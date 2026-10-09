const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function normalizeURL(value) {
  const input = String(value || '').trim();
  if (!input || input.length > 4096) throw new Error('请输入有效网址');
  const hostWithPort = /^[^/\s:]+:\d+(?:\/|$)/.test(input);
  const url = new URL(!hostWithPort && /^[a-z][a-z\d+.-]*:/i.test(input) ? input : `https://${input}`);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('仅支持不含用户名密码的 HTTP / HTTPS 网址');
  return url.href;
}

class AccountStore {
  constructor(directory) {
    this.file = path.join(directory, 'accounts.json');
    this.state = { version: 2, restoreOnLaunch: true, sites: [], accounts: [] };
    if (fs.existsSync(this.file)) {
      const loaded = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (![1, 2].includes(loaded.version) || !Array.isArray(loaded.accounts)) throw new Error('账号数据格式不正确');
      const ids = new Set();
      for (const account of loaded.accounts) {
        if (!/^[\da-f-]{36}$/.test(account.id) || ids.has(account.id)) throw new Error('账号标识不正确');
        ids.add(account.id);
        account.url = normalizeURL(account.url);
        account.lastURL = normalizeURL(account.lastURL || account.url);
      }
      this.state = loaded;
      if (loaded.version === 1) {
        loaded.sites = [];
        for (const account of loaded.accounts) {
          const host = new URL(account.url).host;
          let site = loaded.sites.find(item => new URL(item.url).host === host);
          if (!site) { site = { id: randomUUID(), name: host, url: account.url }; loaded.sites.push(site); }
          account.siteId = site.id;
        }
        const backup = path.join(directory, 'accounts-v1-backup.json');
        if (!fs.existsSync(backup)) fs.copyFileSync(this.file, backup, fs.constants.COPYFILE_EXCL);
        loaded.version = 2; this.save();
      } else {
        if (!Array.isArray(loaded.sites)) throw new Error('网站数据格式不正确');
        const siteIds = new Set(), hosts = new Set();
        for (const site of loaded.sites) {
          site.url = normalizeURL(site.url);
          if (!/^[\da-f-]{36}$/.test(site.id) || siteIds.has(site.id) || hosts.has(new URL(site.url).host) || typeof site.name !== 'string' || !site.name.trim()) throw new Error('网站数据格式不正确');
          siteIds.add(site.id); hosts.add(new URL(site.url).host);
        }
        if (loaded.accounts.some(account => !siteIds.has(account.siteId))) throw new Error('账号缺少有效的网站归属');
      }
    }
  }
  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(`${this.file}.tmp`, JSON.stringify(this.state, null, 2), { mode: 0o600 });
    fs.renameSync(`${this.file}.tmp`, this.file);
  }
  get(id) {
    const account = this.state.accounts.find(item => item.id === id);
    if (!account) throw new Error('账号不存在');
    return account;
  }
  getSite(id) { const site = this.state.sites.find(item => item.id === id); if (!site) throw new Error('网站不存在'); return site; }
  validateSite(input, id) {
    const name = String(input.name || '').trim(), url = normalizeURL(input.url);
    if (!name || name.length > 60) throw new Error('网站名称需为 1–60 个字符');
    if (this.state.sites.some(site => site.id !== id && new URL(site.url).host === new URL(url).host)) throw new Error('该网站已存在，请选择已有网站');
    return { name, url };
  }
  addSite(input) {
    const site = { id: randomUUID(), ...this.validateSite(input) }; this.state.sites.push(site);
    try { this.save(); } catch (error) { this.state.sites.pop(); throw error; } return site;
  }
  editSite(id, input) {
    const site = this.getSite(id), patch = this.validateSite(input, id);
    if (new URL(site.url).host !== new URL(patch.url).host && this.state.accounts.some(account => account.siteId === id)) throw new Error('网站已有账号，不能更换域名；可修改名称或同域名下的默认页面');
    const previous = { ...site }; Object.assign(site, patch);
    try { this.save(); } catch (error) { Object.assign(site, previous); throw error; } return site;
  }
  removeSite(id) {
    this.getSite(id); if (this.state.accounts.some(account => account.siteId === id)) throw new Error('请先删除该网站下的账号，再移除网站');
    const previous = this.state.sites; this.state.sites = previous.filter(site => site.id !== id);
    try { this.save(); } catch (error) { this.state.sites = previous; throw error; }
  }
  add(input, mail) {
    const name = String(input.name || '').trim();
    if (!name || name.length > 320) throw new Error('账号需为 1–320 个字符');
    const note = String(input.note || '').trim(); if (note.length > 80) throw new Error('账号备注最多 80 个字符');
    let site = input.siteId ? this.getSite(input.siteId) : null;
    const url = site ? site.url : normalizeURL(input.url);
    if (!site) site = this.state.sites.find(item => new URL(item.url).host === new URL(url).host) || this.addSite({ name: new URL(url).host, url });
    const account = { id: randomUUID(), name, note, siteId: site.id, url, lastURL: url, createdAt: new Date().toISOString(), wasOpen: false, ...(mail ? { mail } : {}) };
    this.state.accounts.push(account);
    try { this.save(); } catch (error) { this.state.accounts.pop(); throw error; }
    return account;
  }
  update(id, patch) { Object.assign(this.get(id), patch); this.save(); }
  remove(id) { this.get(id); this.state.accounts = this.state.accounts.filter(item => item.id !== id); this.save(); }
}
module.exports = { AccountStore, normalizeURL };

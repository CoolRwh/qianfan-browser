const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

function validateConfig(input) {
  const url = new URL(String(input.baseURL || '').trim());
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))) || url.username || url.password || url.search || url.hash) throw new Error('API 地址必须为 HTTPS 地址');
  const adminEmail = String(input.adminEmail || '').trim();
  const domain = String(input.domain || '').trim().toLowerCase();
  const prefix = String(input.prefix || 'qf').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) throw new Error('请输入正确的管理员邮箱');
  if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) throw new Error('请输入正确的邮箱域名');
  if (!/^[a-z][a-z0-9_-]{0,19}$/.test(prefix)) throw new Error('邮箱前缀须为字母开头的 1–20 位字母、数字、下划线或短横线');
  if (typeof input.password !== 'string' || !input.password || input.password.length > 1024) throw new Error('请输入管理员密码');
  return { baseURL: url.href.replace(/\/$/, ''), adminEmail, domain, prefix, password: input.password };
}
class MailSettings {
  constructor(directory, encryption) {
    this.file = path.join(directory, 'cloud-mail.json'); this.encryption = encryption;
    this.value = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : null;
  }
  public() { const { encryptedPassword, ...value } = this.value || {}; return { baseURL: 'https://shibox.cloud', adminEmail: 'admin@xn1.top', domain: 'shibox.cloud', prefix: 'qf', ...value, hasPassword: Boolean(encryptedPassword) }; }
  credentials(input) {
    const value = input || this.value;
    if (!value) throw new Error('请先配置 Cloud Mail');
    let password = input?.password;
    if (!password && this.value?.encryptedPassword) {
      if (input && (String(input.baseURL || '').trim().replace(/\/$/, '') !== this.value.baseURL || String(input.adminEmail || '').trim() !== this.value.adminEmail)) throw new Error('更换 API 地址或管理员邮箱时，请重新输入密码');
      password = this.encryption.decryptString(Buffer.from(this.value.encryptedPassword, 'base64'));
    }
    return validateConfig({ ...value, password });
  }
  save(input) {
    if (!this.encryption.isEncryptionAvailable()) throw new Error('系统安全存储不可用，无法保存管理员密码');
    const { password, ...config } = this.credentials(input);
    const next = { ...config, encryptedPassword: this.encryption.encryptString(password).toString('base64') };
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(`${this.file}.tmp`, JSON.stringify(next, null, 2), { mode: 0o600 }); fs.renameSync(`${this.file}.tmp`, this.file);
    this.value = next; return this.public();
  }
}
function plainText(value) {
  const entities = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  return String(value || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<\/(?:p|div|tr|h[1-6])\s*>|<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, ' ').replace(/&#(x[\da-f]+|\d+);/gi, (_, n) => String.fromCodePoint(Math.min(n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n), 0x10ffff))).replace(/&(nbsp|amp|lt|gt|quot|apos);/g, (_, name) => entities[name]);
}
function extractCode(subject, text, content) {
  const source = `${plainText(subject)}\n${plainText(text)}\n${plainText(content)}`.slice(0, 200000);
  const keyword = /(?:验证码|校验码|验证代码|verification\s*code|security\s*code|one[- ]time\s*(?:password|code)|passcode|\bOTP\b)/i;
  if (!keyword.test(source)) return null;
  const pattern = /(?:验证码|校验码|验证代码|verification\s*code|security\s*code|one[- ]time\s*(?:password|code)|passcode|\bOTP\b|\bcode\b)\s*(?:(?:is|是|为)\s*)?[:：=\-\s"'「」【】]*([a-z\d]{4,8})(?![a-z\d])/gi;
  const candidates = [...new Set([...source.matchAll(pattern)].map(match => match[1]).filter(value => (/[0-9]/.test(value) || /^[A-Z]{4,8}$/.test(value)) && !/^(?:19|20)\d{2}$/.test(value)))];
  return candidates.length === 1 ? candidates[0] : null;
}
function mailTime(value) {
  const str = String(value || '');
  return Date.parse(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(str) ? str.replace(' ', 'T') + 'Z' : str);
}
class CloudMail {
  constructor(settings, fetcher = fetch) { this.settings = settings; this.fetcher = fetcher; this.auth = null; }
  async request(config, endpoint, { method = 'GET', body, token } = {}) {
    let response;
    try { response = await this.fetcher(`${config.baseURL}${endpoint}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000), redirect: 'error' }); }
    catch { throw new Error('Cloud Mail 请求失败或超时，请检查 API 地址与网络'); }
    let json; try { json = await response.json(); } catch { throw new Error('Cloud Mail 返回非 JSON 数据，请检查 API 地址'); }
    if (!response.ok || Number(json.code) !== 200) {
      const error = new Error(`Cloud Mail 接口 ${endpoint.split('?')[0]} 返回错误（${json.code || response.status}），请检查权限、域名或人机验证设置`);
      error.unauthorized = response.status === 401 || Number(json.code) === 401;
      throw error;
    }
    return json.data;
  }
  async login(config) {
    const data = await this.request(config, '/api/login', { method: 'POST', body: { email: config.adminEmail, password: config.password } });
    if (!data?.token || typeof data.token !== 'string') throw new Error('Cloud Mail 登录未返回有效令牌');
    return data.token;
  }
  async authorized(config, endpoint, options = {}) {
    if (!this.auth || this.auth.baseURL !== config.baseURL || this.auth.adminEmail !== config.adminEmail || this.auth.expires < Date.now()) this.auth = { token: await this.login(config), baseURL: config.baseURL, adminEmail: config.adminEmail, expires: Date.now() + 600000 };
    try { return await this.request(config, endpoint, { ...options, token: this.auth.token }); }
    catch (error) { if (!error.unauthorized) throw error; this.auth = null; const token = await this.login(config); return this.request(config, endpoint, { ...options, token }); }
  }
  async test(input) { await this.login(this.settings.credentials(input)); return { connected: true }; }
  async generate(prefix) {
    const config = this.settings.credentials();
    if (prefix !== undefined) { config.prefix = String(prefix).trim().toLowerCase(); if (!/^[a-z][a-z0-9_-]{0,19}$/.test(config.prefix)) throw new Error('邮箱前缀须为字母开头的 1–20 位字母、数字、下划线或短横线'); }
    const email = `${config.prefix}-${randomBytes(8).toString('hex')}@${config.domain}`;
    const data = await this.authorized(config, '/api/account/add', { method: 'POST', body: { email } });
    if (!Number.isSafeInteger(Number(data?.accountId)) || Number(data.accountId) <= 0) throw new Error(`邮箱 ${email} 已提交创建，但未返回有效邮箱 ID；请在 Cloud Mail 中检查`);
    return { email, accountId: Number(data.accountId), baseURL: config.baseURL, adminEmail: config.adminEmail, createdAt: new Date().toISOString() };
  }
  async code(mail, since) {
    const config = this.settings.credentials();
    if (config.baseURL !== mail.baseURL || config.adminEmail !== mail.adminEmail) throw new Error('此邮箱属于另一套 Cloud Mail 配置，请恢复原 API 地址和管理员邮箱');
    const params = new URLSearchParams({ accountId: String(mail.accountId), type: '0', size: '30', timeSort: '0', allReceive: '0', full: '1' });
    const data = await this.authorized(config, `/api/email/list?${params}`);
    if (!Array.isArray(data?.list)) throw new Error('Cloud Mail 邮件列表格式不正确');
    const cutoff = Math.max(Number(since) || 0, Date.now() - 15 * 60000);
    const messages = data.list.filter(item => String(item.toEmail || '').trim().toLowerCase() === mail.email.toLowerCase() && Number(item.accountId) === mail.accountId && mailTime(item.createTime) >= cutoff).sort((a, b) => mailTime(b.createTime) - mailTime(a.createTime));
    const previews = messages.map(item => ({
      emailId: String(item.emailId || ''), code: extractCode(item.subject, item.text, item.content),
      subject: String(item.subject || '').slice(0, 300), sender: String(item.sendEmail || ''),
      receivedAt: new Date(mailTime(item.createTime)).toISOString(),
      body: String(item.text || '').trim() ? String(item.text).slice(0, 200000) : plainText(item.content).slice(0, 200000),
      html: String(item.content || '').slice(0, 200000)
    }));
    return { ...(previews[0] || { code: null }), messages: previews, checkedAt: new Date().toISOString() };
  }
}
module.exports = { MailSettings, CloudMail, extractCode, validateConfig };

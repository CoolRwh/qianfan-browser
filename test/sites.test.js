const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { AccountStore } = require('../src/store');
function directory(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qianfan-sites-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; }
test('legacy migration groups by host without changing account IDs, login state or mail binding', t => {
  const dir = directory(t);
  const first = { id: randomUUID(), name: '个人', url: 'https://example.com/login', lastURL: 'https://example.com/work', wasOpen: true, mail: { email: 'a@example.test', accountId: 7 } };
  const second = { id: randomUUID(), name: '工作', url: 'https://example.com/signup', lastURL: 'https://example.com/projects', wasOpen: false };
  const other = { id: randomUUID(), name: '其他', url: 'https://other.example.com', wasOpen: false };
  const previous = { version: 1, restoreOnLaunch: true, accounts: [first, second, other] };
  fs.writeFileSync(path.join(dir, 'accounts.json'), JSON.stringify(previous));
  const store = new AccountStore(dir); assert.equal(store.state.version, 2); assert.equal(store.state.sites.length, 2);
  assert.equal(store.get(first.id).siteId, store.get(second.id).siteId); assert.notEqual(store.get(first.id).siteId, store.get(other.id).siteId);
  assert.equal(store.get(first.id).wasOpen, true); assert.equal(store.get(first.id).lastURL, first.lastURL); assert.deepEqual(store.get(first.id).mail, first.mail);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'accounts-v1-backup.json'), 'utf8')), previous);
  assert.deepEqual(new AccountStore(dir).state, store.state);
});
test('website selection, custom name and default URL persist while account sessions remain stable', t => {
  const dir = directory(t), store = new AccountStore(dir);
  const site = store.addSite({ name: '即梦工作室', url: 'https://example.com/register' });
  const account = store.add({ name: 'work@example.test', siteId: site.id, note: '设计团队' });
  assert.equal(account.url, site.url); assert.equal(account.note, '设计团队');
  store.editSite(site.id, { name: '我的设计网站', url: 'https://example.com/login' });
  assert.equal(store.get(account.id).url, 'https://example.com/register');
  const next = store.add({ name: 'new@example.test', siteId: site.id }); assert.equal(next.url, 'https://example.com/login');
  const loaded = new AccountStore(dir); assert.equal(loaded.getSite(site.id).name, '我的设计网站'); assert.equal(loaded.get(account.id).siteId, site.id);
  assert.throws(() => store.addSite({ name: '重复', url: 'https://example.com/another' }), /已存在/);
  assert.throws(() => store.editSite(site.id, { name: '新域名', url: 'https://other.example.com' }), /不能更换域名/);
  assert.throws(() => store.removeSite(site.id), /请先删除/);
  store.remove(account.id); store.remove(next.id); store.removeSite(site.id); assert.equal(new AccountStore(dir).state.sites.length, 0);
});
test('invalid website or account input does not create an account', t => {
  const store = new AccountStore(directory(t));
  assert.throws(() => store.addSite({ name: '', url: 'example.com' }));
  assert.throws(() => store.addSite({ name: 'test', url: 'file:///C:/test' }));
  assert.throws(() => store.add({ name: 'test', siteId: randomUUID() }));
  assert.equal(store.state.accounts.length, 0); assert.equal(store.state.sites.length, 0);
});

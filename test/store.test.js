const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AccountStore, normalizeURL } = require('../src/store');
test('accounts keep stable independent IDs and recover persisted state', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qianfan-test-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = new AccountStore(dir);
  const a = store.add({ name: '工作', url: 'example.com' }); const b = store.add({ name: '工作', url: 'example.com' });
  assert.notEqual(a.id, b.id);
  store.update(a.id, { wasOpen: true, lastURL: 'https://example.com/dashboard', bounds: { x: 10, y: 20, width: 900, height: 700 } });
  const recovered = new AccountStore(dir); assert.equal(recovered.get(a.id).wasOpen, true); assert.equal(recovered.get(b.id).wasOpen, false); assert.equal(recovered.get(a.id).lastURL, 'https://example.com/dashboard');
  recovered.remove(a.id); assert.equal(new AccountStore(dir).state.accounts.length, 1); assert.throws(() => recovered.get(a.id));
  const bound = recovered.add({ name: '邮箱账号', url: 'example.com' }, { email: 'work@example.test', accountId: 9 });
  assert.equal(new AccountStore(dir).get(bound.id).mail.accountId, 9);
});
test('rejects unsafe protocols and credentials', () => {
  for (const value of ['file:///C:/secret', 'javascript:alert(1)', 'data:text/html,test', 'https://user:pass@example.com', '']) assert.throws(() => normalizeURL(value));
  assert.equal(normalizeURL('example.com/login'), 'https://example.com/login');
  assert.equal(normalizeURL('localhost:8080/login'), 'https://localhost:8080/login');
});
test('invalid names and corrupt stores preserve existing data', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qianfan-test-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = new AccountStore(dir); assert.throws(() => store.add({ name: ' ', url: 'example.com' }));
  fs.writeFileSync(path.join(dir, 'accounts.json'), 'broken'); assert.throws(() => new AccountStore(dir)); assert.equal(fs.readFileSync(path.join(dir, 'accounts.json'), 'utf8'), 'broken');
});

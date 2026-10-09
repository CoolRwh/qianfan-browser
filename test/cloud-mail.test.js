const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { MailSettings, CloudMail, extractCode, validateConfig } = require('../src/cloud-mail');
const config = { baseURL: 'https://mail.example.test', adminEmail: 'admin@example.test', password: 'test-only-password', domain: 'example.test', prefix: 'work' };
const encryption = { isEncryptionAvailable: () => true, encryptString: text => Buffer.from(text.split('').reverse().join('')), decryptString: buffer => buffer.toString().split('').reverse().join('') };
test('settings hide passwords, persist encrypted data and require reentry when changing servers', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qianfan-mail-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const settings = new MailSettings(dir, encryption); const result = settings.save(config);
  assert.equal(result.hasPassword, true); assert.equal(result.password, undefined); assert.equal(result.encryptedPassword, undefined);
  assert.ok(!fs.readFileSync(settings.file, 'utf8').includes(config.password));
  const recovered = new MailSettings(dir, encryption); assert.equal(recovered.credentials().password, config.password);
  recovered.save({ ...config, password: '' }); assert.equal(recovered.credentials().password, config.password);
  assert.throws(() => recovered.save({ ...config, baseURL: 'https://other.example.test', password: '' }));
  assert.throws(() => validateConfig({ ...config, baseURL: 'http://mail.example.test' }));
  assert.throws(() => validateConfig({ ...config, prefix: '../bad' }));
});
test('code extraction handles text and HTML without treating arbitrary numbers as codes', () => {
  assert.equal(extractCode('验证邮件', '验证码是：123456', ''), '123456');
  assert.equal(extractCode('Your verification code', '', '<div>Your code is <b>876543</b></div>'), '876543');
  assert.equal(extractCode('验证码', '', '<b>&#49;&#50;&#51;&#52;&#53;&#54;</b>'), '123456');
  assert.equal(extractCode('订单通知', '订单号123456', ''), null);
  assert.equal(extractCode('验证码', '订单123456 客户987654', ''), null);
  assert.equal(extractCode('Welcome to Dreamina and your verification code is F9KKG5', 'Copyright 2024', ''), 'F9KKG5');
  assert.equal(extractCode('Verification code', 'Copyright 2024', ''), null);
  assert.equal(extractCode('Verification code', 'Your verification code is F9KKG5. Security code is A2B3C4.', ''), null);
  assert.equal(extractCode('Verification code', 'Your verification code expires in 2024.', ''), null);
  assert.equal(extractCode('Verification code', 'Your code is ABCDEF', ''), 'ABCDEF');
  assert.equal(extractCode('Verification code', 'Your code is required', ''), null);
  assert.equal(extractCode('Verification code', '', '<p>Your code is &#x46;9KKG5</p><p>Copyright 2024</p>'), 'F9KKG5');
});
test('ambiguous newest mail returns original content instead of silently using an older code', async () => {
  const client = new CloudMail({ credentials: () => config }, async url => ({ ok: true, json: async () => ({ code: 200, data: url.endsWith('/api/login') ? { token: 'fixture' } : { list: [
    { emailId: 2, accountId: 1, toEmail: 'work@example.test', subject: 'Verification code', text: 'Please choose F9KKG5 manually. Copyright 2024.', content: '<script>alert(1)</script><p>F9KKG5</p>', createTime: new Date().toISOString() },
    { emailId: 1, accountId: 1, toEmail: 'work@example.test', subject: 'Verification code', text: 'Your code is 123456', createTime: new Date(Date.now() - 60000).toISOString() }
  ] } }) }));
  const result = await client.code({ email: 'work@example.test', accountId: 1, baseURL: config.baseURL, adminEmail: config.adminEmail });
  assert.equal(result.code, null); assert.equal(result.messages.length, 2); assert.ok(result.body.includes('F9KKG5')); assert.equal(result.messages[1].code, '123456');
});
test('Cloud Mail uses raw Authorization token and mailbox IDs, filters wrong recipients and stale codes', async () => {
  const requests = [];
  const fetcher = async (url, options) => {
    requests.push({ url, options });
    let data;
    if (url.endsWith('/api/login')) { assert.deepEqual(JSON.parse(options.body), { email: config.adminEmail, password: config.password }); data = { token: 'test-token' }; }
    else if (url.endsWith('/api/account/add')) { assert.equal(options.headers.Authorization, 'test-token'); data = { accountId: 9 }; }
    else {
      assert.equal(new URL(url).searchParams.get('accountId'), '9'); assert.equal(new URL(url).searchParams.get('allReceive'), '0');
      const email = JSON.parse(requests.find(r => r.url.endsWith('/api/account/add')).options.body).email;
      data = { list: [
        { accountId: 9, toEmail: 'wrong@example.test', subject: '验证码', text: '验证码：111111', createTime: new Date().toISOString() },
        { accountId: 9, toEmail: email, subject: '验证码', text: '验证码：222222', createTime: new Date(Date.now() - 3600000).toISOString() },
        { accountId: 9, toEmail: email, subject: '验证码', text: '验证码：333333', createTime: new Date().toISOString(), sendEmail: 'service@example.test' }
      ] };
    }
    return { ok: true, json: async () => ({ code: 200, data }) };
  };
  const client = new CloudMail({ credentials: () => config }, fetcher);
  const mail = await client.generate(); assert.match(mail.email, /^work-[a-f0-9]{16}@example\.test$/);
  assert.equal((await client.code(mail, Date.now() - 60000)).code, '333333');
  assert.equal(requests.filter(r => r.url.endsWith('/api/login')).length, 1);
  await assert.rejects(() => client.code({ ...mail, baseURL: 'https://other.example.test' }), /另一套/);
});
test('authentication expires safely and service errors never expose response contents', async () => {
  let logins = 0, lists = 0;
  const client = new CloudMail({ credentials: () => config }, async url => {
    if (url.endsWith('/api/login')) return { ok: true, json: async () => ({ code: 200, data: { token: `token-${++logins}` } }) };
    if (++lists === 1) return { ok: false, status: 401, json: async () => ({ code: 401, message: config.password }) };
    return { ok: true, json: async () => ({ code: 200, data: { list: [] } }) };
  });
  const result = await client.code({ email: 'work@example.test', accountId: 1, baseURL: config.baseURL, adminEmail: config.adminEmail });
  assert.equal(result.code, null); assert.equal(logins, 2);
  const broken = new CloudMail({ credentials: () => config }, async () => ({ ok: false, status: 500, json: async () => ({ code: 500, message: config.password }) }));
  await assert.rejects(() => broken.generate(), error => !error.message.includes(config.password));
});

const { app, BrowserWindow, clipboard } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
app.setPath('userData', path.join(__dirname, '..', '.mail-smoke-data'));
let createdEmail = '', nextID = 0;
let ambiguous = false;
const server = http.createServer((req, res) => {
  let body = ''; req.on('data', chunk => { body += chunk; }); req.on('end', () => {
    let data;
    if (req.url === '/api/login') data = { token: 'fixture-token' };
    else if (req.url === '/api/account/add') { createdEmail = JSON.parse(body).email; data = { accountId: ++nextID }; }
    else data = { list: [{ accountId: nextID, toEmail: createdEmail, subject: ambiguous ? 'Verification code' : 'Welcome to Dreamina and your verification code is F9KKG5', text: ambiguous ? 'Please manually choose A7B8C9. Copyright 2024.' : 'Your verification code is F9KKG5. Copyright 2024.', content: '<p>Mail original content</p><script>window.evil=true</script>', createTime: new Date().toISOString(), sendEmail: 'test@example.test' }] };
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ code: 200, data }));
  });
});
server.listen(18766, '127.0.0.1');
require('../src/main');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(fn) { for (let i = 0; i < 100; i++) { const result = await fn(); if (result) return result; await sleep(100); } throw new Error('Timed out'); }
app.whenReady().then(async () => {
  try {
    const manager = await waitFor(() => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/index.html')));
    await waitFor(() => !manager.webContents.isLoading());
    const invoke = script => manager.webContents.executeJavaScript(script);
    const config = { baseURL: 'http://127.0.0.1:18766', adminEmail: 'admin@example.test', password: 'fixture-secret', domain: 'example.test', prefix: 'qf' };
    await invoke(`window.cloudMail.save(${JSON.stringify(config)})`);
    assert.equal((await invoke('window.cloudMail.settings()')).password, undefined);
    assert.ok(!fs.readFileSync(path.join(app.getPath('userData'), 'cloud-mail.json'), 'utf8').includes(config.password));
    assert.equal((await invoke(`window.cloudMail.test(${JSON.stringify({ ...config, password: '' })})`)).connected, true);
    const result = await invoke("window.cloudMail.generate({url:'https://example.com',count:2,openNow:false})");
    assert.equal(result.completed, 2);
    const account = result.state.accounts.at(-1);
    assert.equal((await invoke(`window.cloudMail.code({id:'${account.id}'})`)).code, 'F9KKG5');
    await invoke('(async()=>render(await window.accounts.list()))()');
    await invoke(`Array.from(document.querySelectorAll('.card')).find(card=>card.querySelector('h2').textContent===${JSON.stringify(account.mail.email)}).querySelector('.copy-account-button').onclick()`);
    await waitFor(async () => await clipboard.readText() === account.mail.email);
    await invoke(`openCodeDialog(state.accounts.find(a=>a.id==='${account.id}'))`);
    await waitFor(() => invoke("document.getElementById('code-value').textContent==='F9KKG5'"));
    assert.ok(await invoke("document.getElementById('code-body').value.includes('Copyright 2024')"));
    assert.equal(await invoke('window.evil'), undefined);
    ambiguous = true;
    await invoke("document.getElementById('code-refresh').click()");
    await waitFor(() => invoke("document.getElementById('code-body').value.includes('A7B8C9')"));
    assert.equal(await invoke("document.getElementById('code-copy').disabled"), true);
    await invoke("(()=>{const body=document.getElementById('code-body');const start=body.value.indexOf('A7B8C9');body.setSelectionRange(start,start+6);body.dispatchEvent(new Event('select'));document.getElementById('code-use-selection').click();document.getElementById('code-copy').click()})()");
    await waitFor(async () => await clipboard.readText() === 'A7B8C9');
    assert.equal(await invoke("document.getElementById('code-value').textContent"), 'A7B8C9');
    await sleep(250);
    await manager.webContents.capturePage().then(img => fs.writeFileSync(path.join(__dirname, '..', 'cloud-mail-preview.png'), img.toPNG()));
    await invoke("document.getElementById('mail-code-dialog').close()");
    await invoke("document.getElementById('mail-settings').click()");
    await waitFor(() => invoke("document.getElementById('mail-settings-dialog').open"));
    assert.equal(await invoke("document.getElementById('mail-password').value"), '');
    console.log('PASS: alphanumeric recognition, original mail, manual selection and clipboard, copy-account button, encrypted configuration');
    server.close(); app.quit();
  } catch (error) { console.error(error); server.close(); app.exit(1); }
});

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const profile = path.join(root, '.packaged-smoke-data', randomUUID());
fs.mkdirSync(profile, { recursive: true });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function freePort() { const server = net.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port; }
async function connect(url) {
  const socket = new WebSocket(url), pending = new Map(); let id = 0;
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', event => { const message = JSON.parse(event.data); const task = pending.get(message.id); if (!task) return; pending.delete(message.id); message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result); });
  return {
    call: (method, params = {}) => new Promise((resolve, reject) => { const requestID = ++id; pending.set(requestID, { resolve, reject }); socket.send(JSON.stringify({ id: requestID, method, params })); }),
    quit: () => socket.send(JSON.stringify({ id: ++id, method: 'Runtime.evaluate', params: { expression: 'window.close()' } })),
    close: () => socket.close()
  };
}
async function checkExecutable(executable, create) {
  const port = await freePort();
  const child = spawn(executable, [`--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'], { windowsHide: true, stdio: 'ignore' });
  const exited = new Promise(resolve => { child.once('exit', code => resolve(code)); child.once('error', error => resolve(error)); });
  let client;
  try {
    let page;
    for (let attempts = 0; attempts < 200; attempts++) {
      try { const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); page = pages.find(item => item.type === 'page' && item.url.endsWith('/index.html')); if (page) break; } catch {}
      await pause(200);
    }
    assert.ok(page, 'packaged manager must start'); client = await connect(page.webSocketDebuggerUrl);
    const evaluate = async expression => { const result = await client.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error('Packaged renderer evaluation failed'); return result.result.value; };
    await evaluate('window.accounts.list()');
    if (create) {
      const result = await evaluate("window.sites.add({name:'打包验证网站',url:'https://example.com'})");
      await evaluate(`window.accounts.add({siteId:${JSON.stringify(result.site.id)},name:'packaging@example.test',note:'持久化验证',openNow:false})`);
      await pause(300);
      assert.equal(await evaluate("document.querySelectorAll('.account-row').length"), 1);
      const capture = await client.call('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(root, 'dist', 'packaged-preview.png'), Buffer.from(capture.data, 'base64'));
    } else {
      const state = await evaluate('window.accounts.list()'); assert.equal(state.accounts.length, 1); assert.equal(state.accounts[0].name, 'packaging@example.test'); assert.equal(state.sites[0].name, '打包验证网站');
    }
    client.quit();
    const exit = await Promise.race([exited, pause(15000).then(() => 'timeout')]); assert.equal(exit, 0, 'packaged app closes cleanly');
    console.log(`PASS ${path.basename(executable)}: starts, renders and ${create ? 'saves' : 'restores'} isolated account data`);
  } finally { client?.close(); if (child.exitCode === null) child.kill(); }
}
(async () => {
  const asar = require('@electron/asar');
  const entries = asar.listPackage(path.join(root, 'dist', 'win-unpacked', 'resources', 'app.asar'));
  assert.ok(entries.some(file => /src[\\/]index\.html$/.test(file)));
  assert.ok(entries.some(file => /src[\\/]theme\.css$/.test(file)));
  assert.ok(entries.some(file => /build[\\/]icon\.png$/.test(file)));
  assert.ok(!entries.some(file => /(?:^|[\\/])(?:config\.yml|\.env(?:\..*)?|accounts\.json|cloud-mail\.json)$/.test(file)));
  assert.ok(!entries.some(file => /(?:^|[\\/])(?:test|scripts|\.smoke-data|\.design-smoke-data|\.mail-smoke-data)[\\/]/.test(file)));
  await checkExecutable(path.join(root, 'dist', 'win-unpacked', 'QianfanBrowser.exe'), true);
  await checkExecutable(path.join(root, 'dist', 'QianfanBrowser-Portable-1.0.0-x64.exe'), false);
})().catch(error => { console.error(error.message); process.exitCode = 1; });

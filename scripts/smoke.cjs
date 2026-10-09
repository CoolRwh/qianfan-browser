const { app, BrowserWindow, session } = require('electron');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const phase = process.argv[2];
app.setPath('userData', path.join(__dirname, '..', '.smoke-data', /^[a-f0-9-]{36}$/.test(process.argv[3] || '') ? process.argv[3] : 'default'));
const server = http.createServer((_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Session test</title><h1>Local session fixture</h1>'); });
server.listen(18765, '127.0.0.1');
require('../src/main');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(fn) { for (let i = 0; i < 100; i++) { const result = fn(); if (result) return result; await sleep(100); } throw new Error('Timed out waiting for application'); }
app.whenReady().then(async () => {
  try {
    const manager = await waitFor(() => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/index.html')));
    await waitFor(() => !manager.webContents.isLoading());
    const invoke = script => manager.webContents.executeJavaScript(script);
    if (phase === 'first') {
      await invoke("window.accounts.add({name:'工作账号',url:'http://127.0.0.1:18765',openNow:true})");
      await invoke("window.accounts.add({name:'个人账号',url:'http://127.0.0.1:18765',openNow:true})");
      const state = await invoke('window.accounts.list()'); assert.equal(state.accounts.length, 2);
      for (const [index, a] of state.accounts.entries()) {
        const ses = session.fromPartition(`persist:account-${a.id}`);
        await ses.cookies.set({ url: a.url, name: 'identity', value: String(index), expirationDate: Date.now() / 1000 + 86400 });
        const win = BrowserWindow.getAllWindows().find(w => w.webContents.session === ses);
        await waitFor(() => !win.webContents.isLoading());
        await win.webContents.executeJavaScript(`localStorage.setItem('identity', '${index}')`);
        assert.equal((await ses.cookies.get({ name: 'identity' }))[0].value, String(index));
      }
      await invoke(`window.accounts.open('${state.accounts[0].id}')`);
      assert.equal(BrowserWindow.getAllWindows().length, 3, 'focus must not create a duplicate');
      await manager.webContents.capturePage().then(img => fs.writeFileSync(path.join(__dirname, '..', 'preview.png'), img.toPNG()));
    } else {
      const state = await invoke('window.accounts.list()'); assert.equal(state.accounts.length, 2); assert.equal(state.accounts.filter(a => a.isOpen).length, 2, 'restores open accounts');
      for (const [index, a] of state.accounts.entries()) {
        const ses = session.fromPartition(`persist:account-${a.id}`);
        assert.equal((await ses.cookies.get({ name: 'identity' }))[0].value, String(index), 'cookie survives restart in separate partitions');
        const win = BrowserWindow.getAllWindows().find(w => w.webContents.session === ses);
        await waitFor(() => !win.webContents.isLoading());
        assert.equal(await win.webContents.executeJavaScript("localStorage.getItem('identity')"), String(index));
      }
      await invoke('window.accounts.closeAll()');
      await waitFor(() => BrowserWindow.getAllWindows().length === 1);
      assert.equal((await invoke('window.accounts.list()')).accounts.filter(a => a.isOpen).length, 0);
    }
    console.log(`PASS ${phase}: account windows, session isolation and persistence`);
    server.close(); app.quit();
  } catch (error) { console.error(error); server.close(); app.exit(1); }
});

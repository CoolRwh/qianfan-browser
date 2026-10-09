const { app, BrowserWindow, ipcMain, session, dialog, Menu, screen, safeStorage, clipboard } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { AccountStore, normalizeURL } = require('./store');
const { MailSettings, CloudMail } = require('./cloud-mail');
// Keep the development and packaged application on the same account/session directory.
if (app.isPackaged) app.setPath('userData', app.commandLine.getSwitchValue('user-data-dir') || path.join(app.getPath('appData'), 'qianfan-browser'));

let store, manager, quitting = false, flushed = false;
let mailSettings, cloudMail, generating = false;
const windows = new Map();
const deleting = new Set();
const managerURL = pathToFileURL(path.join(__dirname, 'index.html')).href;
const partition = id => `persist:account-${id}`;
const snapshot = () => ({ restoreOnLaunch: store.state.restoreOnLaunch, sites: store.state.sites, accounts: store.state.accounts.map(a => ({ ...a, isOpen: Boolean(windows.get(a.id)?.size), windowCount: windows.get(a.id)?.size || 0 })) });
function publish() { if (manager && !manager.isDestroyed()) manager.webContents.send('accounts:changed', snapshot()); }
function safeURL(value) { try { return normalizeURL(value); } catch { return null; } }
function boundsFor(account) {
  const b = account.bounds;
  if (!b || ![b.x, b.y, b.width, b.height].every(Number.isFinite)) return { width: 1200, height: 820 };
  const area = screen.getDisplayMatching(b).workArea;
  return { width: Math.min(Math.max(b.width, 640), area.width), height: Math.min(Math.max(b.height, 480), area.height), x: Math.max(area.x, Math.min(b.x, area.x + area.width - Math.min(b.width, area.width))), y: Math.max(area.y, Math.min(b.y, area.y + area.height - Math.min(b.height, area.height))) };
}
function configureSession(ses) {
  ses.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
}
function openAccount(id, target, popup = false) {
  if (quitting || deleting.has(id)) return;
  const account = store.get(id);
  const existing = windows.get(id);
  if (!popup && existing?.size) { const win = [...existing][0]; if (win.isMinimized()) win.restore(); win.show(); win.focus(); return; }
  const ses = session.fromPartition(partition(id));
  configureSession(ses);
  const win = new BrowserWindow({ ...boundsFor(account), minWidth: 640, minHeight: 480, title: account.name, autoHideMenuBar: true, backgroundColor: '#ffffff', webPreferences: { session: ses, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true } });
  if (!windows.has(id)) windows.set(id, new Set());
  windows.get(id).add(win);
  store.update(id, { wasOpen: true, lastOpenedAt: new Date().toISOString() });
  win.on('page-title-updated', event => { event.preventDefault(); win.setTitle(`${account.name} · 千帆浏览器`); });
  win.webContents.setWindowOpenHandler(({ url }) => { const valid = safeURL(url); if (valid) openAccount(id, valid, true); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (event, url) => { if (!safeURL(url)) event.preventDefault(); });
  win.webContents.on('will-redirect', (event, url) => { if (!safeURL(url)) event.preventDefault(); });
  const rememberURL = (_event, url) => { if (!popup && safeURL(url) && !deleting.has(id)) store.update(id, { lastURL: url }); };
  win.webContents.on('did-navigate', rememberURL);
  win.webContents.on('did-navigate-in-page', (event, url, isMainFrame) => { if (isMainFrame) rememberURL(event, url); });
  win.on('close', () => { if (!deleting.has(id)) store.update(id, { bounds: win.getNormalBounds(), maximized: win.isMaximized() }); });
  win.on('closed', () => {
    windows.get(id)?.delete(win);
    if (!windows.get(id)?.size) { windows.delete(id); if (!quitting && !deleting.has(id)) store.update(id, { wasOpen: false }); }
    void ses.cookies.flushStore().catch(console.error);
    publish();
  });
  if (account.maximized) win.maximize();
  win.loadURL(target || account.lastURL || account.url).catch(error => { if (!win.isDestroyed()) dialog.showMessageBox(win, { type: 'error', message: '页面加载失败', detail: error.message }); });
  publish();
}
function createManager() {
  manager = new BrowserWindow({ width: 1440, height: 900, minWidth: 980, minHeight: 650, title: '千帆 · 多账号浏览器', icon: path.join(__dirname, '../build/icon.png'), backgroundColor: '#f6f8fc', webPreferences: { preload: path.join(__dirname, 'preload.js'), nodeIntegration: false, contextIsolation: true, sandbox: true } });
  manager.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  manager.webContents.on('will-navigate', event => event.preventDefault());
  manager.loadURL(managerURL);
  manager.on('closed', () => { manager = null; if (!quitting) app.quit(); });
}
function handle(channel, action) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!manager || event.sender !== manager.webContents || event.senderFrame?.url !== managerURL) throw new Error('未授权的请求');
    try { return { ok: true, data: await action(...args) }; }
    catch (error) { return { ok: false, error: error.message }; }
  });
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (manager) { if (manager.isMinimized()) manager.restore(); manager.show(); manager.focus(); } });
  app.whenReady().then(() => {
    try { store = new AccountStore(app.getPath('userData')); }
    catch (error) { dialog.showErrorBox('无法读取账号数据', `${error.message}\n数据文件保留在 ${app.getPath('userData')}，请修复后重新启动。`); app.exit(1); return; }
    try { mailSettings = new MailSettings(app.getPath('userData'), safeStorage); cloudMail = new CloudMail(mailSettings); }
    catch { dialog.showErrorBox('无法读取邮箱配置', 'cloud-mail.json 格式不正确，请修复后重新启动。'); app.exit(1); return; }
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: '千帆', submenu: [{ label: '账号管理', click: () => { manager?.show(); manager?.focus(); } }, { type: 'separator' }, { role: 'quit', label: '退出', accelerator: 'CmdOrCtrl+Q' }] }, { label: '编辑', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] }, { label: '浏览', submenu: [{ role: 'reload', label: '刷新' }, { label: '后退', accelerator: 'Alt+Left', click: (_item, win) => { if (win && win !== manager && win.webContents.navigationHistory.canGoBack()) win.webContents.navigationHistory.goBack(); } }, { label: '前进', accelerator: 'Alt+Right', click: (_item, win) => { if (win && win !== manager && win.webContents.navigationHistory.canGoForward()) win.webContents.navigationHistory.goForward(); } }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }] }]));
    handle('accounts:list', snapshot);
    handle('sites:add', input => { const site = store.addSite(input); publish(); return { site, state: snapshot() }; });
    handle('sites:edit', input => { store.editSite(input.id, input); publish(); return snapshot(); });
    handle('sites:remove', id => { store.removeSite(id); publish(); return snapshot(); });
    handle('sites:open', id => { store.getSite(id); for (const account of store.state.accounts.filter(a => a.siteId === id)) openAccount(account.id); return snapshot(); });
    handle('sites:close', id => { store.getSite(id); for (const account of store.state.accounts.filter(a => a.siteId === id)) for (const win of windows.get(account.id) || []) win.close(); return snapshot(); });
    handle('mail:settings', () => mailSettings.public());
    handle('mail:save', input => { const config = mailSettings.save(input); cloudMail.auth = null; return config; });
    handle('mail:test', input => cloudMail.test(input));
    handle('mail:generate', async input => {
      if (generating) throw new Error('正在生成账号，请等待完成');
      const site = input.siteId ? store.getSite(input.siteId) : null;
      const url = site ? site.url : normalizeURL(input.url);
      const note = String(input.note || '').trim(); if (note.length > 80) throw new Error('账号备注最多 80 个字符');
      const count = Number(input.count);
      if (!Number.isInteger(count) || count < 1 || count > 20) throw new Error('每次可生成 1–20 个账号');
      generating = true; let completed = 0;
      try {
        for (let i = 0; i < count; i++) {
          const mail = await cloudMail.generate(input.prefix);
          let account;
          try { account = store.add({ name: mail.email, url, siteId: site?.id, note }, mail); }
          catch { throw new Error(`邮箱 ${mail.email} 已创建，但本地保存失败；请在 Cloud Mail 中保留该邮箱并检查磁盘`); }
          completed++; publish(); if (input.openNow) openAccount(account.id);
        }
        return { state: snapshot(), completed };
      } catch (error) { throw new Error(`已生成 ${completed} 个账号。${error.message}`); }
      finally { generating = false; }
    });
    handle('mail:code', input => { const account = store.get(input.id); if (!account.mail) throw new Error('该账号未绑定 Cloud Mail 邮箱'); return cloudMail.code(account.mail, input.since); });
    handle('mail:copy', async text => { if (typeof text !== 'string' || text.length > 320) throw new Error('复制内容无效'); await clipboard.writeText(text); });
    handle('accounts:add', input => { const account = store.add(input); publish(); if (input.openNow) openAccount(account.id); return snapshot(); });
    handle('accounts:open', id => { openAccount(id); return snapshot(); });
    handle('accounts:close', id => { store.get(id); for (const win of windows.get(id) || []) win.close(); return snapshot(); });
    handle('accounts:delete', async id => {
      const account = store.get(id);
      if (deleting.has(id)) throw new Error('正在删除此账号');
      const answer = await dialog.showMessageBox(manager, { type: 'warning', message: `删除“${account.name}”？`, detail: '所有窗口将关闭，登录状态、Cookie 和网站存储将永久清除。', buttons: ['取消', '删除账号'], defaultId: 0, cancelId: 0, noLink: true });
      if (answer.response !== 1) return snapshot();
      deleting.add(id);
      try {
        for (const win of windows.get(id) || []) win.destroy();
        const ses = session.fromPartition(partition(id));
        await ses.closeAllConnections(); await ses.clearStorageData(); await ses.clearCache(); await ses.cookies.flushStore();
        store.remove(id); publish(); return snapshot();
      } finally { deleting.delete(id); }
    });
    handle('settings:restore', enabled => { if (typeof enabled !== 'boolean') throw new Error('无效设置'); store.state.restoreOnLaunch = enabled; store.save(); publish(); return snapshot(); });
    handle('accounts:open-all', () => { for (const a of store.state.accounts) openAccount(a.id); return snapshot(); });
    handle('accounts:close-all', () => { for (const group of windows.values()) for (const win of group) win.close(); return snapshot(); });
    createManager();
    if (store.state.restoreOnLaunch) for (const account of store.state.accounts) if (account.wasOpen) openAccount(account.id);
  });
  app.on('before-quit', event => {
    quitting = true;
    if (flushed || !store) return;
    event.preventDefault();
    Promise.all(store.state.accounts.map(a => { const ses = session.fromPartition(partition(a.id)); ses.flushStorageData(); return ses.cookies.flushStore(); })).catch(console.error).finally(() => { flushed = true; app.quit(); });
  });
  app.on('window-all-closed', () => app.quit());
}

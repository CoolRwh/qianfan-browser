const { contextBridge, ipcRenderer } = require('electron');
const invoke = async (channel, value) => { const result = await ipcRenderer.invoke(channel, value); if (!result.ok) throw new Error(result.error); return result.data; };
contextBridge.exposeInMainWorld('accounts', {
  list: () => invoke('accounts:list'), add: input => invoke('accounts:add', input),
  open: id => invoke('accounts:open', id), close: id => invoke('accounts:close', id), remove: id => invoke('accounts:delete', id),
  openAll: () => invoke('accounts:open-all'), closeAll: () => invoke('accounts:close-all'), restore: enabled => invoke('settings:restore', enabled),
  subscribe: callback => { const listener = (_event, data) => callback(data); ipcRenderer.on('accounts:changed', listener); return () => ipcRenderer.removeListener('accounts:changed', listener); }
});
contextBridge.exposeInMainWorld('sites', {
  add: input => invoke('sites:add', input), edit: input => invoke('sites:edit', input), remove: id => invoke('sites:remove', id),
  open: id => invoke('sites:open', id), close: id => invoke('sites:close', id)
});
contextBridge.exposeInMainWorld('cloudMail', {
  settings: () => invoke('mail:settings'), save: input => invoke('mail:save', input), test: input => invoke('mail:test', input),
  generate: input => invoke('mail:generate', input), code: input => invoke('mail:code', input), copy: text => invoke('mail:copy', text)
});

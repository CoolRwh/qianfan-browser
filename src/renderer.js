const $ = id => document.getElementById(id);
let state = { sites: [], accounts: [], restoreOnLaunch: true }, filter = 'all', selectedSite = null, creationMode = 'manual', creating = false;
let toastTimer;
function toast(message) { $('toast').textContent = message; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 4000); }
async function action(fn) { try { const data = await fn(); if (data) render(data); } catch (error) { toast(error.message); } }
function element(tag, className, text) { const el = document.createElement(tag); el.className = className; if (text !== undefined) el.textContent = text; return el; }
function button(label, className, handler) { const el = element('button', className, label); el.type = 'button'; el.onclick = handler; return el; }
function iconButton(label, className, name, handler) { const el = button('', className, handler); decorate(el, name, label); if (!label) el.setAttribute('aria-label', name === 'edit' ? '编辑网站' : '更多操作'); return el; }
function render(data = state) {
  state = data;
  if (selectedSite && !state.sites.some(site => site.id === selectedSite)) selectedSite = null;
  $('site-total').textContent = state.sites.length; $('total').textContent = state.accounts.length;
  $('running').textContent = state.accounts.filter(a => a.isOpen).length; $('restore').checked = state.restoreOnLaunch;
  $('breadcrumb-site').textContent = selectedSite ? state.sites.find(site => site.id === selectedSite).name : '全部网站';
  $('site-nav').replaceChildren();
  const navItem = (id, name, count) => { const el = button('', `nav ${selectedSite === id ? 'active' : ''}`, () => { selectedSite = id; render(); }); const mark = id ? siteMark(state.sites.find(site => site.id === id), true) : icon('folder'); el.append(mark, element('span', 'nav-name', name), element('span', 'nav-count', count)); $('site-nav').append(el); };
  navItem(null, '全部网站', state.accounts.length);
  state.sites.forEach(site => navItem(site.id, site.name, state.accounts.filter(a => a.siteId === site.id).length));
  const query = $('search').value.trim().toLowerCase();
  $('grid').replaceChildren(); let visible = 0;
  for (const [index, site] of state.sites.entries()) {
    if (selectedSite && site.id !== selectedSite) continue;
    const all = state.accounts.filter(a => a.siteId === site.id);
    const matchesSite = `${site.name} ${site.url}`.toLowerCase().includes(query);
    const accounts = all.filter(a => (filter === 'all' || (filter === 'open' ? a.isOpen : !a.isOpen)) && (matchesSite || `${a.name} ${a.note || ''} ${a.mail?.email || ''}`.toLowerCase().includes(query)));
    if (!accounts.length && (all.length || filter !== 'all' || !matchesSite)) continue;
    visible++;
    const group = element('section', 'site-group'); group.dataset.siteId = site.id;
    const head = element('div', 'group-header'); head.append(siteMark(site));
    const title = element('div', 'group-title'); const line = element('div', 'group-title-line');
    line.append(element('h2', '', site.name), iconButton('', 'edit-site icon-button', 'edit', () => openSites(site.id))); title.append(line, element('p', '', new URL(site.url).host)); head.append(title, element('span', 'group-count', `${all.length} 个账号`));
    const actions = element('div', 'group-actions'); actions.append(iconButton('全部打开', 'group-open', 'play', () => action(() => window.sites.open(site.id))));
    const menu = element('details', 'action-menu'); const summary = element('summary', ''); summary.append(icon('more')); summary.setAttribute('aria-label', `${site.name}网站操作`); const items = element('div', 'menu-items');
    items.append(button('关闭该网站窗口', '', () => { menu.open = false; void action(() => window.sites.close(site.id)); }), button('编辑网站', '', () => { menu.open = false; openSites(site.id); })); menu.append(summary, items); actions.append(menu); head.append(actions); group.append(head);
    for (const account of accounts) {
      const row = element('article', 'account-row card'); row.dataset.accountId = account.id;
      const avatar = element('div', `avatar color-${colorIndex(account.id)}`); avatar.append(icon('user')); row.append(avatar);
      const identity = element('div', `account-identity ${account.name.length <= 24 && (account.note || '').length <= 8 ? 'inline-note' : ''}`); const name = element('h2', 'account-name', account.name); name.title = account.name; identity.append(name);
      if (account.note) { const note = element('span', 'account-note', account.note); note.title = account.note; identity.append(note); } row.append(identity);
      const status = element('span', `status ${account.isOpen ? 'online' : ''}`, account.isOpen ? '运行中' : '未打开'); status.title = account.isOpen ? `${account.windowCount} 个窗口` : '未打开'; row.append(status);
      const controls = element('div', 'row-controls');
      controls.append(iconButton('复制账号', 'copy-account-button', 'copy', async () => { try { await window.cloudMail.copy(account.mail?.email || account.name); toast('账号已复制'); } catch (error) { toast(error.message); } }));
      if (account.mail) controls.append(iconButton('验证码', 'mail-code-button', 'mail', () => openCodeDialog(account)));
      else { const space = element('span', 'mail-action-space'); space.setAttribute('aria-hidden', 'true'); controls.append(space); }
      controls.append(iconButton(account.isOpen ? '聚焦窗口' : '打开窗口', 'open-button', 'open', () => action(() => window.accounts.open(account.id))));
      const rowMenu = element('details', 'action-menu'); const rowSummary = element('summary', ''); rowSummary.append(icon('more')); rowSummary.setAttribute('aria-label', `${account.name}账号操作`); const rowItems = element('div', 'menu-items');
      if (account.isOpen) rowItems.append(button('关闭窗口', '', () => { rowMenu.open = false; void action(() => window.accounts.close(account.id)); }));
      rowItems.append(button('删除账号', 'danger-text', () => { rowMenu.open = false; void action(() => window.accounts.remove(account.id)); })); rowMenu.append(rowSummary, rowItems); controls.append(rowMenu); row.append(controls); group.append(row);
    }
    if (!all.length) group.append(element('p', 'group-empty', '还没有账号，点击右上角“添加账号”选择此网站。'));
    $('grid').append(group);
  }
  $('empty').hidden = visible > 0;
  $('empty').querySelector('h2').textContent = state.sites.length ? '没有匹配的账号' : '从你的第一个网站开始';
  $('empty').querySelector('p').textContent = state.sites.length ? '试试其他关键词或账号状态，或者添加新账号。' : '先在左侧管理网站，再点击右上角添加账号。';
  refreshSiteSelect(); if ($('sites-dialog').open) renderSites();
}
function refreshSiteSelect(preferred) {
  const value = preferred || $('account-site').value || selectedSite;
  $('account-site').replaceChildren();
  if (!state.sites.length) { const option = element('option', '', '请先新增网站'); option.value = ''; $('account-site').append(option); }
  for (const site of state.sites) { const option = element('option', '', site.name); option.value = site.id; $('account-site').append(option); }
  if (state.sites.some(site => site.id === value)) $('account-site').value = value;
  updateSiteHost();
}
function updateSiteHost() { const site = state.sites.find(s => s.id === $('account-site').value); $('account-site-host').textContent = site ? new URL(site.url).host : '先创建网站，再为它添加账号。'; $('selected-site-mark').replaceChildren(site ? siteMark(site, true) : icon('globe')); }
async function refreshCreationConfig() {
  const config = await window.cloudMail.settings(); $('mail-service-status').textContent = config.hasPassword ? 'Cloud Mail 已配置' : 'Cloud Mail 未配置'; $('mail-service-status').classList.toggle('configured', config.hasPassword);
  $('generate-domain').value = config.domain; if (!$('generate-prefix').value) $('generate-prefix').value = config.prefix;
  return config;
}
function setCreationMode(mode) {
  creationMode = mode; $('manual-fields').hidden = mode !== 'manual'; $('auto-fields').hidden = mode !== 'auto';
  $('name').required = mode === 'manual'; $('name').disabled = mode !== 'manual';
  for (const id of ['generate-prefix', 'generate-count']) { $(id).disabled = mode !== 'auto'; $(id).required = mode === 'auto'; }
  for (const kind of ['manual', 'auto']) { $(`mode-${kind}`).classList.toggle('selected', kind === mode); $(`mode-${kind}`).setAttribute('aria-pressed', String(kind === mode)); }
  $('form-error').textContent = ''; if (mode === 'auto') void refreshCreationConfig().catch(error => { $('form-error').textContent = error.message; });
}
function openDialog() {
  if (creating) { $('dialog').show(); document.body.classList.add('drawer-open'); return; }
  $('form').reset(); $('generate-prefix').value = ''; setCreationMode('manual'); refreshSiteSelect(selectedSite); $('form-error').textContent = '';
  $('dialog').show(); document.body.classList.add('drawer-open'); $('account-site').focus();
}
function closeDrawer() { $('dialog').close(); document.body.classList.remove('drawer-open'); }
$('dialog').addEventListener('close', () => document.body.classList.remove('drawer-open'));
$('add').onclick = openDialog; $('cancel').onclick = $('cancel-x').onclick = closeDrawer;
$('mode-manual').onclick = () => setCreationMode('manual'); $('mode-auto').onclick = () => setCreationMode('auto'); $('account-site').onchange = updateSiteHost;
$('count-minus').onclick = () => { $('generate-count').value = Math.max(1, (Number($('generate-count').value) || 1) - 1); };
$('count-plus').onclick = () => { $('generate-count').value = Math.min(20, (Number($('generate-count').value) || 1) + 1); };
$('drawer-mail-settings').onclick = () => $('mail-settings').onclick();
$('form').onsubmit = async event => {
  event.preventDefault(); if (creating) return;
  const siteId = $('account-site').value; if (!siteId) { $('form-error').textContent = '请先新增并选择网站'; return; }
  const input = { siteId, name: $('name').value, note: $('account-note').value, openNow: $('open-now').checked, count: Number($('generate-count').value), prefix: $('generate-prefix').value };
  creating = true; $('submit').disabled = true; $('form-error').textContent = creationMode === 'auto' ? '正在生成账号；关闭抽屉不会取消已提交的创建。' : '';
  const fields = [...$('form').querySelectorAll('input,select,button:not(#cancel):not(#cancel-x)')]; const disabledBefore = fields.map(field => field.disabled); fields.forEach(field => { field.disabled = true; });
  try {
    if (creationMode === 'auto') { const config = await window.cloudMail.settings(); if (!config.hasPassword) throw new Error('请先配置 Cloud Mail'); const result = await window.cloudMail.generate(input); render(result.state); toast(`已生成 ${result.completed} 个邮箱账号`); }
    else { render(await window.accounts.add(input)); toast('账号已创建'); }
    closeDrawer();
  } catch (error) { $('form-error').textContent = error.message; if (!$('dialog').open) toast(error.message); await action(() => window.accounts.list()); }
  finally { creating = false; fields.forEach((field, i) => { field.disabled = disabledBefore[i]; }); $('submit').disabled = false; }
};
function resetSiteForm() { $('site-form').reset(); $('site-id').value = ''; $('site-form-title').textContent = '新增网站'; $('site-error').textContent = ''; }
function renderSites() {
  $('sites-list').replaceChildren();
  for (const site of state.sites) {
    const row = element('div', 'site-management-row'); const info = element('div', 'site-management-info'); info.append(element('strong', '', site.name), element('p', '', new URL(site.url).host)); row.append(info);
    row.append(button('编辑', '', () => fillSiteForm(site.id)));
    const remove = button('移除', 'danger-text', () => action(() => window.sites.remove(site.id))); remove.disabled = state.accounts.some(a => a.siteId === site.id); remove.title = remove.disabled ? '先删除该网站下的账号才能移除网站' : '移除空网站'; row.append(remove); $('sites-list').append(row);
  }
}
function fillSiteForm(id) { const site = state.sites.find(s => s.id === id); if (!site) return; $('site-id').value = id; $('site-name').value = site.name; $('site-url').value = site.url; $('site-form-title').textContent = '编辑网站'; $('site-error').textContent = ''; }
function openSites(id) { resetSiteForm(); renderSites(); if (id) fillSiteForm(id); $('sites-dialog').showModal(); $('site-name').focus(); }
$('manage-sites').onclick = () => openSites(); $('new-site').onclick = () => openSites(); $('site-reset').onclick = resetSiteForm;
$('site-form').onsubmit = async event => {
  event.preventDefault(); $('site-save').disabled = true; $('site-error').textContent = '';
  try {
    const input = { id: $('site-id').value, name: $('site-name').value, url: $('site-url').value };
    if (input.id) { render(await window.sites.edit(input)); toast('网站已更新'); }
    else { const result = await window.sites.add(input); render(result.state); refreshSiteSelect(result.site.id); toast('网站已创建'); }
    resetSiteForm(); if ($('dialog').open) $('sites-dialog').close();
  } catch (error) { $('site-error').textContent = error.message; }
  finally { $('site-save').disabled = false; }
};
$('search').oninput = () => render();
document.querySelectorAll('[data-filter]').forEach(el => { el.onclick = () => { filter = el.dataset.filter; document.querySelectorAll('[data-filter]').forEach(other => other.classList.toggle('selected', other === el)); render(); }; });
$('restore').onchange = () => action(async () => { try { return await window.accounts.restore($('restore').checked); } catch (error) { $('restore').checked = state.restoreOnLaunch; throw error; } });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && $('dialog').open && !document.querySelector('dialog:modal')) closeDrawer(); });
document.addEventListener('click', event => { document.querySelectorAll('.action-menu[open]').forEach(menu => { if (!menu.contains(event.target)) menu.open = false; }); });
document.querySelector('.logo').replaceChildren(brandMark());
decorate($('manage-sites'), 'plus', '管理网站'); decorate($('mail-settings'), 'settings', '邮箱服务设置');
decorate(document.querySelector('.local-session'), 'database', '本地独立会话'); decorate($('add'), 'plus', '添加账号');
document.querySelector('.search > span').replaceChildren(icon('search')); decorate($('new-site'), 'plus', '新增网站');
decorate($('cancel-x'), 'close'); document.querySelectorAll('[data-close]').forEach(el => decorate(el, 'close'));
document.querySelector('.service-icon').replaceChildren(icon('cloud')); decorate($('count-minus'), 'minus'); decorate($('count-plus'), 'plus');
decorate(document.querySelector('.drawer-hint'), 'info', '网站名称可自定义；同一网站的账号会自动归组。');
document.querySelector('.empty > span').replaceChildren(icon('folder'));
window.accounts.subscribe(render); action(() => window.accounts.list());

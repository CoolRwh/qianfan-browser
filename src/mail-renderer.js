const mailConfigInput = () => ({ baseURL: $('mail-api').value, adminEmail: $('mail-admin').value, password: $('mail-password').value, domain: $('mail-domain').value, prefix: $('mail-prefix').value });
let codeAccount = null, codeGeneration = 0, codeTimer, currentCode = null;
let codeMessages = [], selectedMailText = '';
function resetMailPreview() {
  codeMessages = []; selectedMailText = ''; $('code-mail-section').hidden = true; $('code-mail-list').replaceChildren();
  $('code-body').value = $('code-html').value = $('code-manual').value = '';
  $('code-use-selection').disabled = true; $('code-selection-hint').textContent = '在原文中选中验证码，再点击使用。';
}
function chooseMail(index) {
  const mail = codeMessages[index]; if (!mail) return;
  stopCodePolling(); selectedMailText = ''; $('code-use-selection').disabled = true;
  $('code-selection-hint').textContent = '在原文中选中验证码，再点击使用。';
  currentCode = mail.code || null; $('code-value').textContent = currentCode || '待手动选择';
  $('code-manual').value = currentCode || ''; $('code-copy').disabled = !currentCode;
  $('code-body').value = `主题：${mail.subject || '无主题'}\n\n${mail.body || '此邮件没有纯文本正文，请查看 HTML 原文或邮件主题。'}`;
  $('code-html').value = mail.html || ''; $('code-html-section').hidden = !mail.html; $('code-html-section').open = false;
  $('code-meta').textContent = `${mail.subject} · ${mail.sender} · ${new Date(mail.receivedAt).toLocaleString('zh-CN')}`;
  $('code-message').textContent = currentCode ? '已识别验证码，请核对原文；也可手动修改。' : '已收到邮件，未能明确识别验证码，请从原文中选取或手动填写。';
}
function showMailPreview(messages) {
  codeMessages = messages; $('code-mail-section').hidden = false; $('code-mail-list').replaceChildren();
  messages.forEach((mail, index) => { const option = document.createElement('option'); option.value = index; option.textContent = `${mail.subject || '无主题'} · ${new Date(mail.receivedAt).toLocaleTimeString('zh-CN')}`; $('code-mail-list').append(option); });
  chooseMail(0);
}
function captureMailSelection(event) {
  const input = event.target; selectedMailText = input.value.slice(input.selectionStart, input.selectionEnd).trim();
  $('code-use-selection').disabled = !selectedMailText || selectedMailText.length > 64;
  $('code-selection-hint').textContent = selectedMailText ? (selectedMailText.length > 64 ? '选中内容过长，请只选择验证码。' : `已选中：${selectedMailText}`) : '在原文中选中验证码，再点击使用。';
}
for (const id of ['code-body', 'code-html']) for (const event of ['select', 'mouseup', 'keyup']) $(id).addEventListener(event, captureMailSelection);
$('code-mail-list').onchange = () => chooseMail(Number($('code-mail-list').value));
$('code-manual').oninput = () => { stopCodePolling(); currentCode = $('code-manual').value.trim() || null; $('code-copy').disabled = !currentCode; $('code-value').textContent = currentCode || '待手动选择'; $('code-message').textContent = '使用手动填写的验证码，请核对后复制。'; };
$('code-use-selection').onclick = () => { if (selectedMailText && selectedMailText.length <= 64) { $('code-manual').value = selectedMailText; $('code-manual').oninput(); $('code-message').textContent = '已使用原文中选中的内容，可点击复制验证码。'; } };
function stopCodePolling() { codeGeneration++; clearTimeout(codeTimer); }
document.querySelectorAll('[data-close]').forEach(button => { button.onclick = () => $(button.dataset.close).close(); });
$('mail-code-dialog').addEventListener('close', () => { stopCodePolling(); codeAccount = null; currentCode = null; resetMailPreview(); });
$('mail-settings-dialog').addEventListener('close', () => { $('mail-password').value = ''; });
$('mail-settings').onclick = async () => {
  try {
    const config = await window.cloudMail.settings();
    $('mail-api').value = config.baseURL; $('mail-admin').value = config.adminEmail; $('mail-domain').value = config.domain; $('mail-prefix').value = config.prefix;
    $('mail-password').value = ''; $('mail-password').placeholder = config.hasPassword ? '已保存密码；留空保留，输入新密码替换' : '请输入管理员密码';
    $('mail-settings-message').textContent = ''; $('mail-settings-dialog').showModal();
  } catch (error) { toast(error.message); }
};
async function configAction(test) {
  $('mail-save').disabled = $('mail-test').disabled = true; $('mail-settings-message').textContent = test ? '正在测试连接…' : '正在保存…';
  try {
    if (test) { await window.cloudMail.test(mailConfigInput()); $('mail-settings-message').textContent = '登录成功，可以连接 Cloud Mail。邮箱创建权限和域名需在生成时验证。'; }
    else { await window.cloudMail.save(mailConfigInput()); $('mail-settings-dialog').close(); if ($('dialog').open) { $('generate-prefix').value = ''; await refreshCreationConfig(); } toast('Cloud Mail 配置已保存'); }
  } catch (error) { $('mail-settings-message').textContent = error.message; }
  finally { $('mail-save').disabled = $('mail-test').disabled = false; }
}
$('mail-test').onclick = () => configAction(true);
$('mail-settings-form').onsubmit = event => { event.preventDefault(); void configAction(false); };
function openCodeDialog(account) {
  stopCodePolling(); codeAccount = account; currentCode = null;
  resetMailPreview();
  $('code-address').textContent = account.mail.email; $('code-value').textContent = '— — — — — —'; $('code-meta').textContent = ''; $('code-copy').disabled = true;
  $('mail-code-dialog').showModal(); void queryCode(false);
}
async function queryCode(wait) {
  if (!codeAccount) return;
  stopCodePolling(); const generation = codeGeneration; const id = codeAccount.id; const started = Date.now();
  const since = wait ? started - 30000 : started - 15 * 60000;
  currentCode = null; $('code-copy').disabled = true; $('code-value').textContent = '— — — — — —'; $('code-meta').textContent = '';
  resetMailPreview();
  const poll = async () => {
    if (generation !== codeGeneration) return;
    $('code-message').textContent = wait ? '等待新邮件到达…' : '正在查询最近验证码…';
    try {
      const result = await window.cloudMail.code({ id, since });
      if (generation !== codeGeneration) return;
      if (result.messages?.length) { showMailPreview(result.messages); return; }
      if (wait && Date.now() - started < 120000) { $('code-message').textContent = '尚未收到验证码，5 秒后重试…'; codeTimer = setTimeout(poll, 5000); }
      else $('code-message').textContent = wait ? '等待已结束，尚未找到新验证码。可以再次等待。' : '过去 15 分钟尚未找到验证码，请发送验证邮件后点击等待。';
    } catch (error) { if (generation === codeGeneration) $('code-message').textContent = error.message; }
  };
  await poll();
}
$('code-refresh').onclick = () => queryCode(false); $('code-wait').onclick = () => queryCode(true);
$('code-copy').onclick = async () => { if (currentCode) { try { await window.cloudMail.copy(currentCode); toast('验证码已复制'); } catch (error) { toast(error.message); } } };

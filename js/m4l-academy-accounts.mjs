// Remembered IDs are display hints only. Every account switch uses server PIN verification.
const tokenKey = 'm4l_account_token';
const apiBase = () => String(window.M4L_CONFIG?.API_BASE || '').replace(/\/$/, '');
export const rememberedKey = base => 'm4l_academy_remembered_ids_v1:' + encodeURIComponent(String(base || '').replace(/\/$/, ''));
const validId = id => typeof id === 'string' && /^[A-Za-z0-9._~-]{1,128}$/.test(id);

export function readRemembered(storage, base) {
  try {
    const raw = storage.getItem(rememberedKey(base)) || '[]';
    if (raw.length > 65536) return [];
    const rows = JSON.parse(raw), seen = new Set();
    if (!Array.isArray(rows)) return [];
    return rows.filter(row => validId(row?.id) && Number.isFinite(row.lastUsed) && row.lastUsed >= 0)
      .sort((a, b) => b.lastUsed - a.lastUsed).filter(row => {
        const id = row.id.toUpperCase();
        if (seen.has(id)) return false;
        seen.add(id); return true;
      }).slice(0, 10).map(row => ({ id: row.id, name: String(row.name || '').slice(0, 128), lastUsed: row.lastUsed }));
  } catch { return []; }
}

export function forgetRemembered(storage, base, id) {
  try {
    if (!id) storage.removeItem(rememberedKey(base));
    else storage.setItem(rememberedKey(base), JSON.stringify(readRemembered(storage, base).filter(row => row.id.toUpperCase() !== id.toUpperCase())));
    return true;
  } catch { return false; }
}

export function rememberVerified(storage, base, account, now = Date.now()) {
  const id = String(account?.uniqueid || '').trim();
  if (!validId(id)) return false;
  const row = { id, name: String(account.displayName || '').trim().slice(0, 128), lastUsed: now };
  try {
    storage.setItem(rememberedKey(base), JSON.stringify([row, ...readRemembered(storage, base).filter(saved => saved.id.toUpperCase() !== id.toUpperCase())].slice(0, 10)));
    return true;
  } catch { return false; }
}

// Keep drafts scoped to their existing owner. Discard reusable private response caches.
export function clearPrivateState(local, session) {
  session.removeItem('m4l_academy_signed_in');
  for (const key of ['m4l_account_context', 'm4l_account_contexts', 'm4l_account_workspace', 'maktab_token', 'maktab_user_type']) local.removeItem(key);
  for (let i = local.length - 1; i >= 0; i--) {
    const key = local.key(i);
    if (key && (key.startsWith('m4l_library_v1:') && key.includes(':personal:') || ['m4l_app_cache_', 'maktab_timetable_cache_', 'm4l_academy_timetable_'].some(prefix => key.startsWith(prefix)))) local.removeItem(key);
  }
  for (let i = session.length - 1; i >= 0; i--) {
    const key = session.key(i);
    if (key && ['m4l_read_v1:', 'm4l_admin_progress_dashboard_', 'm4l_academy_daily_timetable_', 'm4l_academy_timetable_return_', 'm4l_academy_memorisation_return_'].some(prefix => key.startsWith(prefix))) session.removeItem(key);
  }
}

export function installAccounts({ actions, signOut }) {
  if (window.M4L_ACADEMY_ACCOUNTS) return;
  const local = window.localStorage, session = window.sessionStorage, base = apiBase();
  const currentToken = () => local.getItem(tokenKey) || '';
  let pageToken = currentToken(), ticket = 0, committing = false, leaving = false, requesting = false;
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/css/m4l-academy-accounts.css?v=107.97'; document.head.append(css);
  const switchButton = document.createElement('button');
  switchButton.type = 'button'; switchButton.id = 'academy-switch-account';
  switchButton.setAttribute('aria-label', 'Switch account'); switchButton.setAttribute('aria-haspopup', 'dialog');
  switchButton.title = 'Switch account';
  switchButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4"/></svg><span>Switch account</span>';
  actions.insertBefore(switchButton, signOut);

  const dialog = document.createElement('dialog'); dialog.id = 'academy-account-switcher'; dialog.className = 'academy-account-switcher';
  dialog.setAttribute('aria-labelledby', 'account-switch-title');
  dialog.innerHTML = `<div class="account-switch-heading"><h2 id="account-switch-title">Switch account</h2><button type="button" data-switch-close class="academy-close" aria-label="Close account switcher">×</button></div>
    <p>Choose an account and enter its PIN. This switches all Academy tabs in this browser.</p>
    <section data-switch-list></section>
    <form data-switch-form autocomplete="off" novalidate>
      <label for="account-switch-id">Account ID</label><input id="account-switch-id" autocomplete="username" spellcheck="false" maxlength="128" required>
      <label for="account-switch-pin">PIN</label><div class="account-switch-pin"><input id="account-switch-pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off" required><button type="button" data-switch-pin-toggle aria-label="Show PIN">Show</button></div>
      <label class="academy-remember-id"><input type="checkbox" data-switch-remember checked>Remember my ID on this browser</label>
      <button type="submit" class="account-switch-submit">Switch account</button>
      <p data-switch-status role="status" aria-live="polite" hidden></p>
    </form>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form'), idInput = dialog.querySelector('#account-switch-id'), pinInput = dialog.querySelector('#account-switch-pin');
  const remember = dialog.querySelector('[data-switch-remember]'), status = dialog.querySelector('[data-switch-status]'), close = dialog.querySelector('[data-switch-close]'), toggle = dialog.querySelector('[data-switch-pin-toggle]');
  const normalForm = document.getElementById('login-preview');
  let normalList, normalRemember;
  if (normalForm) {
    normalList = document.createElement('section'); normalList.className = 'academy-remembered-login';
    normalForm.querySelector('label').before(normalList);
    const label = document.createElement('label'); label.className = 'academy-remember-id';
    normalRemember = document.createElement('input'); normalRemember.type = 'checkbox'; normalRemember.id = 'academy-remember-id'; normalRemember.defaultChecked = normalRemember.checked = true;
    label.append(normalRemember, document.createTextNode('Remember my ID on this browser'));
    normalForm.querySelector('button[type="submit"]').before(label);
  }
  // Personal-link PIN setup/login uses the same optional ID-only preference.
  for (const name of ['login-form', 'setup-form']) {
    const accountForm = document.getElementById(name);
    if (!accountForm) continue;
    const label = document.createElement('label'); label.className = 'academy-remember-id';
    const input = document.createElement('input'); input.type = 'checkbox'; input.id = name + '-remember-id'; input.defaultChecked = input.checked = true;
    label.append(input, document.createTextNode('Remember my ID on this browser'));
    accountForm.querySelector('button[type="submit"]').before(label);
  }

  function message(text) { status.textContent = text; status.hidden = !text; }
  function resetPin(input = pinInput, button = toggle) {
    input.value = ''; input.type = 'password'; button.textContent = 'Show'; button.setAttribute('aria-label', 'Show PIN');
  }
  function choose(row, normal = false) {
    const input = normal ? document.getElementById('demo-username') : idInput;
    input.value = row?.id || '';
    const pin = normal ? document.getElementById('demo-pin') : pinInput;
    resetPin(pin, normal ? document.getElementById('demo-pin-toggle') : toggle);
    (normal ? normalRemember : remember).checked = true;
    if (!normal) message('');
    (row ? pin : input).focus();
  }
  function renderList(host, normal = false) {
    host.replaceChildren();
    const rows = readRemembered(local, base);
    if (!rows.length) return;
    const heading = document.createElement('h3'); heading.textContent = 'Remembered accounts'; host.append(heading);
    const list = document.createElement('ul'); list.className = 'academy-remembered-accounts'; host.append(list);
    for (const row of rows) {
      const li = document.createElement('li'), select = document.createElement('button'), remove = document.createElement('button');
      select.type = remove.type = 'button'; select.className = 'remembered-account'; select.dataset.rememberedId = row.id;
      const name = document.createElement('strong'), id = document.createElement('small');
      name.textContent = row.name || row.id; id.textContent = row.id; select.append(name); if (row.name) select.append(id);
      select.addEventListener('click', () => choose(row, normal));
      remove.className = 'forget-account'; remove.textContent = 'Remove'; remove.setAttribute('aria-label', 'Remove ' + row.id + ' from this browser');
      remove.addEventListener('click', () => {
        if (!forgetRemembered(local, base, row.id)) { message('This browser could not remove the remembered ID.'); return; }
        if (idInput.value.toUpperCase() === row.id.toUpperCase()) remember.checked = false;
        if (normalRemember && document.getElementById('demo-username').value.toUpperCase() === row.id.toUpperCase()) normalRemember.checked = false;
        renderLists();
      });
      li.append(select, remove); list.append(li);
    }
    const footer = document.createElement('div'); footer.className = 'remembered-account-actions';
    const another = document.createElement('button'), forget = document.createElement('button'); another.type = forget.type = 'button';
    another.textContent = 'Use another ID'; another.addEventListener('click', () => choose(null, normal));
    forget.textContent = 'Forget all remembered IDs'; forget.addEventListener('click', () => {
      if (!forgetRemembered(local, base)) { message('This browser could not remove the remembered IDs.'); return; }
      remember.checked = false; if (normalRemember) normalRemember.checked = false; renderLists();
    });
    footer.append(another, forget); host.append(footer);
  }
  function renderLists() { renderList(dialog.querySelector('[data-switch-list]')); if (normalList) renderList(normalList, true); if (requesting) busy(true); }
  function busy(value) {
    requesting = value;
    for (const input of form.elements) input.disabled = value;
    for (const button of dialog.querySelectorAll('[data-switch-list] button')) button.disabled = value;
  }
  function open() {
    if (!currentToken() || dialog.open) return;
    ++ticket; committing = false; busy(false); resetPin(); idInput.value = ''; remember.checked = true; message(''); renderLists();
    dialog.showModal(); (dialog.querySelector('[data-remembered-id]') || idInput).focus();
  }
  switchButton.addEventListener('click', open);
  const identity = document.getElementById('academy-header-name') || document.getElementById('academy-shell-name');
  if (identity) {
    identity.setAttribute('role', 'button'); identity.setAttribute('aria-label', 'Switch account'); identity.setAttribute('aria-haspopup', 'dialog'); identity.tabIndex = 0;
    identity.addEventListener('click', open);
    identity.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } });
  }
  close.addEventListener('click', () => { if (!committing) dialog.close(); });
  dialog.addEventListener('cancel', event => { if (committing) event.preventDefault(); });
  dialog.addEventListener('close', () => { ++ticket; resetPin(); busy(false); message(''); switchButton.focus(); });
  pinInput.addEventListener('input', () => { pinInput.value = pinInput.value.replace(/\D/g, '').slice(0, 4); });
  toggle.addEventListener('click', () => {
    const visible = pinInput.type === 'password'; pinInput.type = visible ? 'text' : 'password'; toggle.textContent = visible ? 'Hide' : 'Show'; toggle.setAttribute('aria-label', visible ? 'Hide PIN' : 'Show PIN');
  });

  async function request(path, payload, token = '') {
    const response = await fetch(base + path, { method: 'POST', keepalive: path.endsWith('/logout'), headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok || result.success !== true) throw Object.assign(Error(result.error || 'The account service is unavailable. Please try again.'), { status: response.status });
    return result;
  }
  const revokeUnused = token => request('/api/account/logout', {}, token).catch(() => {});
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (committing || form.querySelector('[type=submit]').disabled) return;
    const uniqueid = idInput.value.trim(), pin = pinInput.value, oldToken = currentToken(), turn = ++ticket;
    if (!validId(uniqueid)) { message('Enter your account ID.'); idInput.focus(); return; }
    if (!/^\d{4}$/.test(pin)) { message('Enter your complete 4-digit PIN.'); pinInput.focus(); return; }
    if (!oldToken) { message('Your sign-in changed. Open Login again.'); return; }
    // Existing page guards also save recoverable drafts. Do not switch during unfinished work.
    if (!window.dispatchEvent(new Event('beforeunload', { cancelable: true }))) { message('Save or close your unfinished work before switching accounts.'); return; }
    const optIn = remember.checked;
    busy(true); message('Checking PIN…');
    let nextToken = '', applied = false;
    const active = () => turn === ticket && dialog.open && currentToken() === oldToken;
    try {
      const result = await request('/api/account/login', { uniqueid, pin });
      nextToken = result.token || '';
      if (!nextToken || !validId(result.account?.uniqueid) || result.account.uniqueid.toUpperCase() !== uniqueid.toUpperCase()) throw Error('The account service could not verify that account.');
      if (!active()) return;
      if (!window.dispatchEvent(new Event('beforeunload', { cancelable: true }))) { message('Save or close your unfinished work before switching accounts.'); return; }
      committing = true; close.disabled = true; message('Switching account…');
      // Only end the previous session after the new PIN has been accepted.
      try { await request('/api/account/logout', {}, oldToken); }
      catch (error) { if (error.status !== 401) throw error; } // Already expired or revoked sessions are ended.
      if (!active()) return;
      clearPrivateState(local, session);
      window.M4L_ACADEMY_READ_CACHE?.invalidate({ privateOnly: true });
      local.setItem(tokenKey, nextToken); applied = true; pageToken = nextToken;
      try { session.setItem('m4l_academy_signed_in', result.account.uniqueid); } catch { /* The verified session can restore without a tab-local ID hint. */ }
      if (optIn) rememberVerified(local, base, result.account); else forgetRemembered(local, base, result.account.uniqueid);
      // Start at the neutral entry point; its verified roles choose the new workspace.
      protectAndOpen();
    } catch (error) {
      if (turn === ticket) { resetPin(); message(error.message || 'The account could not be switched. Please try again.'); pinInput.focus(); }
    } finally {
      if (nextToken && !applied) void revokeUnused(nextToken);
      if (turn === ticket) { committing = false; close.disabled = false; busy(false); }
    }
  });

  function protectAndOpen() {
    if (leaving) return; leaving = true; ++ticket;
    document.body.classList.add('academy-changing-account');
    window.M4L_ACADEMY_READ_CACHE?.invalidate({ privateOnly: true });
    for (const popup of document.querySelectorAll('dialog[open]')) popup.close();
    for (const child of document.body.children) child.inert = true;
    const mask = document.createElement('section'); mask.className = 'academy-account-changing'; mask.setAttribute('role', 'status');
    const text = document.createElement('p'); text.textContent = 'Account changed. Opening its workspace…';
    const openAccount = () => {
      // A hash-only move on /academy/ would retain the previous account's JS state.
      window.history.replaceState(null, '', '/academy/#overview');
      window.M4L_ACADEMY_WORKSPACE?.commit();
      window.dispatchEvent(new Event('m4l-academy-session'));
      window.location.reload();
    };
    const link = document.createElement('a'); link.href = '/academy/#overview'; link.textContent = 'Open account';
    link.addEventListener('click', event => { event.preventDefault(); openAccount(); });
    mask.append(text, link); document.body.append(mask); openAccount();
  }
  function update() { switchButton.hidden = !currentToken(); if (identity) identity.tabIndex = currentToken() ? 0 : -1; }
  window.M4L_ACADEMY_ACCOUNTS = Object.freeze({
    recordLogin(account, source = 'login-preview') {
      pageToken = currentToken();
      const preference = source === 'login-preview' ? normalRemember : document.getElementById(source + '-remember-id');
      const optIn = preference?.checked;
      if (optIn) rememberVerified(local, base, account); else if (validId(account?.uniqueid)) forgetRemembered(local, base, account.uniqueid);
      if (preference) preference.checked = true;
      renderLists(); update();
    }, open
  });
  window.addEventListener('m4l-academy-session', update);
  window.addEventListener('storage', event => {
    if (event.key === rememberedKey(base)) { renderLists(); return; }
    if ((event.key === tokenKey && event.oldValue && event.oldValue !== event.newValue || event.key === null && pageToken && pageToken !== currentToken()) && !leaving) {
      event.stopImmediatePropagation(); clearPrivateState(local, session); protectAndOpen();
    }
    update();
  }, true);
  window.addEventListener('pageshow', event => {
    if (event.persisted && pageToken !== currentToken()) {
      // Run before older page restoration handlers can compare against the former ID.
      event.stopImmediatePropagation(); clearPrivateState(local, session); protectAndOpen();
    }
  }, true);
  renderLists(); update();
}

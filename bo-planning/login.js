/* BO Planning System – accounts, sign-in and loader.
   Only approved accounts get in: a person requests access, the admin approves it (Users & requests), then they
   sign in with their email and password. The server (bo-api/) checks every call; after sign-in it hands out the
   key that opens the tool's code (app.bundle), which is decrypted in this browser and kept in memory only.
   The rest of the website stays open to everyone. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const yr = $('yr'); if (yr) yr.textContent = new Date().getFullYear();
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const API = '../bo-api/';
  let me = null; let mounted = false;

  /* ---------- server calls ---------- */
  async function api(path, body, opts = {}) {
    const isForm = body instanceof FormData;
    let res;
    try {
      res = await fetch(API + path, {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: Object.assign({ 'X-BO-Request': '1' }, isForm ? {} : { 'Content-Type': 'application/json' }),
        body: isForm ? body : JSON.stringify(body || {})
      });
    } catch (_) { throw Object.assign(new Error('The server cannot be reached. Check the connection and try again.'), { offline: true }); }
    if (opts.raw && res.ok) return res;
    let data = null; try { data = await res.json(); } catch (_) { /* not JSON */ }
    if (!data) throw Object.assign(new Error(res.status === 404 ? 'Sign-in is available on freightkit.in only.' : 'The server gave an unexpected answer.'), { status: res.status });
    if (!res.ok || data.ok === false) {
      if (data.signedOut && mounted) { signedOut('You were signed out (1 hour without activity, or your account changed). Sign in again.'); }
      throw Object.assign(new Error(data.error || 'Something went wrong.'), { status: res.status, data });
    }
    return data;
  }

  /* ---------- screens ---------- */
  function show(id) { ['login-card', 'request-card', 'password-card'].forEach((x) => { const el = $(x); if (el) el.hidden = x !== id; }); }
  function say(id, msg, kind) { const el = $(id); if (!el) return; el.textContent = msg || ''; el.className = 'bo-login-status' + (kind === 'error' ? ' is-error' : kind === 'ok' ? ' is-ok' : ''); }
  function signedOut(msg) { sessionStorage.setItem('bo-signed-out', msg || ''); window.location.reload(); }

  $('login-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const email = $('login-email').value.trim().toLowerCase(); const password = $('login-password').value;
    if (!email || !password) { say('login-status', 'Enter your email and password.', 'error'); return; }
    if (!window.crypto || !crypto.subtle || typeof DecompressionStream === 'undefined') { say('login-status', 'This browser is too old for this tool. Use a current Chrome, Edge, Firefox or Safari.', 'error'); return; }
    $('login-btn').disabled = true; say('login-status', 'Signing in…');
    try {
      const r = await api('auth.php?a=login', { email, password });
      $('login-password').value = '';
      await enter(r.user);
    } catch (err) {
      say('login-status', err.message, 'error'); $('login-password').value = ''; $('login-password').focus();
    } finally { $('login-btn').disabled = false; }
  });
  $('show-request').addEventListener('click', () => { show('request-card'); say('request-status', ''); $('rq-name').focus(); });
  $('back-login').addEventListener('click', () => { show('login-card'); $('login-email').focus(); });
  $('request-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = (id) => $(id).value.trim();
    if ($('rq-pass').value !== $('rq-pass2').value) { say('request-status', 'The two passwords are not the same.', 'error'); return; }
    $('rq-btn').disabled = true; say('request-status', 'Sending…');
    try {
      const r = await api('auth.php?a=request', { name: f('rq-name'), email: f('rq-email').toLowerCase(), company: f('rq-company'), note: f('rq-note'), password: $('rq-pass').value });
      $('request-form').reset(); say('request-status', r.message, 'ok');
    } catch (err) { say('request-status', err.message, 'error'); } finally { $('rq-btn').disabled = false; }
  });
  $('password-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if ($('pw-next').value !== $('pw-next2').value) { say('password-status', 'The two new passwords are not the same.', 'error'); return; }
    $('pw-btn').disabled = true; say('password-status', 'Saving…');
    try {
      await api('auth.php?a=password', { current: $('pw-current').value, next: $('pw-next').value });
      $('password-form').reset(); say('password-status', 'Password changed.', 'ok');
      if (!mounted) await enter(Object.assign({}, me, { mustChange: false })); else setTimeout(() => { $('password-card').hidden = true; $('app-root').hidden = false; }, 800);
    } catch (err) { say('password-status', err.message, 'error'); } finally { $('pw-btn').disabled = false; }
  });
  $('pw-cancel').addEventListener('click', () => { if (!mounted) { signOut(); return; } $('password-card').hidden = true; $('app-root').hidden = false; });

  /* ---------- open the tool ---------- */
  async function enter(user) {
    me = user;
    $('signed-user').textContent = user.name || user.email;
    $('signed-in').hidden = false; $('sign-out').hidden = false; $('site-link').hidden = true;
    if (user.mustChange) { show('password-card'); say('password-status', 'Choose a new password before you start (the admin set a temporary one).'); $('pw-cancel').textContent = 'Sign out'; $('pw-current').focus(); return; }
    show(null); $('login-wrap').hidden = true;
    const loading = $('app-loading'); loading.hidden = false;
    try {
      const k = await api('auth.php?a=appkey');
      const res = await fetch('app.bundle', { cache: 'no-store' });
      if (!res.ok) throw new Error('The tool file could not be loaded.');
      const bundle = await res.json();
      if (bundle.format !== 'bo-bundle-2') throw new Error('The tool file is out of date. Reload the page.');
      const key = await crypto.subtle.importKey('raw', b64(k.key), { name: 'AES-GCM' }, false, ['decrypt']);
      const packed = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(bundle.iv), additionalData: new TextEncoder().encode('bo-bundle-2') }, key, b64(bundle.data));
      const app = JSON.parse(await new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text());
      // The user's newest saved work (their rules and the "last saved" time); the files load only on Reset.
      let latest = null; try { latest = await api('work.php?a=latest'); } catch (_) { /* nothing saved yet */ }
      // What the tool needs from the shell: who is signed in, their latest save and how to reach the server.
      Object.defineProperty(window, 'BO_SESSION', { value: Object.freeze({ user: Object.freeze(Object.assign({}, user)), latest, api, signedOut }), writable: false, configurable: false });
      const style = document.createElement('style'); style.textContent = app.css; document.head.appendChild(style);
      $('app-root').innerHTML = app.html;
      for (const s of app.scripts) await loadScript(s.code, s.name);
      mounted = true;
      $('pw-open').hidden = false;
      if (user.role === 'admin') { $('admin-open').hidden = false; refreshPending(); }
      watchIdle();
    } catch (err) {
      $('login-wrap').hidden = false; show('login-card'); say('login-status', err.message || 'Could not open the tool.', 'error');
    } finally { loading.hidden = true; }
  }
  function loadScript(code, name) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(new Blob([code + `\n//# sourceURL=bo/${name}`], { type: 'text/javascript' }));
      const s = document.createElement('script'); s.src = url;
      s.onload = () => { URL.revokeObjectURL(url); resolve(); };
      s.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Could not start ${name}.`)); };
      document.body.appendChild(s);
    });
  }

  /* ---------- sign out, password, idle ---------- */
  async function signOut() {
    if (mounted && window.BO_HAS_UNSAVED && window.BO_HAS_UNSAVED() && !window.confirm('You have unsaved work. Sign out anyway? Unsaved changes are lost.')) return;
    try { await api('auth.php?a=logout'); } catch (_) { /* signed out anyway */ }
    window.BO_LEAVING = true; window.location.reload();
  }
  $('sign-out').addEventListener('click', signOut);
  $('pw-open').addEventListener('click', () => { $('app-root').hidden = true; $('login-wrap').hidden = false; show('password-card'); say('password-status', ''); $('pw-cancel').textContent = 'Cancel'; $('pw-current').focus(); });
  // Signed out after 1 hour without activity (the server does the same); unsaved work is lost, so warn first.
  const IDLE_MS = 60 * 60 * 1000; const WARN_MS = 5 * 60 * 1000;
  function watchIdle() {
    let last = Date.now(); let warn = null; let ping = 0;
    const hideWarn = () => { if (warn) { warn.remove(); warn = null; } };
    const seen = () => {
      last = Date.now(); hideWarn();
      // Keep the server session alive while the person works (at most once every 5 minutes).
      if (Date.now() - ping > 5 * 60 * 1000) { ping = Date.now(); api('auth.php?a=me').catch(() => {}); }
    };
    ['pointerdown', 'keydown', 'wheel', 'touchstart', 'input'].forEach((t) => window.addEventListener(t, seen, { capture: true, passive: true }));
    const check = () => {
      const idle = Date.now() - last;
      if (idle >= IDLE_MS) { window.BO_LEAVING = true; api('auth.php?a=logout').finally(() => signedOut('You were signed out after 1 hour without activity.')); return; }
      if (idle >= IDLE_MS - WARN_MS && !warn) {
        warn = document.createElement('div'); warn.className = 'bo-idle-warn'; warn.setAttribute('role', 'alert');
        warn.textContent = 'No activity for almost an hour: you will be signed out in a few minutes. Save your work, or click anywhere to stay signed in.';
        document.body.appendChild(warn);
      }
    };
    setInterval(check, 15000); document.addEventListener('visibilitychange', check);
  }

  /* ---------- admin: requests and users ---------- */
  const fmtT = (t) => (t ? new Date(t * 1000).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
  const mb = (b) => (b ? `${(b / 1048576).toFixed(1)} MB` : '');
  async function refreshPending() {
    try { const r = await api('admin.php?a=list'); const n = r.users.filter((u) => u.status === 'pending').length; $('admin-count').textContent = n ? String(n) : ''; $('admin-count').hidden = !n; return r; } catch (_) { return null; }
  }
  async function openAdmin() {
    $('admin-panel').hidden = false; $('admin-body').innerHTML = '<p class="muted-small">Loading…</p>';
    const r = await refreshPending(); if (!r) { $('admin-body').innerHTML = '<p class="bo-login-status is-error">Could not load the accounts.</p>'; return; }
    const pending = r.users.filter((u) => u.status === 'pending'); const others = r.users.filter((u) => u.status !== 'pending');
    const st = { approved: 'Active', disabled: 'Disabled', rejected: 'Rejected' };
    $('admin-body').innerHTML = `<h3>Access requests <span class="muted-small">${pending.length || 'none waiting'}</span></h3>
${pending.length ? `<div class="bo-adm-list">${pending.map((u) => `<div class="bo-adm-item"><div><strong>${esc(u.name)}</strong> · ${esc(u.email)}${u.company ? ` · ${esc(u.company)}` : ''}<span class="muted-small">${esc(u.note || 'No reason given')} · asked ${esc(fmtT(u.created_at))}</span></div><div class="bo-adm-btns"><button class="btn bo-btn-sm" data-adm="approve" data-id="${u.id}">Approve</button><button class="btn secondary bo-btn-sm" data-adm="reject" data-id="${u.id}">Reject</button></div></div>`).join('')}</div>` : ''}
<h3>Accounts</h3>
<div class="table-scroll"><table class="data-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last sign-in</th><th>Saved work</th><th></th></tr></thead><tbody>${others.map((u) => `<tr><td>${esc(u.name)}${u.company ? `<span class="bo-sub">${esc(u.company)}</span>` : ''}</td><td>${esc(u.email)}</td><td>${u.role === 'admin' ? 'Admin' : 'User'}</td><td>${esc(st[u.status] || u.status)}${u.must_change ? '<span class="bo-sub">must change password</span>' : ''}</td><td>${esc(fmtT(u.last_login))}</td><td>${u.saves ? `${u.saves} · ${esc(mb(u.bytes))}<span class="bo-sub">last ${esc(fmtT(u.lastSave))}</span>` : '—'}</td>
<td class="bo-adm-btns">${u.id === r.me ? '<span class="muted-small">You</span>' : `${u.status === 'approved' ? `<button class="text-button" data-adm="disable" data-id="${u.id}">Disable</button>` : `<button class="text-button" data-adm="enable" data-id="${u.id}">${u.status === 'rejected' ? 'Approve' : 'Enable'}</button>`}<button class="text-button" data-adm="reset" data-id="${u.id}" data-name="${esc(u.name)}">Reset password</button><button class="text-button" data-adm="role" data-role="${u.role === 'admin' ? 'user' : 'admin'}" data-id="${u.id}">${u.role === 'admin' ? 'Make user' : 'Make admin'}</button><button class="text-button danger-text" data-adm="delete" data-id="${u.id}" data-name="${esc(u.name)}">Delete</button>`}</td></tr>`).join('') || '<tr><td colspan="7" class="bo-empty">No accounts yet.</td></tr>'}</tbody></table></div>
<h3>Email settings</h3>
<p class="bo-adm-mailwarn" id="adm-mail-warn" hidden></p>
<form class="bo-adm-mail" id="adm-mail"><div class="field"><label for="adm-notify">Send access requests to</label><input id="adm-notify" type="email" placeholder="your email"></div><div class="field"><label for="adm-from">Sender address <span class="opt">a mailbox of freightkit.in</span></label><input id="adm-from" type="email" placeholder="support@freightkit.in"></div><div class="field"><label for="adm-mpass">Sender mailbox password <span class="opt" id="adm-mpass-note">the password of that mailbox (hPanel → Emails)</span></label><input id="adm-mpass" type="password" autocomplete="new-password" placeholder="type it to send through the mailbox"></div><p class="muted-small bo-adm-mailnote">Emails are sent by signing in to this mailbox, like an email app, so they reach the inbox. The password is stored encrypted on the server and never shown again.</p><div class="bo-adm-btns"><button class="btn bo-btn-sm" type="submit">Save</button><button class="btn secondary bo-btn-sm" type="button" id="adm-test">Send test email</button><span class="muted-small" id="adm-mail-status" role="status"></span></div></form>
<details class="bo-adm-log"><summary>Recent activity</summary><ul>${r.audit.map((x) => `<li><span class="muted-small">${esc(fmtT(x.at))}</span> ${esc(x.action)} · ${esc(x.user || x.detail || '')}${x.actor && x.actor !== x.user ? ` <span class="muted-small">by ${esc(x.actor)}</span>` : ''}</li>`).join('')}</ul></details>`;
  }
  // Email settings: where access requests go, and the mailbox they are sent from.
  async function loadMailSettings() {
    try { const s = await api('admin.php?a=settings'); if ($('adm-notify')) { $('adm-notify').value = s.notify; $('adm-from').value = s.from; $('adm-mpass').placeholder = s.passwordSet ? 'saved (leave empty to keep it)' : 'type it to send through the mailbox';
      const w = $('adm-mail-warn'); w.hidden = false; w.classList.toggle('is-ok', !!s.passwordSet);
      w.textContent = s.passwordSet ? `Emails are sent through the ${s.from || 'sender'} mailbox.` : 'The sender mailbox password is not saved, so emails go out as basic server mail and land in Spam (or are rejected). Type the mailbox password below and press Save.'; } } catch (_) { /* shown on save */ }
  }
  $('admin-body').addEventListener('submit', async (ev) => {
    if (ev.target.id !== 'adm-mail') return;
    ev.preventDefault(); const st = $('adm-mail-status');
    st.textContent = 'Saving…';
    try { await api('admin.php?a=save-settings', { notify: $('adm-notify').value.trim(), from: $('adm-from').value.trim(), password: $('adm-mpass').value }); $('adm-mpass').value = ''; st.textContent = 'Saved. Now press Send test email.'; loadMailSettings(); }
    catch (err) { st.textContent = err.message; }
  });
  $('admin-body').addEventListener('click', async (ev) => {
    if (!ev.target.closest('#adm-test')) return;
    const st = $('adm-mail-status'); st.textContent = 'Sending…';
    try { const r = await api('admin.php?a=test-email'); st.textContent = `Test email sent to ${r.to}. Check the inbox (and Spam).`; }
    catch (err) { st.textContent = err.message; }
  });
  $('admin-open').addEventListener('click', async () => { await openAdmin(); loadMailSettings(); });
  $('admin-close').addEventListener('click', () => { $('admin-panel').hidden = true; });
  $('admin-body').addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-adm]'); if (!b) return;
    const act = b.dataset.adm === 'enable' && b.textContent === 'Approve' ? 'approve' : b.dataset.adm; const id = Number(b.dataset.id); const body = { id };
    if (act === 'delete' && !window.confirm(`Delete ${b.dataset.name}'s account and all their saved work? This cannot be undone.`)) return;
    if (act === 'reset') {
      const p = window.prompt(`Temporary password for ${b.dataset.name} (12+ characters, letters and numbers). Tell it to them; they must change it when they sign in. Their saved work is kept.`);
      if (!p) return; body.password = p;
    }
    if (act === 'role') body.role = b.dataset.role;
    b.disabled = true;
    try { const r = await api(`admin.php?a=${act}`, body); if ((act === 'approve' || act === 'reject') && r.mailed === false) window.alert('Done. The email to the user could not be sent (check Email settings below).'); await openAdmin(); loadMailSettings(); }
    catch (err) { window.alert(err.message); b.disabled = false; }
  });

  /* ---------- start ---------- */
  const note = sessionStorage.getItem('bo-signed-out'); if (note !== null) { sessionStorage.removeItem('bo-signed-out'); if (note) say('login-status', note); }
  (async () => {
    try { const r = await api('auth.php?a=me'); await enter(r.user); }
    catch (err) { $('login-wrap').hidden = false; show('login-card'); if (err.offline || err.status === 404) say('login-status', err.message, 'error'); $('login-email').focus(); }
  })();
  window.addEventListener('beforeunload', (ev) => { if (!window.BO_LEAVING && mounted && window.BO_HAS_UNSAVED && window.BO_HAS_UNSAVED()) { ev.preventDefault(); ev.returnValue = ''; } });
})();

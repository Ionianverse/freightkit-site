/* BO Planning System – sign-in and loader.
   The tool itself is in app.bundle, encrypted with a key derived from the ID and password.
   Nothing is sent to a server: the bundle is decrypted in this browser and kept in memory only. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const yr = $('yr'); if (yr) yr.textContent = new Date().getFullYear();
  const enc = new TextEncoder();
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  let failures = 0;

  function say(msg, isError) {
    const el = $('login-status');
    el.textContent = msg;
    el.className = 'bo-login-status' + (isError ? ' is-error' : '');
  }

  async function unlock(id, password) {
    const res = await fetch('app.bundle', { cache: 'no-store' });
    if (!res.ok) throw new Error('The tool file could not be loaded.');
    const bundle = await res.json();
    if (bundle.format !== 'bo-bundle-1') throw new Error('Unknown tool file format.');
    const base = await crypto.subtle.importKey('raw', enc.encode(`${id}\n${password}`), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt: b64(bundle.salt), iterations: bundle.iterations },
      base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
    );
    let packed;
    try {
      packed = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(bundle.iv), additionalData: enc.encode('bo-bundle-1') }, key, b64(bundle.data));
    } catch (_) {
      const err = new Error('ID or password is incorrect.'); err.auth = true; throw err;
    }
    const stream = new Blob([packed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    const app = JSON.parse(await new Response(stream).text());
    // A second key from the same ID and password, for the remarks history kept encrypted on this device.
    // It cannot be read out of the browser (not extractable) and is never stored.
    const vaultKey = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(`freightkit-bo-history-v1|${id}`), iterations: 200000 },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    );
    return { app, vaultKey };
  }

  function loadScript(code, name) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(new Blob([code + `\n//# sourceURL=bo/${name}`], { type: 'text/javascript' }));
      const s = document.createElement('script');
      s.src = url;
      s.onload = () => { URL.revokeObjectURL(url); resolve(); };
      s.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Could not start ${name}.`)); };
      document.body.appendChild(s);
    });
  }

  async function mount(app) {
    const style = document.createElement('style');
    style.textContent = app.css;
    document.head.appendChild(style);
    $('app-root').innerHTML = app.html;
    $('login-card').remove();
    $('signed-in').hidden = false;
    $('sign-out').hidden = false;
    $('site-link').hidden = true;
    for (const s of app.scripts) await loadScript(s.code, s.name);
  }

  $('login-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const id = $('login-id').value.trim().toLowerCase();
    const password = $('login-password').value;
    if (!id || !password) { say('Enter the ID and password.', true); return; }
    if (!window.crypto || !crypto.subtle || typeof DecompressionStream === 'undefined') { say('This browser is too old for this tool. Use a current Chrome, Edge, Firefox or Safari.', true); return; }
    $('login-btn').disabled = true;
    say('Checking…');
    if (failures >= 3) await new Promise((r) => setTimeout(r, 2000 * (failures - 2)));
    try {
      const { app, vaultKey } = await unlock(id, password);
      $('login-password').value = '';
      $('signed-user').textContent = id;
      Object.defineProperty(window, 'BO_VAULT_KEY', { value: vaultKey, writable: false, configurable: false });
      await mount(app);
      watchIdle();
    } catch (err) {
      failures += err.auth ? 1 : 0;
      say(err.message || 'Could not open the tool.', true);
      $('login-password').value = '';
      $('login-password').focus();
    } finally {
      const btn = $('login-btn'); if (btn) btn.disabled = false;
    }
  });
  $('sign-out').addEventListener('click', () => window.location.reload());

  // Automatic sign-out after 1 hour without activity: reloading clears the files, the plan and the keys from memory.
  const IDLE_MS = 60 * 60 * 1000; const WARN_MS = 5 * 60 * 1000;
  function watchIdle() {
    let last = Date.now(); let warn = null;
    const hideWarn = () => { if (warn) { warn.remove(); warn = null; } };
    const seen = () => { last = Date.now(); hideWarn(); };
    ['pointerdown', 'keydown', 'wheel', 'touchstart', 'input'].forEach((t) => window.addEventListener(t, seen, { capture: true, passive: true }));
    const check = () => {
      const idle = Date.now() - last;
      if (idle >= IDLE_MS) { window.location.reload(); return; }
      if (idle >= IDLE_MS - WARN_MS && !warn) {
        warn = document.createElement('div'); warn.className = 'bo-idle-warn'; warn.setAttribute('role', 'alert');
        warn.textContent = 'No activity for almost an hour: you will be signed out in a few minutes and the loaded files will be cleared. Click or press a key to stay signed in.';
        document.body.appendChild(warn);
      }
    };
    setInterval(check, 15000);
    document.addEventListener('visibilitychange', check);
  }
  $('login-id').focus();
})();

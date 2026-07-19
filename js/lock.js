/* App lock — an optional PIN/biometric gate so the app can sit on a shared
   phone without showing real balances to whoever picks it up. This is a UI
   gate, not encryption: data in localStorage is unchanged either way. Forgetting
   the PIN is never a silent bypass — the only way back in is restoring a JSON
   backup, which is why the config lives in its own key, untouched by
   Store.reset()/Store.replace()/Store.startFresh(). */
(function () {
  'use strict';

  const KEY = 'householdFinance.lock';
  const APP_NAME = 'Household Finance';
  const DEFAULT_TIMEOUT_MIN = 5;
  const IDLE_CHECK_MS = 15000;
  const ACTIVITY_THROTTLE_MS = 20000;
  const MAX_ATTEMPTS = 5;
  const ATTEMPT_COOLDOWN_MS = 10000;

  function blank() {
    return { enabled: false, salt: null, hash: null, webauthnId: null, timeoutMin: DEFAULT_TIMEOUT_MIN, lastActive: null };
  }
  let cfg;
  try { cfg = JSON.parse(localStorage.getItem(KEY)) || blank(); } catch (e) { cfg = blank(); }
  function saveCfg() { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) { /* quota — lock still works this session */ } }

  async function sha256Hex(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  function randomHex(bytes) {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return [...arr].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function isEnabled() { return !!cfg.enabled; }
  async function setup(pin) {
    cfg.salt = randomHex(16);
    cfg.hash = await sha256Hex(cfg.salt + pin);
    cfg.enabled = true;
    cfg.lastActive = Date.now();
    saveCfg();
  }
  function disable() { cfg = blank(); saveCfg(); unlockedNow = false; }
  async function verifyPin(pin) {
    if (!cfg.hash) return false;
    return (await sha256Hex(cfg.salt + pin)) === cfg.hash;
  }
  async function changePin(oldPin, newPin) {
    if (!(await verifyPin(oldPin))) return false;
    await setup(newPin);
    return true;
  }
  function getTimeoutMin() { return cfg.timeoutMin || DEFAULT_TIMEOUT_MIN; }
  function setTimeoutMin(min) { cfg.timeoutMin = +min || DEFAULT_TIMEOUT_MIN; saveCfg(); }

  /* ---------- session / idle state ----------
     Deliberately in-memory only (not sessionStorage, which survives a reload
     by spec): every fresh script load — reload or reopen — starts locked, so
     "opening the app always asks" holds regardless of how the tab/process
     boundary behaves on a given platform. cfg.lastActive still persists to
     localStorage so the idle-timeout re-lock survives a backgrounding that
     doesn't unload the page. */
  let unlockedNow = false;
  function markUnlocked() {
    unlockedNow = true;
    cfg.lastActive = Date.now();
    saveCfg();
  }
  function markLocked() { unlockedNow = false; }
  function idleExpired() {
    if (!cfg.lastActive) return true;
    return (Date.now() - cfg.lastActive) > getTimeoutMin() * 60000;
  }
  function isLocked() {
    if (!isEnabled()) return false;
    return !unlockedNow || idleExpired();
  }
  let lastTouch = 0;
  function touchActivity() {
    if (!isEnabled() || !unlockedNow) return;
    const now = Date.now();
    if (now - lastTouch < ACTIVITY_THROTTLE_MS) return;
    lastTouch = now;
    cfg.lastActive = now;
    saveCfg();
  }

  /* ---------- WebAuthn (Face ID / Touch ID / Windows Hello) ---------- */
  function webauthnSupported() { return !!(window.PublicKeyCredential && navigator.credentials); }
  async function webauthnAvailable() {
    if (!webauthnSupported()) return false;
    try { return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); }
    catch (e) { return false; }
  }
  function hasBiometric() { return !!cfg.webauthnId; }
  async function registerBiometric() {
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: APP_NAME },
        user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'device-owner', displayName: 'Device owner' },
        pubKeyCredParams: [{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
        timeout: 60000
      }
    });
    if (!cred) throw new Error('No credential created');
    cfg.webauthnId = btoa(String.fromCharCode(...new Uint8Array(cred.rawId)));
    saveCfg();
  }
  function removeBiometric() { cfg.webauthnId = null; saveCfg(); }
  async function verifyBiometric() {
    if (!cfg.webauthnId) return false;
    const idBytes = Uint8Array.from(atob(cfg.webauthnId), c => c.charCodeAt(0));
    try {
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          allowCredentials: [{ id: idBytes, type: 'public-key' }],
          userVerification: 'required', timeout: 60000
        }
      });
      return !!assertion;
    } catch (e) { return false; }
  }

  /* ---------- gate UI ---------- */
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function renderPinView(root, opts) {
    const canBio = opts.bioReady && hasBiometric();
    root.innerHTML = `
      <div class="lock-gate">
        <div class="lock-card" id="lock-card">
          <div class="lock-ico" aria-hidden="true">🔒</div>
          <div class="lock-title">${esc(APP_NAME)} is locked</div>
          <div class="lock-sub">Enter your PIN to continue.</div>
          <form id="lock-pin-form" autocomplete="off">
            <label for="lock-pin-input" class="sr-only" style="position:absolute;left:-9999px;">PIN</label>
            <input class="input lock-pin" id="lock-pin-input" type="password" inputmode="numeric"
              pattern="[0-9]*" minlength="4" maxlength="8" placeholder="••••" autofocus
              aria-label="PIN">
            <div class="lock-error" id="lock-error" role="alert"></div>
            <div class="lock-actions">
              <button class="btn gold" type="submit" id="lock-unlock-btn">Unlock</button>
              ${canBio ? '<button class="btn ghost" type="button" id="lock-bio-btn">Use Face ID / Touch ID</button>' : ''}
            </div>
          </form>
          <div class="lock-forgot"><button type="button" id="lock-forgot-btn">Forgot PIN?</button></div>
        </div>
      </div>`;

    const card = root.querySelector('#lock-card');
    const form = root.querySelector('#lock-pin-form');
    const input = root.querySelector('#lock-pin-input');
    const err = root.querySelector('#lock-error');
    const bioBtn = root.querySelector('#lock-bio-btn');
    let attempts = 0;
    let cooling = false;

    async function tryUnlock(pin) {
      const ok = await verifyPin(pin);
      if (ok) { opts.onUnlock(); return; }
      attempts++;
      input.value = '';
      input.focus();
      if (!card.classList.contains('shake')) {
        card.classList.add('shake');
        setTimeout(() => card.classList.remove('shake'), 350);
      }
      if (attempts >= MAX_ATTEMPTS && !cooling) {
        cooling = true;
        const btn = root.querySelector('#lock-unlock-btn');
        btn.disabled = true;
        err.textContent = 'Too many attempts — try again in 10 seconds.';
        setTimeout(() => { cooling = false; attempts = 0; btn.disabled = false; err.textContent = ''; }, ATTEMPT_COOLDOWN_MS);
      } else {
        err.textContent = 'Wrong PIN.';
      }
    }

    form.addEventListener('submit', e => {
      e.preventDefault();
      if (cooling) return;
      const pin = input.value.trim();
      if (pin.length < 4) { err.textContent = 'PIN must be at least 4 digits.'; return; }
      tryUnlock(pin);
    });
    if (bioBtn) bioBtn.addEventListener('click', async () => {
      bioBtn.disabled = true;
      const ok = await verifyBiometric();
      bioBtn.disabled = false;
      if (ok) opts.onUnlock(); else err.textContent = "Couldn't verify — try your PIN.";
    });
    root.querySelector('#lock-forgot-btn').addEventListener('click', () => renderForgotView(root, opts));

    if (canBio) {
      // One automatic prompt on show, matching native app conventions — falls
      // through to the PIN field silently if the user dismisses or it fails.
      setTimeout(async () => { if (await verifyBiometric()) opts.onUnlock(); }, 250);
    }
  }

  function renderForgotView(root, opts) {
    root.innerHTML = `
      <div class="lock-gate">
        <div class="lock-card">
          <div class="lock-ico" aria-hidden="true">🗝️</div>
          <div class="lock-title">Restore from backup</div>
          <div class="lock-sub">There's no way around a forgotten PIN — that's the point. Choosing a
            backup file replaces everything on this device with what's in it, and turns the lock off
            so you can set a new PIN.</div>
          <div class="lock-actions">
            <label class="btn ghost file-btn">⬆ Choose backup file
              <input type="file" id="lock-restore-file" accept=".json,application/json" hidden>
            </label>
            <button class="btn ghost" type="button" id="lock-forgot-cancel">Back to PIN</button>
          </div>
          <div class="lock-error" id="lock-restore-error" role="alert"></div>
        </div>
      </div>`;
    root.querySelector('#lock-forgot-cancel').addEventListener('click', () => renderPinView(root, opts));
    const errEl = root.querySelector('#lock-restore-error');
    root.querySelector('#lock-restore-file').addEventListener('change', e => {
      const f = e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        let next;
        try { next = JSON.parse(String(reader.result)); }
        catch (err) { errEl.textContent = 'Not a valid backup file.'; return; }
        if (!next || !Array.isArray(next.transactions) || !Array.isArray(next.budget) || !Array.isArray(next.goals)) {
          errEl.textContent = "That file isn't a Household Finance backup.";
          return;
        }
        renderConfirmRestoreView(root, opts, next);
      };
      reader.readAsText(f);
      e.target.value = '';
    });
  }

  function renderConfirmRestoreView(root, opts, next) {
    root.innerHTML = `
      <div class="lock-gate">
        <div class="lock-card">
          <div class="lock-ico" aria-hidden="true">⚠️</div>
          <div class="lock-title">Replace everything on this device?</div>
          <div class="lock-sub">${next.transactions.length} transactions, last updated
            ${next.lastUpdated ? new Date(next.lastUpdated).toLocaleDateString() : 'unknown'}.
            Anything entered on this device since your last backup will be lost. The app lock
            turns off — you can set a new PIN from Export &amp; Backup once you're in.</div>
          <div class="lock-actions">
            <button class="btn danger" type="button" id="lock-restore-confirm">Restore and unlock</button>
            <button class="btn ghost" type="button" id="lock-restore-cancel">Cancel</button>
          </div>
        </div>
      </div>`;
    root.querySelector('#lock-restore-cancel').addEventListener('click', () => renderForgotView(root, opts));
    root.querySelector('#lock-restore-confirm').addEventListener('click', () => {
      Store.replace(next);
      disable();
      opts.onUnlock();
    });
  }

  function showGate(onUnlock) {
    let root = document.getElementById('lock-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'lock-root';
      document.body.appendChild(root);
    }
    document.body.style.overflow = 'hidden';
    webauthnAvailable().then(bioReady => {
      renderPinView(root, {
        bioReady,
        onUnlock: () => {
          root.innerHTML = '';
          document.body.style.overflow = '';
          markUnlocked();
          onUnlock();
        }
      });
    });
  }

  /* ---------- boot-time + mid-session guard ---------- */
  let watching = false;
  function armWatch() {
    if (watching) return;
    watching = true;
    setInterval(() => {
      if (isEnabled() && unlockedNow && idleExpired()) {
        markLocked();
        showGate(() => {});
      }
    }, IDLE_CHECK_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (isLocked()) showGate(() => {});
    });
    ['click', 'keydown', 'touchstart', 'scroll'].forEach(evt =>
      document.addEventListener(evt, touchActivity, { passive: true }));
  }
  function guard(onUnlock) {
    armWatch();
    if (isLocked()) {
      showGate(onUnlock);
    } else {
      markUnlocked();
      onUnlock();
    }
  }

  window.Lock = {
    isEnabled, setup, disable, verifyPin, changePin,
    getTimeoutMin, setTimeoutMin,
    webauthnSupported, webauthnAvailable, hasBiometric, registerBiometric, removeBiometric,
    guard, isLocked
  };
})();

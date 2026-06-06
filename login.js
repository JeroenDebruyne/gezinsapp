// ── Config ────────────────────────────────────────────────────────────────────
// SUPABASE_URL en SUPABASE_KEY komen uit config.js
const SESSION_KEY  = 'sb-' + new URL(SUPABASE_URL).hostname.split('.')[0] + '-auth-token';

// ── Gezin & avatar initialisatie ─────────────────────────────────────────────
async function initialiseerLogin() {
  try {
    // Controleer of er al profielen bestaan
    const profRes = await fetch(
      `${SUPABASE_URL}/rest/v1/gezin_profielen?select=id&limit=1`,
      { headers: { 'apikey': SUPABASE_KEY } }
    );
    if (!profRes.ok) throw new Error();
    const profielen = await profRes.json();

    if (!profielen.length) {
      // Geen gezin aangemaakt — toon setup scherm
      document.getElementById('mode-tabs').style.display = 'none';
      document.querySelectorAll('.form-section').forEach(s => s.classList.remove('active'));
      document.getElementById('sect-setup').classList.add('active');
      document.getElementById('logo-sub').textContent = 'Stel je gezin in';
      return;
    }

    // Gezinsnaam ophalen en tonen
    const gezinRes = await fetch(
      `${SUPABASE_URL}/rest/v1/gezinnen?select=naam&limit=1`,
      { headers: { 'apikey': SUPABASE_KEY } }
    );
    if (gezinRes.ok) {
      const d = await gezinRes.json();
      const naam = d[0]?.naam;
      if (naam) {
        document.getElementById('logo-sub').textContent = naam;
        document.getElementById('login-divider').textContent = `log in als ${naam}`;
      }
    }

    // Avatar grid bouwen
    await bouwAvatarGrid();

  } catch {
    // Verbindingsfout — toon normale login zonder avatars
    document.getElementById('avatar-grid').innerHTML =
      '<div style="grid-column:1/-1;font-size:12px;color:#a8a29e;text-align:center;padding:8px 0;">⚠️ Kan gezinsleden niet laden.</div>';
  }
}

async function bouwAvatarGrid() {
  const grid = document.getElementById('avatar-grid');
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/gezin_profielen?select=*&order=naam`, {
      headers: { 'apikey': SUPABASE_KEY }
    });
    if (!res.ok) throw new Error();
    const data = await res.json();
    const ROLLABEL = { gezinshoofd:'Gezinshoofd', jeugd:'Jeugd', kind:'Kind' };
    grid.innerHTML = data.map(p => {
      if (p.is_kind || p.rol === 'kind') {
        return `<button class="avatar-btn avatar-btn-kind" data-action="login-als-kind" data-persoon="${escAttr(p.persoon_key)}">
          <span class="avatar-emoji">${escHtmlL(p.emoji||'👤')}</span>
          <span class="avatar-info">
            <span class="avatar-naam">${escHtmlL(p.naam)}</span>
            <span class="avatar-rol">Kind · tik om in te loggen</span>
          </span>
        </button>`;
      }
      return `<button class="avatar-btn" data-action="kies-volwassene" data-email="${escAttr(p.email)}">
        <span class="avatar-emoji">${escHtmlL(p.emoji||'👤')}</span>
        <span class="avatar-info">
          <span class="avatar-naam">${escHtmlL(p.naam)}</span>
          <span class="avatar-rol">${escHtmlL(ROLLABEL[p.rol]||p.rol)}</span>
        </span>
      </button>`;
    }).join('');
  } catch {
    grid.innerHTML = '<div style="grid-column:1/-1;font-size:12px;color:#a8a29e;text-align:center;">Kan avatars niet laden.</div>';
  }
}

// ── Escaping helpers (login.js heeft geen toegang tot data.js) ───────────────
function escHtmlL(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function escAttr(s) { return escHtmlL(s); }

// ── Gezin aanmaken (eerste keer) ─────────────────────────────────────────────
function kiesSetupEmoji(e) { document.getElementById('setup-emoji').value = e; }

function suggestSetupKey() {
  const keyEl = document.getElementById('setup-key');
  if (keyEl && !keyEl.dataset.manualEdit) {
    const naam = document.getElementById('setup-naam').value.trim();
    keyEl.value = naam.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
  }
}

async function maakGezinAan() {
  hideMsg();
  const gezinNaam = document.getElementById('setup-gezin').value.trim();
  const naam      = document.getElementById('setup-naam').value.trim();
  const emoji     = document.getElementById('setup-emoji').value.trim() || '🧑';
  const key       = document.getElementById('setup-key').value.trim().toLowerCase().replace(/\s+/g,'_');
  const email     = document.getElementById('setup-email').value.trim();
  const pw        = document.getElementById('setup-pw').value;

  if (!gezinNaam) { showMsg('Vul een gezinsnaam in.'); return; }
  if (!naam)      { showMsg('Vul je naam in.'); return; }
  if (!key)       { showMsg('Vul een persoon-ID in (bijv. "jeroen").'); return; }
  if (!email)     { showMsg('Vul je e-mailadres in.'); return; }
  if (pw.length < 8) { showMsg('Wachtwoord moet minstens 8 tekens zijn.'); return; }

  setLoading('btn-setup', true);
  try {
    // 1. Supabase auth account aanmaken
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pw, data: { naam, rol: 'gezinshoofd' } })
    });
    const authData = await authRes.json();
    if (!authRes.ok || authData.error)
      throw new Error(authData.error_description || authData.msg || authData.error || 'Aanmaken mislukt');

    // Geen token? (e-mailbevestiging aan in Supabase) → onmiddellijk inloggen als fallback
    let sessionData = authData;
    if (!authData.access_token) {
      const loginRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pw })
      });
      const loginData = await loginRes.json();
      if (!loginRes.ok || !loginData.access_token)
        throw new Error('Zet "Confirm email" uit in Supabase → Authentication → Providers → Email, en probeer opnieuw.');
      sessionData = loginData;
    }

    const token = sessionData.access_token;
    const h = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };

    // 2. Gezin aanmaken in gezinnen tabel
    const gezinDbRes = await fetch(`${SUPABASE_URL}/rest/v1/gezinnen`, {
      method: 'POST', headers: h,
      body: JSON.stringify({ naam: gezinNaam })
    });
    if (!gezinDbRes.ok) {
      const err = await gezinDbRes.json().catch(()=>({}));
      throw new Error(err.message || 'Gezin opslaan mislukt');
    }
    const gezinDbData = await gezinDbRes.json();
    const gezinId = Array.isArray(gezinDbData) ? gezinDbData[0]?.id : gezinDbData?.id;
    if (!gezinId) throw new Error('Geen gezin_id ontvangen van database');

    // 3. Profiel aanmaken (rol = gezinshoofd, altijd)
    await fetch(`${SUPABASE_URL}/rest/v1/gezin_profielen`, {
      method: 'POST', headers: h,
      body: JSON.stringify({ naam, emoji, rol: 'gezinshoofd', persoon_key: key, email, is_kind: false, gezin_id: gezinId })
    });

    // 4. Sessie opslaan + doorsturen naar app
    saveSession(sessionData);
    localStorage.removeItem('gezinsapp-kind-sessie');
    window.location.replace('index.html');

  } catch(e) {
    showMsg('❌ ' + e.message);
  } finally {
    setLoading('btn-setup', false);
  }
}

function toonNieuwGezin(e) {
  if (e) e.preventDefault();
  hideMsg();
  document.getElementById('mode-tabs').style.display = 'none';
  document.querySelectorAll('.form-section').forEach(s => s.classList.remove('active'));
  document.getElementById('sect-setup').classList.add('active');
  document.getElementById('logo-sub').textContent = 'Nieuw gezin aanmaken';
  // Scroll naar boven
  document.querySelector('.card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function saveSession(data) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    access_token:  data.access_token,
    refresh_token: data.refresh_token,
    expires_at:    data.expires_at || Math.floor(Date.now()/1000) + (data.expires_in || 3600),
    user:          data.user,
  }));
}

function showMsg(tekst, type = 'error') {
  const el = document.getElementById('msg');
  el.textContent = tekst;
  el.className = 'msg show ' + type;
}
function hideMsg() {
  const el = document.getElementById('msg');
  el.className = 'msg';
}

function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  btn.disabled = loading;
  btn.classList.toggle('loading', loading);
}

function togglePw(inputId) {
  const inp = document.getElementById(inputId);
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

function switchMode(mode) {
  hideMsg();
  document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.form-section').forEach(s => s.classList.remove('active'));
  document.getElementById('tab-' + mode).classList.add('active');
  document.getElementById('sect-' + mode).classList.add('active');
}

// ── Inloggen ──────────────────────────────────────────────────────────────────
async function doLogin() {
  hideMsg();
  const email = document.getElementById('login-email').value.trim();
  const pw    = document.getElementById('login-pw').value;

  if (!email || !pw) { showMsg('Vul je e-mailadres en wachtwoord in.'); return; }

  setLoading('btn-login', true);
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pw })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || data.msg || 'Inloggen mislukt');
    saveSession(data);
    localStorage.removeItem('gezinsapp-kind-sessie');
    window.location.replace('index.html');
  } catch (e) {
    showMsg('❌ ' + (e.message === 'Invalid login credentials' ? 'Verkeerd e-mailadres of wachtwoord.' : e.message));
  } finally {
    setLoading('btn-login', false);
  }
}

// ── Volwassene: avatar invullen + wachtwoord focus ───────────────────────────
function kiesVolwassene(email) {
  document.getElementById('login-email').value = email;
  document.getElementById('login-pw').value = '';
  document.getElementById('login-pw').focus();
  document.querySelectorAll('.avatar-btn').forEach(b => {
    b.classList.toggle('selected', b.dataset.email === email);
  });
}

// ── Kind: direct inloggen zonder wachtwoord ────────────────────────────────
function loginAlsKind(persoonKey) {
  localStorage.removeItem(SESSION_KEY);
  localStorage.setItem('gezinsapp-kind-sessie', persoonKey);
  window.location.replace('index.html');
}

// ── Wachtwoord reset ──────────────────────────────────────────────────────────
async function doReset() {
  hideMsg();
  const email = document.getElementById('reset-email').value.trim();
  if (!email) { showMsg('Vul je e-mailadres in.'); return; }

  setLoading('btn-reset', true);
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    if (!res.ok) {
      const d = await res.json();
      throw new Error(d.error_description || 'Verzenden mislukt');
    }
    showMsg('✅ Resetlink verstuurd! Controleer je inbox.', 'success');
    document.getElementById('reset-email').value = '';
  } catch (e) {
    showMsg('❌ ' + e.message);
  } finally {
    setLoading('btn-reset', false);
  }
}

// ── Nieuw wachtwoord instellen (na resetlink) ─────────────────────────────────
let _recoveryToken = null;

async function doNieuwWachtwoord() {
  hideMsg();
  const pw  = document.getElementById('nieuw-pw').value;
  const pw2 = document.getElementById('nieuw-pw2').value;
  if (!pw || pw.length < 8) { showMsg('Wachtwoord moet minstens 8 tekens zijn.'); return; }
  if (pw !== pw2) { showMsg('Wachtwoorden komen niet overeen.'); return; }

  setLoading('btn-nieuw', true);
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'PUT',
      headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + _recoveryToken },
      body: JSON.stringify({ password: pw })
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Opslaan mislukt'); }
    showMsg('✅ Wachtwoord opgeslagen! Je wordt ingelogd…', 'success');
    setTimeout(() => window.location.replace('index.html'), 1500);
  } catch(e) {
    showMsg('❌ ' + e.message);
  } finally {
    setLoading('btn-nieuw', false);
  }
}

// ── Event delegation: clicks ──────────────────────────────────────────────────
document.addEventListener('click', function(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  switch (a) {
    case 'switch-mode': switchMode(el.dataset.mode); break;
    case 'toggle-pw': togglePw(el.dataset.target); break;
    case 'do-login': doLogin(); break;
    case 'do-reset': doReset(); break;
    case 'do-nieuw-wachtwoord': doNieuwWachtwoord(); break;
    case 'maak-gezin-aan': maakGezinAan(); break;
    case 'toon-nieuw-gezin': toonNieuwGezin(e); break;
    case 'kies-setup-emoji': kiesSetupEmoji(el.dataset.emoji); break;
    case 'login-als-kind': loginAlsKind(el.dataset.persoon); break;
    case 'kies-volwassene': kiesVolwassene(el.dataset.email); break;
  }
});

// ── Setup key: handmatige bewerking onthouden + suggestie ─────────────────────
document.getElementById('setup-key')?.addEventListener('input', function(){ this.dataset.manualEdit='1'; });
document.getElementById('setup-naam')?.addEventListener('input', suggestSetupKey);

// ── Enter toets ───────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const activeSect = document.querySelector('.form-section.active');
  if (!activeSect) return;
  const sect = activeSect.id;
  if (sect === 'sect-login') doLogin();
  if (sect === 'sect-reset') doReset();
  if (sect === 'sect-setup') maakGezinAan();
  if (sect === 'sect-nieuw') doNieuwWachtwoord();
});

// ── Redirect als al ingelogd / recovery token detecteren ─────────────────────
(function checkAlreadyLoggedIn() {
  try {
    // Foutmelding vanuit auth.js (bijv. geen gezinsprofiel)
    const loginFout = sessionStorage.getItem('login-fout');
    if (loginFout) { sessionStorage.removeItem('login-fout'); showMsg('❌ ' + loginFout); return; }

    // Supabase hash parameters parsen (#access_token=...&type=recovery)
    const hash = window.location.hash.substring(1);
    if (hash) {
      const params = Object.fromEntries(hash.split('&').map(p => p.split('=')));
      if (params.error) {
        showMsg('❌ ' + decodeURIComponent(params.error_description || params.error).replace(/\+/g, ' '));
        return;
      }
      if (params.type === 'recovery' && params.access_token) {
        if (params.expires_at && Date.now()/1000 > Number(params.expires_at)) {
          showMsg('❌ Deze resetlink is verlopen. Vraag een nieuwe aan.');
          return;
        }
        _recoveryToken = params.access_token;
        document.getElementById('mode-tabs').style.display = 'none';
        document.querySelectorAll('.form-section').forEach(s => s.classList.remove('active'));
        document.getElementById('sect-nieuw').classList.add('active');
        document.getElementById('logo-sub').textContent = 'Nieuw wachtwoord instellen';
        history.replaceState(null, '', window.location.pathname);
        return;
      }
    }
    // Kindersessie actief
    if (localStorage.getItem('gezinsapp-kind-sessie')) {
      window.location.replace('index.html');
      return;
    }
    // Volwassene sessie nog geldig
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    const exp = s.expires_at || 0;
    if (s.access_token && Date.now()/1000 < exp - 60) {
      window.location.replace('index.html');
    }
  } catch {}
})();

initialiseerLogin();

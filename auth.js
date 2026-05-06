/**
 * auth.js — Gezinsapp Auth & Permissies
 * Laden vóór data.js en pagina-specifieke scripts
 */

const Auth = (() => {

  // DEV_MODE = true  → geen login nodig
  // DEV_MODE = false → login.html vereist
  const DEV_MODE = false;

  const SUPABASE_URL = 'https://ceeplmghvcaqvlpicwyi.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_pJgY7XEt_wZrxVQcd-bP4A_dSVcsgYa';
  const SESSION_KEY  = 'sb-ceeplmghvcaqvlpicwyi-auth-token';
  const KIND_KEY     = 'gezinsapp-kind-sessie';

  // Profielen & gezin — leeg bij opstart, gevuld vanuit database
  const _profielenCache = [];
  let _gezinId = null;

  const ROLLEN = {
    gezinshoofd: {
      label:'Gezinshoofd', kanAllesZien:true,
      kanActiviteitenBeheren:true, kanReceptenBeheren:true,
      kanPlanningBeheren:true, kanTodosBeheren:true,
      kanContactenBeheren:true, kanInstellingenZien:true,
      kanGebruikersBeheren:true,
    },
    jeugd: {
      label:'Jeugd', kanAllesZien:false,
      kanActiviteitenBeheren:true, kanReceptenBeheren:true,
      kanPlanningBeheren:true, kanTodosBeheren:true,
      kanContactenBeheren:false, kanInstellingenZien:false,
      kanGebruikersBeheren:false,
    },
    kind: {
      label:'Kind', kanAllesZien:false,
      kanActiviteitenBeheren:false, kanReceptenBeheren:false,
      kanPlanningBeheren:false, kanTodosBeheren:'eigen',
      kanContactenBeheren:false, kanInstellingenZien:false,
      kanGebruikersBeheren:false,
    },
  };


  function _readSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)||'null'); } catch { return null; }
  }
  function _saveSession(data) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      access_token:data.access_token, refresh_token:data.refresh_token,
      expires_at:data.expires_at||Math.floor(Date.now()/1000)+(data.expires_in||3600),
      user:data.user,
    }));
  }
  function _clearSession() { localStorage.removeItem(SESSION_KEY); }

  function isDev() { return DEV_MODE; }

  function session() {
    if (DEV_MODE) return { access_token:'dev', user:{ email:_profielenCache[0]?.email } };
    return _readSession();
  }

  function profiel() {
    if (DEV_MODE) return _profielenCache[0];
    // Kindersessie (geen Supabase-account nodig)
    const kindKey = localStorage.getItem(KIND_KEY);
    if (kindKey) return _profielenCache.find(p => p.persoonKey === kindKey) || null;
    const s = _readSession();
    if (!s?.user) return null;
    const email = s.user.email?.toLowerCase()||'';
    return _profielenCache.find(p => p.email?.toLowerCase() === email)
      || { email, naam:email.split('@')[0], emoji:'👤', rol:'jeugd', persoonKey:'onbekend' };
  }

  async function laadProfielen() {
    try {
      const h = { 'apikey': SUPABASE_KEY };
      const s = _readSession();
      if (s?.access_token) h['Authorization'] = 'Bearer ' + s.access_token;
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/gezin_profielen?select=*&order=naam`,
        { headers: h }
      );
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data) && data.length) {
        _profielenCache.length = 0;
        data.forEach(p => _profielenCache.push({
          email:         p.email || null,
          naam:          p.naam,
          emoji:         p.emoji || '👤',
          rol:           p.rol,
          persoonKey:    p.persoon_key,
          isKind:        p.is_kind || false,
          gezinId:       p.gezin_id || null,
          geboortedatum: p.geboortedatum || null,
        }));
        // gezin_id ophalen van de ingelogde gebruiker
        const s = _readSession();
        const email = s?.user?.email?.toLowerCase();
        const kindKey = localStorage.getItem(KIND_KEY);
        const mijn = kindKey
          ? data.find(p => p.persoon_key === kindKey)
          : data.find(p => p.email?.toLowerCase() === email);
        _gezinId = mijn?.gezin_id || data[0]?.gezin_id || null;
      }
    } catch {}
  }

  function rol() { return profiel()?.rol||'kind'; }

  function kan(machtiging) {
    const r = ROLLEN[rol()];
    return r ? r[machtiging]===true : false;
  }

  function headers() {
    // apikey = anon/publishable key (altijd mee, voor RLS-role identificatie)
    // Authorization Bearer = alleen een echt JWT access_token (NOOIT de publishable key)
    const h = { 'apikey':SUPABASE_KEY, 'Content-Type':'application/json' };
    if (!DEV_MODE) {
      const s = _readSession();
      if (s?.access_token) h['Authorization'] = 'Bearer ' + s.access_token;
    }
    return h;
  }

  async function logout() {
    if (DEV_MODE) { alert('Zet DEV_MODE=false in auth.js om in te loggen.'); return; }
    // Kindersessie uitloggen
    if (localStorage.getItem(KIND_KEY)) {
      localStorage.removeItem(KIND_KEY);
      window.location.replace('login.html');
      return;
    }
    fetch(`${SUPABASE_URL}/auth/v1/logout`,{method:'POST',headers:headers()}).catch(()=>{});
    _clearSession();
    window.location.replace('login.html');
  }

  async function refreshIfNeeded() {
    if (DEV_MODE) return session();
    const s = _readSession();
    if (!s?.access_token) return null;
    if (Date.now()/1000 < (s.expires_at||0)-300) return s;
    if (!s.refresh_token) { _clearSession(); return null; }
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,{
        method:'POST', headers:{'apikey':SUPABASE_KEY,'Content-Type':'application/json'},
        body:JSON.stringify({refresh_token:s.refresh_token})
      });
      if (!res.ok) { _clearSession(); return null; }
      const data = await res.json(); _saveSession(data); return data;
    } catch { return null; }
  }

  async function requireAuth() {
    if (DEV_MODE) return true;
    if (localStorage.getItem(KIND_KEY)) return true;
    const s = await refreshIfNeeded();
    if (!s) { window.location.replace('login.html'); return false; }
    return true;
  }

  function loginAlsKind(persoonKey) {
    _clearSession();
    localStorage.setItem(KIND_KEY, persoonKey);
    window.location.replace('index.html');
  }

  function initPagina(paginaKey) {
    requireAuth().then(async ok => {
      if (!ok) return;
      await laadProfielen();   // eerst profielen laden zodat naam/emoji beschikbaar zijn
      const p = profiel();
      // Topbar
      const nEl = document.getElementById('topbar-naam');
      const eEl = document.getElementById('topbar-emoji');
      if (nEl && p) nEl.textContent = p.naam;
      if (eEl && p) eEl.textContent = p.emoji;
      // Sidebar (wordt initieel gevuld vóór profielen geladen zijn — hier corrigeren)
      const sAvEl = document.getElementById('sidebar-avatar');
      const sNmEl = document.getElementById('sidebar-naam');
      const sRlEl = document.getElementById('sidebar-rol');
      if (sAvEl && p) sAvEl.textContent = p.emoji || '🧑';
      if (sNmEl && p) sNmEl.textContent = p.naam || '';
      if (sRlEl)      sRlEl.textContent  = ROLLEN[p?.rol]?.label || p?.rol || '';
      if (DEV_MODE) {
        const d = document.getElementById('dev-badge');
        if (d) d.style.display = 'inline';
      }
      document.querySelectorAll('.bottom-nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.pagina === paginaKey);
      });
      const r = ROLLEN[rol()];
      if (r && !r.kanInstellingenZien)
        document.querySelectorAll('[data-pagina="instellingen"]').forEach(el=>el.style.display='none');
      if (r && !r.kanContactenBeheren)
        document.querySelectorAll('[data-pagina="contacten"]').forEach(el=>el.style.display='none');
    });
    setInterval(refreshIfNeeded, 4*60*1000);
  }

  return { isDev, session, profiel, rol, kan, headers, logout, refreshIfNeeded, requireAuth, initPagina, loginAlsKind, laadProfielen, getProfielen: () => _profielenCache, getGezinId: () => _gezinId, PROFIELEN: _profielenCache, ROLLEN, KIND_KEY };
})();

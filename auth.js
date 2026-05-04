/**
 * auth.js — Gezinsapp Auth & Permissies
 * Laden vóór data.js en pagina-specifieke scripts
 */

const Auth = (() => {

  // DEV_MODE = true  → geen login nodig
  // DEV_MODE = false → login.html vereist
  const DEV_MODE = true;

  const SUPABASE_URL = 'https://rdessctmorraeeipysct.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_bKCmI021FVOaOMhGKU-6eg_jTerhSWq';
  const SESSION_KEY  = 'sb-rdessctmorraeeipysct-auth-token';

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

  const PROFIELEN = [
    { email:'jeroen.debruyne@outlook.be',   naam:'Jeroen', emoji:'🧑', rol:'gezinshoofd', persoonKey:'jeroen' },
    { email:'dewaegenaerekelly@hotmail.com', naam:'Kelly',  emoji:'👩', rol:'gezinshoofd', persoonKey:'kelly'  },
    { email:'debruyne.nora@icloud.com',      naam:'Nora',   emoji:'👧', rol:'kind',        persoonKey:'nora'   },
    { email:'debruyne.odiel@icloud.com',     naam:'Odiel',  emoji:'👦', rol:'kind',        persoonKey:'odiel'  },
  ];

  const DEV_PROFIEL = PROFIELEN[0];

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
    if (DEV_MODE) return { access_token:'dev', user:{ email:DEV_PROFIEL.email } };
    return _readSession();
  }

  function profiel() {
    if (DEV_MODE) return DEV_PROFIEL;
    const s = _readSession();
    if (!s?.user) return null;
    const email = s.user.email?.toLowerCase()||'';
    return PROFIELEN.find(p=>p.email.toLowerCase()===email)
      || { email, naam:email.split('@')[0], emoji:'👤', rol:'jeugd', persoonKey:'onbekend' };
  }

  function rol() { return profiel()?.rol||'kind'; }

  function kan(machtiging) {
    const r = ROLLEN[rol()];
    return r ? r[machtiging]===true : false;
  }

  function headers() {
    const token = DEV_MODE ? SUPABASE_KEY : (_readSession()?.access_token||SUPABASE_KEY);
    return { 'apikey':SUPABASE_KEY, 'Authorization':'Bearer '+token, 'Content-Type':'application/json' };
  }

  async function logout() {
    if (DEV_MODE) { alert('Zet DEV_MODE=false in auth.js om in te loggen.'); return; }
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
    const s = await refreshIfNeeded();
    if (!s) { window.location.replace('login.html'); return false; }
    return true;
  }

  function initPagina(paginaKey) {
    requireAuth().then(ok => {
      if (!ok) return;
      const p = profiel();
      const nEl = document.getElementById('topbar-naam');
      const eEl = document.getElementById('topbar-emoji');
      if (nEl && p) nEl.textContent = p.naam;
      if (eEl && p) eEl.textContent = p.emoji;
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

  return { isDev, session, profiel, rol, kan, headers, logout, refreshIfNeeded, requireAuth, initPagina, PROFIELEN, ROLLEN };
})();

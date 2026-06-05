/**
 * data.js — Gezinsapp gedeelde data & Supabase
 * Laad na auth.js, voor pagina-specifieke scripts
 */

// ── HTML escaping helper (voorkomt XSS in innerHTML templates) ──
function escHtml(s){
  return String(s==null?'':s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── Constanten ────────────────────────────────────────────────
// SUPABASE_URL en SUPABASE_KEY komen uit config.js

function _maakId() { return Date.now() + Math.random(); }

let WINKELS        = ['Colruyt','Delhaize','Lidl','Albert Heijn','Beenhouwerij','Markt','Andere'];
const ALLE_TAGS    = ['Kindvriendelijk','Feest','Restjes-proof','Meal prep','Eenpansgerecht','Oven'];

// Personen — leeg bij opstart, herbouwd via herbouwPersonenData() na laadProfielen()
// Muteert altijd dezelfde objecten zodat alle pagina-scripts de updates zien
const PERSONEN = [];
const PLABEL   = { familie:'Familie' };
const PBADGE   = { familie:'badge-familie' };
const PEMOJI   = {};

// Kleuren worden hergebruikt als er meer dan 4 personen zijn
const _BADGE_KLEUREN = ['badge-jeroen','badge-kelly','badge-nora','badge-odiel'];

function herbouwPersonenData() {
  const profielen = Auth.getProfielen();
  // Leegmaken (muteren, niet vervangen)
  PERSONEN.length = 0;
  Object.keys(PLABEL).forEach(k => { if (k !== 'familie') delete PLABEL[k]; });
  Object.keys(PBADGE).forEach(k => { if (k !== 'familie') delete PBADGE[k]; });
  Object.keys(PEMOJI).forEach(k => delete PEMOJI[k]);
  // Opnieuw vullen vanuit database-profielen
  profielen.forEach((p, i) => {
    PERSONEN.push(p.persoonKey);
    PLABEL[p.persoonKey] = p.naam;
    PBADGE[p.persoonKey] = _BADGE_KLEUREN[i % _BADGE_KLEUREN.length];
    PEMOJI[p.persoonKey] = p.emoji;
  });
}

const DKORT   = ['Ma','Di','Wo','Do','Vr','Za','Zo'];   // Ma-first, index 0=Ma
const DLANG   = ['Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag','Zondag'];
const WEEKEND  = [5, 6]; // index in DKORT (Za=5, Zo=6)
const DAGKEYS  = ['ma','di','wo','do','vr','za','zo'];   // Ma-first lowercase
const DAGMAP   = {0:'zo',1:'ma',2:'di',3:'wo',4:'do',5:'vr',6:'za'}; // getDay() → key
const DLANG_GD = ['Zondag','Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag']; // getDay() → lang

const SLOTS  = [
  { key:'ontbijt', lbl:'Ontbijt', types:['ontbijt'] },
  { key:'lunch',   lbl:'Lunch',   types:['lunch','weekend'] },
  { key:'avond',   lbl:'Avond',   types:['avond','weekend'] },
];
const SPEC   = { shake:'Shake', uiteten:'Uit eten', afhalen:'Afhalen', restjes:'Restjes' };

const DRUKTE_MAX = { normaal:2, druk:4 }; // aantal activiteiten: ≤1=rustig, 2-3=normaal, ≥4=druk
const DRUKTE_BG  = { rustig:'#e1f5ee', normaal:'#faeeda', druk:'#fcebeb' };
const DRUKTE_CLR = { rustig:'#085041', normaal:'#633806', druk:'#a32d2d' };
const DRUKTE_DOT = { rustig:'#1d9e75', normaal:'#ba7517', druk:'#e24b4a' };

// Schoolvakanties Vlaanderen — hardcoded baselines (uitbreidbaar via instellingen)
const SCHOOLVAKANTIES = [
  { naam:'Herfstvakantie',       van:'2025-10-27', tot:'2025-11-02', kleur:'#faeeda' },
  { naam:'Wapenstilstand',       van:'2025-11-11', tot:'2025-11-11', kleur:'#e6f1fb' },
  { naam:'Kerstvakantie',        van:'2025-12-22', tot:'2026-01-04', kleur:'#e1f5ee' },
  { naam:'Krokusvakantie',       van:'2026-02-16', tot:'2026-02-22', kleur:'#eeedfe' },
  { naam:'Paasvakantie',         van:'2026-04-06', tot:'2026-04-19', kleur:'#fbeaf0' },
  { naam:'Dag van de Arbeid',    van:'2026-05-01', tot:'2026-05-01', kleur:'#e6f1fb' },
  { naam:'O.L.H. Hemelvaart',   van:'2026-05-14', tot:'2026-05-15', kleur:'#e6f1fb' },
  { naam:'Pinksteren',           van:'2026-05-25', tot:'2026-05-25', kleur:'#e6f1fb' },
  { naam:'Zomervakantie',        van:'2026-07-01', tot:'2026-08-31', kleur:'#faeeda' },
];

// Belgische feestdagen — hardcoded baselines (uitbreidbaar via instellingen)
const FEESTDAGEN = [
  { naam:'Nieuwjaarsdag',        van:'2025-01-01', tot:'2025-01-01', kleur:'#e6f1fb' },
  { naam:'Paasmaandag',          van:'2025-04-21', tot:'2025-04-21', kleur:'#fbeaf0' },
  { naam:'Dag van de Arbeid',    van:'2025-05-01', tot:'2025-05-01', kleur:'#e6f1fb' },
  { naam:'O.L.H. Hemelvaart',   van:'2025-05-29', tot:'2025-05-29', kleur:'#e6f1fb' },
  { naam:'Pinkstermaandag',      van:'2025-06-09', tot:'2025-06-09', kleur:'#e6f1fb' },
  { naam:'Nationale feestdag',   van:'2025-07-21', tot:'2025-07-21', kleur:'#e6f1fb' },
  { naam:'O.L.V. Hemelvaart',   van:'2025-08-15', tot:'2025-08-15', kleur:'#e6f1fb' },
  { naam:'Allerheiligen',        van:'2025-11-01', tot:'2025-11-01', kleur:'#eeedfe' },
  { naam:'Wapenstilstand',       van:'2025-11-11', tot:'2025-11-11', kleur:'#e6f1fb' },
  { naam:'Kerstmis',             van:'2025-12-25', tot:'2025-12-25', kleur:'#e1f5ee' },
  { naam:'Nieuwjaarsdag',        van:'2026-01-01', tot:'2026-01-01', kleur:'#e6f1fb' },
  { naam:'Paasmaandag',          van:'2026-04-06', tot:'2026-04-06', kleur:'#fbeaf0' },
  { naam:'Dag van de Arbeid',    van:'2026-05-01', tot:'2026-05-01', kleur:'#e6f1fb' },
  { naam:'O.L.H. Hemelvaart',   van:'2026-05-14', tot:'2026-05-14', kleur:'#e6f1fb' },
  { naam:'Pinkstermaandag',      van:'2026-05-25', tot:'2026-05-25', kleur:'#e6f1fb' },
  { naam:'Nationale feestdag',   van:'2026-07-21', tot:'2026-07-21', kleur:'#e6f1fb' },
  { naam:'O.L.V. Hemelvaart',   van:'2026-08-15', tot:'2026-08-15', kleur:'#e6f1fb' },
  { naam:'Allerheiligen',        van:'2026-11-01', tot:'2026-11-01', kleur:'#eeedfe' },
  { naam:'Wapenstilstand',       van:'2026-11-11', tot:'2026-11-11', kleur:'#e6f1fb' },
  { naam:'Kerstmis',             van:'2026-12-25', tot:'2026-12-25', kleur:'#e1f5ee' },
];

// ── App state ─────────────────────────────────────────────────
let activiteiten = [];
let recepten = [];
let planning = {};
let extraItems = [];
let boodschappenReceptItems = [];
let drukteOverride = {};
let standaardIngredienten = [];
let contacten = [];
let todos = [];
let geheugen = [];
let uitzonderingen = [];
let transportUitzonderingen = {};   // { 'YYYY-MM-DD': { nora:{brengt,haalt,eetGroo}, odiel:{...} } }
let standaardTransport = {};
let vasteRoosters = {};
let customSchoolvakanties = [];     // Aangepaste/extra schoolvakanties (opgeslagen in Supabase)
let customFeestdagen = [];          // Aangepaste/extra feestdagen (opgeslagen in Supabase)
let transportPersonen = [];         // Configureerbare transportpersonen [{naam:'Kelly'}, ...]
let portiesKindRatio  = 0.5;       // Portie-gewicht per kind (default 0.5 = halve portie)

// ── Hulpfuncties datum ────────────────────────────────────────
function getWeekDatesFrom(isoDate, offset) {
  const now=new Date(isoDate+'T12:00:00'); const day=now.getDay();
  const diff=(day===0?-6:1-day);
  const mon=new Date(now); mon.setDate(now.getDate()+diff+(offset||0)*7);
  return Array.from({length:7},(_,i)=>{const d=new Date(mon);d.setDate(mon.getDate()+i);return d;});
}
function getWeekDates(offset) {
  return getWeekDatesFrom(fDateISO(new Date()), offset);
}
function fDate(d) { return d.getDate()+'/'+(d.getMonth()+1); }
function fDateISO(d) {
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function wLabel(dates) { return fDate(dates[0])+' — '+fDate(dates[6]); }

function maakTransportActiviteit(datum, kind, brengt, haalt) {
  const profielen = Auth.getProfielen();
  const kindNaam = (profielen.find(p=>p.persoonKey===kind)?.naam) || (kind.charAt(0).toUpperCase()+kind.slice(1));
  let seq = 0;
  const verwerk = (naam, transportNaam, start, eindUur) => {
    if (!transportNaam) return;
    const p = profielen.find(q => q.naam === transportNaam);
    if (!p) return;
    const wie = [p.persoonKey];
    const bestaatAl = activiteiten.some(a =>
      a.freq==='eenmalig' && a.beginDatum===datum && a.naam===naam &&
      (a.wie||[]).length===1 && (a.wie||[])[0]===p.persoonKey
    );
    if (bestaatAl) return;
    const act = {
      id: Date.now()+seq++, naam, wie, dagen:[], start, eindUur,
      duur:0, reisHeen:0, reisTerug:0, prep:0, locatie:'',
      freq:'eenmalig', beginDatum:datum, eindDatum:datum,
      meerdaags:false, prive:false, informatief:false, transport:{}, maaltijdThuis:{}
    };
    activiteiten.push(act);
    slaLokaalOp();
    sbSaveActiviteit(act);
  };
  verwerk(`${kindNaam} naar school`, brengt, '08:00', '08:20');
  verwerk(`${kindNaam} ophalen`, haalt, '15:30', '15:45');
}

function isSchoolvakantie(datum) {
  const d = new Date(datum+'T12:00:00');
  return [...SCHOOLVAKANTIES, ...customSchoolvakanties].some(v=>d>=new Date(v.van)&&d<=new Date(v.tot)) ||
    uitzonderingen.some(u=>u.datum===datum&&(u.type==='vrij'||u.type==='kindjes-vrij'));
}
function getVakantieNaam(datum) {
  const d = new Date(datum+'T12:00:00');
  const v = [...SCHOOLVAKANTIES, ...customSchoolvakanties].find(v=>d>=new Date(v.van)&&d<=new Date(v.tot));
  return v ? v.naam : 'Vakantie';
}
function isFeestdag(datum) {
  const d = new Date(datum+'T12:00:00');
  return [...FEESTDAGEN, ...customFeestdagen].some(v=>d>=new Date(v.van)&&d<=new Date(v.tot));
}
function getFeestdagNaam(datum) {
  const d = new Date(datum+'T12:00:00');
  const v = [...FEESTDAGEN, ...customFeestdagen].find(v=>d>=new Date(v.van)&&d<=new Date(v.tot));
  return v ? v.naam : 'Feestdag';
}
function getDagDrukte(datum) {
  if (drukteOverride[datum]) return drukteOverride[datum];
  const aantalActs = activiteiten.filter(a => isActiefOpDatum(a, datum) && !a.informatief).length;
  if (aantalActs >= DRUKTE_MAX.druk)    return 'druk';
  if (aantalActs >= DRUKTE_MAX.normaal) return 'normaal';
  return 'rustig';
}
function tijdMinuten(t) {
  if (!t) return 0;
  const [h,m] = t.split(':').map(Number); return h*60+(m||0);
}
function isActiefOpDatum(act, datumStr) {
  // Meerdaagse activiteiten: toon op elke dag binnen de periode
  if (act.meerdaags) return !!act.beginDatum && !!act.eindDatum && datumStr >= act.beginDatum && datumStr <= act.eindDatum;
  // Check uitgesloten dates (enkel-herhaling-verwijderd)
  if ((act.uitgesloten||[]).includes(datumStr)) return false;
  // Eenmalige activiteiten: toon enkel op hun exacte begindatum
  if (act.freq === 'eenmalig') return datumStr === act.beginDatum;
  const datum = new Date(datumStr+'T12:00:00');
  const dagNr = datum.getDay();
  const dagKey = DAGMAP[dagNr];
  if (!act.dagen || !act.dagen.includes(dagKey)) return false;
  if (act.beginDatum && datum < new Date(act.beginDatum)) return false;
  if (act.eindDatum  && datum > new Date(act.eindDatum+'T23:59:59')) return false;
  if (act.freq === 'tweewekelijks') {
    const ref = act.beginDatum ? new Date(act.beginDatum) : new Date('2024-01-01');
    const diff = Math.floor((datum - ref) / (7*24*3600*1000));
    if (diff % 2 !== 0) return false;
  }
  return true;
}

// ── Supabase fetch ────────────────────────────────────────────
let _eigenTs = 0;
async function sbFetch(tabel, methode='GET', body=null, filter='', prefer=null) {
  if (methode !== 'GET') _eigenTs = Date.now();
  await Auth.refreshIfNeeded();
  const url = `${SUPABASE_URL}/rest/v1/${tabel}${filter}`;
  const preferValue = prefer !== null ? prefer : (methode==='POST' ? 'return=representation' : null);
  const headers = { ...Auth.headers() };
  if (preferValue) headers['Prefer'] = preferValue;
  const opts = { method: methode, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (res.status===401) {
    if (!localStorage.getItem(Auth.KIND_KEY)) Auth.logout();
    throw new Error('Sessie verlopen');
  }
  if (!res.ok) {
    const e = await res.json().catch(()=>({}));
    const msg = e.message || e.hint || e.error_description || String(res.status);
    console.error(`[Supabase] ${methode} /${tabel}${filter}`, res.status, e);
    throw new Error(msg);
  }
  if (methode==='DELETE'||res.status===204) return [];
  return res.json().catch(()=>[]);
}

// ── Data laden ────────────────────────────────────────────────
async function laadOp() {
  toonOpslagStatus('⏳ Data laden...');
  // Bewaar lokaal opgeslagen items die nog niet naar Supabase zijn gesynchroniseerd
  // (items zonder _sbId werden lokaal aangemaakt maar de write werd onderbroken)
  let _pendingActs = [], _pendingTodos = [];
  try {
    const _local = JSON.parse(localStorage.getItem('gezinsapp_data') || '{}');
    _pendingActs  = (_local.activiteiten || []).filter(a => !a._sbId);
    _pendingTodos = (_local.todos        || []).filter(t => !t._sbId);
  } catch {}
  try {
    await Auth.laadProfielen();
    herbouwPersonenData(); // PERSONEN, PLABEL, PBADGE, PEMOJI vullen vanuit profielen
    const [r,i,a,p,b,c,d,t] = await Promise.all([
      sbFetch(`recepten${_gezinIdQ('?order=naam')}`),
      sbFetch(`ingredienten${_gezinIdQ('?order=naam')}`),
      sbFetch(`activiteiten${_gezinIdQ('?order=naam')}`),
      sbFetch(`planning${_gezinIdQ('')}`),
      sbFetch(`boodschappen_extra${_gezinIdQ('?order=naam')}`),
      sbFetch(`contacten${_gezinIdQ('?order=naam')}`),
      sbFetch(`drukte_override${_gezinIdQ('')}`),
      sbFetch(`todos${_gezinIdQ('?order=aangemaakt_op')}`).catch(()=>[]),
    ]);
    if (r.length) recepten = r.map(x=>({...x, _sbId:x.id, tags:x.tags||[], ingredienten:x.ingredienten||[], wie:x.wie||[], prive:x.prive||false}));
    if (i.length) standaardIngredienten = i.map(x => ({...x, _sbId: x.id, productLink: x.product_link || null}));
    if (a.length) activiteiten = a.map(x=>({
      ...x, _sbId:x.id,
      dagen:x.dagen||[], wie:Array.isArray(x.wie)?x.wie:[x.wie].filter(Boolean),
      reisHeen:x.reis_heen, reisTerug:x.reis_terug, eindUur:x.eind_uur,
      beginDatum:x.begin_datum, eindDatum:x.eind_datum, prive:x.prive||false,
      transport: x.transport || {},
      uitgesloten: (x.transport||{}).uitgesloten || [],
      icalUid: x.ical_uid||null, icalSource: x.ical_source||null,
      maaltijdThuis: x.maaltijd_thuis || null,
    }));
    if (p.length) p.forEach(x=>{ planning[x.datum]={ontbijt:x.ontbijt,lunch:x.lunch,avond:x.avond,porties:x.porties||{}}; });
    if (b.length) {
      extraItems = b.filter(x => (x.type||'extra') === 'extra');
      boodschappenReceptItems = b.filter(x => x.type === 'recept').map(x => ({
        ...x, _sbId: x.id,
        afgevinkt: x.afgevinkt || false,
        weekKey: x.week_key || null,
        eenheid: x.eenheid || null,
        hoev: x.hoev || null,
        receptNaam: x.recept_naam || null,
      }));
    }
    if (c.length) contacten = c.map(x=>{
      const _p=(v)=>{if(!v) return null; if(typeof v==='object') return v; try{return JSON.parse(v);}catch{return null;}};
      const partnerData=_p(x.partner); // {p1:{...}, p2:{...}} of oud formaat
      const isNieuwFormaat=partnerData&&(partnerData.p1||partnerData.p2);
      return {
        ...x, _sbId:x.id,
        partner1: isNieuwFormaat ? (partnerData.p1||null) : (partnerData||null),
        partner2: isNieuwFormaat ? (partnerData.p2||null) : null,
        kinderenData: _p(x.kinderen_namen)||[],
        kerstmis: x.kerstmis===true||x.kerstmis==='ja'||x.kerstmis===1,
        cadeauNj: x.cadeau_nj, cadeauVj: x.cadeau_vj,
        adres: x.adres||null,
        belangrijkeDatums: isNieuwFormaat ? (partnerData.bd||[]) : [],
      };
    });
    if (d.length) d.forEach(x=>drukteOverride[x.datum]=x.drukte);
    if (t.length) todos = t.map(x=>({...x, _sbId:x.id, wie:x.wie||[], gedaanOp:x.gedaan_op, aangemaaktDoor:x.aangemaakt_door, aangemaaktOp:x.aangemaakt_op}));
    // Laad instellingen
    const inst = await sbFetch(`instellingen${_gezinIdQ('')}`).catch(()=>[]);
    inst.forEach(r=>{
      if (r.id==='vasteRoosters'&&r.waarde) vasteRoosters={...vasteRoosters,...r.waarde};
      if (r.id==='uitzonderingen'&&r.waarde) uitzonderingen=r.waarde;
      if (r.id==='transportUitzonderingen'&&r.waarde) transportUitzonderingen=r.waarde;
      if (r.id==='standaardTransport'&&r.waarde) standaardTransport={...standaardTransport,...r.waarde};
      if (r.id==='googleMapsKey'&&r.waarde) localStorage.setItem('google_maps_key', r.waarde);
      if (r.id==='thuisadres'&&r.waarde) localStorage.setItem('gezinsapp_thuisadres', r.waarde);
      if (r.id==='anthropicApiKey'&&r.waarde) localStorage.setItem('anthropic_api_key', r.waarde);
      if (r.id==='buienradarUrl'&&r.waarde) localStorage.setItem('gezinsapp_buienradar_url', r.waarde);
      if (r.id==='geheugen' && r.waarde) geheugen = r.waarde;
      if (r.id.startsWith('werkadres_')&&r.waarde) localStorage.setItem('gezinsapp_'+r.id, r.waarde);
      if (r.id.startsWith('reistijd_')&&r.waarde) localStorage.setItem('gezinsapp_'+r.id, r.waarde);
      if (r.id==='gezinsDatums'&&r.waarde) gezinsDatums = r.waarde;
      if (r.id==='customSchoolvakanties'&&r.waarde) customSchoolvakanties = r.waarde;
      if (r.id==='customFeestdagen'&&r.waarde) customFeestdagen = r.waarde;
      if (r.id==='transportPersonen'&&r.waarde) transportPersonen = r.waarde;
      if (r.id==='winkels'&&r.waarde&&Array.isArray(r.waarde)&&r.waarde.length) WINKELS = r.waarde;
      if (r.id==='portiesKindRatio'&&typeof r.waarde==='number') portiesKindRatio = r.waarde;
    });
    // Hersync: lokale items die nooit Supabase bereikten (bijv. door iOS Safari page-unload)
    const toSyncActs  = _pendingActs.filter(a => !activiteiten.some(x => x.id === a.id));
    const toSyncTodos = _pendingTodos.filter(t => !todos.some(x => x.id === t.id));
    toSyncActs.forEach(a => activiteiten.push(a));
    toSyncTodos.forEach(t => todos.push(t));
    let syncOk = true;
    if (toSyncActs.length || toSyncTodos.length) {
      const results = await Promise.all([
        ...toSyncActs.map(a => sbSaveActiviteit(a)),
        ...toSyncTodos.map(t => sbSaveTodo(t)),
      ]);
      syncOk = results.every(r => r !== false);
    }
    if (syncOk) toonOpslagStatus('✅ Gesynchroniseerd');
    _initPolling();
  } catch(e) {
    console.warn('Laden mislukt:', e);
    toonOpslagStatus('⚠️ Offline');
    laadLokaal();
  }
}

function laadLokaal() {
  try {
    const raw = localStorage.getItem('gezinsapp_data');
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.activiteiten) activiteiten = data.activiteiten;
    if (data.recepten)     recepten     = data.recepten;
    if (data.planning)     planning     = data.planning;
    if (data.extraItems)   extraItems   = data.extraItems;
    if (data.boodschappenReceptItems) boodschappenReceptItems = data.boodschappenReceptItems;
    if (data.drukteOverride) drukteOverride = data.drukteOverride;
    if (data.standaardIngredienten) standaardIngredienten = data.standaardIngredienten;
    if (data.contacten)    contacten    = data.contacten;
    if (data.todos)        todos        = data.todos;
    if (data.geheugen)     geheugen     = data.geheugen;
    if (data.uitzonderingen) uitzonderingen = data.uitzonderingen;
    if (data.vasteRoosters) vasteRoosters = {...vasteRoosters,...data.vasteRoosters};
    if (data.transportUitzonderingen) transportUitzonderingen = data.transportUitzonderingen;
    if (data.standaardTransport) standaardTransport = {...standaardTransport,...data.standaardTransport};
  } catch(e) { console.warn('Lokaal laden mislukt:', e); }
}

const _dataChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('gezinsapp_data') : null;

// ── Polling (vervangt Supabase Realtime WebSocket) ────────────
// Elke 30s worden wijzigingen van andere toestellen opgepikt.
// Eigen schrijfacties worden genegeerd via _eigenTs (2s venster).
const _updateCallbacks = [];

function onGezinsappUpdate(fn) { _updateCallbacks.push(fn); }

function _initPolling() {
  if (window._sbPollingInit) return;
  window._sbPollingInit = true;
  setInterval(() => {
    if (document.hidden) return;               // tab niet actief: overslaan
    if (Date.now() - _eigenTs < 2000) return;  // eigen schrijfactie: overslaan
    if (document.querySelector('.modal-bg.open')) return; // modal open: overslaan
    laadOp().then(() => {
      _updateCallbacks.forEach(fn => { try { fn(); } catch(e) { console.warn('[Polling] render fout', e); } });
      _dataChannel?.postMessage('changed');
    }).catch(() => {});
  }, 30_000);
}

function slaLokaalOp() {
  const data = { activiteiten, recepten, planning, extraItems, boodschappenReceptItems, drukteOverride, standaardIngredienten, contacten, todos, geheugen, uitzonderingen, vasteRoosters, transportUitzonderingen, standaardTransport };
  try { localStorage.setItem('gezinsapp_data', JSON.stringify(data)); } catch(e) {}
  _dataChannel?.postMessage('changed');
}

// Huidige gezin_id — gebruikt in alle lees- en schrijfoperaties
// Fallback op localStorage zodat saves ook werken als laadProfielen faalde
function _gezinId() { return Auth.getGezinId() || localStorage.getItem('gezinsapp_gezin_id') || null; }
// Voegt gezin_id toe aan een query string: _gezinIdQ('?order=naam') → '?order=naam&gezin_id=eq.xxx'
function _gezinIdQ(base = '') {
  const id = _gezinId();
  if (!id) return base;
  return base ? `${base}&gezin_id=eq.${id}` : `?gezin_id=eq.${id}`;
}

let _lastClickedBtn = null;
document.addEventListener('mousedown', e => {
  const btn = e.target.closest('button');
  if (btn) _lastClickedBtn = btn;
}, true);

function _flashGreen(btn) {
  if (!btn) return;
  btn.classList.add('btn-saved');
  setTimeout(() => btn.classList.remove('btn-saved'), 1800);
}

function toonOpslagStatus(tekst) {
  document.querySelectorAll('.opslag-status, .sidebar-sync').forEach(el => el.textContent = tekst);
  if (tekst && tekst.startsWith('✅')) _flashGreen(_lastClickedBtn);
}

// Uniforme fout-afhandeling: log + toon in UI
function _opslagFout(e, context) {
  const msg = e?.message || String(e);
  console.error(`[Opslaan/${context||'?'}]`, msg);
  toonOpslagStatus('⚠️ ' + msg);
}

// ── Specifieke save functies ──────────────────────────────────
async function sbSaveRecept(recept) {
  const data = {
    naam:recept.naam,
    type:recept.type,                          // backwards compat
    types:recept.types||[recept.type].filter(Boolean),  // nieuw: array
    tijd:recept.tijd,
    porties:recept.porties||4,                 // nieuw
    moeilijk:recept.moeilijk,
    wie:Array.isArray(recept.wie)?recept.wie:[recept.wie].filter(Boolean),
    bron:recept.bron,
    bereiding:recept.bereiding,
    tags:recept.tags,
    ingredienten:recept.ingredienten,
    prive:recept.prive||false,
    score:recept.score??null,
  };
  try {
    if (recept._sbId) { await sbFetch(`recepten?id=eq.${recept._sbId}`,'PATCH',data); }
    else { const res=await sbFetch('recepten','POST',{...data,gezin_id:_gezinId()}); if(res[0]) recept._sbId=res[0].id; }
    toonOpslagStatus('✅ Opgeslagen');
    return true;
  } catch(e) { _opslagFout(e,'recept'); return e?.message||String(e); }
}
async function sbDeleteRecept(sbId) { try{await sbFetch(`recepten?id=eq.${sbId}`,'DELETE');}catch(e){_opslagFout(e,'recept-delete');} }

async function sbSaveActiviteit(act) {
  const gid = _gezinId();
  if (!act._sbId && !gid) { toonOpslagStatus('⚠️ Geen gezin_id — herlaad de pagina'); return false; }
  const data = {
    naam:act.naam, wie:act.wie, start:act.start||null, eind_uur:act.eindUur||null,
    duur: +act.duur || 0, reis_heen: +act.reisHeen || 0, reis_terug: +act.reisTerug || 0,
    locatie:act.locatie, freq:act.freq, begin_datum:act.beginDatum||null,
    eind_datum:act.eindDatum||null, prep: act.prep || null, dagen:act.dagen,
    meerdaags:act.meerdaags||false, prive:act.prive||false, informatief:act.informatief||false,
    transport: { ...(act.transport||{}), uitgesloten: act.uitgesloten||[] },
    ical_uid: act.icalUid||null, ical_source: act.icalSource||null,
    maaltijd_thuis: act.maaltijdThuis||null,
  };
  const _doSave = async (d) => {
    if (act._sbId) {
      await sbFetch(`activiteiten?id=eq.${act._sbId}`,'PATCH',d);
    } else {
      const res = await sbFetch('activiteiten','POST',{...d,gezin_id:gid});
      if (res[0]) { act._sbId = res[0].id; slaLokaalOp(); }
    }
  };
  try {
    await _doSave(data);
    toonOpslagStatus('✅ Opgeslagen');
    return true;
  } catch(e) {
    // Kolom 'informatief' bestaat nog niet → retry zonder die kolom
    if (String(e).includes('informatief')) {
      try {
        const { informatief: _drop, ...dataZonderInfo } = data;
        await _doSave(dataZonderInfo);
        toonOpslagStatus('✅ Opgeslagen');
        return true;
      } catch(e2) { _opslagFout(e2,'activiteit'); return false; }
    }
    _opslagFout(e,'activiteit'); return false;
  }
}
async function sbDeleteActiviteit(sbId) { try{await sbFetch(`activiteiten?id=eq.${sbId}`,'DELETE');}catch(e){_opslagFout(e,'activiteit-delete');} }

async function sbSaveTodo(todo) {
  const data = {
    titel:todo.titel, notitie:todo.notitie||null, deadline:todo.deadline||null,
    duur:todo.duur||null, prioriteit:todo.prioriteit||'middel', wie:todo.wie||[],
    prive:todo.prive||false, gedaan:todo.gedaan||false, gedaan_op:todo.gedaanOp ? new Date(todo.gedaanOp).toISOString() : null,
    aangemaakt_door:todo.aangemaaktDoor||null, aangemaakt_op:todo.aangemaaktOp||null,
  };
  try {
    if (todo._sbId) {
      await sbFetch(`todos?id=eq.${todo._sbId}`,'PATCH',data);
    } else {
      const res = await sbFetch('todos','POST',{...data,gezin_id:_gezinId()});
      if (res[0]) { todo._sbId = res[0].id; slaLokaalOp(); }
    }
    toonOpslagStatus('✅ Opgeslagen');
    return true;
  } catch(e) { _opslagFout(e,'todo'); return false; }
}
async function sbDeleteTodo(sbId) { try{await sbFetch(`todos?id=eq.${sbId}`,'DELETE');}catch(e){_opslagFout(e,'todo-delete');} }

async function sbSavePlanning(datum, slot, waarde, porties) {
  const gid = _gezinId();
  if (!gid) { toonOpslagStatus('⚠️ Geen gezin_id — herlaad de pagina'); return; }
  try {
    await sbFetch('planning','POST',
      {datum,[slot]:waarde,porties:porties||{},gezin_id:gid},
      '','resolution=merge-duplicates');
    toonOpslagStatus('✅ Opgeslagen');
  } catch(e) { _opslagFout(e,'planning'); }
}

async function sbSaveIngredient(ing) {
  const data = { naam:ing.naam, winkel:ing.winkel, categorie:ing.categorie, product_link:ing.productLink||null };
  try {
    if (ing._sbId) { await sbFetch(`ingredienten?id=eq.${ing._sbId}`,'PATCH',data); }
    else { const res=await sbFetch('ingredienten','POST',{...data,gezin_id:_gezinId()}); if(res[0]) ing._sbId=res[0].id; }
    toonOpslagStatus('✅ Opgeslagen');
  } catch(e) { _opslagFout(e,'ingredient'); }
}
async function sbDeleteIngredient(sbId) { try{await sbFetch(`ingredienten?id=eq.${sbId}`,'DELETE');}catch(e){_opslagFout(e,'ingredient-delete');} }

async function sbSaveContact(contact) {
  // Serialiseer nieuwe structuur naar bestaande kolommen
  // partner1+partner2 worden opgeslagen als JSON in de 'partner' kolom
  const p1 = contact.partner1||null;
  const p2 = contact.partner2||null;
  const bd = Array.isArray(contact.belangrijkeDatums) ? contact.belangrijkeDatums : [];
  const partnerJson = JSON.stringify({p1, p2, bd});
  const kinderenData = Array.isArray(contact.kinderenData) ? contact.kinderenData : [];
  const kerstmis = contact.kerstmis===true||contact.kerstmis==='ja'||contact.kerstmis===1;
  const data = {
    naam: contact.naam,
    partner: partnerJson,
    kinderen: kinderenData.length,
    kinderen_namen: JSON.stringify(kinderenData),
    kerstmis: kerstmis,
    cadeau_nj: contact.cadeauNj||null,
    cadeau_vj: contact.cadeauVj||null,
    adres: contact.adres||null,
  };
  try {
    if (contact._sbId) { await sbFetch(`contacten?id=eq.${contact._sbId}`,'PATCH',data); }
    else { const res=await sbFetch('contacten','POST',{...data,gezin_id:_gezinId()}); if(res&&res[0]) contact._sbId=res[0].id; }
    toonOpslagStatus('✅ Opgeslagen');
  } catch(e) { _opslagFout(e,'contact'); }
}
async function sbDeleteContact(sbId) { try{await sbFetch(`contacten?id=eq.${sbId}`,'DELETE');}catch(e){_opslagFout(e,'contact-delete');} }

async function sbSaveExtra(item) {
  try { const res=await sbFetch('boodschappen_extra','POST',{naam:item.naam,winkel:item.winkel,gezin_id:_gezinId()}); if(res[0]) item._sbId=res[0].id; toonOpslagStatus('✅ Opgeslagen'); }
  catch(e) { _opslagFout(e,'extra'); }
}
async function sbDeleteExtra(sbId) { try{await sbFetch(`boodschappen_extra?id=eq.${sbId}`,'DELETE');}catch(e){_opslagFout(e,'extra-delete');} }

async function sbSaveBoodschapReceptItem(item) {
  try {
    const gid = _gezinId();
    const body = {
      naam: item.naam,
      winkel: item.winkel,
      eenheid: item.eenheid || null,
      hoev: item.hoev || null,
      recept_naam: item.receptNaam || null,
      type: 'recept',
      afgevinkt: false,
      week_key: item.weekKey || null,
      gezin_id: gid,
    };
    const res = await sbFetch('boodschappen_extra', 'POST', body);
    if (res[0]) item._sbId = res[0].id;
  } catch(e) { console.warn('[boodschapReceptItem save]', e); }
}

async function sbToggleAfgevinktItem(sbId, val) {
  if (!sbId) return;
  try { await sbFetch(`boodschappen_extra?id=eq.${sbId}`, 'PATCH', { afgevinkt: val }); }
  catch(e) { console.warn('[toggleAfgevinktItem]', e); }
}

async function sbDeleteAlleReceptItems() {
  const gid = _gezinId(); if (!gid) return;
  try { await sbFetch(`boodschappen_extra?gezin_id=eq.${gid}&type=eq.recept`, 'DELETE'); }
  catch(e) { console.warn('[deleteAlleReceptItems]', e); }
}

async function sbDeleteAfgevinktBoodschappen() {
  const gid = _gezinId(); if (!gid) return;
  try { await sbFetch(`boodschappen_extra?gezin_id=eq.${gid}&afgevinkt=eq.true`, 'DELETE'); }
  catch(e) { console.warn('[deleteAfgevinktBoodschappen]', e); }
}

async function sbResetAfgevinkt() {
  const gid = _gezinId(); if (!gid) return;
  try { await sbFetch(`boodschappen_extra?gezin_id=eq.${gid}&afgevinkt=eq.true`, 'PATCH', { afgevinkt: false }); }
  catch(e) { console.warn('[sbResetAfgevinkt]', e); }
}

async function sbSaveDrukte(datum, drukte) {
  const gid = _gezinId();
  if (!gid) { toonOpslagStatus('⚠️ Geen gezin_id — herlaad de pagina'); return; }
  try {
    await sbFetch('drukte_override','POST',
      {datum,drukte,gezin_id:gid},
      '','resolution=merge-duplicates');
    toonOpslagStatus('✅ Opgeslagen');
  } catch(e) { _opslagFout(e,'drukte'); }
}

async function sbSaveInstellingen() {
  const gid = _gezinId();
  if (!gid) { toonOpslagStatus('⚠️ Geen gezin_id — herlaad de pagina'); return; }
  try {
    const extra = [
      ['googleMapsKey',  localStorage.getItem('google_maps_key')         || null],
      ['thuisadres',     localStorage.getItem('gezinsapp_thuisadres')   || null],
      ['anthropicApiKey',localStorage.getItem('anthropic_api_key')      || null],
      ['buienradarUrl',  localStorage.getItem('gezinsapp_buienradar_url')|| null],
    ].filter(([,v]) => v !== null);
    Auth.getProfielen().filter(p=>p.rol==='gezinshoofd').forEach(p=>{
      const wa=localStorage.getItem(`gezinsapp_werkadres_${p.persoonKey}`);
      const rt=localStorage.getItem(`gezinsapp_reistijd_${p.persoonKey}`);
      if(wa) extra.push([`werkadres_${p.persoonKey}`, wa]);
      if(rt) extra.push([`reistijd_${p.persoonKey}`, rt]);
    });
    for (const [id, waarde] of [['vasteRoosters',vasteRoosters],['uitzonderingen',uitzonderingen],['transportUitzonderingen',transportUitzonderingen],['standaardTransport',standaardTransport],...extra]) {
      await sbFetch('instellingen','POST',
        {id,waarde,updated_at:new Date().toISOString(),gezin_id:gid},
        '','resolution=merge-duplicates');
    }
  } catch(e) { _opslagFout(e,'instellingen'); }
}

async function sbSaveGeheugen() {
  const gid = _gezinId();
  if (!gid) return;
  try {
    await sbFetch('instellingen','POST',
      {id:'geheugen', waarde:geheugen, updated_at:new Date().toISOString(), gezin_id:gid},
      '','resolution=merge-duplicates');
  } catch(e) { _opslagFout(e,'geheugen'); }
}

// ── Gezinsdatums ─────────────────────────────────────────────
let gezinsDatums = [];

async function laadGezinsDatums() {
  try {
    const gid = _gezinId();
    const f = gid ? `?id=eq.gezinsDatums&gezin_id=eq.${gid}` : `?id=eq.gezinsDatums`;
    const rows = await sbFetch(`instellingen${f}`).catch(() => []);
    if (rows[0]?.waarde) gezinsDatums = rows[0].waarde;
  } catch(_) {}
}
async function slaCustomSchoolvakantiesOp() {
  const gid = _gezinId(); if (!gid) return;
  try { await sbFetch('instellingen','POST',{id:'customSchoolvakanties',waarde:customSchoolvakanties,updated_at:new Date().toISOString(),gezin_id:gid},'','resolution=merge-duplicates'); } catch(_) {}
}
async function slaCustomFeestdagenOp() {
  const gid = _gezinId(); if (!gid) return;
  try { await sbFetch('instellingen','POST',{id:'customFeestdagen',waarde:customFeestdagen,updated_at:new Date().toISOString(),gezin_id:gid},'','resolution=merge-duplicates'); } catch(_) {}
}
async function slaTransportPersonenOp() {
  const gid = _gezinId(); if (!gid) return;
  try { await sbFetch('instellingen','POST',{id:'transportPersonen',waarde:transportPersonen,updated_at:new Date().toISOString(),gezin_id:gid},'','resolution=merge-duplicates'); } catch(_) {}
}
async function slaWinkelsOp() {
  const gid = _gezinId(); if (!gid) return;
  try { await sbFetch('instellingen','POST',{id:'winkels',waarde:WINKELS,updated_at:new Date().toISOString(),gezin_id:gid},'','resolution=merge-duplicates'); } catch(_) {}
}
async function slaPortiesKindRatioOp() {
  const gid = _gezinId(); if (!gid) return;
  try { await sbFetch('instellingen','POST',{id:'portiesKindRatio',waarde:portiesKindRatio,updated_at:new Date().toISOString(),gezin_id:gid},'','resolution=merge-duplicates'); } catch(_) {}
}
async function slaGezinsDatumsOp() {
  const gid = _gezinId();
  if (!gid) return;
  try {
    await sbFetch('instellingen','POST',
      {id:'gezinsDatums',waarde:gezinsDatums,updated_at:new Date().toISOString(),gezin_id:gid},
      '','resolution=merge-duplicates');
  } catch(_) {}
}

// ── iCal: zie data-ical.js ────────────────────────────────────

// ── Export / import ───────────────────────────────────────────
function exporteerData() {
  const data = { activiteiten, recepten, planning, extraItems, drukteOverride, standaardIngredienten, contacten, todos, uitzonderingen, vasteRoosters, exportDatum:new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a'); a.href=url;
  a.download = 'gezinsapp_backup_'+new Date().toISOString().slice(0,10)+'.json';
  a.click(); URL.revokeObjectURL(url);
}

function importeerData(event) {
  const file = event.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.activiteiten) activiteiten=data.activiteiten;
      if (data.recepten)     recepten=data.recepten;
      if (data.planning)     planning=data.planning;
      if (data.extraItems)   extraItems=data.extraItems;
      if (data.drukteOverride) drukteOverride=data.drukteOverride;
      if (data.standaardIngredienten) standaardIngredienten=data.standaardIngredienten;
      if (data.contacten)    contacten=data.contacten;
      if (data.todos)        todos=data.todos;
      if (data.uitzonderingen) uitzonderingen=data.uitzonderingen;
      if (data.vasteRoosters) vasteRoosters={...vasteRoosters,...data.vasteRoosters};
      slaLokaalOp();
      alert('✅ Data geladen!');
    } catch(err) { alert('❌ Fout: '+err.message); }
  };
  reader.readAsText(file);
}

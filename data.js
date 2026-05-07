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
const SUPABASE_URL = 'https://ceeplmghvcaqvlpicwyi.supabase.co';
const SUPABASE_KEY = 'sb_publishable_pJgY7XEt_wZrxVQcd-bP4A_dSVcsgYa';

const WINKELS      = ['Colruyt','Delhaize','Lidl','Albert Heijn','Beenhouwerij','Markt','Andere'];
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

const DKORT  = ['Di','Wo','Do','Vr','Za','Zo','Ma'];
const DLANG  = ['Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag','Zondag','Maandag'];
const WEEKEND = [4, 5]; // index in DKORT

const SLOTS  = [
  { key:'ontbijt', lbl:'Ontbijt', types:['ontbijt'] },
  { key:'lunch',   lbl:'Lunch',   types:['lunch','weekend'] },
  { key:'avond',   lbl:'Avond',   types:['avond','weekend'] },
];
const SPEC   = { shake:'Shake', uiteten:'Uit eten', afhalen:'Afhalen', restjes:'Restjes' };
const EMOJIS = { avond:'🍝', lunch:'🥗', weekend:'🍖', ontbijt:'🥐' };

const DRUKTE_MAX = { normaal:2, druk:4 }; // aantal activiteiten: ≤1=rustig, 2-3=normaal, ≥4=druk
const DRUKTE_BG  = { rustig:'#e1f5ee', normaal:'#faeeda', druk:'#fcebeb' };
const DRUKTE_CLR = { rustig:'#085041', normaal:'#633806', druk:'#a32d2d' };
const DRUKTE_DOT = { rustig:'#1d9e75', normaal:'#ba7517', druk:'#e24b4a' };

// Schoolvakanties Vlaanderen 2025-2026
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

// ── App state ─────────────────────────────────────────────────
let activiteiten = [];
let recepten = [];
let planning = {};
let extraItems = [];
let drukteOverride = {};
let standaardIngredienten = [];
let contacten = [];
let todos = [];
let uitzonderingen = [];
let transportUitzonderingen = {};   // { 'YYYY-MM-DD': { nora:{brengt,haalt,eetGroo}, odiel:{...} } }
let standaardTransport = {};
let vasteRoosters = {};

// ── Hulpfuncties datum ────────────────────────────────────────
function getWeekDates(offset) {
  const now = new Date(); const day = now.getDay();
  const diff = (day===0 ? -5 : 2-day);
  const tue = new Date(now); tue.setDate(now.getDate()+diff+(offset||0)*7);
  return Array.from({length:7}, (_,i) => { const d=new Date(tue); d.setDate(tue.getDate()+i); return d; });
}
function fDate(d) { return d.getDate()+'/'+(d.getMonth()+1); }
function fDateISO(d) {
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function wLabel(dates) { return fDate(dates[0])+' — '+fDate(dates[6]); }
function isSchoolvakantie(datum) {
  const d = new Date(datum+'T12:00:00');
  return SCHOOLVAKANTIES.some(v=>d>=new Date(v.van)&&d<=new Date(v.tot)) ||
    uitzonderingen.some(u=>u.datum===datum&&(u.type==='vrij'||u.type==='kindjes-vrij'));
}
function getVakantieNaam(datum) {
  const d = new Date(datum+'T12:00:00');
  const v = SCHOOLVAKANTIES.find(v=>d>=new Date(v.van)&&d<=new Date(v.tot));
  return v ? v.naam : 'Vakantie';
}
function getDagDrukte(datum) {
  if (drukteOverride[datum]) return drukteOverride[datum];
  const aantalActs = activiteiten.filter(a => isActiefOpDatum(a, datum)).length;
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
  const dagMap = {1:'ma',2:'di',3:'wo',4:'do',5:'vr',6:'za',0:'zo'};
  const dagKey = dagMap[dagNr];
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
async function sbFetch(tabel, methode='GET', body=null, filter='') {
  await Auth.refreshIfNeeded();
  const url = `${SUPABASE_URL}/rest/v1/${tabel}${filter}`;
  const opts = {
    method: methode,
    headers: { ...Auth.headers(), 'Prefer': methode==='POST'?'return=representation':'' }
  };
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
  return res.json();
}

// ── Data laden ────────────────────────────────────────────────
async function laadOp() {
  toonOpslagStatus('⏳ Data laden...');
  try {
    await Auth.laadProfielen();
    herbouwPersonenData(); // PERSONEN, PLABEL, PBADGE, PEMOJI vullen vanuit profielen
    const [r,i,a,p,b,c,d,t] = await Promise.all([
      sbFetch(`recepten${_gidQ('?order=naam')}`),
      sbFetch(`ingredienten${_gidQ('?order=naam')}`),
      sbFetch(`activiteiten${_gidQ('?order=naam')}`),
      sbFetch(`planning${_gidQ('')}`),
      sbFetch(`boodschappen_extra${_gidQ('?order=naam')}`),
      sbFetch(`contacten${_gidQ('?order=naam')}`),
      sbFetch(`drukte_override${_gidQ('')}`),
      sbFetch(`todos${_gidQ('?order=aangemaakt_op')}`).catch(()=>[]),
    ]);
    if (r.length) recepten = r.map(x=>({...x, _sbId:x.id, tags:x.tags||[], ingredienten:x.ingredienten||[], wie:x.wie||[], prive:x.prive||false}));
    if (i.length) standaardIngredienten = i;
    if (a.length) activiteiten = a.map(x=>({
      ...x, _sbId:x.id,
      dagen:x.dagen||[], wie:Array.isArray(x.wie)?x.wie:[x.wie].filter(Boolean),
      reisHeen:x.reis_heen, reisTerug:x.reis_terug, eindUur:x.eind_uur,
      beginDatum:x.begin_datum, eindDatum:x.eind_datum, prive:x.prive||false,
      transport: x.transport || {},
      uitgesloten: (x.transport||{}).uitgesloten || [],
      icalUid: x.ical_uid||null, icalSource: x.ical_source||null,
    }));
    if (p.length) p.forEach(x=>{ planning[x.datum]={ontbijt:x.ontbijt,lunch:x.lunch,avond:x.avond,porties:x.porties||{}}; });
    if (b.length) extraItems = b;
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
      };
    });
    if (d.length) d.forEach(x=>drukteOverride[x.datum]=x.drukte);
    if (t.length) todos = t.map(x=>({...x, _sbId:x.id, wie:x.wie||[], gedaanOp:x.gedaan_op, aangemaaktDoor:x.aangemaakt_door, aangemaaktOp:x.aangemaakt_op}));
    // Laad instellingen
    const inst = await sbFetch(`instellingen${_gidQ('')}`).catch(()=>[]);
    inst.forEach(r=>{
      if (r.id==='vasteRoosters'&&r.waarde) vasteRoosters={...vasteRoosters,...r.waarde};
      if (r.id==='uitzonderingen'&&r.waarde) uitzonderingen=r.waarde;
      if (r.id==='transportUitzonderingen'&&r.waarde) transportUitzonderingen=r.waarde;
      if (r.id==='standaardTransport'&&r.waarde) standaardTransport={...standaardTransport,...r.waarde};
    });
    toonOpslagStatus('✅ Gesynchroniseerd');
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
    if (data.drukteOverride) drukteOverride = data.drukteOverride;
    if (data.standaardIngredienten) standaardIngredienten = data.standaardIngredienten;
    if (data.contacten)    contacten    = data.contacten;
    if (data.todos)        todos        = data.todos;
    if (data.uitzonderingen) uitzonderingen = data.uitzonderingen;
    if (data.vasteRoosters) vasteRoosters = {...vasteRoosters,...data.vasteRoosters};
    if (data.transportUitzonderingen) transportUitzonderingen = data.transportUitzonderingen;
    if (data.standaardTransport) standaardTransport = {...standaardTransport,...data.standaardTransport};
  } catch(e) { console.warn('Lokaal laden mislukt:', e); }
}

function slaLokaalOp() {
  const data = { activiteiten, recepten, planning, extraItems, drukteOverride, standaardIngredienten, contacten, todos, uitzonderingen, vasteRoosters, transportUitzonderingen, standaardTransport };
  try { localStorage.setItem('gezinsapp_data', JSON.stringify(data)); } catch(e) {}
}

// Huidige gezin_id — gebruikt in alle lees- en schrijfoperaties
function _gid() { return Auth.getGezinId() || null; }
// Voegt gezin_id toe aan een query string: _gidQ('?order=naam') → '?order=naam&gezin_id=eq.xxx'
function _gidQ(base = '') {
  const id = _gid();
  if (!id) return base;
  return base ? `${base}&gezin_id=eq.${id}` : `?gezin_id=eq.${id}`;
}

function toonOpslagStatus(tekst) {
  document.querySelectorAll('.opslag-status').forEach(el => el.textContent = tekst);
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
    wie:recept.wie,
    bron:recept.bron,
    bereiding:recept.bereiding,
    tags:recept.tags,
    ingredienten:recept.ingredienten,
    prive:recept.prive||false
  };
  try {
    if (recept._sbId) { await sbFetch(`recepten?id=eq.${recept._sbId}`,'PATCH',data); }
    else { const res=await sbFetch('recepten','POST',{...data,gezin_id:_gid()}); if(res[0]) recept._sbId=res[0].id; }
    toonOpslagStatus('✅ Opgeslagen');
  } catch(e) { _opslagFout(e,'recept'); }
}
async function sbDeleteRecept(sbId) { try{await sbFetch(`recepten?id=eq.${sbId}`,'DELETE');}catch(e){_opslagFout(e,'recept-delete');} }

async function sbSaveActiviteit(act) {
  const data = {
    naam:act.naam, wie:act.wie, start:act.start||null, eind_uur:act.eindUur||null,
    duur: +act.duur || 0, reis_heen: +act.reisHeen || 0, reis_terug: +act.reisTerug || 0,
    locatie:act.locatie, freq:act.freq, begin_datum:act.beginDatum||null,
    eind_datum:act.eindDatum||null, prep: +act.prep || 0, dagen:act.dagen,
    meerdaags:act.meerdaags||false, prive:act.prive||false,
    transport: { ...(act.transport||{}), uitgesloten: act.uitgesloten||[] },
    ical_uid: act.icalUid||null, ical_source: act.icalSource||null,
  };
  try {
    if (act._sbId) { await sbFetch(`activiteiten?id=eq.${act._sbId}`,'PATCH',data); }
    else { const res=await sbFetch('activiteiten','POST',{...data,gezin_id:_gid()}); if(res[0]) act._sbId=res[0].id; }
    toonOpslagStatus('✅ Opgeslagen');
  } catch(e) { _opslagFout(e,'activiteit'); }
}
async function sbDeleteActiviteit(sbId) { try{await sbFetch(`activiteiten?id=eq.${sbId}`,'DELETE');}catch(e){_opslagFout(e,'activiteit-delete');} }

async function sbSaveTodo(todo) {
  const data = {
    titel:todo.titel, notitie:todo.notitie||null, deadline:todo.deadline||null,
    duur:todo.duur||null, prioriteit:todo.prioriteit||'middel', wie:todo.wie||[],
    prive:todo.prive||false, gedaan:todo.gedaan||false, gedaan_op:todo.gedaanOp||null,
    aangemaakt_door:todo.aangemaaktDoor||null, aangemaakt_op:todo.aangemaaktOp||null,
  };
  try {
    if (todo._sbId) { await sbFetch(`todos?id=eq.${todo._sbId}`,'PATCH',data); }
    else { const res=await sbFetch('todos','POST',{...data,gezin_id:_gid()}); if(res[0]) todo._sbId=res[0].id; }
    toonOpslagStatus('✅ Opgeslagen');
  } catch(e) { _opslagFout(e,'todo'); }
}
async function sbDeleteTodo(sbId) { try{await sbFetch(`todos?id=eq.${sbId}`,'DELETE');}catch(e){_opslagFout(e,'todo-delete');} }

async function sbSavePlanning(datum, slot, waarde, porties) {
  const gid = _gid();
  const pf = gid ? `?datum=eq.${datum}&gezin_id=eq.${gid}` : `?datum=eq.${datum}`;
  const bestaand = await sbFetch(`planning${pf}`).catch(()=>[]);
  try {
    if (bestaand.length) { await sbFetch(`planning${pf}`,'PATCH',{[slot]:waarde,porties:porties||{}}); }
    else { await sbFetch('planning','POST',{datum,[slot]:waarde,porties:porties||{},gezin_id:gid}); }
    toonOpslagStatus('✅ Opgeslagen');
  } catch(e) { _opslagFout(e,'planning'); }
}

async function sbSaveIngredient(ing) {
  const data = { naam:ing.naam, winkel:ing.winkel, categorie:ing.categorie };
  try {
    if (ing._sbId) { await sbFetch(`ingredienten?id=eq.${ing._sbId}`,'PATCH',data); }
    else { const res=await sbFetch('ingredienten','POST',{...data,gezin_id:_gid()}); if(res[0]) ing._sbId=res[0].id; }
    toonOpslagStatus('✅ Opgeslagen');
  } catch(e) { _opslagFout(e,'ingredient'); }
}
async function sbDeleteIngredient(sbId) { try{await sbFetch(`ingredienten?id=eq.${sbId}`,'DELETE');}catch(e){_opslagFout(e,'ingredient-delete');} }

async function sbSaveContact(contact) {
  // Serialiseer nieuwe structuur naar bestaande kolommen
  // partner1+partner2 worden opgeslagen als JSON in de 'partner' kolom
  const p1 = contact.partner1||null;
  const p2 = contact.partner2||null;
  const partnerJson = JSON.stringify({p1, p2});
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
  };
  try {
    if (contact._sbId) { await sbFetch(`contacten?id=eq.${contact._sbId}`,'PATCH',data); }
    else { const res=await sbFetch('contacten','POST',{...data,gezin_id:_gid()}); if(res&&res[0]) contact._sbId=res[0].id; }
    toonOpslagStatus('✅ Opgeslagen');
  } catch(e) { _opslagFout(e,'contact'); }
}
async function sbDeleteContact(sbId) { try{await sbFetch(`contacten?id=eq.${sbId}`,'DELETE');}catch(e){_opslagFout(e,'contact-delete');} }

async function sbSaveExtra(item) {
  try { const res=await sbFetch('boodschappen_extra','POST',{naam:item.naam,winkel:item.winkel,gezin_id:_gid()}); if(res[0]) item._sbId=res[0].id; toonOpslagStatus('✅ Opgeslagen'); }
  catch(e) { _opslagFout(e,'extra'); }
}
async function sbDeleteExtra(sbId) { try{await sbFetch(`boodschappen_extra?id=eq.${sbId}`,'DELETE');}catch(e){_opslagFout(e,'extra-delete');} }

async function sbSaveDrukte(datum, drukte) {
  const gid = _gid();
  const df = gid ? `?datum=eq.${datum}&gezin_id=eq.${gid}` : `?datum=eq.${datum}`;
  const bestaand = await sbFetch(`drukte_override${df}`).catch(()=>[]);
  try {
    if (bestaand.length) { await sbFetch(`drukte_override${df}`,'PATCH',{drukte}); }
    else { await sbFetch('drukte_override','POST',{datum,drukte,gezin_id:gid}); }
    toonOpslagStatus('✅ Opgeslagen');
  } catch(e) { _opslagFout(e,'drukte'); }
}

async function sbSaveInstellingen() {
  try {
    const gid = _gid();
    for (const [id, waarde] of [['vasteRoosters',vasteRoosters],['uitzonderingen',uitzonderingen],['transportUitzonderingen',transportUitzonderingen],['standaardTransport',standaardTransport]]) {
      const instF = gid ? `?id=eq.${id}&gezin_id=eq.${gid}` : `?id=eq.${id}`;
      const bestaand = await sbFetch(`instellingen${instF}`).catch(()=>[]);
      const data = { waarde, updated_at:new Date().toISOString() };
      if (bestaand.length) { await sbFetch(`instellingen${instF}`,'PATCH',data); }
      else { await sbFetch('instellingen','POST',{id,...data,gezin_id:gid}); }
    }
  } catch(e) { _opslagFout(e,'instellingen'); }
}

// ── iCal gedeelde functies ────────────────────────────────────
let icalAbonnementen = [];

async function laadIcalAbonnementen() {
  try {
    const gid = _gid();
    const f = gid ? `?id=eq.icalAbonnementen&gezin_id=eq.${gid}` : `?id=eq.icalAbonnementen`;
    const rows = await sbFetch(`instellingen${f}`).catch(() => []);
    if (rows[0]?.waarde) icalAbonnementen = rows[0].waarde;
  } catch(_) {}
}
async function slaIcalAbonnementenOp() {
  try {
    const gid = _gid();
    const f = gid ? `?id=eq.icalAbonnementen&gezin_id=eq.${gid}` : `?id=eq.icalAbonnementen`;
    const bestaand = await sbFetch(`instellingen${f}`).catch(() => []);
    const data = { waarde: icalAbonnementen, updated_at: new Date().toISOString() };
    if (bestaand.length) await sbFetch(`instellingen${f}`, 'PATCH', data);
    else await sbFetch('instellingen', 'POST', { id:'icalAbonnementen', ...data, gezin_id: gid });
  } catch(_) {}
}

async function sbVerwijderIcalActiviteiten(sourceUrl) {
  const gid = _gid();
  const filter = gid
    ? `?ical_source=eq.${encodeURIComponent(sourceUrl)}&gezin_id=eq.${gid}`
    : `?ical_source=eq.${encodeURIComponent(sourceUrl)}`;
  try { await sbFetch(`activiteiten${filter}`, 'DELETE'); } catch(e) { console.warn('[iCal delete]', e); }
  activiteiten = activiteiten.filter(a => a.icalSource !== sourceUrl);
}

async function icalFetchUrl(rawUrl) {
  // Externe iCal-providers hebben zelden CORS-headers, dus altijd via proxy ophalen.
  // Directe fetch vermijden: dat logt altijd een CORS-error in de console, ook al is hij gevangen.
  const url = rawUrl.replace(/^webcal:\/\//i, 'https://');
  const proxy = `https://corsproxy.io/?${encodeURIComponent(url)}`;
  const r = await fetch(proxy);
  if (!r.ok) throw new Error(`Kan agenda niet ophalen (HTTP ${r.status})`);
  const t = await r.text();
  if (!t.includes('BEGIN:VCALENDAR')) throw new Error('Geen geldig iCal-bestand ontvangen.');
  return t;
}

async function icalMerge(parsedEvents, wie, sourceUrl) {
  let nieuw = 0, geupdate = 0;
  for (const ev of parsedEvents) {
    ev.wie = wie.length ? [...wie] : [Auth.profiel()?.persoonKey].filter(Boolean);
    if (!ev.icalUid) {
      // Geen UID: altijd toevoegen (eenmalige import zonder deduplicatie)
      activiteiten.push(ev); await sbSaveActiviteit(ev); nieuw++; continue;
    }
    const bestaande = activiteiten.find(a => a.icalUid === ev.icalUid && a.icalSource === sourceUrl);
    if (bestaande) {
      const changed = bestaande.naam !== ev.naam || bestaande.beginDatum !== ev.beginDatum ||
        bestaande.eindDatum !== ev.eindDatum || bestaande.start !== ev.start;
      if (changed) {
        Object.assign(bestaande, { naam:ev.naam, beginDatum:ev.beginDatum, eindDatum:ev.eindDatum,
          start:ev.start, eindUur:ev.eindUur, meerdaags:ev.meerdaags, dagen:ev.dagen, freq:ev.freq });
        await sbSaveActiviteit(bestaande); geupdate++;
      }
    } else {
      activiteiten.push(ev); await sbSaveActiviteit(ev); nieuw++;
    }
  }
  return { nieuw, geupdate };
}

function parseIcal(icsText, sourceUrl = null) {
  const text = icsText.replace(/\r\n/g,'\n').replace(/\r/g,'\n').replace(/\n[ \t]/g,'');
  const events = [];
  const blocks = text.split('BEGIN:VEVENT');
  for (let bi = 1; bi < blocks.length; bi++) {
    const block = blocks[bi].split('END:VEVENT')[0];
    const prop = {};
    for (const line of block.split('\n')) {
      const ci = line.indexOf(':'); if (ci < 0) continue;
      const fullKey = line.slice(0, ci).toUpperCase();
      const val = line.slice(ci + 1).trimEnd();
      const baseKey = fullKey.split(';')[0];
      if (!prop[baseKey]) prop[baseKey] = { val, fullKey };
    }
    const summary = _icalUnescape(prop['SUMMARY']?.val || ''); if (!summary) continue;
    const location = _icalUnescape(prop['LOCATION']?.val || '');
    const uid = prop['UID']?.val || null;
    const dtsFull = prop['DTSTART']?.fullKey || '';
    const dtsVal  = prop['DTSTART']?.val || '';
    const dteVal  = prop['DTEND']?.val || '';
    const allDay  = dtsFull.includes('VALUE=DATE') || /^\d{8}$/.test(dtsVal);
    let beginDatum, eindDatum, startTijd = '', eindTijd = '';
    if (allDay) {
      beginDatum = _icalD(dtsVal);
      let ed = _icalD(dteVal || dtsVal);
      if (ed && ed > beginDatum) { const d = new Date(ed+'T12:00:00'); d.setDate(d.getDate()-1); ed = fDateISO(d); }
      eindDatum = ed || beginDatum;
    } else {
      const ps = _icalDT(dtsVal), pe = _icalDT(dteVal);
      beginDatum = ps?.date || null; eindDatum = pe?.date || beginDatum;
      startTijd = ps?.time || ''; eindTijd = pe?.time || '';
    }
    if (!beginDatum) continue;
    let freq = 'eenmalig', dagen = [], rruleEind = null;
    if (prop['RRULE']) {
      const rp = {};
      prop['RRULE'].val.split(';').forEach(s => { const [k,v] = s.split('='); if (k&&v) rp[k]=v; });
      const interval = parseInt(rp['INTERVAL'] || '1');
      const dm = {MO:'ma',TU:'di',WE:'wo',TH:'do',FR:'vr',SA:'za',SU:'zo'};
      if (rp['FREQ']==='WEEKLY')      { freq=interval===2?'tweewekelijks':'wekelijks'; if(rp['BYDAY']) dagen=rp['BYDAY'].split(',').map(d=>dm[d.trim()]).filter(Boolean); }
      else if (rp['FREQ']==='MONTHLY') { freq='maandelijks'; }
      else if (rp['FREQ']==='DAILY')   { freq='wekelijks'; dagen=['ma','di','wo','do','vr','za','zo']; }
      if (rp['UNTIL']) rruleEind = _icalD(rp['UNTIL'].slice(0,8));
    }
    if (freq !== 'eenmalig' && dagen.length === 0 && beginDatum)
      dagen = [['zo','ma','di','wo','do','vr','za'][new Date(beginDatum+'T12:00:00').getDay()]];
    const meerdaags = allDay && beginDatum !== (rruleEind||eindDatum) && freq === 'eenmalig';
    events.push({
      id: Date.now()+Math.random(), naam:summary, wie:[], locatie:location, prep:0,
      prive:false, meerdaags, beginDatum, eindDatum:rruleEind||eindDatum,
      start:startTijd, eindUur:eindTijd, freq, dagen:meerdaags?[]:dagen,
      duur:startTijd&&eindTijd?Math.max(0,tijdMinuten(eindTijd)-tijdMinuten(startTijd)):60,
      reisHeen:0, reisTerug:0, transport:{}, icalUid:uid, icalSource:sourceUrl,
    });
  }
  return events;
}
function _icalD(val) {
  if (!val||val.length<8) return null; const s=val.slice(0,8);
  return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
}
function _icalDT(val) {
  if (!val||val.length<8) return {date:_icalD(val),time:''};
  const date=_icalD(val); if(val.length<15) return {date,time:''};
  const isUTC=val.endsWith('Z'); const h=val.slice(9,11),m=val.slice(11,13);
  if (isUTC) { const d=new Date(`${date}T${h}:${m}:00Z`); return {date:d.toLocaleDateString('sv'),time:d.toTimeString().slice(0,5)}; }
  return {date, time:`${h}:${m}`};
}
function _icalUnescape(s) {
  return s.replace(/\\n/g,' ').replace(/\\,/g,',').replace(/\\;/g,';').replace(/\\\\/g,'\\');
}

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

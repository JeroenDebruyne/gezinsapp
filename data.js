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
let recepten = [
  { id:1, naam:'Spaghetti bolognese', type:'avond', tijd:35, moeilijk:'Normaal', wie:['jeroen','kelly','nora','odiel'], score:5, bron:'', bereiding:'', prive:false, tags:['Restjes-proof','Meal prep'], ingredienten:[{naam:'Gehakt',hoev:'500',eenheid:'gram',winkel:'Beenhouwerij'},{naam:'Spaghetti',hoev:'400',eenheid:'gram',winkel:'Colruyt'},{naam:'Tomatenblokjes',hoev:'2',eenheid:'blik',winkel:'Lidl'},{naam:'Ui',hoev:'2',eenheid:'stuks',winkel:'Markt'}] },
  { id:2, naam:'Griekse salade met kip', type:'lunch', tijd:15, moeilijk:'Snel', wie:['jeroen','kelly'], score:4, bron:'', bereiding:'', prive:false, tags:['Restjes-proof'], ingredienten:[{naam:'Kipfilet',hoev:'300',eenheid:'gram',winkel:'Delhaize'},{naam:'Feta',hoev:'150',eenheid:'gram',winkel:'Albert Heijn'},{naam:'Komkommer',hoev:'1',eenheid:'stuk',winkel:'Markt'}] },
  { id:3, naam:'Pancakes met fruit', type:'weekend', tijd:25, moeilijk:'Snel', wie:['jeroen','kelly','nora','odiel'], score:5, bron:'', bereiding:'', prive:false, tags:['Kindvriendelijk','Eenpansgerecht'], ingredienten:[{naam:'Bloem',hoev:'200',eenheid:'gram',winkel:'Colruyt'},{naam:'Eieren',hoev:'3',eenheid:'stuks',winkel:'Lidl'},{naam:'Aardbeien',hoev:'250',eenheid:'gram',winkel:'Markt'}] },
  { id:4, naam:'Granola met yoghurt', type:'ontbijt', tijd:5, moeilijk:'Snel', wie:['jeroen','kelly'], score:4, bron:'', bereiding:'', prive:false, tags:['Meal prep'], ingredienten:[{naam:'Granola',hoev:'80',eenheid:'gram',winkel:'Albert Heijn'},{naam:'Griekse yoghurt',hoev:'150',eenheid:'gram',winkel:'Delhaize'},{naam:'Honing',hoev:'1',eenheid:'el',winkel:'Colruyt'}] },
];
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
  const datum = new Date(datumStr+'T12:00:00');
  const dagNr = datum.getDay(); // 0=zo,1=ma,...
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
      sbFetch('recepten'), sbFetch('ingredienten'), sbFetch('activiteiten'),
      sbFetch('planning'), sbFetch('boodschappen_extra'), sbFetch('contacten'),
      sbFetch('drukte_override'), sbFetch('todos').catch(()=>[]),
    ]);
    if (r.length) recepten = r.map(x=>({...x, _sbId:x.id, tags:x.tags||[], ingredienten:x.ingredienten||[], wie:x.wie||[], prive:x.prive||false}));
    if (i.length) standaardIngredienten = i;
    if (a.length) activiteiten = a.map(x=>({
      ...x, _sbId:x.id,
      dagen:x.dagen||[], wie:Array.isArray(x.wie)?x.wie:[x.wie].filter(Boolean),
      reisHeen:x.reis_heen, reisTerug:x.reis_terug, eindUur:x.eind_uur,
      beginDatum:x.begin_datum, eindDatum:x.eind_datum, prive:x.prive||false,
      brengtNora:  x.transport?.nora?.brengt  ?? '',
      haaltNora:   x.transport?.nora?.haalt   ?? '',
      eetGrooNora: x.transport?.nora?.eetGroo ?? false,
      brengtOdiel:  x.transport?.odiel?.brengt  ?? '',
      haaltOdiel:   x.transport?.odiel?.haalt   ?? '',
      eetGrooOdiel: x.transport?.odiel?.eetGroo ?? false,
    }));
    if (p.length) p.forEach(x=>{ planning[x.datum]={ontbijt:x.ontbijt,lunch:x.lunch,avond:x.avond,porties:x.porties||{}}; });
    if (b.length) extraItems = b;
    if (c.length) contacten = c.map(x=>({...x, _sbId:x.id, kinderenNamen:x.kinderen_namen,cadeauNj:x.cadeau_nj,cadeauVj:x.cadeau_vj,kerstmis:x.kerstmis}));
    if (d.length) d.forEach(x=>drukteOverride[x.datum]=x.drukte);
    if (t.length) todos = t.map(x=>({...x, _sbId:x.id, wie:x.wie||[], gedaanOp:x.gedaan_op, aangemaaktDoor:x.aangemaakt_door, aangemaaktOp:x.aangemaakt_op}));
    // Laad instellingen
    const inst = await sbFetch('instellingen').catch(()=>[]);
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
    else { const res=await sbFetch('recepten','POST',data); if(res[0]) recept._sbId=res[0].id; }
    toonOpslagStatus('✅ Opgeslagen');
  } catch(e) { _opslagFout(e,'recept'); }
}
async function sbDeleteRecept(sbId) { try{await sbFetch(`recepten?id=eq.${sbId}`,'DELETE');}catch(e){_opslagFout(e,'recept-delete');} }

async function sbSaveActiviteit(act) {
  const data = {
    naam:act.naam, wie:act.wie, start:act.start||null, eind_uur:act.eindUur||null,
    duur:act.duur, reis_heen:act.reisHeen, reis_terug:act.reisTerug,
    locatie:act.locatie, freq:act.freq, begin_datum:act.beginDatum||null,
    eind_datum:act.eindDatum||null, prep:act.prep, dagen:act.dagen,
    meerdaags:act.meerdaags||false, prive:act.prive||false,
    transport: {
      nora:  { brengt:act.brengtNora||'',  haalt:act.haaltNora||'',  eetGroo:act.eetGrooNora||false  },
      odiel: { brengt:act.brengtOdiel||'', haalt:act.haaltOdiel||'', eetGroo:act.eetGrooOdiel||false },
    },
  };
  try {
    if (act._sbId) { await sbFetch(`activiteiten?id=eq.${act._sbId}`,'PATCH',data); }
    else { const res=await sbFetch('activiteiten','POST',data); if(res[0]) act._sbId=res[0].id; }
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
    else { const res=await sbFetch('todos','POST',data); if(res[0]) todo._sbId=res[0].id; }
    toonOpslagStatus('✅ Opgeslagen');
  } catch(e) { _opslagFout(e,'todo'); }
}
async function sbDeleteTodo(sbId) { try{await sbFetch(`todos?id=eq.${sbId}`,'DELETE');}catch(e){_opslagFout(e,'todo-delete');} }

async function sbSavePlanning(datum, slot, waarde, porties) {
  const bestaand = await sbFetch(`planning?datum=eq.${datum}`).catch(()=>[]);
  try {
    if (bestaand.length) { await sbFetch(`planning?datum=eq.${datum}`,'PATCH',{[slot]:waarde,porties:porties||{}}); }
    else { await sbFetch('planning','POST',{datum,[slot]:waarde,porties:porties||{}}); }
    toonOpslagStatus('✅ Opgeslagen');
  } catch(e) { _opslagFout(e,'planning'); }
}

async function sbSaveIngredient(ing) {
  const data = { naam:ing.naam, winkel:ing.winkel, categorie:ing.categorie };
  try {
    if (ing._sbId) { await sbFetch(`ingredienten?id=eq.${ing._sbId}`,'PATCH',data); }
    else { const res=await sbFetch('ingredienten','POST',data); if(res[0]) ing._sbId=res[0].id; }
    toonOpslagStatus('✅ Opgeslagen');
  } catch(e) { _opslagFout(e,'ingredient'); }
}
async function sbDeleteIngredient(sbId) { try{await sbFetch(`ingredienten?id=eq.${sbId}`,'DELETE');}catch(e){_opslagFout(e,'ingredient-delete');} }

async function sbSaveContact(contact) {
  const data = { naam:contact.naam, partner:contact.partner, kinderen:parseInt(contact.kinderen)||0, kinderen_namen:contact.kinderenNamen, kerstmis:contact.kerstmis, cadeau_nj:contact.cadeauNj, cadeau_vj:contact.cadeauVj };
  try {
    if (contact._sbId) { await sbFetch(`contacten?id=eq.${contact._sbId}`,'PATCH',data); }
    else { const res=await sbFetch('contacten','POST',data); if(res[0]) contact._sbId=res[0].id; }
    toonOpslagStatus('✅ Opgeslagen');
  } catch(e) { _opslagFout(e,'contact'); }
}
async function sbDeleteContact(sbId) { try{await sbFetch(`contacten?id=eq.${sbId}`,'DELETE');}catch(e){_opslagFout(e,'contact-delete');} }

async function sbSaveExtra(item) {
  try { const res=await sbFetch('boodschappen_extra','POST',{naam:item.naam,winkel:item.winkel}); if(res[0]) item._sbId=res[0].id; toonOpslagStatus('✅ Opgeslagen'); }
  catch(e) { _opslagFout(e,'extra'); }
}
async function sbDeleteExtra(sbId) { try{await sbFetch(`boodschappen_extra?id=eq.${sbId}`,'DELETE');}catch(e){_opslagFout(e,'extra-delete');} }

async function sbSaveDrukte(datum, drukte) {
  const bestaand = await sbFetch(`drukte_override?datum=eq.${datum}`).catch(()=>[]);
  try {
    if (bestaand.length) { await sbFetch(`drukte_override?datum=eq.${datum}`,'PATCH',{drukte}); }
    else { await sbFetch('drukte_override','POST',{datum,drukte}); }
    toonOpslagStatus('✅ Opgeslagen');
  } catch(e) { _opslagFout(e,'drukte'); }
}

async function sbSaveInstellingen() {
  try {
    for (const [id, waarde] of [['vasteRoosters',vasteRoosters],['uitzonderingen',uitzonderingen],['transportUitzonderingen',transportUitzonderingen],['standaardTransport',standaardTransport]]) {
      const bestaand = await sbFetch(`instellingen?id=eq.${id}`).catch(()=>[]);
      const data = { waarde, updated_at:new Date().toISOString() };
      if (bestaand.length) { await sbFetch(`instellingen?id=eq.${id}`,'PATCH',data); }
      else { await sbFetch('instellingen','POST',{id,...data}); }
    }
  } catch(e) { _opslagFout(e,'instellingen'); }
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

// agent-tools.js — Gedeelde agent-tools voor index.html, weekplanner.html en agent.html
// Laden na auth.js en data.js

// ── Gedeelde helpers ─────────────────────────────────────────────

let _weerCache = null, _weerLaatst = 0;

function _atNuISO() {
  const stored = localStorage.getItem('gezinsapp_vandaag');
  if (stored && /^\d{4}-\d{2}-\d{2}$/.test(stored)) return stored;
  try {
    const fmt = new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit'});
    const iso = fmt.format(new Date());
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  } catch(e) {}
  return fDateISO(new Date());
}

function _atGetWeekDates(offset) { return getWeekDatesFrom(_atNuISO(), offset || 0); }

function _atGetNaam(keuze) {
  if (!keuze) return '–';
  if (SPEC[keuze]) return SPEC[keuze];
  const r = recepten.find(r => r.id === keuze || r.id == keuze);
  return r ? r.naam : '–';
}

function _atTransportVoorDag(datum) {
  const dagKey = DAGMAP[new Date(datum + 'T12:00:00').getDay()];
  const result = {};
  const kinderen = Auth.getProfielen().filter(p => p.rol === 'kind').map(p => p.persoonKey);
  (kinderen.length ? kinderen : ['nora', 'odiel']).forEach(kind => {
    const std = (standaardTransport || {})[kind]?.[dagKey] || {};
    const uit = (transportUitzonderingen || {})[datum]?.[kind] || {};
    result[kind] = {...std, ...uit};
  });
  return result;
}

function _atVerjDatumDitJaar(verjaardag, nu) {
  const [,m,d] = verjaardag.split('-');
  const dt = new Date(nu.getFullYear(), parseInt(m) - 1, parseInt(d));
  if (dt < nu) dt.setFullYear(dt.getFullYear() + 1);
  return dt;
}

function _weerIcon(c){if(c===0)return'☀️';if(c<=2)return'⛅';if(c<=3)return'☁️';if(c<=49)return'🌫️';if(c<=69)return'🌧️';if(c<=79)return'🌨️';if(c<=82)return'🌦️';if(c<=86)return'❄️';if(c<=99)return'⛈️';return'🌡️';}
function _weerOmschrijving(c){if(c===0)return'Helder';if(c<=2)return'Licht bewolkt';if(c<=3)return'Bewolkt';if(c<=49)return'Mist';if(c<=69)return'Regen';if(c<=79)return'Sneeuw';if(c<=82)return'Regenbuien';if(c<=86)return'Sneeuwbuien';if(c<=99)return'Onweer';return'Onbekend';}

async function _laadWeer() {
  if (_weerCache && Date.now() - _weerLaatst < 30 * 60 * 1000) return;
  try {
    const coords = (typeof Maps !== 'undefined' && Maps.getCoords()) || {lat:50.97, lng:3.19};
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lng}&current=temperature_2m,precipitation_probability,weather_code&timezone=Europe%2FBrussels`);
    const d = await r.json();
    _weerCache = {temp:Math.round(d.current.temperature_2m), regen:d.current.precipitation_probability, omschrijving:_weerOmschrijving(d.current.weather_code || 0), icon:_weerIcon(d.current.weather_code || 0)};
    _weerLaatst = Date.now();
  } catch(e) { _weerCache = null; }
}

// Leest maaltijditems uit een planningsdag-slot (ondersteunt enkelvoudig en meervoudig formaat)
function getSlotItems(dagPlan, slotKey) {
  const stored = (dagPlan.porties || {})['items_' + slotKey];
  if (stored && stored.length) return stored.map(i => ({...i, wie: i.wie || []}));
  const waarde = dagPlan[slotKey];
  if (!waarde) return [];
  return [{waarde, wie: [], kok: (dagPlan.porties || {})['kok_' + slotKey] || null, extra_eters: 0}];
}

function _isEetGrooOpDag(kindKey, datum) {
  const uitz = (transportUitzonderingen[datum] || {})[kindKey];
  if (uitz && uitz.eetGroo !== undefined) return uitz.eetGroo;
  const d = new Date(datum + 'T12:00:00');
  const dagKey = DAGKEYS[(d.getDay() + 6) % 7];
  const cap = kindKey.charAt(0).toUpperCase() + kindKey.slice(1);
  if (activiteiten.some(a => (a.dagen || []).includes(dagKey) && a[`eetGroo${cap}`])) return true;
  return (standaardTransport[kindKey] || {})[dagKey]?.eetGroo || false;
}

function _berekenPorties(item, datum) {
  const wieEet = !item.wie || item.wie.length === 0 ? PERSONEN : item.wie;
  const portiesGezin = wieEet.reduce((sum, p) => {
    const prof = Auth.getProfielen().find(pr => pr.persoonKey === p);
    if (prof?.rol === 'kind') {
      if (datum && _isEetGrooOpDag(p, datum)) return sum;
      return sum + (typeof portiesKindRatio !== 'undefined' ? portiesKindRatio : 0.5);
    }
    return sum + 1.0;
  }, 0);
  return Math.round((portiesGezin + (item.extra_eters || 0)) * 10) / 10 || 1;
}

// Sla items op in een planningsslot (enkelvoudig + meervoudig formaat synchroon)
function _saveItems(dagKey, slotKey, items) {
  if (!planning[dagKey]) planning[dagKey] = {};
  if (!planning[dagKey].porties) planning[dagKey].porties = {};
  planning[dagKey].porties['items_' + slotKey] = items;
  const first = items[0] || null;
  planning[dagKey][slotKey] = first ? first.waarde : null;
  if (first) {
    planning[dagKey].porties[slotKey] = _berekenPorties(first);
    planning[dagKey].porties['kok_' + slotKey] = first.kok || null;
  } else {
    delete planning[dagKey].porties[slotKey];
    delete planning[dagKey].porties['kok_' + slotKey];
  }
  slaLokaalOp();
  sbSavePlanning(dagKey, slotKey, planning[dagKey][slotKey], planning[dagKey].porties);
}

// ── Tool-definities ──────────────────────────────────────────────
const AGENT_TOOLS = [
  // ── LEZEN ──────────────────────────────────────────────────────
  {name:'get_dag',
   description:'Volledig dagoverzicht: activiteiten, maaltijden (met wie/kok/porties), transport kinderen, drukte en schoolvakantie. Gebruik voor vragen over één specifieke dag.',
   input_schema:{type:'object',properties:{datum:{type:'string',description:'YYYY-MM-DD. Leeg = vandaag.'}},required:[]}},

  {name:'get_week',
   description:'Weekoverzicht met per dag: activiteiten, maaltijden (met wie/kok/porties), transport, drukte en schoolvakantie. Gebruik voor wekelijkse planning of overzichten.',
   input_schema:{type:'object',properties:{offset:{type:'integer',description:'0=huidige week, 1=volgende, -1=vorige, enz.'}},required:[]}},

  {name:'get_activiteiten',
   description:'Alle activiteiten in het rooster, optioneel gefilterd op persoon of zoekterm.',
   input_schema:{type:'object',properties:{persoon:{type:'string',description:'persoonKey (bijv. jeroen/kelly/nora)'},zoekterm:{type:'string'},actief_na:{type:'string',description:'YYYY-MM-DD — filter op einddatum'}},required:[]}},

  {name:'get_recepten',
   description:'Recepten ophalen met rijke filters. Roep dit ALTIJD aan vóór stel_weekmenu_in.',
   input_schema:{type:'object',properties:{zoekterm:{type:'string'},type:{type:'string',description:'avond/lunch/ontbijt/weekend'},max_tijd:{type:'integer',description:'max bereidingstijd in minuten'},tag:{type:'string',description:'Kindvriendelijk/Feest/Restjes-proof/Meal prep/Eenpansgerecht/Oven'},wie:{type:'string',description:'Heel gezin/Alleen volwassenen'},max_resultaten:{type:'integer'}},required:[]}},

  {name:'get_todos',
   description:'To-dos ophalen, optioneel gefilterd. Geeft id terug voor wijzigen of afvinken.',
   input_schema:{type:'object',properties:{wie:{type:'string',description:'persoonKey'},prioriteit:{type:'string',description:'hoog/middel/laag'},inclusief_gedaan:{type:'boolean',description:'Standaard false'}},required:[]}},

  {name:'get_boodschappenlijst',
   description:'Boodschappenlijst per winkel: ingrediënten uit weekmenu (geschaald op porties) plus extra handmatige items.',
   input_schema:{type:'object',properties:{},required:[]}},

  {name:'get_contacten',
   description:'Contacten met familienaam, partners, kinderen, verjaardagen en kerstkaart-info.',
   input_schema:{type:'object',properties:{zoekterm:{type:'string'}},required:[]}},

  {name:'get_verjaardagen',
   description:'Aankomende verjaardagen uit contacten, gesorteerd op datum.',
   input_schema:{type:'object',properties:{weken:{type:'integer',description:'Aantal weken vooruit. Standaard 8.'}},required:[]}},

  {name:'get_transport',
   description:'Transport voor kinderen (wie brengt/haalt, eet bij grootouders) voor een dag of de volledige week.',
   input_schema:{type:'object',properties:{datum:{type:'string',description:'YYYY-MM-DD. Leeg = vandaag.'},week:{type:'boolean',description:'true = volledige huidige week'}},required:[]}},

  {name:'get_schoolvakanties',
   description:'Schoolvakanties Vlaanderen en geplande uitzonderingen (verlof, vrije dagen).',
   input_schema:{type:'object',properties:{},required:[]}},

  {name:'get_eethistoriek',
   description:'Maaltijdhistoriek van de afgelopen weken. Roep dit ALTIJD aan vóór je een weekmenu plant om herhalingen te vermijden.',
   input_schema:{type:'object',properties:{weken:{type:'integer',description:'Standaard 8'}},required:[]}},

  {name:'get_weer',
   description:'Huidig weer op thuislocatie: temperatuur, neerslagkans en weersomschrijving.',
   input_schema:{type:'object',properties:{},required:[]}},

  {name:'get_conflicten',
   description:'Detecteer overlappende activiteiten voor dezelfde persoon in de opgegeven week.',
   input_schema:{type:'object',properties:{offset:{type:'integer',description:'0=huidige week, 1=volgende, enz.'}},required:[]}},

  {name:'zoek_ingredienten',
   description:'Zoek in de standaard ingrediëntenlijst. Gebruik dit vóór voeg_ingredient_toe om duplicaten te vermijden.',
   input_schema:{type:'object',properties:{zoekterm:{type:'string'}},required:['zoekterm']}},

  // ── SCHRIJVEN (altijd bevestiging vragen) ───────────────────────
  {name:'stel_weekmenu_in',
   description:'Plan maaltijden voor een of meerdere dagen. Gebruik NUMERIEK recept-id uit get_recepten, of "uiteten"/"afhalen"/"restjes"/"shake". Supports wie/kok/extra_eters per slot. ALTIJD bevestiging vragen.',
   input_schema:{type:'object',properties:{menu:{type:'array',items:{type:'object',properties:{datum:{type:'string',description:'YYYY-MM-DD'},ontbijt:{type:['number','string','null']},lunch:{type:['number','string','null']},avond:{type:['number','string','null']},extra_eters:{type:'object',description:'{avond:2} — aantal extra gasten'},kok:{type:'object',description:'{avond:"persoonKey"} — wie kookt'},wie:{type:'object',description:'{avond:["persoonKey"]} — wie eet dit (leeg=iedereen)'}},required:['datum']}},bevestiging_vereist:{type:'boolean'},bevestiging_bericht:{type:'string'}},required:['menu']}},

  {name:'voeg_maaltijd_toe',
   description:'Voeg een EXTRA maaltijd toe aan een slot op een dag (bijv. iemand eet iets anders dan de rest). ALTIJD bevestiging vragen.',
   input_schema:{type:'object',properties:{datum:{type:'string',description:'YYYY-MM-DD'},slot:{type:'string',description:'ontbijt/lunch/avond'},recept:{type:['number','string'],description:'recept-id of "uiteten"/"afhalen"/etc.'},wie:{type:'array',items:{type:'string'},description:'persoonKeys die dit eten'},kok:{type:'string',description:'persoonKey van de kok'},extra_eters:{type:'integer',description:'Aantal extra gasten'},bevestiging_vereist:{type:'boolean'},bevestiging_bericht:{type:'string'}},required:['datum','slot','recept']}},

  {name:'wis_weekmenu_slot',
   description:'Wis ALLE maaltijditems van één slot op een specifieke datum. ALTIJD bevestiging vragen.',
   input_schema:{type:'object',properties:{datum:{type:'string',description:'YYYY-MM-DD'},slot:{type:'string',description:'ontbijt/lunch/avond'},bevestiging_vereist:{type:'boolean'},bevestiging_bericht:{type:'string'}},required:['datum','slot']}},

  {name:'beoordeel_maaltijd',
   description:'Beoordeel een recept na het eten (score 1-5). Werkt het geheugen bij zodat toekomstige aanbevelingen verbeteren. ALTIJD bevestiging vragen.',
   input_schema:{type:'object',properties:{recept_id:{type:'integer',description:'Het numerieke recept-id'},score:{type:'integer',description:'Score 1-5 (1=slecht, 3=ok, 5=uitstekend)'},opmerking:{type:'string',description:'Optionele opmerking'},bevestiging_vereist:{type:'boolean'},bevestiging_bericht:{type:'string'}},required:['recept_id','score']}},

  {name:'voeg_activiteit_toe',
   description:'Voeg een nieuwe activiteit toe aan het rooster. ALTIJD bevestiging vragen.',
   input_schema:{type:'object',properties:{naam:{type:'string'},wie:{type:'array',items:{type:'string'},description:'persoonKeys — optioneel, laat leeg als niet van toepassing'},dagen:{type:'array',items:{type:'string'},description:'ma/di/wo/do/vr/za/zo (gebruik ALTIJD de 2-letter afkorting)'},start:{type:'string',description:'HH:MM'},eind_uur:{type:'string',description:'HH:MM'},locatie:{type:'string'},freq:{type:'string',description:'wekelijks/tweewekelijks/maandelijks/eenmalig'},begin_datum:{type:'string',description:'YYYY-MM-DD'},eind_datum:{type:'string',description:'YYYY-MM-DD'},prep:{type:'integer',description:'voorbereiding in minuten'},informatief:{type:'boolean',description:'true = geen impact op drukte'},bevestiging_vereist:{type:'boolean'},bevestiging_bericht:{type:'string'}},required:['naam']}},

  {name:'wijzig_activiteit',
   description:'Wijzig velden van een bestaande activiteit. Zoekt op naam (gedeeltelijk). ALTIJD bevestiging vragen.',
   input_schema:{type:'object',properties:{naam:{type:'string',description:'Huidige naam of deel ervan'},nieuw_naam:{type:'string'},wie:{type:'array',items:{type:'string'}},dagen:{type:'array',items:{type:'string'}},start:{type:'string'},eind_uur:{type:'string'},locatie:{type:'string'},freq:{type:'string'},begin_datum:{type:'string'},eind_datum:{type:'string'},prep:{type:'integer'},bevestiging_vereist:{type:'boolean'},bevestiging_bericht:{type:'string'}},required:['naam']}},

  {name:'verwijder_activiteit',
   description:'Verwijder een activiteit permanent. ALTIJD bevestiging vragen.',
   input_schema:{type:'object',properties:{naam:{type:'string'},bevestiging_vereist:{type:'boolean'},bevestiging_bericht:{type:'string'}},required:['naam']}},

  {name:'voeg_todo_toe',
   description:'Voeg een nieuwe to-do toe. ALTIJD bevestiging vragen.',
   input_schema:{type:'object',properties:{titel:{type:'string'},notitie:{type:'string'},deadline:{type:'string',description:'YYYY-MM-DD'},prioriteit:{type:'string',description:'hoog/middel/laag'},wie:{type:'array',items:{type:'string'}},bevestiging_vereist:{type:'boolean'},bevestiging_bericht:{type:'string'}},required:['titel']}},

  {name:'wijzig_todo',
   description:'Wijzig een bestaande to-do op id. ALTIJD bevestiging vragen.',
   input_schema:{type:'object',properties:{id:{type:'string'},titel:{type:'string'},notitie:{type:'string'},deadline:{type:'string'},prioriteit:{type:'string'},wie:{type:'array',items:{type:'string'}},bevestiging_vereist:{type:'boolean'},bevestiging_bericht:{type:'string'}},required:['id']}},

  {name:'vink_todo_af',
   description:'Markeer een to-do als gedaan. ALTIJD bevestiging vragen.',
   input_schema:{type:'object',properties:{id:{type:'string'},bevestiging_vereist:{type:'boolean'},bevestiging_bericht:{type:'string'}},required:['id']}},

  {name:'verwijder_todo',
   description:'Verwijder een to-do permanent. ALTIJD bevestiging vragen.',
   input_schema:{type:'object',properties:{id:{type:'string'},bevestiging_vereist:{type:'boolean'},bevestiging_bericht:{type:'string'}},required:['id']}},

  {name:'stel_transport_in',
   description:'Éénmalige transport-uitzondering voor een specifieke dag (overschrijft standaard). ALTIJD bevestiging vragen.',
   input_schema:{type:'object',properties:{datum:{type:'string',description:'YYYY-MM-DD'},kind:{type:'string',description:'persoonKey van het kind'},brengt:{type:'string',description:'persoonKey of lege string'},haalt:{type:'string',description:'persoonKey of lege string'},eet_groo:{type:'boolean'},bevestiging_vereist:{type:'boolean'},bevestiging_bericht:{type:'string'}},required:['datum','kind']}},

  {name:'wijzig_standaard_transport',
   description:'Wijzig het vaste weekrooster voor transport van een kind (permanent voor die weekdag). ALTIJD bevestiging vragen.',
   input_schema:{type:'object',properties:{kind:{type:'string',description:'persoonKey van het kind'},dag:{type:'string',description:'ma/di/wo/do/vr'},brengt:{type:'string'},haalt:{type:'string'},eet_groo:{type:'boolean'},bevestiging_vereist:{type:'boolean'},bevestiging_bericht:{type:'string'}},required:['kind','dag']}},

  {name:'overschrijf_drukte',
   description:'Stel de drukte van een dag handmatig in. ALTIJD bevestiging vragen.',
   input_schema:{type:'object',properties:{datum:{type:'string',description:'YYYY-MM-DD'},drukte:{type:'string',description:'rustig/normaal/druk'},bevestiging_vereist:{type:'boolean'},bevestiging_bericht:{type:'string'}},required:['datum','drukte']}},

  {name:'voeg_aan_boodschappenlijst_toe',
   description:'Voeg een extra item toe aan de boodschappenlijst. ALTIJD bevestiging vragen.',
   input_schema:{type:'object',properties:{naam:{type:'string'},winkel:{type:'string',description:'Gebruik een geconfigureerde winkelnaam'},hoev:{type:'string'},eenheid:{type:'string'},bevestiging_vereist:{type:'boolean'},bevestiging_bericht:{type:'string'}},required:['naam','winkel']}},

  {name:'voeg_ingredient_toe',
   description:'Voeg een nieuw standaard-ingrediënt toe. Gebruik zoek_ingredienten eerst om duplicaten te vermijden. ALTIJD bevestiging vragen.',
   input_schema:{type:'object',properties:{naam:{type:'string'},winkel:{type:'string',description:'Gebruik een geconfigureerde winkelnaam'},eenheid:{type:'string'},categorie:{type:'string'},bevestiging_vereist:{type:'boolean'},bevestiging_bericht:{type:'string'}},required:['naam','winkel']}},

  {name:'voeg_recept_toe',
   description:'Voeg een volledig nieuw recept toe met ingrediënten en bereiding. ALTIJD bevestiging vragen.',
   input_schema:{type:'object',properties:{naam:{type:'string'},types:{type:'array',items:{type:'string'},description:'avond/lunch/ontbijt/weekend'},porties:{type:'integer',description:'aantal porties/servings'},tijd:{type:'integer',description:'bereidingstijd in minuten'},moeilijk:{type:'string',description:'Snel/Normaal/Uitgebreid'},wie:{type:'string',description:'Heel gezin/Alleen volwassenen'},bron:{type:'string'},bereiding:{type:'string'},score:{type:'integer',description:'Beoordeling 1–5 (optioneel, weglaten als onbekend)'},tags:{type:'array',items:{type:'string'},description:'Kindvriendelijk/Feest/Restjes-proof/Meal prep/Eenpansgerecht/Oven'},ingredienten:{type:'array',items:{type:'object',properties:{naam:{type:'string'},hoev:{type:'string'},eenheid:{type:'string'},winkel:{type:'string'}}}},bevestiging_vereist:{type:'boolean'},bevestiging_bericht:{type:'string'}},required:['naam','types']}},

  {name:'wijzig_recept',
   description:'Wijzig velden van een bestaand recept (naam, score, tags, tijd, bereiding, ingrediënten…). Zoekt op naam. ALTIJD bevestiging vragen.',
   input_schema:{type:'object',properties:{naam:{type:'string',description:'Huidige naam of deel ervan'},nieuw_naam:{type:'string'},types:{type:'array',items:{type:'string'}},tijd:{type:'integer'},moeilijk:{type:'string'},wie:{type:'string'},bron:{type:'string'},bereiding:{type:'string'},score:{type:'integer',description:'1-5'},tags:{type:'array',items:{type:'string'}},ingredienten:{type:'array',items:{type:'object',properties:{naam:{type:'string'},hoev:{type:'string'},eenheid:{type:'string'},winkel:{type:'string'}}}},bevestiging_vereist:{type:'boolean'},bevestiging_bericht:{type:'string'}},required:['naam']}},

  {name:'onthoud',
   description:'Sla een herinnering of voorkeur op in het permanente geheugen van de agent. Gebruik dit wanneer de gebruiker zegt "onthoud dit", "vergeet niet", "houd bij" of iets wil bewaren voor later.',
   input_schema:{type:'object',properties:{tekst:{type:'string',description:'De tekst om te onthouden, volledig en zelfstandig leesbaar'}},required:['tekst']}},

  {name:'vergeet_herinnering',
   description:'Verwijder een specifieke herinnering uit het geheugen op basis van de index (0-gebaseerd).',
   input_schema:{type:'object',properties:{index:{type:'integer',description:'Index van de herinnering om te verwijderen (0 = eerste)'}},required:['index']}},
];

// ── Gedeelde tool-executor ───────────────────────────────────────
async function agentExecute(naam, input) {
  switch (naam) {

    // ── LEZEN ────────────────────────────────────────────────────
    case 'get_dag': {
      const datum = input.datum || _atNuISO();
      const dag = planning[datum] || {};
      const dObj = new Date(datum + 'T12:00:00');
      const dagNr = dObj.getDay();
      const dagKey = DAGMAP[dagNr];
      const acts = activiteiten.filter(a => isActiefOpDatum(a, datum)).map(a => ({
        naam:a.naam, wie:(a.wie||[]).join(','), start:a.start||'', eind:a.eindUur||'',
        locatie:a.locatie||'', duur:a.duur||0, reisHeen:a.reisHeen||0,
        maaltijdThuis:a.maaltijdThuis||{}, informatief:a.informatief||false, prep:a.prep||''
      }));
      const thuiskomst = {};
      Auth.getProfielen().filter(p => p.rol === 'gezinshoofd').forEach(p => {
        const rooster = (vasteRoosters[p.persoonKey] || {})[dagKey];
        if (!rooster || !rooster.actief) { thuiskomst[p.naam] = 'niet ingepland'; return; }
        if ((rooster.locatie || 'thuis') === 'kantoor') {
          const reistijd = parseInt(localStorage.getItem(`gezinsapp_reistijd_${p.persoonKey}`) || '0') || 0;
          const [h,m] = (rooster.tot || '17:00').split(':').map(Number);
          const thuisTot = h * 60 + m + reistijd;
          thuiskomst[p.naam] = `kantoor tot ${rooster.tot}, thuis ~${String(Math.floor(thuisTot/60)).padStart(2,'0')}:${String(thuisTot%60).padStart(2,'0')}`;
        } else {
          thuiskomst[p.naam] = `thuis/remote (tot ${rooster.tot})`;
        }
      });
      const _items = s => getSlotItems(dag, s).map(it => ({
        naam: _atGetNaam(it.waarde), waarde: it.waarde,
        wie: it.wie && it.wie.length ? it.wie.map(p => PLABEL[p] || p) : ['iedereen'],
        kok: it.kok ? PLABEL[it.kok] || it.kok : null,
        porties: _berekenPorties(it), extra_eters: it.extra_eters || 0
      }));
      return JSON.stringify({
        datum, dag: DLANG_GD[dagNr], isVandaag: datum === _atNuISO(),
        isSchooldag: !isSchoolvakantie(datum) && dagNr >= 1 && dagNr <= 5,
        vakantie: isSchoolvakantie(datum) ? getVakantieNaam(datum) || true : false,
        drukte: getDagDrukte(datum),
        ontbijt: _items('ontbijt'), lunch: _items('lunch'), avond: _items('avond'),
        activiteiten: acts, transport: _atTransportVoorDag(datum), thuiskomst
      });
    }

    case 'get_week': {
      const offset = input.offset || 0;
      const dates = _atGetWeekDates(offset);
      const vandaagISO = _atNuISO();
      return JSON.stringify(dates.map((d, i) => {
        const datum = fDateISO(d);
        const dag = planning[datum] || {};
        const dagNr = d.getDay();
        const dagKey = DAGMAP[dagNr];
        const acts = activiteiten.filter(a => isActiefOpDatum(a, datum)).map(a => ({
          naam:a.naam, wie:(a.wie||[]).join(','), start:a.start||'', eind:a.eindUur||'', locatie:a.locatie||''
        }));
        const thuiskomst = {};
        Auth.getProfielen().filter(p => p.rol === 'gezinshoofd').forEach(p => {
          const rooster = (vasteRoosters[p.persoonKey] || {})[dagKey];
          if (!rooster || !rooster.actief) return;
          if ((rooster.locatie || 'thuis') === 'kantoor') {
            const reistijd = parseInt(localStorage.getItem(`gezinsapp_reistijd_${p.persoonKey}`) || '0') || 0;
            const [h,m] = (rooster.tot || '17:00').split(':').map(Number);
            const thuisTot = h * 60 + m + reistijd;
            thuiskomst[p.naam] = `kantoor tot ${rooster.tot} → thuis ~${String(Math.floor(thuisTot/60)).padStart(2,'0')}:${String(thuisTot%60).padStart(2,'0')}`;
          } else {
            thuiskomst[p.naam] = `thuis (tot ${rooster.tot})`;
          }
        });
        const _items = s => getSlotItems(dag, s).map(it => ({
          naam: _atGetNaam(it.waarde), waarde: it.waarde,
          wie: it.wie && it.wie.length ? it.wie.map(p => PLABEL[p] || p) : ['iedereen'],
          kok: it.kok ? PLABEL[it.kok] || it.kok : null,
          porties: _berekenPorties(it), extra_eters: it.extra_eters || 0
        }));
        return {
          dag: DKORT[i], datum, isVandaag: datum === vandaagISO,
          vakantie: isSchoolvakantie(datum) ? getVakantieNaam(datum) || true : false,
          drukte: getDagDrukte(datum),
          ontbijt: _items('ontbijt'), lunch: _items('lunch'), avond: _items('avond'),
          activiteiten: acts, transport: _atTransportVoorDag(datum), thuiskomst
        };
      }));
    }

    case 'get_activiteiten': {
      let acts = activiteiten;
      if (input.persoon) acts = acts.filter(a => (a.wie || []).includes(input.persoon));
      if (input.zoekterm) acts = acts.filter(a => a.naam.toLowerCase().includes(input.zoekterm.toLowerCase()));
      if (input.actief_na) acts = acts.filter(a => !a.eindDatum || a.eindDatum >= input.actief_na);
      return JSON.stringify(acts.map(a => ({
        naam:a.naam, wie:(a.wie||[]).join(','), dagen:(a.dagen||[]).join(','),
        start:a.start||'', eind:a.eindUur||'', locatie:a.locatie||'', freq:a.freq,
        beginDatum:a.beginDatum, eindDatum:a.eindDatum, prep:a.prep||'', informatief:a.informatief||false
      })));
    }

    case 'get_recepten': {
      let recs = recepten;
      if (input.zoekterm) { const q = input.zoekterm.toLowerCase(); recs = recs.filter(r => r.naam.toLowerCase().includes(q) || (r.tags||[]).some(t => t.toLowerCase().includes(q))); }
      if (input.type) recs = recs.filter(r => (r.types || [r.type].filter(Boolean)).includes(input.type));
      if (input.max_tijd) recs = recs.filter(r => r.tijd && r.tijd <= input.max_tijd);
      if (input.tag) recs = recs.filter(r => (r.tags||[]).some(t => t.toLowerCase() === input.tag.toLowerCase()));
      if (input.wie) recs = recs.filter(r => !r.wie || r.wie === input.wie);
      return JSON.stringify(recs.slice(0, input.max_resultaten || 50).map(r => ({
        id:r.id, naam:r.naam, types:r.types||[r.type], tijd:r.tijd,
        moeilijk:r.moeilijk, wie:r.wie, score:r.score ?? null, tags:r.tags||[],
        ingredienten:(r.ingredienten||[]).map(i => i.naam)
      })));
    }

    case 'get_todos': {
      let td = todos;
      if (!input.inclusief_gedaan) td = td.filter(t => !t.gedaan);
      if (input.wie) td = td.filter(t => (t.wie||[]).includes(input.wie));
      if (input.prioriteit) td = td.filter(t => t.prioriteit === input.prioriteit);
      return JSON.stringify(td.map(t => ({
        id:t.id, titel:t.titel, notitie:t.notitie||'', deadline:t.deadline||'',
        prioriteit:t.prioriteit, wie:(t.wie||[]).join(','), gedaan:t.gedaan
      })));
    }

    case 'get_boodschappenlijst': {
      const vandaagISO = _atNuISO();
      const weekItems = [];
      _atGetWeekDates(0).forEach(d => {
        const datum = fDateISO(d);
        const dag = planning[datum] || {};
        SLOTS.forEach(slot => {
          getSlotItems(dag, slot.key).filter(it => !SPEC[it.waarde]).forEach(it => {
            const r = recepten.find(r => r.id === it.waarde || r.id === parseInt(it.waarde));
            if (!r) return;
            const receptPorties = r.porties || 4;
            const geplandPorties = _berekenPorties(it) || receptPorties;
            const schaal = geplandPorties / receptPorties;
            (r.ingredienten || []).forEach(ing => {
              const hoevNum = parseFloat(ing.hoev) || null;
              const geschaaldHoev = hoevNum ? Math.round(hoevNum * schaal * 100) / 100 : null;
              weekItems.push({naam:ing.naam, winkel:ing.winkel||'Andere', hoev:geschaaldHoev, eenheid:ing.eenheid||null, receptNaam:r.naam, type:'recept'});
            });
          });
        });
      });
      const extra = (extraItems || []).map(i => ({naam:i.naam, winkel:i.winkel||'Andere', hoev:i.hoev||null, eenheid:i.eenheid||null, type:'extra'}));
      const perWinkel = {};
      [...weekItems, ...extra].forEach(i => { if (!perWinkel[i.winkel]) perWinkel[i.winkel] = []; perWinkel[i.winkel].push(i); });
      return JSON.stringify(perWinkel);
    }

    case 'get_contacten': {
      const q = (input.zoekterm || '').toLowerCase();
      let ct = contacten;
      if (q) ct = ct.filter(c => (c.naam || '').toLowerCase().includes(q));
      return JSON.stringify(ct.map(c => {
        let partners = [];
        try { const p = typeof c.partner === 'string' ? JSON.parse(c.partner) : (c.partner || {}); partners = Object.values(p).filter(p => p && p.voornaam); } catch {}
        let kinderen = [];
        try { kinderen = typeof c.kinderen_namen === 'string' ? JSON.parse(c.kinderen_namen) : (c.kinderen_namen || []); } catch {}
        return {
          familie: c.naam,
          partners: partners.map(p => ({naam:`${p.voornaam||''} ${p.achternaam||''}`.trim(), verjaardag:p.verjaardag||''})),
          kinderen: kinderen.map(k => ({naam:`${k.voornaam||''} ${k.achternaam||''}`.trim(), verjaardag:k.verjaardag||''})),
          kerstmis: c.kerstmis || false, adres: c.adres || ''
        };
      }));
    }

    case 'get_verjaardagen': {
      const weken = input.weken || 8;
      const nu = new Date(_atNuISO() + 'T00:00:00');
      const tot = new Date(nu); tot.setDate(tot.getDate() + weken * 7);
      const vj = [];
      contacten.forEach(c => {
        let personen = [];
        try { const p = typeof c.partner === 'string' ? JSON.parse(c.partner) : (c.partner || {}); personen.push(...Object.values(p).filter(p => p && p.voornaam)); } catch {}
        try { const k = typeof c.kinderen_namen === 'string' ? JSON.parse(c.kinderen_namen) : (c.kinderen_namen || []); personen.push(...k); } catch {}
        personen.forEach(p => {
          if (!p || !p.verjaardag) return;
          const d = _atVerjDatumDitJaar(p.verjaardag, nu);
          if (d >= nu && d <= tot) vj.push({naam:`${p.voornaam||''} ${p.achternaam||''}`.trim(), familie:c.naam, datum:fDateISO(d), over:Math.round((d-nu)/(24*3600*1000))});
        });
      });
      vj.sort((a, b) => a.over - b.over);
      return JSON.stringify(vj.length ? vj : `Geen verjaardagen de komende ${weken} weken.`);
    }

    case 'get_transport': {
      if (input.week) {
        const dates = _atGetWeekDates(0);
        return JSON.stringify(dates.map(d => ({datum:fDateISO(d), dag:DLANG_GD[d.getDay()], isSchooldag:!isSchoolvakantie(fDateISO(d))&&d.getDay()>=1&&d.getDay()<=5, transport:_atTransportVoorDag(fDateISO(d))})));
      }
      const datum = input.datum || _atNuISO();
      return JSON.stringify({datum, dag:DLANG_GD[new Date(datum+'T12:00:00').getDay()], transport:_atTransportVoorDag(datum)});
    }

    case 'get_schoolvakanties': {
      const nu = _atNuISO();
      return JSON.stringify({vakanties:SCHOOLVAKANTIES, uitzonderingen:(uitzonderingen||[]).filter(u => u.datum >= nu)});
    }

    case 'get_eethistoriek': {
      const weken = input.weken || 8;
      const vandaagISO = _atNuISO();
      const nu = new Date(vandaagISO + 'T12:00:00');
      const cutoff = new Date(nu); cutoff.setDate(cutoff.getDate() - weken * 7);
      const hist = [];
      Object.entries(planning).forEach(([datum, dag]) => {
        const d = new Date(datum + 'T12:00:00');
        if (d < cutoff || d > nu) return;
        ['ontbijt','lunch','avond'].forEach(slot => {
          getSlotItems(dag, slot).forEach(it => {
            hist.push({datum, slot, naam:_atGetNaam(it.waarde), wie:it.wie&&it.wie.length?it.wie.map(p=>PLABEL[p]||p):['iedereen']});
          });
        });
      });
      hist.sort((a, b) => b.datum.localeCompare(a.datum));
      return JSON.stringify(hist.length ? hist : 'Geen eethistoriek (planning nog leeg).');
    }

    case 'get_weer':
      if (!_weerCache) await _laadWeer();
      return _weerCache ? JSON.stringify(_weerCache) : 'Weersdata niet beschikbaar.';

    case 'get_conflicten': {
      const dates = _atGetWeekDates(input.offset || 0);
      const conflicten = [];
      const personen = PERSONEN.length ? PERSONEN : Auth.getProfielen().map(p => p.persoonKey);
      dates.forEach(d => {
        const datum = fDateISO(d);
        const acts = activiteiten.filter(a => isActiefOpDatum(a, datum) && !a.informatief && a.start && a.eindUur);
        personen.forEach(persoon => {
          const pActs = acts.filter(a => (a.wie||[]).includes(persoon));
          for (let i = 0; i < pActs.length; i++) {
            for (let j = i + 1; j < pActs.length; j++) {
              const a1 = pActs[i], a2 = pActs[j];
              if (a1.start < a2.eindUur && a2.start < a1.eindUur)
                conflicten.push({datum, dag:DLANG_GD[d.getDay()], persoon:PLABEL[persoon]||persoon, act1:a1.naam, act2:a2.naam, tijden:`${a1.start}-${a1.eindUur} / ${a2.start}-${a2.eindUur}`});
            }
          }
        });
      });
      return JSON.stringify(conflicten.length ? conflicten : 'Geen conflicten gevonden.');
    }

    case 'zoek_ingredienten': {
      const q = (input.zoekterm || '').toLowerCase();
      return JSON.stringify(standaardIngredienten.filter(i => (i.naam||'').toLowerCase().includes(q)).map(i => ({id:i._sbId||i.id, naam:i.naam, winkel:i.winkel, eenheid:i.eenheid||'', categorie:i.categorie||''})));
    }

    // ── SCHRIJVEN ────────────────────────────────────────────────
    case 'stel_weekmenu_in': {
      if (!input.menu || !Array.isArray(input.menu)) return 'Fout formaat.';
      input.menu.forEach(dd => {
        const key = dd.datum;
        if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return;
        ['ontbijt','lunch','avond'].forEach(slot => {
          if (dd[slot] === undefined) return;
          let val = dd[slot];
          if (val === null || val === '') { _saveItems(key, slot, []); return; }
          if (typeof val === 'string' && SPEC[val]) {}
          else if (typeof val === 'number' || !isNaN(Number(val))) val = Number(val);
          else { const rec = recepten.find(r => r.naam.toLowerCase() === String(val).toLowerCase()); val = rec ? rec.id : val; }
          const wie = dd.wie && dd.wie[slot] ? dd.wie[slot] : [];
          const kok = dd.kok && dd.kok[slot] ? dd.kok[slot] : null;
          const extra_eters = (dd.extra_eters && dd.extra_eters[slot]) || 0;
          _saveItems(key, slot, [{waarde:val, wie, kok, extra_eters}]);
        });
      });
      slaLokaalOp();
      if (typeof renderPlanner === 'function') renderPlanner();
      return '✅ Weekmenu ingesteld.';
    }

    case 'voeg_maaltijd_toe': {
      const {datum, slot, recept, wie, kok} = input;
      if (!datum || !slot) return '⚠️ datum en slot zijn verplicht.';
      let val = recept;
      if (SPEC[val]) {}
      else if (typeof val === 'number' || !isNaN(Number(val))) val = Number(val);
      else { const r2 = recepten.find(r => r.naam.toLowerCase().includes(String(val).toLowerCase())); val = r2 ? r2.id : val; }
      const items = getSlotItems(planning[datum] || {}, slot);
      items.push({waarde:val, wie:wie||[], kok:kok||null, extra_eters:input.extra_eters||0});
      _saveItems(datum, slot, items);
      slaLokaalOp();
      if (typeof renderPlanner === 'function') renderPlanner();
      return `✅ Extra maaltijd "${_atGetNaam(val)}" toegevoegd aan ${slot} op ${datum}.`;
    }

    case 'wis_weekmenu_slot': {
      _saveItems(input.datum, input.slot, []);
      slaLokaalOp();
      if (typeof renderPlanner === 'function') renderPlanner();
      return `✅ ${input.slot} op ${input.datum} gewist.`;
    }

    case 'beoordeel_maaltijd': {
      const r = recepten.find(r => r.id === input.recept_id || r.id == input.recept_id);
      if (!r) return `⚠️ Recept ${input.recept_id} niet gevonden.`;
      r.score = Math.min(5, Math.max(1, input.score));
      slaLokaalOp();
      sbSaveRecept(r);
      const opmerking = input.opmerking ? ` (${input.opmerking})` : '';
      return `✅ ${r.naam} beoordeeld: ${r.score}/5${opmerking}.`;
    }

    case 'voeg_activiteit_toe': {
      const act = {id:Date.now(), naam:input.naam, wie:input.wie||[], dagen:input.dagen||[], start:input.start||null, eindUur:input.eind_uur||null, duur:0, reisHeen:0, reisTerug:0, prep:input.prep||'', locatie:input.locatie||'', freq:input.freq||'wekelijks', beginDatum:input.begin_datum||null, eindDatum:input.eind_datum||null, meerdaags:false, prive:false, informatief:input.informatief||false, transport:{}, maaltijdThuis:{}};
      activiteiten.push(act); slaLokaalOp(); sbSaveActiviteit(act);
      return `✅ Activiteit "${act.naam}" toegevoegd.`;
    }

    case 'wijzig_activiteit': {
      const act = activiteiten.find(a => a.naam.toLowerCase().includes(input.naam.toLowerCase()));
      if (!act) return `Activiteit met "${input.naam}" niet gevonden.`;
      if (input.nieuw_naam !== undefined) act.naam = input.nieuw_naam;
      if (input.wie !== undefined) act.wie = input.wie;
      if (input.dagen !== undefined) act.dagen = input.dagen;
      if (input.start !== undefined) act.start = input.start;
      if (input.eind_uur !== undefined) act.eindUur = input.eind_uur;
      if (input.locatie !== undefined) act.locatie = input.locatie;
      if (input.freq !== undefined) act.freq = input.freq;
      if (input.begin_datum !== undefined) act.beginDatum = input.begin_datum;
      if (input.eind_datum !== undefined) act.eindDatum = input.eind_datum;
      if (input.prep !== undefined) act.prep = input.prep;
      slaLokaalOp(); sbSaveActiviteit(act);
      return `✅ Activiteit "${act.naam}" gewijzigd.`;
    }

    case 'verwijder_activiteit': {
      const idx = activiteiten.findIndex(a => a.naam.toLowerCase().includes(input.naam.toLowerCase()));
      if (idx < 0) return `Activiteit met "${input.naam}" niet gevonden.`;
      const [removed] = activiteiten.splice(idx, 1);
      slaLokaalOp(); if (removed._sbId) sbDeleteActiviteit(removed._sbId);
      return `✅ Activiteit "${removed.naam}" verwijderd.`;
    }

    case 'voeg_todo_toe': {
      const todo = {id:String(Date.now()), titel:input.titel, notitie:input.notitie||'', deadline:input.deadline||'', prioriteit:input.prioriteit||'middel', wie:input.wie||[], gedaan:false, aangemaaktDoor:Auth.profiel()?.persoonKey, aangemaaktOp:_atNuISO()};
      todos.push(todo); slaLokaalOp(); sbSaveTodo(todo);
      if (typeof renderTodosPreview === 'function') renderTodosPreview(Auth.profiel());
      return `✅ To-do "${todo.titel}" toegevoegd.`;
    }

    case 'wijzig_todo': {
      const todo = todos.find(t => t.id === input.id);
      if (!todo) return 'To-do niet gevonden.';
      if (input.titel !== undefined) todo.titel = input.titel;
      if (input.notitie !== undefined) todo.notitie = input.notitie;
      if (input.deadline !== undefined) todo.deadline = input.deadline;
      if (input.prioriteit !== undefined) todo.prioriteit = input.prioriteit;
      if (input.wie !== undefined) todo.wie = input.wie;
      slaLokaalOp(); sbSaveTodo(todo);
      return `✅ To-do "${todo.titel}" gewijzigd.`;
    }

    case 'vink_todo_af': {
      const todo = todos.find(t => t.id === input.id);
      if (!todo) return 'To-do niet gevonden.';
      todo.gedaan = true; todo.gedaanOp = _atNuISO();
      slaLokaalOp(); sbSaveTodo(todo);
      if (typeof renderTodosPreview === 'function') renderTodosPreview(Auth.profiel());
      return `✅ "${todo.titel}" afgevinkt.`;
    }

    case 'verwijder_todo': {
      const idx = todos.findIndex(t => t.id === input.id);
      if (idx < 0) return 'To-do niet gevonden.';
      const [removed] = todos.splice(idx, 1);
      slaLokaalOp(); if (removed._sbId) sbDeleteTodo(removed._sbId);
      return `✅ To-do "${removed.titel}" verwijderd.`;
    }

    case 'stel_transport_in': {
      if (!transportUitzonderingen[input.datum]) transportUitzonderingen[input.datum] = {};
      if (!transportUitzonderingen[input.datum][input.kind]) transportUitzonderingen[input.datum][input.kind] = {};
      const t = transportUitzonderingen[input.datum][input.kind];
      if (input.brengt !== undefined) t.brengt = input.brengt;
      if (input.haalt !== undefined) t.haalt = input.haalt;
      if (input.eet_groo !== undefined) t.eetGroo = input.eet_groo;
      slaLokaalOp(); sbSaveInstellingen();
      if (typeof maakTransportActiviteit === 'function') maakTransportActiviteit(input.datum, input.kind, t.brengt, t.haalt);
      return `✅ Transport voor ${input.kind} op ${input.datum} ingesteld.`;
    }

    case 'wijzig_standaard_transport': {
      if (!standaardTransport[input.kind]) standaardTransport[input.kind] = {};
      if (!standaardTransport[input.kind][input.dag]) standaardTransport[input.kind][input.dag] = {};
      const t = standaardTransport[input.kind][input.dag];
      if (input.brengt !== undefined) t.brengt = input.brengt;
      if (input.haalt !== undefined) t.haalt = input.haalt;
      if (input.eet_groo !== undefined) t.eetGroo = input.eet_groo;
      slaLokaalOp(); sbSaveInstellingen();
      return `✅ Standaard transport voor ${input.kind} op ${input.dag} permanent gewijzigd.`;
    }

    case 'overschrijf_drukte': {
      drukteOverride[input.datum] = input.drukte;
      slaLokaalOp(); sbSaveDrukte(input.datum, input.drukte);
      return `✅ Drukte op ${input.datum} ingesteld op "${input.drukte}".`;
    }

    case 'voeg_aan_boodschappenlijst_toe': {
      const item = {id:Date.now(), naam:input.naam, winkel:input.winkel||'Andere', hoev:input.hoev||'', eenheid:input.eenheid||''};
      extraItems.push(item); slaLokaalOp(); sbSaveExtra(item);
      return `✅ "${input.naam}" toegevoegd aan boodschappenlijst (${input.winkel}).`;
    }

    case 'voeg_ingredient_toe': {
      const ing = {id:String(Date.now()), naam:input.naam, winkel:input.winkel||'Andere', eenheid:input.eenheid||'', categorie:input.categorie||''};
      standaardIngredienten.push(ing); slaLokaalOp(); sbSaveIngredient(ing);
      return `✅ Ingrediënt "${input.naam}" toegevoegd.`;
    }

    case 'voeg_recept_toe': {
      const rec = {id:Date.now(), naam:input.naam, types:input.types||['avond'], type:input.types?.[0]||'avond', porties:input.porties||4, tijd:input.tijd||null, moeilijk:input.moeilijk||'Normaal', wie:input.wie?[input.wie]:null, bron:input.bron||'', bereiding:input.bereiding||'', tags:input.tags||[], score:input.score??null, prive:false, ingredienten:input.ingredienten||[]};
      recepten.push(rec); slaLokaalOp();
      const _r = await sbSaveRecept(rec);
      return _r === true ? `✅ Recept "${rec.naam}" opgeslagen.` : `❌ Opslaan mislukt: ${_r}`;
    }

    case 'wijzig_recept': {
      const rec = recepten.find(r => r.naam.toLowerCase().includes(input.naam.toLowerCase()));
      if (!rec) return `Recept met "${input.naam}" niet gevonden.`;
      if (input.nieuw_naam !== undefined) rec.naam = input.nieuw_naam;
      if (input.types !== undefined) { rec.types = input.types; rec.type = input.types[0]; }
      if (input.tijd !== undefined) rec.tijd = input.tijd;
      if (input.moeilijk !== undefined) rec.moeilijk = input.moeilijk;
      if (input.wie !== undefined) rec.wie = [input.wie];
      if (input.bron !== undefined) rec.bron = input.bron;
      if (input.bereiding !== undefined) rec.bereiding = input.bereiding;
      if (input.score !== undefined) rec.score = input.score;
      if (input.tags !== undefined) rec.tags = input.tags;
      if (input.ingredienten !== undefined) rec.ingredienten = input.ingredienten;
      slaLokaalOp(); const _r = await sbSaveRecept(rec);
      return _r === true ? `✅ Recept "${rec.naam}" gewijzigd.` : `❌ Opslaan mislukt: ${_r}`;
    }

    case 'onthoud': {
      const item = {tekst:input.tekst, aangemaakt_op:new Date().toISOString()};
      geheugen.push(item); slaLokaalOp(); sbSaveGeheugen();
      return `✅ Onthouden: "${input.tekst}"`;
    }

    case 'vergeet_herinnering': {
      if (input.index < 0 || input.index >= geheugen.length) return `⚠️ Geen herinnering op index ${input.index}.`;
      const verwijderd = geheugen.splice(input.index, 1)[0];
      slaLokaalOp(); sbSaveGeheugen();
      return `✅ Vergeten: "${verwijderd.tekst}"`;
    }

    default: return `Onbekende tool: ${naam}`;
  }
}

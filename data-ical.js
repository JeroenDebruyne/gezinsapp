// data-ical.js — iCal ophalen, parsen en samenvoegen
// Vereist: data.js geladen (gebruikt sbFetch, sbSaveActiviteit, activiteiten, Auth, fDateISO, tijdMinuten, _gezinId)

let icalAbonnementen = [];

async function laadIcalAbonnementen() {
  try {
    const gid = _gezinId();
    const f = gid ? `?id=eq.icalAbonnementen&gezin_id=eq.${gid}` : `?id=eq.icalAbonnementen`;
    const rows = await sbFetch(`instellingen${f}`).catch(() => []);
    if (rows[0]?.waarde) icalAbonnementen = rows[0].waarde;
  } catch(e) { console.warn('[laadIcalAbonnementen]', e); }
}
async function slaIcalAbonnementenOp() {
  const gid = _gezinId();
  if (!gid) return;
  try {
    await sbFetch('instellingen','POST',
      {id:'icalAbonnementen',waarde:icalAbonnementen,updated_at:new Date().toISOString(),gezin_id:gid},
      '','resolution=merge-duplicates');
  } catch(e) { console.warn('[slaIcalAbonnementenOp]', e); }
}

async function sbVerwijderIcalActiviteiten(sourceUrl) {
  const gid = _gezinId();
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
  const proxy = `${SUPABASE_URL}/functions/v1/cors-proxy?url=${encodeURIComponent(url)}`;
  const s = typeof Auth !== 'undefined' ? Auth.session() : null;
  const r = await fetch(proxy, s?.access_token ? { headers: { 'Authorization': 'Bearer ' + s.access_token } } : {});
  if (!r.ok) throw new Error(`Kan agenda niet ophalen (HTTP ${r.status})`);
  const t = await r.text();
  if (!t.includes('BEGIN:VCALENDAR')) throw new Error('Geen geldig iCal-bestand ontvangen.');
  return t;
}

async function icalMerge(parsedEvents, wie, sourceUrl, opties = {}) {
  let nieuw = 0, geupdate = 0;
  for (const ev of parsedEvents) {
    ev.wie = ev.wie?.length ? ev.wie : (wie.length ? [...wie] : [Auth.profiel()?.persoonKey].filter(Boolean));
    if (opties.informatief) ev.informatief = true;

    // Synthetische UID voor events zonder UID — voorkomt herduplicatie bij meerdere devices of hersyncs
    if (!ev.icalUid && sourceUrl) {
      ev.icalUid = `synth:${sourceUrl}|${ev.naam}|${ev.beginDatum}|${ev.start||''}`;
    }

    if (!ev.icalUid) {
      // Geen UID en geen source: eenmalig toevoegen, geen dedup mogelijk
      activiteiten.push(ev); await sbSaveActiviteit(ev); nieuw++; continue;
    }

    // Zoek bestaande via UID óf via content-fallback voor legacy null-UID activiteiten
    const bestaande = activiteiten.find(a =>
      (a.icalSource === sourceUrl && a.icalUid === ev.icalUid) ||
      (a.icalSource === sourceUrl && !a.icalUid && a.naam === ev.naam && a.beginDatum === ev.beginDatum && (a.start||'') === (ev.start||''))
    );

    if (bestaande) {
      const needsUidUpdate = !bestaande.icalUid && ev.icalUid;
      const changed = needsUidUpdate ||
        bestaande.naam !== ev.naam || bestaande.beginDatum !== ev.beginDatum ||
        bestaande.eindDatum !== ev.eindDatum || bestaande.start !== ev.start ||
        bestaande.locatie !== ev.locatie;
      if (changed) {
        Object.assign(bestaande, {
          naam: ev.naam, beginDatum: ev.beginDatum, eindDatum: ev.eindDatum,
          locatie: ev.locatie, start: ev.start, eindUur: ev.eindUur,
          meerdaags: ev.meerdaags, dagen: ev.dagen, freq: ev.freq,
          ...(needsUidUpdate ? { icalUid: ev.icalUid } : {}),
        });
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
      id: _maakId(), naam:summary, wie:[], locatie:location, prep:null,
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

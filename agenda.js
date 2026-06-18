// agenda.js — Agendapagina logica
Auth.initPagina('agenda');
// Permissiecheck na data-laden: profielen zijn dan beschikbaar via Auth

// ── State ─────────────────────────────────────────────────────
let huidigJaar   = new Date().getFullYear();
let huidigMaand  = new Date().getMonth();
let geselecteerdeDatum = fDateISO(new Date());
let actEditId    = null;
let priveAan     = false;
let meerdaagsAan = false;
let informatiefAan = false;
let geselecteerdePersonen = [];
let doKey=null, tempOverride=null;
let actievePersoonFilter = 'alle';
let _savingAct = false;

const MAANDEN = ['Januari','Februari','Maart','April','Mei','Juni','Juli','Augustus','September','Oktober','November','December'];
const DAGKORT  = DKORT;  // alias voor agenda-intern gebruik
const DOT_KLEUR  = new Proxy({}, { get: (_, p) => typeof p === 'string' ? 'dot-' + p : undefined });
const KLEUR_BALK = new Proxy({}, { get: (_, p) => typeof p === 'string' ? 'var(--c-' + p + '-dot)' : undefined });
const KINDEREN = () => Auth.getProfielen().filter(p => p.isKind).map(p => p.persoonKey);

// ── Laden ─────────────────────────────────────────────────────
function _checkFabPermissie() {
  if (!Auth.kan('kanActiviteitenBeheren')) {
    const b = document.querySelector('.fab');
    if (b) b.style.display = 'none';
  }
}

Promise.race([laadOp(), new Promise((_,r)=>setTimeout(()=>r(new Error('timeout')),8000))])
  .then(()=>{
    _checkFabPermissie();
    renderAlles(); icalAutoSync();
    if (new URLSearchParams(location.search).get('nieuw')==='1') {
      geselecteerdeDatum=fDateISO(new Date());
      setTimeout(openActModal, 300);
    }
  }).catch(()=>{_checkFabPermissie();laadLokaal();renderAlles();});

if(typeof BroadcastChannel!=='undefined'){
  new BroadcastChannel('gezinsapp_data').onmessage=()=>{ laadLokaal(); renderAlles(); };
}
onGezinsappUpdate(renderAlles);
AppState.subscribe('activiteiten', renderAlles);
AppState.subscribe('planning', renderAlles);
AppState.subscribe('drukteOverride', renderAlles);

function renderAlles(){
  renderLegenda();
  renderMaand();
  renderDagDetail(geselecteerdeDatum);
}

// ── Legenda ───────────────────────────────────────────────────
function renderLegenda(){
  document.getElementById('persoon-legenda').innerHTML=[
    {key:'alle',label:'Alle',dot:''},
    ...PERSONEN.map(p=>({key:p,label:PLABEL[p],dot:DOT_KLEUR[p]}))
  ].map(item=>`
    <div class="legenda-item${actievePersoonFilter===item.key?' actief':''}" data-action="set-filter" data-key="${escHtml(item.key)}">
      ${item.dot?`<div class="legenda-dot ${item.dot}"></div>`:''}${escHtml(item.label)}
    </div>`).join('');
}
function setFilter(key){actievePersoonFilter=key;renderLegenda();renderMaand();renderDagDetail(geselecteerdeDatum);}

// ── Maand ─────────────────────────────────────────────────────
function changeMonth(dir){
  huidigMaand+=dir;
  if(huidigMaand>11){huidigMaand=0;huidigJaar++;}
  if(huidigMaand<0){huidigMaand=11;huidigJaar--;}
  renderMaand();
}
function naarVandaag(){
  const nu=new Date();huidigJaar=nu.getFullYear();huidigMaand=nu.getMonth();
  geselecteerdeDatum=fDateISO(nu);renderAlles();
}

function renderMaand(){
  const vandaagISO=fDateISO(new Date());
  document.getElementById('agenda-maand-titel').textContent=MAANDEN[huidigMaand];
  document.getElementById('agenda-jaar').textContent=huidigJaar+' — klik voor vandaag';
  document.getElementById('maand-nav-label').textContent=MAANDEN[huidigMaand]+' '+huidigJaar;

  const eerste=new Date(huidigJaar,huidigMaand,1);
  let startDag=eerste.getDay();startDag=startDag===0?6:startDag-1;
  const aantalDagen=new Date(huidigJaar,huidigMaand+1,0).getDate();
  const vorigeDagen=new Date(huidigJaar,huidigMaand,0).getDate();

  let cellen=[];
  for(let i=startDag-1;i>=0;i--){
    const d=new Date(huidigJaar,huidigMaand-1,vorigeDagen-i);
    cellen.push({datum:fDateISO(d),andereMaand:true,dagNr:vorigeDagen-i});
  }
  for(let i=1;i<=aantalDagen;i++){
    const d=new Date(huidigJaar,huidigMaand,i);
    cellen.push({datum:fDateISO(d),andereMaand:false,dagNr:i});
  }
  let ex=1;
  while(cellen.length%7!==0){
    const d=new Date(huidigJaar,huidigMaand+1,ex++);
    cellen.push({datum:fDateISO(d),andereMaand:true,dagNr:ex-1});
  }

  document.getElementById('maand-grid').innerHTML=cellen.map(cel=>{
    const d=new Date(cel.datum+'T12:00:00');
    const dagVdWeek=d.getDay();
    const isWeekend=dagVdWeek===0||dagVdWeek===6;
    const isVandaag=cel.datum===vandaagISO;
    const isGeselecteerd=cel.datum===geselecteerdeDatum;
    const actsOpDag=getActsOpDatum(cel.datum);
    const dots=maakDots(actsOpDag,cel.datum);
    const meerdaagsActs=getMeerdaagsOpDatum(cel.datum);
    const vakantie=isSchoolvakantie(cel.datum)&&!cel.andereMaand;
    return `<div class="dag-cel${cel.andereMaand?' andere-maand':''}${isGeselecteerd?' geselecteerd':''}"
        data-action="selecteer-dag" data-datum="${cel.datum}">
      <div class="dag-num${isVandaag?' vandaag':''}${isWeekend&&!isVandaag?' weekend':''}">${cel.dagNr}</div>
      ${meerdaagsActs.slice(0,2).map(a=>{
        const kleur=KLEUR_BALK[(a.wie||[])[0]]||'var(--accent)';
        return `<div class="meerdaags-balk" style="background:${kleur};" title="${escHtml(a.naam)}">${cel.dagNr===parseInt(a.beginDatum?.split('-')[2])?escHtml(a.naam):''}</div>`;
      }).join('')}
      <div class="dag-dots">${dots}${vakantie?'<div class="dot" style="background:var(--normaal-dot);opacity:.6;"></div>':''}</div>
    </div>`;
  }).join('');
}

function getActsOpDatum(datumISO){
  return activiteiten.filter(a=>{
    if(a.meerdaags) return false;
    if(!isActiefOp(a,datumISO)) return false;
    if(!magZien(a)) return false;
    if(actievePersoonFilter!=='alle'&&!(a.wie||[]).includes(actievePersoonFilter)) return false;
    return true;
  });
}
function getMeerdaagsOpDatum(datumISO){
  return activiteiten.filter(a=>{
    if(!a.meerdaags) return false;
    if(!magZien(a)) return false;
    if(!a.beginDatum||!a.eindDatum) return false;
    return datumISO>=a.beginDatum&&datumISO<=a.eindDatum;
  });
}
function maakDots(acts,datumISO){
  const personen=new Set();const heeftPrive=acts.some(a=>a.prive);
  acts.forEach(a=>(a.wie||[]).forEach(w=>personen.add(w)));
  const isFamiliedag=PERSONEN.length>1&&PERSONEN.every(p=>personen.has(p));
  let html='';
  if(isFamiliedag){
    html+=`<div class="dot dot-familie"></div>`;
    personen.forEach(p=>{if(!PERSONEN.includes(p)&&DOT_KLEUR[p])html+=`<div class="dot ${DOT_KLEUR[p]}"></div>`;});
  } else {
    personen.forEach(p=>{if(DOT_KLEUR[p])html+=`<div class="dot ${DOT_KLEUR[p]}"></div>`;});
  }
  if(heeftPrive)html+=`<div class="dot dot-prive"></div>`;
  if(datumISO&&getVerjaardagsOpDatum(datumISO).length>0)html+=`<div class="dot dot-verjaardag"></div>`;
  if(datumISO&&typeof isFeestdag!=='undefined'&&isFeestdag(datumISO))html+=`<div class="dot" style="background:var(--rustig-dot);"></div>`;
  return html;
}
function selecteerDag(datum){
  geselecteerdeDatum=datum;
  const d=new Date(datum+'T12:00:00');
  const nu=new Date();nu.setHours(0,0,0,0);
  const ma=new Date(nu);ma.setDate(nu.getDate()-((nu.getDay()+6)%7));
  const dMa=new Date(d);dMa.setDate(d.getDate()-((d.getDay()+6)%7));
  sessionStorage.setItem('weekplanner_offset',Math.round((dMa-ma)/(7*86400000)));
  renderMaand();renderDagDetail(datum);
}

// ── Dag detail ────────────────────────────────────────────────
function renderDagDetail(datumISO){
  const el=document.getElementById('dag-detail');
  const d=new Date(datumISO+'T12:00:00');
  const dagNamen=['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag'];
  const dagLabel=dagNamen[d.getDay()].charAt(0).toUpperCase()+dagNamen[d.getDay()].slice(1)+' '+d.getDate()+' '+MAANDEN[d.getMonth()].toLowerCase();
  const drukte=getDagDrukte(datumISO);
  const drukteConfig={rustig:{bg:'var(--rustig-bg)',clr:'var(--rustig-clr)',lbl:'Rustige dag',dot:'var(--rustig-dot)'},normaal:{bg:'var(--normaal-bg)',clr:'var(--normaal-clr)',lbl:'Drukke dag',dot:'var(--normaal-dot)'},druk:{bg:'var(--druk-bg)',clr:'var(--druk-clr)',lbl:'Zeer druk',dot:'var(--druk-dot)'}};
  const dc=drukteConfig[drukte];
  const vakantie=isSchoolvakantie(datumISO);
  const alleActs=[
    ...getMeerdaagsOpDatum(datumISO),
    ...getActsOpDatum(datumISO)
  ].sort((a,b)=>tijdMinuten(a.start)-tijdMinuten(b.start));
  const kanBewerken=Auth.kan('kanActiviteitenBeheren');
  const conflictIds=new Set();
  const metTijd=alleActs.filter(a=>a.start&&a.eindUur&&!a.informatief);
  for(let i=0;i<metTijd.length;i++){
    for(let j=i+1;j<metTijd.length;j++){
      const a1=metTijd[i],a2=metTijd[j];
      const gemeenschappelijk=(a1.wie||[]).some(p=>(a2.wie||[]).includes(p));
      if(gemeenschappelijk&&a1.start<a2.eindUur&&a2.start<a1.eindUur){
        conflictIds.add(a1.id);conflictIds.add(a2.id);
      }
    }
  }

  el.innerHTML=`
    <div class="dag-detail-header">
      <div class="dag-detail-titel">${dagLabel}</div>
      <div style="display:flex;gap:8px;align-items:center;">
        <span class="dag-detail-drukte" style="background:${dc.bg};color:${dc.clr};display:inline-flex;align-items:center;gap:5px;"
          data-action="open-do-modal" data-datum="${datumISO}" data-label="${escHtml(dagLabel)}"><span style="width:7px;height:7px;border-radius:50%;background:${dc.dot};flex-shrink:0;"></span>${dc.lbl}</span>
      </div>
    </div>
    ${vakantie?`<div style="padding:6px 12px;background:var(--normaal-bg);border-radius:var(--radius-sm);font-size:12px;color:var(--normaal-clr);margin-bottom:6px;font-weight:600;display:flex;align-items:center;gap:6px;"><i data-lucide="umbrella" class="icon-inline"></i> ${escHtml(getVakantieNaam(datumISO))}</div>`:''}
    ${(typeof isFeestdag!=='undefined'&&isFeestdag(datumISO))?`<div style="padding:6px 12px;background:var(--rustig-bg);border-radius:var(--radius-sm);font-size:12px;color:var(--rustig-clr);margin-bottom:12px;font-weight:600;display:flex;align-items:center;gap:6px;"><i data-lucide="party-popper" class="icon-inline"></i> ${escHtml(getFeestdagNaam(datumISO))}</div>`:''}
    ${getVerjaardagsOpDatum(datumISO).map(v=>`
      <div class="verjaardag-kaart">
        ${v.icon?`<i data-lucide="${escHtml(v.icon)}" style="width:20px;height:20px;flex-shrink:0;"></i>`:`<span style="font-size:20px;">${escHtml(v.emoji||'')}</span>`}
        <div style="flex:1;">
          <div class="verjaardag-naam">${escHtml(v.naam)}</div>
          ${v.type==='contactdatum'
            ?`<div class="verjaardag-info"><i data-lucide="users" class="icon-inline"></i> ${escHtml(v.sub||'')}</div>`
            :v.type==='gezinsdatum'
              ?`<div class="verjaardag-info"><i data-lucide="calendar-range" class="icon-inline"></i> ${v.meerdaags?(v.isEerstedag?'Meerdaags':'Loopt door'):'Vandaag'}&nbsp;<span style="font-size:10px;background:var(--bg-2);color:var(--muted);padding:1px 6px;border-radius:99px;font-weight:600;vertical-align:middle;">geen impact</span></div>`
              :v.leeftijd?`<div class="verjaardag-info"><i data-lucide="cake" class="icon-inline"></i> Wordt ${v.leeftijd} jaar${v.type==='gezin'?' (gezin)':''}</div>`:'<div class="verjaardag-info"><i data-lucide="cake" class="icon-inline"></i> Verjaardag!</div>'
          }
        </div>
      </div>`).join('')}
    ${alleActs.length===0
      ?`<div class="empty-state"><i data-lucide="calendar" class="empty-icon"></i><p>Geen activiteiten</p></div>`
      :alleActs.map(a=>{
          const wie=a.wie||[];
          const isFamilie=PERSONEN.length>1&&PERSONEN.every(p=>wie.includes(p));
          const balk=isFamilie?'var(--accent)':(KLEUR_BALK[wie[0]]||'var(--muted-2)');
          const badges=isFamilie
            ?`<span class="act-rij-badge" style="background:var(--accent-l);color:var(--accent);border:1px solid var(--accent)55;"><i data-lucide="users" class="icon-inline"></i> Familie</span>`
            :wie.map(w=>`
              <span class="act-rij-badge" style="background:${KLEUR_BALK[w]||'var(--bg-2)'}22;color:${KLEUR_BALK[w]||'var(--muted)'};border:1px solid ${KLEUR_BALK[w]||'var(--border)'}44;">
                ${escHtml(PEMOJI[w]||'')} ${escHtml(PLABEL[w]||w)}
              </span>`).join('');
          const transportHtml=renderTransportDetail(a,datumISO);
          return `
          <div class="act-rij${a.informatief?' informatief-rij':''}${conflictIds.has(a.id)?' conflict-rij':''}"${kanBewerken?` data-action="edit-act" data-id="${a.id}"`:''}>
            <div class="act-kleur-balk" style="background:${conflictIds.has(a.id)?'var(--druk-dot)':(a.informatief?'var(--muted-2)':balk)};${a.meerdaags?'border-radius:2px;':''}${a.informatief?'opacity:0.5;':''}" ></div>
            <div class="act-rij-body">
              <div class="act-rij-naam${a.prive?' prive':''}">
                ${conflictIds.has(a.id)?'<i data-lucide="triangle-alert" class="icon-inline"></i> ':''}${a.informatief?'<i data-lucide="pin" class="icon-inline"></i> ':''}${a.meerdaags?'<i data-lucide="calendar-range" class="icon-inline"></i> ':''}${escHtml(a.naam)}${a.prive?' <i data-lucide="lock" class="icon-inline"></i>':''}${a.informatief?'&nbsp;<span style="font-size:10px;background:var(--bg-2);color:var(--muted);padding:1px 6px;border-radius:99px;font-weight:600;vertical-align:middle;">geen impact</span>':''}
              </div>
              <div class="act-rij-meta">
                ${a.meerdaags&&a.beginDatum?`${escHtml(a.beginDatum)} → ${escHtml(a.eindDatum)}`:
                  a.start?`${escHtml(a.start)}${a.eindUur?' – '+escHtml(a.eindUur):''}`:''}
                ${a.locatie?` · <i data-lucide="map-pin" class="icon-inline"></i> ${escHtml(a.locatie)}`:''}
                ${a.prep?` · <i data-lucide="triangle-alert" class="icon-inline" style="color:var(--normaal-dot);"></i> ${escHtml(a.prep)}`:''}
              </div>
              ${badges?`<div class="act-rij-badges">${badges}</div>`:''}
              ${transportHtml}
            </div>
            ${kanBewerken?`<div class="act-rij-acties">
              <button class="act-icon-btn" data-action="verwijder-act" data-id="${a.id}" data-datum="${datumISO}"><i data-lucide="trash-2" class="icon-inline"></i></button>
            </div>`:''}
          </div>`;
        }).join('')
    }`;
}

// ── Transport detail render ───────────────────────────────────
function renderTransportDetail(act,datumISO){
  if(act.informatief) return '';
  const heeftKind=KINDEREN().some(k=>(act.wie||[]).includes(k));
  if(!heeftKind&&!act.meerdaags) return '';
  const profielen=Auth.getProfielen();
  const heeftGezinsHoofd=(act.wie||[]).some(w=>{
    const p=profielen.find(pr=>pr.persoonKey===w);
    return p&&!p.isKind;
  });
  if(heeftGezinsHoofd) return '';

  const dagKey=DAGMAP[new Date(datumISO+'T12:00:00').getDay()];
  const stdTransport=standaardTransport||{};
  const uitzondering=(transportUitzonderingen||{})[datumISO];

  let html='';
  const isEenmalig=!act.freq||act.freq==='eenmalig';
  KINDEREN().forEach(kind=>{
    if(!(act.wie||[]).includes(kind)) return;
    const std=isEenmalig?{}:stdTransport[kind]?.[dagKey]||{};
    const uitz=uitzondering?.[kind]||{};
    const kt=getKindTransportAct(act,kind);
    const brengt=kt.brengt||uitz.brengt||std.brengt||'';
    const haalt=kt.haalt||uitz.haalt||std.haalt||'';
    const eetGroo=kt.eetGroo||(uitz.eetGroo!==undefined?uitz.eetGroo:std.eetGroo);
    if(!brengt&&!haalt&&!eetGroo) return;
    const isUitz=uitzondering&&uitzondering[kind];
    html+=`<div style="display:flex;align-items:center;gap:8px;font-size:12px;margin-top:3px;">
      <span style="font-weight:600;color:var(--ink);">${PEMOJI[kind]} ${PLABEL[kind]}:</span>
      ${brengt?`<span><i data-lucide="car" class="icon-inline"></i>→ ${escHtml(brengt)}</span>`:''}
      ${haalt?`<span>←<i data-lucide="car" class="icon-inline"></i> ${escHtml(haalt)}</span>`:''}
      ${eetGroo?'<span style="font-size:10px;background:var(--rustig-bg);color:var(--rustig-clr);padding:1px 6px;border-radius:99px;font-weight:600;display:inline-flex;align-items:center;gap:3px;"><i data-lucide="utensils" class="icon-inline"></i> Eet bij grootouders</span>':''}
      ${isUitz?'<span style="font-size:10px;background:var(--normaal-bg);color:var(--normaal-clr);padding:1px 6px;border-radius:99px;font-weight:600;display:inline-flex;align-items:center;gap:3px;"><i data-lucide="zap" class="icon-inline"></i> Uitzondering</span>':''}
    </div>`;
  });
  return html?`<div class="transport-sectie" style="margin-top:8px;">${html}</div>`:'';
}

// ── Helpers ───────────────────────────────────────────────────
function isActiefOp(act,datumISO){
  if(act.meerdaags) return false;
  if((act.uitgesloten||[]).includes(datumISO)) return false;
  if(act.freq==='eenmalig') return datumISO===act.beginDatum;
  const d=new Date(datumISO+'T12:00:00');
  if(act.beginDatum&&d<new Date(act.beginDatum+'T00:00:00')) return false;
  if(act.eindDatum&&d>new Date(act.eindDatum+'T23:59:59')) return false;
  // Jaarlijks: zelfde dag en maand als beginDatum, elk jaar
  if(act.freq==='jaarlijks'){
    if(!act.beginDatum) return false;
    const [,bm,bd]=act.beginDatum.split('-');
    const [,dm,dd]=datumISO.split('-');
    return bm===dm && bd===dd;
  }
  // Maandelijks: zelfde dag van de maand als beginDatum
  if(act.freq==='maandelijks'){
    if(!act.beginDatum) return false;
    return d.getDate()===new Date(act.beginDatum+'T12:00:00').getDate();
  }
  // Wekelijks, tweewekelijks, seizoen: weekdag-gebaseerd
  const dagKey=DAGMAP[d.getDay()];
  if(!act.dagen||!act.dagen.includes(dagKey)) return false;
  if(act.freq==='tweewekelijks'){
    const ref=act.beginDatum?new Date(act.beginDatum+'T12:00:00'):new Date('2024-01-01');
    if(Math.floor((d-ref)/(7*24*3600*1000))%2!==0) return false;
  }
  return true;
}
function magZien(act){
  if(!act.prive) return true;
  if(Auth.kan('kanAllesZien')) return true;
  return(act.wie||[]).includes(Auth.profiel()?.persoonKey);
}

// ── Verjaardagen ──────────────────────────────────────────────
function getVerjaardagsOpDatum(datumISO){
  const [,mm,dd]=datumISO.split('-');
  const jaar=parseInt(datumISO.split('-')[0]);
  const result=[];
  Auth.getProfielen().forEach(p=>{
    if(!p.geboortedatum) return;
    const [by,bm,bd]=p.geboortedatum.split('-');
    if(bm===mm&&bd===dd){
      result.push({naam:p.naam,emoji:p.emoji||'🎂',leeftijd:jaar-parseInt(by),type:'gezin'});
    }
  });
  contacten.forEach(c=>{
    const _chk=(naam,verjaardag)=>{
      if(!verjaardag) return;
      const parts=verjaardag.split('-');
      if(parts.length<3) return;
      const [by,bm,bd]=parts;
      if(bm===mm&&bd===dd){
        const leeftijd=by&&by!=='0000'?jaar-parseInt(by):null;
        result.push({naam,icon:'cake',leeftijd,type:'contact'});
      }
    };
    const p1=c.partner1&&typeof c.partner1==='object'?c.partner1:(c.partner1?_tryParse(c.partner1):null);
    const p2=c.partner2&&typeof c.partner2==='object'?c.partner2:(c.partner2?_tryParse(c.partner2):null);
    if(p1){_chk(((p1.voornaam||'')+' '+(p1.achternaam||'')).trim()||c.naam,p1.verjaardag);}
    if(p2){_chk(((p2.voornaam||'')+' '+(p2.achternaam||'')).trim(),p2.verjaardag);}
    const kids=c.kinderenData&&typeof c.kinderenData==='object'?c.kinderenData:(c.kinderenData?_tryParse(c.kinderenData):null);
    (kids||[]).forEach(k=>_chk(((k.voornaam||'')+' '+(k.achternaam||'')).trim()||'Kind',k.verjaardag));
    const contactNaam=c.naam||((p1?.voornaam||'')+' '+(p1?.achternaam||'')).trim()||'Contact';
    (c.belangrijkeDatums||[]).forEach(bd=>{
      if(!bd.datum) return;
      const [bdy,bdm,bdd]=bd.datum.split('-');
      if(bd.herhalend){
        if(bdm===mm&&bdd===dd) result.push({naam:bd.label||'Belangrijke datum',sub:contactNaam,icon:'calendar',type:'contactdatum'});
      } else {
        if(bd.datum===datumISO) result.push({naam:bd.label||'Belangrijke datum',sub:contactNaam,icon:'calendar',type:'contactdatum'});
      }
    });
  });
  (typeof gezinsDatums!=='undefined'?gezinsDatums:[]).forEach(gd=>{
    if(!gd.startDatum) return;
    const eind=gd.eindDatum||gd.startDatum;
    let treffer=false;
    if(gd.herhalend){
      const adjStart=datumISO.slice(0,4)+'-'+gd.startDatum.slice(5);
      const adjEind =datumISO.slice(0,4)+'-'+eind.slice(5);
      if(adjStart<=adjEind){
        treffer=datumISO>=adjStart&&datumISO<=adjEind;
      } else {
        const prevYear=String(parseInt(datumISO.slice(0,4))-1);
        const adjStartPrev=prevYear+'-'+gd.startDatum.slice(5);
        treffer=datumISO>=adjStartPrev||datumISO<=adjEind;
      }
    } else {
      treffer=datumISO>=gd.startDatum&&datumISO<=eind;
    }
    if(treffer){
      const isEerstedag=gd.herhalend
        ?(datumISO.slice(5)===gd.startDatum.slice(5))
        :(datumISO===gd.startDatum);
      const meerdaags=eind!==gd.startDatum;
      result.push({naam:gd.label||'Speciale datum',emoji:gd.emoji||'📅',type:'gezinsdatum',meerdaags,isEerstedag});
    }
  });
  return result;
}
function _tryParse(s){try{return JSON.parse(s);}catch{return null;}}

function _renderTransportKinderenHTML(act) {
  const opties=(transportPersonen||[]).map(p=>`<option>${escHtml(typeof p==='object'?p.naam:p)}</option>`).join('');
  return KINDEREN().map(kind=>{
    const profiel=Auth.getProfielen().find(p=>p.persoonKey===kind);
    const naam=profiel?.naam||kind;
    const emoji=profiel?.emoji||'';
    const kt=act?getKindTransportAct(act,kind):{};
    return `<div id="transport-${kind}" style="display:none;">
      <div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin:10px 0 6px;display:flex;align-items:center;gap:5px;"><i data-lucide="baby" class="icon-inline"></i> ${escHtml(emoji)} ${escHtml(naam)}</div>
      <div class="form-grid">
        <div class="form-row" style="margin:0 0 10px;">
          <label>Wie brengt?</label>
          <select id="a-brengt-${kind}"><option value="">— Standaard —</option>${opties}</select>
        </div>
        <div class="form-row" style="margin:0 0 10px;">
          <label>Wie haalt?</label>
          <select id="a-haalt-${kind}"><option value="">— Standaard —</option>${opties}</select>
        </div>
      </div>
      <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;font-weight:500;margin-bottom:10px;">
        <input type="checkbox" id="a-eet-groo-${kind}" style="width:auto;accent-color:var(--accent);"/> Eet bij grootouders
      </label>
    </div>`;
  }).join('');
}

function _vulTransportOpties(){
  const opties=(transportPersonen||[]).map(p=>`<option>${escHtml(typeof p==='object'?p.naam:p)}</option>`).join('');
  KINDEREN().forEach(kind=>{
    ['a-brengt-','a-haalt-'].forEach(prefix=>{
      const sel=document.getElementById(prefix+kind);
      if(!sel)return;
      const huidig=sel.value;
      sel.innerHTML='<option value="">— Standaard —</option>'+opties;
      if(huidig)sel.value=huidig;
    });
  });
}

// ── Modal: Activiteit ─────────────────────────────────────────
function openActModal(act){
  if (!act && !Auth.kan('kanActiviteitenBeheren')) return;
  actEditId=act?.id||null;
  priveAan=act?.prive||false;
  meerdaagsAan=act?.meerdaags||false;
  informatiefAan=act?.informatief||false;
  geselecteerdePersonen=act?[...(act.wie||[])]:[Auth.profiel()?.persoonKey].filter(Boolean);

  document.getElementById('act-modal-titel').textContent=act?'Activiteit bewerken':'Nieuwe activiteit';
  document.getElementById('a-naam').value=act?.naam||'';
  document.getElementById('a-start').value=act?.start||'';
  document.getElementById('a-eind-uur').value=act?.eindUur||'';
  document.getElementById('a-reis-heen').value=act?.reisHeen||'';
  document.getElementById('a-reis-terug').value=act?.reisTerug||'';
  document.getElementById('a-locatie').value=act?.locatie||'';
  document.getElementById('a-prep').value=act?.prep||'';
  document.getElementById('a-freq').value=act?.freq||'eenmalig';
  document.getElementById('a-begin').value=act?.beginDatum||geselecteerdeDatum;
  document.getElementById('a-eind').value=act?.eindDatum||'';
  document.getElementById('a-md-start-datum').value=act?.beginDatum||geselecteerdeDatum;
  document.getElementById('a-md-eind-datum').value=act?.eindDatum||'';
  document.getElementById('a-md-start-tijd').value=act?.start||'';
  document.getElementById('a-md-eind-tijd').value=act?.eindUur||'';

  const mt=act?.maaltijdThuis||{};
  document.getElementById('a-mt-ontbijt').checked=mt.ontbijt||false;
  document.getElementById('a-mt-lunch').checked=mt.lunch||false;
  document.getElementById('a-mt-avond').checked=mt.avond||false;
  if(!act?.maaltijdThuis) suggestMaaltijdThuis();

  renderContactKeuze();
  Maps.autocomplete(document.getElementById('a-locatie'), adres => {
    document.getElementById('a-locatie').value=adres;
  });

  checkNachtspan();
  updatePriveSwitch();
  updateMeerdaagsSwitch();
  updateInformatiefSwitch();
  renderPersonenMS();

  document.getElementById('dag-checkboxes').innerHTML=DAGKORT.map((d,i)=>
    `<label class="dag-cb"><input type="checkbox" value="${DAGKEYS[i]}" data-action="freq-change"${act?.dagen?.includes(DAGKEYS[i])?' checked':''}> ${d}</label>`
  ).join('');

  document.getElementById('transport-kinderen-wrap').innerHTML=_renderTransportKinderenHTML(act);
  updateFreqUI();
  checkKindjeSection();
  _vulTransportOpties();
  KINDEREN().forEach(kind=>{
    const kt=act?getKindTransportAct(act,kind):{};
    document.getElementById(`a-brengt-${kind}`).value=kt.brengt||'';
    document.getElementById(`a-haalt-${kind}`).value=kt.haalt||'';
    document.getElementById(`a-eet-groo-${kind}`).checked=kt.eetGroo||false;
  });

  // Verwijder-knop tonen bij bewerken
  document.querySelector('#act-modal-bg .modal-actions').innerHTML = act
    ? `<button class="modal-btn modal-btn-danger" data-action="verwijder-act-modal">Verwijderen</button>
       <button class="modal-btn modal-btn-cancel" data-action="close-act-modal">Annuleren</button>
       <button class="modal-btn modal-btn-primary" data-action="save-activiteit">Opslaan</button>`
    : `<button class="modal-btn modal-btn-cancel" data-action="close-act-modal">Annuleren</button>
       <button class="modal-btn modal-btn-primary" data-action="save-activiteit">Opslaan</button>`;

  const _actModalEl=document.getElementById('act-modal-bg');
  _actModalEl.classList.add('open');
  _actModalEl.querySelector('.modal').scrollTop=0;
}
function openActModalVoorDatum(datum){geselecteerdeDatum=datum;openActModal();}
let _editRecurActId=null,_editRecurDatum=null;
function editActiviteit(id){
  const act=activiteiten.find(a=>a.id===id);
  if(!act)return;
  const isHerhaling=act.freq&&act.freq!=='eenmalig'&&(act.freq==='jaarlijks'||act.freq==='maandelijks'||(act.dagen||[]).length>0);
  if(isHerhaling&&geselecteerdeDatum){
    _editRecurActId=id;_editRecurDatum=geselecteerdeDatum;
    document.getElementById('er-act-naam').textContent=act.naam;
    const el=document.getElementById('edit-recur-modal-bg');
    el.classList.add('open');el.querySelector('.modal').scrollTop=0;
  } else {
    openActModal(act);
  }
}
function closeEditRecurModal(){document.getElementById('edit-recur-modal-bg').classList.remove('open');}
async function wijzigEnkelDit(){
  const origAct=activiteiten.find(a=>a.id===_editRecurActId);
  if(!origAct||!_editRecurDatum)return;
  closeEditRecurModal();
  origAct.uitgesloten=(origAct.uitgesloten||[]).filter(d=>d!==_editRecurDatum).concat(_editRecurDatum);
  slaLokaalOp();await sbSaveActiviteit(origAct);toonOpslagStatus('✅ Opgeslagen');
  const kopie={
    ...origAct,
    id:_maakId(),_sbId:undefined,
    freq:'eenmalig',dagen:[],
    beginDatum:_editRecurDatum,eindDatum:'',
    uitgesloten:[],
  };
  openActModal(kopie);
}
function wijzigAlleHerhalingen(){
  closeEditRecurModal();
  openActModal(activiteiten.find(a=>a.id===_editRecurActId));
}
function _terugNaarHome(){ if (new URLSearchParams(location.search).get('van')==='home') location.href='index.html'; }
function closeActModal(){
  const el=document.getElementById('act-modal-bg');
  const wasOpen=el.classList.contains('open');
  el.classList.remove('open');
  if(wasOpen) _terugNaarHome();
}

function renderPersonenMS(){
  const ms=document.getElementById('a-wie-ms');
  const cols=PERSONEN.length%3===0?3:2;
  ms.style.gridTemplateColumns=`repeat(${cols},1fr)`;
  ms.innerHTML=PERSONEN.map(p=>
    `<div class="persoon-chip${geselecteerdePersonen.includes(p)?' selected':''}" data-action="toggle-persoon" data-persoon="${escHtml(p)}">
      ${escHtml(PEMOJI[p]||'')} ${escHtml(PLABEL[p]||p)}
    </div>`).join('');
}
function togglePersoon(p){
  geselecteerdePersonen=geselecteerdePersonen.includes(p)
    ?geselecteerdePersonen.filter(x=>x!==p):[...geselecteerdePersonen,p];
  renderPersonenMS();checkKindjeSection();
}
function updateFreqUI(){
  const freq = document.getElementById('a-freq')?.value || 'eenmalig';
  const dagenRow = document.getElementById('dagen-row');
  const einddatumRow = document.getElementById('einddatum-row');
  const preview = document.getElementById('freq-preview');
  const beginDatum = document.getElementById('a-begin')?.value;
  const dagGekozen = [...(document.querySelectorAll('#dag-checkboxes input:checked'))].map(c=>c.value);

  // Dagen-rij: alleen tonen bij weekdag-gebaseerde frequenties
  const toontDagen = ['wekelijks','tweewekelijks'].includes(freq);
  if (dagenRow) dagenRow.style.display = toontDagen ? '' : 'none';
  // Einddatum: verbergen bij eenmalig
  if (einddatumRow) einddatumRow.style.display = freq === 'eenmalig' ? 'none' : '';

  // Live preview
  if (!preview) return;
  if (freq === 'eenmalig') { preview.style.display = 'none'; return; }
  const fmt = d => d ? new Date(d+'T12:00:00').toLocaleDateString('nl-BE',{day:'numeric',month:'long'}) : null;
  const fmtVol = d => d ? new Date(d+'T12:00:00').toLocaleDateString('nl-BE',{day:'numeric',month:'long',year:'numeric'}) : null;
  const DAGNAMEN_LANG = {ma:'maandag',di:'dinsdag',wo:'woensdag',do:'donderdag',vr:'vrijdag',za:'zaterdag',zo:'zondag'};
  let tekst = '';
  const einddatum = document.getElementById('a-eind')?.value;
  const periodeSuffix = (beginDatum||einddatum) ? ` · ${beginDatum?'vanaf '+fmtVol(beginDatum):''}${einddatum?' t/m '+fmtVol(einddatum):''}` : '';
  if (freq === 'jaarlijks') {
    tekst = (beginDatum ? `📅 Elk jaar op ${fmt(beginDatum)}` : '📅 Elk jaar op dezelfde datum als begindatum') + periodeSuffix;
  } else if (freq === 'maandelijks') {
    const dag = beginDatum ? new Date(beginDatum+'T12:00:00').getDate() : '?';
    tekst = `📅 Elke maand op de ${dag}e` + periodeSuffix;
  } else {
    const dagNamen = dagGekozen.map(d=>DAGNAMEN_LANG[d]||d).join(', ');
    const prefix = freq === 'tweewekelijks' ? 'Elke 2 weken op' : 'Elke week op';
    tekst = (dagNamen ? `📅 ${prefix} ${dagNamen}` : `📅 ${prefix} … (kies een dag)`) + periodeSuffix;
  }
  preview.textContent = tekst;
  preview.style.display = tekst ? 'block' : 'none';
}

function checkKindjeSection(){
  const kinderen=KINDEREN();
  const heeftKind=kinderen.some(k=>geselecteerdePersonen.includes(k));
  const heeftGezinshoofd=geselecteerdePersonen.some(p=>{const pr=Auth.getProfielen().find(pr=>pr.persoonKey===p);return pr&&!pr.isKind;});
  const toonKindje=heeftKind&&!heeftGezinshoofd;
  document.getElementById('kindje-sectie').style.display=toonKindje?'block':'none';
  kinderen.forEach(kind=>{
    const el=document.getElementById('transport-'+kind);
    if(el) el.style.display=geselecteerdePersonen.includes(kind)?'block':'none';
  });
}
function togglePrive(){priveAan=!priveAan;updatePriveSwitch();}
function updatePriveSwitch(){document.getElementById('prive-switch').className='ios-switch'+(priveAan?' on':'');}
function toggleInformatief(){informatiefAan=!informatiefAan;updateInformatiefSwitch();}
function updateInformatiefSwitch(){document.getElementById('informatief-switch').className='ios-switch'+(informatiefAan?' on':'');}
function toggleMeerdaags(){meerdaagsAan=!meerdaagsAan;updateMeerdaagsSwitch();}
function updateMeerdaagsSwitch(){
  document.getElementById('meerdaags-switch').className='ios-switch'+(meerdaagsAan?' on':'');
  document.getElementById('eendaags-velden').style.display=meerdaagsAan?'none':'block';
  document.getElementById('meerdaags-velden').style.display=meerdaagsAan?'block':'none';
}

function checkNachtspan(){
  const start=document.getElementById('a-start').value;
  const eindUur=document.getElementById('a-eind-uur').value;
  const isNacht=start&&eindUur&&tijdMinuten(eindUur)<tijdMinuten(start);
  document.getElementById('nachtspan-hint').style.display=isNacht?'inline':'none';
  if(isNacht&&document.getElementById('a-freq').value==='eenmalig'){
    const beginDatum=document.getElementById('a-begin').value;
    const eindDatumEl=document.getElementById('a-eind');
    if(beginDatum&&(!eindDatumEl.value||eindDatumEl.value===beginDatum)){
      const d=new Date(beginDatum+'T12:00:00');d.setDate(d.getDate()+1);
      eindDatumEl.value=fDateISO(d);
    }
  }
  suggestMaaltijdThuis();
}

function suggestMaaltijdThuis(){
  const start=document.getElementById('a-start').value;
  const eindUur=document.getElementById('a-eind-uur').value;
  if(!start||!eindUur) return;
  const s=tijdMinuten(start);
  const e=tijdMinuten(eindUur)<s?tijdMinuten(eindUur)+24*60:tijdMinuten(eindUur);
  const slots={ontbijt:[7*60,9*60],lunch:[12*60,14*60],avond:[18*60,20*60]};
  Object.entries(slots).forEach(([slot,[b,en]])=>{
    document.getElementById('a-mt-'+slot).checked = s<en&&e>b;
  });
}

function locatieCheckThuis(input) {
  const val = input.value.trim().toLowerCase();
  if (val !== 'thuis') return;
  const adres = Maps.getThuisadres();
  if (!adres) return;
  input.value = adres;
  input.blur(); input.focus();
}

function renderContactKeuze(){
  const wrap=document.getElementById('locatie-contact-wrap');
  if(!wrap) return;
  const metAdres=contacten.filter(c=>c.adres);
  if(!metAdres.length){wrap.innerHTML='';return;}
  wrap.innerHTML=`<select data-action="kies-locatie-contact"
    style="font-size:12px;padding:5px 8px;border:1.5px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);color:var(--ink);font-family:inherit;max-width:100%;">
    <option value="">Adres van contact kiezen…</option>
    ${metAdres.map(c=>`<option value="${escHtml(c.adres)}">${escHtml(c.naam)}</option>`).join('')}
  </select>`;
}
function kiesLocatieContact(adres){
  if(!adres)return;
  document.getElementById('a-locatie').value=adres;
}

async function berekenReistijdAuto(){
  const locatie=document.getElementById('a-locatie').value.trim();
  if(!locatie){toonOpslagStatus('❌ Vul eerst een locatie in.');return;}
  if(!Maps.getThuisadres()){toonOpslagStatus('❌ Stel eerst je thuisadres in via Instellingen → API instellingen.');return;}
  const btn=document.getElementById('btn-reistijd-auto');
  const orig=btn.textContent; btn.textContent='⏳'; btn.disabled=true;
  const mins=await Maps.reistijd(locatie);
  btn.textContent=orig; btn.disabled=false;
  if(mins===null){toonOpslagStatus('❌ Kon reistijd niet berekenen. Controleer thuisadres en Maps key in Instellingen.');return;}
  document.getElementById('a-reis-heen').value=mins;
  document.getElementById('a-reis-terug').value=mins;
  toonOpslagStatus('Reistijd: '+mins+' min');
}

async function saveActiviteit(){
  if (_savingAct) return;
  _savingAct = true;
  const naam=document.getElementById('a-naam').value.trim();
  if(!naam){toonOpslagStatus('❌ Geef een naam in.');_savingAct=false;return;}
  if(!geselecteerdePersonen.length){toonOpslagStatus('❌ Selecteer minstens één persoon.');_savingAct=false;return;}

  const heeftKind=KINDEREN().some(k=>geselecteerdePersonen.includes(k));
  const bestaande=actEditId?activiteiten.find(a=>a.id===actEditId):null;
  let act;

  if(meerdaagsAan){
    const beginDatum=document.getElementById('a-md-start-datum').value;
    const eindDatum=document.getElementById('a-md-eind-datum').value;
    if(!beginDatum||!eindDatum){toonOpslagStatus('❌ Vul start- en einddatum in.');_savingAct=false;return;}
    if(eindDatum<beginDatum){toonOpslagStatus('❌ Einddatum moet na begindatum zijn.');_savingAct=false;return;}
    const _maaltijdThuis={
      ontbijt:document.getElementById('a-mt-ontbijt').checked,
      lunch:document.getElementById('a-mt-lunch').checked,
      avond:document.getElementById('a-mt-avond').checked,
    };
    const _mt=Object.values(_maaltijdThuis).some(Boolean)?_maaltijdThuis:null;
    act={
      id:actEditId||Date.now(),_sbId:bestaande?._sbId,
      naam,wie:geselecteerdePersonen,prive:priveAan,informatief:informatiefAan,meerdaags:true,
      beginDatum,eindDatum,
      start:document.getElementById('a-md-start-tijd').value,
      eindUur:document.getElementById('a-md-eind-tijd').value,
      locatie:document.getElementById('a-locatie').value,
      prep:document.getElementById('a-prep').value,
      dagen:[],freq:'eenmalig',duur:0,reisHeen:0,reisTerug:0,
      maaltijdThuis:_mt,
    };
  } else {
    const dagen=[...document.querySelectorAll('#dag-checkboxes input:checked')].map(c=>c.value);
    const start=document.getElementById('a-start').value;
    const eindUur=document.getElementById('a-eind-uur').value;
    const tStart=tijdMinuten(start), tEind=tijdMinuten(eindUur);
    const duur=start&&eindUur?(tEind>=tStart?tEind-tStart:24*60-tStart+tEind):60;
    const _maaltijdThuis={
      ontbijt:document.getElementById('a-mt-ontbijt').checked,
      lunch:document.getElementById('a-mt-lunch').checked,
      avond:document.getElementById('a-mt-avond').checked,
    };
    const _mt=Object.values(_maaltijdThuis).some(Boolean)?_maaltijdThuis:null;
    act={
      id:actEditId||Date.now(),_sbId:bestaande?._sbId,
      naam,wie:geselecteerdePersonen,start,eindUur,duur,prive:priveAan,informatief:informatiefAan,meerdaags:false,
      reisHeen:parseInt(document.getElementById('a-reis-heen').value)||0,
      reisTerug:parseInt(document.getElementById('a-reis-terug').value)||0,
      locatie:document.getElementById('a-locatie').value,
      freq:document.getElementById('a-freq').value,
      beginDatum:document.getElementById('a-begin').value,
      eindDatum:document.getElementById('a-eind').value,
      prep:document.getElementById('a-prep').value,
      dagen,
      uitgesloten: bestaande?.uitgesloten||[],
      maaltijdThuis:_mt,
    };
    if (heeftKind) {
      KINDEREN().forEach(kind=>{
        setKindTransportAct(act, kind, {
          brengt: document.getElementById(`a-brengt-${kind}`)?.value || null,
          haalt:  document.getElementById(`a-haalt-${kind}`)?.value || null,
          eetGroo: document.getElementById(`a-eet-groo-${kind}`)?.checked || false,
        });
      });
    }
  }

  if(actEditId)activiteiten=activiteiten.map(a=>a.id===actEditId?act:a);
  else activiteiten.push(act);
  slaLokaalOp();renderAlles();await sbSaveActiviteit(act);toonOpslagStatus('✅ Opgeslagen');
  _savingAct = false;
  closeActModal();
}

let _verwijderActId=null,_verwijderDatum=null;
function verwijderActiviteit(id,datumISO){
  const act=activiteiten.find(a=>a.id===id);
  if(!act) return;
  const isHerhaling=act.freq&&act.freq!=='eenmalig'&&(act.freq==='jaarlijks'||act.freq==='maandelijks'||(act.dagen||[]).length>0);
  if(isHerhaling&&datumISO){
    _verwijderActId=id;_verwijderDatum=datumISO;
    document.getElementById('vd-act-naam').textContent=act.naam;
    const el=document.getElementById('verwijder-modal-bg');
    el.classList.add('open');el.querySelector('.modal').scrollTop=0;
  } else {
    _bevestig('Activiteit verwijderen?', function(){ _doVerwijderVolledig(id); });
  }
}
async function verwijderEnkelHerhaling(){
  const act=activiteiten.find(a=>a.id===_verwijderActId);
  if(!act||!_verwijderDatum) return;
  act.uitgesloten=(act.uitgesloten||[]).filter(d=>d!==_verwijderDatum).concat(_verwijderDatum);
  closeVerwijderModal();slaLokaalOp();renderAlles();await sbSaveActiviteit(act);toonOpslagStatus('✅ Opgeslagen');
}
function verwijderVolleActiviteit(){
  closeVerwijderModal();
  setTimeout(()=>{
    _bevestig('Activiteit definitief verwijderen?', function(){ _doVerwijderVolledig(_verwijderActId); }, {bevestigLabel:'Definitief verwijderen'});
  },200);
}
function _doVerwijderVolledig(id){
  const act=activiteiten.find(a=>a.id===id);
  activiteiten=activiteiten.filter(a=>a.id!==id);
  slaLokaalOp();if(act?._sbId)sbDeleteActiviteit(act._sbId);toonOpslagStatus('✅ Verwijderd');renderAlles();
}
function closeVerwijderModal(){document.getElementById('verwijder-modal-bg').classList.remove('open');}

// ── Modal: Drukte ─────────────────────────────────────────────
function openDOModal(key,label){
  doKey=key;tempOverride=null;
  document.getElementById('do-titel').textContent=label;
  document.querySelectorAll('.do-btn').forEach(b=>b.style.opacity='.6');
  const _doEl=document.getElementById('drukte-modal-bg');
  _doEl.classList.add('open');
  _doEl.querySelector('.modal').scrollTop=0;
}
function selectOverride(d,el){
  tempOverride=d;
  document.querySelectorAll('.do-btn').forEach(b=>b.style.opacity='.6');
  el.style.opacity='1';el.style.outline='2px solid var(--ink)';
}
function saveDOModal(){
  if(doKey&&tempOverride){drukteOverride[doKey]=tempOverride;sbSaveDrukte(doKey,tempOverride);slaLokaalOp();toonOpslagStatus('✅ Opgeslagen');}
  closeDOModal();renderAlles();
}
function closeDOModal(){
  document.getElementById('drukte-modal-bg').classList.remove('open');
  doKey=null;tempOverride=null;
  document.querySelectorAll('.do-btn').forEach(b=>{b.style.opacity='1';b.style.outline='none';});
}

document.querySelectorAll('.modal-bg').forEach(bg=>{
  bg.addEventListener('click',e=>{
    if(e.target!==bg) return;
    switch(bg.id){
      case 'act-modal-bg': if (!_savingAct) closeActModal(); break; // closeActModal regelt zelf _terugNaarHome
      case 'drukte-modal-bg': closeDOModal(); break;
      case 'ical-modal-bg': closeIcalModal(); break;
      case 'verwijder-modal-bg': closeVerwijderModal(); break;
      case 'edit-recur-modal-bg': closeEditRecurModal(); break;
    }
  });
});

// ── iCal import & sync ────────────────────────────────────────
let _icalEvents = [];
let _icalWie    = [];
let _icalSrcUrl = null;

async function icalAutoSync(){
  await laadIcalAbonnementen();
  const actieveAbos = icalAbonnementen.filter(a => !a.paused);
  if (!actieveAbos.length) return;
  let totaalNieuw = 0, totaalUpdate = 0, aangestuurd = false;
  for (let i = 0; i < icalAbonnementen.length; i++) {
    const abo = icalAbonnementen[i];
    if (abo.paused) continue;
    // Gebruik per-abo lastSync uit Supabase — gedeeld over alle toestellen van het gezin
    if (abo.lastSync && Date.now() - new Date(abo.lastSync).getTime() < 23*60*60*1000) continue;
    aangestuurd = true;
    try {
      const text = await icalFetchUrl(abo.url);
      const events = parseIcal(text, abo.url);
      const {nieuw, geupdate} = await icalMerge(events, abo.wie||[], abo.url, {informatief:!!abo.informatief});
      icalAbonnementen[i].lastSync = new Date().toISOString();
      totaalNieuw += nieuw; totaalUpdate += geupdate;
    } catch(e) { console.warn('[iCal sync]', abo.url, e.message); }
  }
  if (aangestuurd) {
    await slaIcalAbonnementenOp();
    if (totaalNieuw || totaalUpdate) {
      slaLokaalOp(); renderAlles();
      toonOpslagStatus(`🔄 iCal: ${totaalNieuw} nieuw, ${totaalUpdate} bijgewerkt`);
    }
  }
}

function openIcalModal(){
  _icalEvents=[]; _icalWie=[]; _icalSrcUrl=null;
  document.getElementById('ical-url').value='';
  document.getElementById('ical-status').textContent='';
  document.getElementById('ical-preview').style.display='none';
  document.getElementById('ical-import-btn').style.display='none';
  icalToonAbonnementen();
  const _icalEl=document.getElementById('ical-modal-bg');
  _icalEl.classList.add('open');
  _icalEl.querySelector('.modal').scrollTop=0;
}

async function icalLaadUrl(){
  let url=document.getElementById('ical-url').value.trim();
  if(!url){
    const inp=document.getElementById('ical-url');
    inp.style.borderColor='var(--accent)';inp.focus();
    document.getElementById('ical-status').textContent='Vul een URL in.';
    inp.addEventListener('input',function(){inp.style.borderColor='';document.getElementById('ical-status').textContent='';},{once:true});
    return;
  }
  document.getElementById('ical-status').textContent='⏳ Laden…';
  try {
    const text=await icalFetchUrl(url);
    _icalSrcUrl=url.replace(/^webcal:\/\//i,'https://');
    icalVerwerk(text, _icalSrcUrl);
  } catch(e){
    document.getElementById('ical-status').textContent='❌ '+e.message;
  }
}

function icalVerwerk(text, srcUrl){
  document.getElementById('ical-status').textContent='⏳ Verwerken…';
  try {
    _icalEvents=parseIcal(text, srcUrl);
    if(!_icalEvents.length){
      document.getElementById('ical-status').textContent='⚠️ Geen activiteiten gevonden.';
      return;
    }
    document.getElementById('ical-status').textContent='';
    _icalWie=[Auth.profiel()?.persoonKey].filter(Boolean);
    icalToonPreview();
  } catch(e){
    document.getElementById('ical-status').textContent='❌ Parsefout: '+e.message;
  }
}

function icalToonPreview(){
  const n=_icalEvents.length;
  const bestaandAantal=_icalEvents.filter(e=>e.icalUid&&activiteiten.find(a=>a.icalUid===e.icalUid&&a.icalSource===e.icalSource)).length;
  const nieuwAantal=n-bestaandAantal;
  document.getElementById('ical-preview-titel').textContent=
    `${n} activiteit${n!==1?'en':''} gevonden`+
    (bestaandAantal?` · ${bestaandAantal} al aanwezig (worden bijgewerkt), ${nieuwAantal} nieuw`:'');

  const _icalMs=document.getElementById('ical-wie-ms');
  _icalMs.style.gridTemplateColumns=`repeat(${PERSONEN.length%3===0?3:2},1fr)`;
  _icalMs.innerHTML=PERSONEN.map(p=>
    `<div class="persoon-chip${_icalWie.includes(p)?' selected':''}" data-key="${escHtml(p)}" data-action="ical-toggle-wie" data-persoon="${escHtml(p)}">
      ${escHtml(PEMOJI[p]||'')} ${escHtml(PLABEL[p]||p)}
    </div>`).join('');

  const isAbo=_icalSrcUrl&&!icalAbonnementen.find(a=>a.url===_icalSrcUrl);
  document.getElementById('ical-abo-rij').style.display=isAbo?'flex':'none';
  document.getElementById('ical-abo-check').checked=isAbo;

  const toon=_icalEvents.slice(0,15);
  document.getElementById('ical-event-lijst').innerHTML=
    toon.map(a=>{
      const al=a.icalUid&&activiteiten.find(x=>x.icalUid===a.icalUid&&x.icalSource===a.icalSource);
      return `<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-bottom:1px solid var(--border);">
        ${al?'<span style="font-size:10px;color:var(--normaal-clr);flex-shrink:0;">↻</span>':'<span style="font-size:10px;color:var(--rustig-clr);flex-shrink:0;">＋</span>'}
        <span style="font-size:11px;color:var(--muted);min-width:80px;flex-shrink:0;">${a.beginDatum}${a.meerdaags&&a.eindDatum!==a.beginDatum?' →'+a.eindDatum.slice(5):''}</span>
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(a.naam)}</span>
        <span style="font-size:11px;color:var(--muted);flex-shrink:0;">${a.start||''}</span>
      </div>`;
    }).join('')+(n>15?`<div style="padding:7px 10px;font-size:12px;color:var(--muted);">… en nog ${n-15} meer</div>`:'');

  document.getElementById('ical-preview').style.display='block';
  const btn=document.getElementById('ical-import-btn');
  btn.style.display='inline-flex'; btn.disabled=false;
  btn.textContent=`Importeer ${nieuwAantal} nieuw${bestaandAantal?' + '+bestaandAantal+' bijwerken':''}`;
}

function icalToggleWie(p){
  _icalWie=_icalWie.includes(p)?_icalWie.filter(x=>x!==p):[..._icalWie,p];
  document.getElementById('ical-wie-ms').querySelectorAll('.persoon-chip').forEach(el=>{
    el.classList.toggle('selected',_icalWie.includes(el.dataset.key));
  });
}

async function icalImporteer(){
  if(!_icalEvents.length) return;
  const btn=document.getElementById('ical-import-btn');
  btn.disabled=true; btn.textContent='Bezig…';
  const wie=_icalWie.length?[..._icalWie]:[Auth.profiel()?.persoonKey].filter(Boolean);
  const src=_icalSrcUrl||null;
  _icalEvents.forEach(e=>{ e.wie=wie; });
  const {nieuw,geupdate}=await icalMerge(_icalEvents,wie,src);
  if(src&&document.getElementById('ical-abo-check')?.checked){
    const naam=document.getElementById('ical-abo-naam')?.value.trim()||src.split('/').pop()||'Agenda';
    if(!icalAbonnementen.find(a=>a.url===src)){
      icalAbonnementen.push({url:src,naam,wie});
      await slaIcalAbonnementenOp();
    }
  }
  closeIcalModal(); slaLokaalOp(); renderAlles();
  toonOpslagStatus(`✅ ${nieuw} toegevoegd, ${geupdate} bijgewerkt`);
}

function icalToonAbonnementen(){
  laadIcalAbonnementen().then(()=>{
    const el=document.getElementById('ical-abonnementen-sectie');
    if(!icalAbonnementen.length){ el.style.display='none'; return; }
    el.style.display='block';
    document.getElementById('ical-abonnementen-lijst').innerHTML=
      icalAbonnementen.map((a,i)=>`
        <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-bottom:1px solid var(--border);font-size:13px;">
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;">${escHtml(a.naam||a.url)}</span>
          <button data-action="ical-sync-enkel" data-index="${i}" style="font-size:11px;padding:3px 8px;border:1px solid var(--border);border-radius:99px;background:none;cursor:pointer;color:var(--accent);">↻ Sync</button>
          <button data-action="ical-verwijder-abo" data-index="${i}" style="font-size:11px;padding:3px 8px;border:1px solid var(--border);border-radius:99px;background:none;cursor:pointer;color:var(--druk-clr);">✕</button>
        </div>`).join('');
  });
}

async function icalSyncEnkel(i){
  const abo=icalAbonnementen[i]; if(!abo) return;
  toonOpslagStatus('⏳ Synchroniseren…');
  try {
    const text=await icalFetchUrl(abo.url);
    const events=parseIcal(text,abo.url);
    const {nieuw,geupdate}=await icalMerge(events,abo.wie||[],abo.url,{informatief:!!abo.informatief});
    icalAbonnementen[i].lastSync=new Date().toISOString();
    await slaIcalAbonnementenOp();
    slaLokaalOp(); renderAlles();
    toonOpslagStatus(`✅ ${abo.naam||'Agenda'}: ${nieuw} nieuw, ${geupdate} bijgewerkt`);
    icalToonAbonnementen();
  } catch(e){ toonOpslagStatus('❌ '+e.message); }
}

async function icalVerwijderAbo(i){
  _bevestig('Abonnement verwijderen?', async function(){
    icalAbonnementen.splice(i,1);
    await slaIcalAbonnementenOp();
    icalToonAbonnementen();
  }, {sub:'De al geïmporteerde activiteiten blijven staan.'});
}

function closeIcalModal(){
  document.getElementById('ical-modal-bg').classList.remove('open');
}

// ── Centrale event delegation (clicks) ───────────────────────
document.addEventListener('click', function(e){
  const el = e.target.closest('[data-action]');

  // Profiel dropdown sluiten bij klik buiten menu
  if (!el || el.dataset.action !== 'toggle-profiel-menu') {
    if (!e.target.closest('#topbar-user') && !e.target.closest('#profiel-menu'))
      document.getElementById('profiel-menu')?.classList.remove('open');
  }

  if (!el) return;
  const id = el.dataset.id, datum = el.dataset.datum;
  switch (el.dataset.action) {
    case 'toggle-profiel-menu': document.getElementById('profiel-menu')?.classList.toggle('open'); break;
    case 'set-filter': setFilter(el.dataset.key); break;
    case 'selecteer-dag': selecteerDag(datum); break;
    case 'open-do-modal': openDOModal(datum, el.dataset.label); break;
    case 'edit-act': editActiviteit(id); break;
    case 'verwijder-act': e.stopPropagation(); verwijderActiviteit(id, datum); break;
    case 'toggle-persoon': togglePersoon(el.dataset.persoon); break;
    case 'ical-toggle-wie': icalToggleWie(el.dataset.persoon); break;
    case 'ical-sync-enkel': icalSyncEnkel(parseInt(el.dataset.index, 10)); break;
    case 'ical-verwijder-abo': icalVerwijderAbo(parseInt(el.dataset.index, 10)); break;
    case 'naar-vandaag': naarVandaag(); break;
    case 'change-month': changeMonth(parseInt(el.dataset.dir, 10)); break;
    case 'open-ical-modal': openIcalModal(); break;
    case 'open-act-modal': openActModal(); break;
    case 'toggle-meerdaags': toggleMeerdaags(); break;
    case 'bereken-reistijd-auto': berekenReistijdAuto(); break;
    case 'toggle-prive': togglePrive(); break;
    case 'toggle-informatief': toggleInformatief(); break;
    case 'close-act-modal': closeActModal(); break;
    case 'verwijder-act-modal': {
      const _id = actEditId, _datum = geselecteerdeDatum;
      if (_id) { closeActModal(); verwijderActiviteit(_id, _datum); }
      break;
    }
    case 'save-activiteit': saveActiviteit(); break;
    case 'select-override': selectOverride(el.dataset.niveau, el); break;
    case 'close-do-modal': closeDOModal(); break;
    case 'save-do-modal': saveDOModal(); break;
    case 'ical-laad-url': icalLaadUrl(); break;
    case 'close-ical-modal': closeIcalModal(); break;
    case 'ical-importeer': icalImporteer(); break;
    case 'verwijder-enkel-herhaling': verwijderEnkelHerhaling(); break;
    case 'verwijder-volle-activiteit': verwijderVolleActiviteit(); break;
    case 'close-verwijder-modal': closeVerwijderModal(); break;
    case 'wijzig-enkel-dit': wijzigEnkelDit(); break;
    case 'wijzig-alle-herhalingen': wijzigAlleHerhalingen(); break;
    case 'close-edit-recur-modal': closeEditRecurModal(); break;
  }
});

// ── Dubbelklik: dag-cel opent nieuwe activiteit ───────────────
document.addEventListener('dblclick', function(e){
  const el = e.target.closest('[data-action="selecteer-dag"]');
  if (el) { e.stopPropagation(); openActModalVoorDatum(el.dataset.datum); }
});

// ── Change/input delegation ───────────────────────────────────
document.addEventListener('change', function(e){
  const el = e.target.closest('[data-action]');
  if (!el) return;
  switch (el.dataset.action) {
    case 'check-nachtspan': checkNachtspan(); break;
    case 'freq-change': checkNachtspan(); updateFreqUI(); break;
    case 'kies-locatie-contact': kiesLocatieContact(el.value); break;
    case 'ical-abo-check-toggle':
      document.getElementById('ical-abo-naam-rij').style.display = el.checked ? 'block' : 'none';
      break;
  }
});
document.addEventListener('input', function(e){
  const el = e.target.closest('[data-action]');
  if (!el) return;
  if (el.dataset.action === 'check-nachtspan') checkNachtspan();
  else if (el.dataset.action === 'locatie-input') { renderContactKeuze(); locatieCheckThuis(el); }
});

// ── Keydown: Enter in iCal-url laadt de agenda ────────────────
document.getElementById('ical-url')?.addEventListener('keydown', function(e){
  if (e.key === 'Enter') icalLaadUrl();
});
// nav.js injecteert generieke sluitknoppen — overschrijf alleen act-modal-bg met closeActModal zodat _terugNaarHome correct vuurt
document.addEventListener('DOMContentLoaded', function(){
  const actSluit = document.querySelector('#act-modal-bg .modal-sluit-btn');
  if(actSluit) actSluit.onclick = function(e){ e.stopPropagation(); closeActModal(); };
});

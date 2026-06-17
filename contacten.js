Auth.initPagina('contacten');

let actieveContactId=null;
let _kerstkaartAan=true;
let _aantalKinderen=0;
let _aantalDatums=0;

laadOp().then(()=>{renderCrm();renderVerjaarDagAlerts();}).catch(()=>{laadLokaal();renderCrm();renderVerjaarDagAlerts();});
onGezinsappUpdate(()=>{ renderCrm(); renderVerjaarDagAlerts(); });
AppState.subscribe('contacten', ()=>{ renderCrm(); renderVerjaarDagAlerts(); });

// ── Helpers ───────────────────────────────────────────────────
function _parseObj(v){ if(!v) return null; if(typeof v==='object') return v; try{return JSON.parse(v);}catch{return null;} }
function _formatVerjaardag(d){
  if(!d) return '';
  try{
    const dt=new Date(d+'T12:00:00');
    return dt.toLocaleDateString('nl-BE',{day:'numeric',month:'long',year:'numeric'});
  }catch{return d;}
}
function _familieNaam(c){
  const p1=_parseObj(c.partner1);
  const p2=_parseObj(c.partner2);
  const ach1=(p1?.achternaam||'').trim();
  const ach2=(p2?.achternaam||'').trim();
  const vn1=(p1?.voornaam||'').trim();
  if(!vn1&&!ach1) return c.naam||'Onbekend';
  if(ach1&&ach2&&ach1!==ach2) return `Familie ${ach1} ${ach2}`;
  if(ach1) return `Familie ${ach1}`;
  return `${vn1}`.trim()||c.naam||'Onbekend';
}

// ── Kerstkaart toggle ─────────────────────────────────────────
function toggleKerstkaart(){
  _kerstkaartAan=!_kerstkaartAan;
  document.getElementById('c-kerstkaart-switch').className='ios-switch'+(_kerstkaartAan?' on':'');
}

// ── Kinderen velden ───────────────────────────────────────────
function _renderKinderenRijen(kinderen){
  const el=document.getElementById('c-kinderen-rijen');
  el.innerHTML='';
  kinderen.forEach((k,i)=>{
    const row=document.createElement('div');
    row.style.cssText='background:var(--surface-2);border:1.5px solid var(--border);border-radius:var(--radius-sm);padding:12px;margin-bottom:8px;position:relative;';
    row.innerHTML=`
      <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">Kind ${i+1}
        <button data-action="verwijder-kind" data-index="${i}" style="float:right;background:none;border:none;color:var(--muted-2);cursor:pointer;font-size:14px;padding:0;">✕</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
        <div class="form-row" style="margin:0;"><label>Voornaam</label><input type="text" id="c-kind-vn-${i}" value="${escHtml(k.voornaam||'')}" placeholder="Voornaam"/></div>
        <div class="form-row" style="margin:0;"><label>Achternaam</label><input type="text" id="c-kind-ach-${i}" value="${escHtml(k.achternaam||'')}" placeholder="Achternaam"/></div>
      </div>
      <div class="form-row" style="margin:0;"><label>Verjaardag</label><input type="date" id="c-kind-vj-${i}" value="${escHtml(k.verjaardag||'')}"/></div>
    `;
    el.appendChild(row);
  });
  document.getElementById('c-kind-add-btn').style.display=kinderen.length>=5?'none':'block';
  _aantalKinderen=kinderen.length;
}
function _leesKinderenVelden(){
  const kids=[];
  for(let i=0;i<_aantalKinderen;i++){
    const vn=document.getElementById(`c-kind-vn-${i}`)?.value.trim()||'';
    const ach=document.getElementById(`c-kind-ach-${i}`)?.value.trim()||'';
    const vj=document.getElementById(`c-kind-vj-${i}`)?.value||'';
    if(vn||ach||vj) kids.push({voornaam:vn,achternaam:ach,verjaardag:vj});
  }
  return kids;
}
function voegKindToe(){
  if(_aantalKinderen>=5) return;
  const huidige=_leesKinderenVelden();
  // Read current fields first, then append new empty
  const kids=[...huidige,{voornaam:'',achternaam:'',verjaardag:''}];
  _renderKinderenRijen(kids);
}
function verwijderKind(index){
  const huidige=_leesKinderenVelden();
  // Re-read all fields
  const alle=[];
  for(let i=0;i<_aantalKinderen;i++){
    const vn=document.getElementById(`c-kind-vn-${i}`)?.value.trim()||'';
    const ach=document.getElementById(`c-kind-ach-${i}`)?.value.trim()||'';
    const vj=document.getElementById(`c-kind-vj-${i}`)?.value||'';
    alle.push({voornaam:vn,achternaam:ach,verjaardag:vj});
  }
  alle.splice(index,1);
  _renderKinderenRijen(alle);
}

// ── Belangrijke datums velden ─────────────────────────────────
function _renderDatumsRijen(datums){
  const el=document.getElementById('c-datums-rijen');
  if(!el) return;
  el.innerHTML='';
  datums.forEach((d,i)=>{
    const row=document.createElement('div');
    row.style.cssText='background:var(--surface-2);border:1.5px solid var(--border);border-radius:var(--radius-sm);padding:12px;margin-bottom:8px;position:relative;';
    row.innerHTML=`
      <button data-action="verwijder-datum" data-index="${i}" style="position:absolute;top:8px;right:10px;background:none;border:none;color:var(--muted-2);cursor:pointer;font-size:14px;padding:0;">✕</button>
      <div style="display:grid;grid-template-columns:1fr auto;gap:8px;align-items:end;margin-bottom:8px;">
        <div class="form-row" style="margin:0;">
          <label>Omschrijving</label>
          <input type="text" id="c-datum-lbl-${i}" value="${escHtml(d.label||'')}" placeholder="bijv. Huwelijksverjaardag"/>
        </div>
        <div class="form-row" style="margin:0;">
          <label>Datum</label>
          <input type="date" id="c-datum-dt-${i}" value="${escHtml(d.datum||'')}"/>
        </div>
      </div>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:var(--ink);">
        <input type="checkbox" id="c-datum-rep-${i}" style="width:auto;accent-color:var(--accent);" ${d.herhalend?'checked':''}/>
        Herhaalt jaarlijks
      </label>`;
    el.appendChild(row);
  });
  _aantalDatums=datums.length;
}
function _leesDatumsVelden(){
  const result=[];
  for(let i=0;i<_aantalDatums;i++){
    const label=document.getElementById(`c-datum-lbl-${i}`)?.value.trim()||'';
    const datum=document.getElementById(`c-datum-dt-${i}`)?.value||'';
    const herhalend=document.getElementById(`c-datum-rep-${i}`)?.checked||false;
    if(label||datum) result.push({label,datum,herhalend});
  }
  return result;
}
function voegBelangrijkeDatumToe(){
  const huidige=_leesDatumsVelden();
  _renderDatumsRijen([...huidige,{label:'',datum:'',herhalend:true}]);
}
function verwijderDatum(index){
  const alle=_leesDatumsVelden();
  alle.splice(index,1);
  _renderDatumsRijen(alle);
}

// ── Datumhulpfuncties ─────────────────────────────────────────
function _dagenTotVolgende(datumStr, herhalend){
  if(!datumStr) return null;
  const nu=new Date(); nu.setHours(0,0,0,0);
  const d=new Date(datumStr+'T12:00:00');
  if(!herhalend){
    const diff=Math.round((d-nu)/(86400000));
    return diff;
  }
  // Jaarlijks: zoek eerstvolgende
  let jaar=nu.getFullYear();
  let volgende=new Date(jaar,d.getMonth(),d.getDate());
  if(volgende<nu) volgende=new Date(jaar+1,d.getMonth(),d.getDate());
  return Math.round((volgende-nu)/(86400000));
}

// ── Aankomende datums alerts ──────────────────────────────────
function renderVerjaarDagAlerts(){
  const el=document.getElementById('verjaardag-alerts');
  if(!el) return;
  const VENSTER=30; // dagen vooruit
  const items=[];
  contacten.forEach(c=>{
    const nm=c.naam||_familieNaam(c);
    // Partners
    [_parseObj(c.partner1),_parseObj(c.partner2)].filter(Boolean).forEach(p=>{
      if(!p.verjaardag) return;
      const pnm=((p.voornaam||'')+' '+(p.achternaam||'')).trim()||nm;
      const dagen=_dagenTotVolgende(p.verjaardag,true);
      if(dagen!==null&&dagen>=0&&dagen<=VENSTER)
        items.push({type:'verjaardag',label:`<i data-lucide="cake" class="icon-inline"></i> ${pnm}`,dagen,datum:p.verjaardag,herhalend:true});
    });
    // Kinderen
    (_parseObj(c.kinderenData)||[]).forEach(k=>{
      if(!k.verjaardag) return;
      const kn=((k.voornaam||'')+' '+(k.achternaam||'')).trim()||'Kind';
      const dagen=_dagenTotVolgende(k.verjaardag,true);
      if(dagen!==null&&dagen>=0&&dagen<=VENSTER)
        items.push({type:'verjaardag',label:`<i data-lucide="cake" class="icon-inline"></i> ${kn}`,dagen,datum:k.verjaardag,herhalend:true});
    });
    // Belangrijke datums
    (c.belangrijkeDatums||[]).forEach(bd=>{
      if(!bd.datum) return;
      const dagen=_dagenTotVolgende(bd.datum,bd.herhalend);
      if(dagen!==null&&(bd.herhalend?dagen>=0&&dagen<=VENSTER:dagen>=0&&dagen<=VENSTER))
        items.push({type:'datum',label:`<i data-lucide="calendar" class="icon-inline"></i> ${bd.label||'Datum'} — ${nm}`,dagen,datum:bd.datum,herhalend:bd.herhalend});
    });
  });
  items.sort((a,b)=>a.dagen-b.dagen);
  if(!items.length){el.innerHTML='';return;}
  el.innerHTML=`<div style="margin-bottom:12px;">
    ${items.map(it=>{
      const d=new Date(it.datum+'T12:00:00');
      const dagStr=it.herhalend
        ?d.toLocaleDateString('nl-BE',{day:'numeric',month:'long'})
        :d.toLocaleDateString('nl-BE',{day:'numeric',month:'long',year:'numeric'});
      const wanneer=it.dagen===0?'vandaag':it.dagen===1?'morgen':`over ${it.dagen} dagen`;
      return `<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:${it.dagen<=7?'var(--normaal-bg)':'var(--surface-2)'};border:1.5px solid var(--border);border-radius:var(--radius-sm);margin-bottom:6px;">
        <div style="flex:1;font-size:13px;font-weight:600;color:var(--ink);">${it.label}</div>
        <div style="text-align:right;flex-shrink:0;">
          <div style="font-size:12px;font-weight:600;color:${it.dagen<=7?'var(--normaal-clr)':'var(--accent)'};">${wanneer}</div>
          <div style="font-size:11px;color:var(--muted);">${dagStr}</div>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

// ── Render lijst ──────────────────────────────────────────────
function renderCrm(){
  const search=(document.getElementById('crm-search')||{}).value||'';
  let filtered=contacten;
  const sq=search.toLowerCase();
  if(search) filtered=filtered.filter(c=>{
    const nm=c.naam||_familieNaam(c)||'';
    const p1=_parseObj(c.partner1);const p2=_parseObj(c.partner2);
    return nm.toLowerCase().includes(sq)||
      (p1?.voornaam||'').toLowerCase().includes(sq)||
      (p1?.achternaam||'').toLowerCase().includes(sq)||
      (p2?.voornaam||'').toLowerCase().includes(sq)||
      (p2?.achternaam||'').toLowerCase().includes(sq);
  });
  const el=document.getElementById('crm-lijst');
  if(!filtered.length){
    el.innerHTML=search
      ?`<div class="empty-state"><i data-lucide="search" class="empty-icon"></i><p>Geen contacten gevonden voor "${escHtml(search)}"</p></div>`
      :`<div class="empty-state"><i data-lucide="users" class="empty-icon"></i><p>Nog geen contacten</p></div>`;
    return;
  }
  el.innerHTML=filtered.map(c=>{
    const isActief=actieveContactId!=null&&actieveContactId==c.id;
    const nm=c.naam||_familieNaam(c);
    const p1=_parseObj(c.partner1);const p2=_parseObj(c.partner2);
    const kids=_parseObj(c.kinderenData)||[];
    const kerstmis=c.kerstmis===true||c.kerstmis==='ja'||c.kerstmis===1;
    const partnerLijn=[p1,p2].filter(Boolean).map(p=>((p.voornaam||'')+' '+(p.achternaam||'')).trim()).filter(Boolean).join(' & ');
    const kindNamen=kids.map(k=>(k.voornaam||k.naam||'').trim()).filter(Boolean).join(', ');
    return `
    <div class="crm-card${isActief?' actief':''}" data-action="open-contact-fiche" data-id="${c.id}">
      <div class="crm-naam"><i data-lucide="users" style="width:14px;height:14px;display:inline-block;vertical-align:-0.1em;"></i> ${escHtml(nm)}</div>
      ${partnerLijn?`<div style="font-size:13px;color:var(--muted);margin-top:2px;"><i data-lucide="heart" style="width:12px;height:12px;display:inline-block;vertical-align:-0.1em;"></i> ${escHtml(partnerLijn)}</div>`:''}
      ${kindNamen?`<div style="font-size:12px;color:var(--muted);margin-top:2px;"><i data-lucide="baby" style="width:12px;height:12px;display:inline-block;vertical-align:-0.1em;"></i> ${escHtml(kindNamen)}</div>`:''}
      <div style="margin-top:7px;">
        <span style="font-size:11px;padding:2px 9px;border-radius:99px;font-weight:600;background:${kerstmis?'var(--rustig-bg)':'var(--bg-2)'};color:${kerstmis?'var(--rustig-clr)':'var(--muted)'};display:inline-flex;align-items:center;gap:3px;"><i data-lucide="tree-pine" style="width:10px;height:10px;"></i> ${kerstmis?'Kerstkaart':'Geen kerstkaart'}</span>
      </div>
    </div>`;
  }).join('');
  if(actieveContactId){
    const c=contacten.find(c=>c.id===actieveContactId);
    if(c) _renderContactFicheDesktop(c);
    else { actieveContactId=null; _clearContactFiche(); }
  }
}

// ── Contactfiche ──────────────────────────────────────────────
function openContactFiche(id){
  actieveContactId=id;
  const c=contacten.find(c=>c.id===id);
  if(!c) return;
  _renderContactFicheDesktop(c);
  if(window.innerWidth<768){
    document.getElementById('crm-fiche-mobiel').innerHTML=renderContactFicheHtml(c,true);
    document.getElementById('crm-fiche-overlay').classList.add('open');
  }
  document.querySelectorAll('.crm-card').forEach(el=>el.classList.toggle('actief',el.dataset.id==id));
}
function _renderContactFicheDesktop(c){
  const el=document.getElementById('crm-fiche');const ph=document.getElementById('crm-fiche-placeholder');
  if(!el) return;
  el.innerHTML=renderContactFicheHtml(c,false);
  el.style.display='block';if(ph) ph.style.display='none';
}
function _clearContactFiche(){
  const el=document.getElementById('crm-fiche');const ph=document.getElementById('crm-fiche-placeholder');
  if(el){el.innerHTML='';el.style.display='none';}if(ph) ph.style.display='flex';
}

function renderContactFicheHtml(c,metSluitknop){
  const kanBewerken=Auth.kan('kanContactenBeheren');
  const nm=c.naam||_familieNaam(c);
  const p1=_parseObj(c.partner1);const p2=_parseObj(c.partner2);
  const kids=_parseObj(c.kinderenData)||[];
  const kerstmis=c.kerstmis===true||c.kerstmis==='ja'||c.kerstmis===1;

  const personenHtml=[p1,p2].filter(Boolean).map((p,i)=>{
    const naam=((p.voornaam||'')+' '+(p.achternaam||'')).trim();
    if(!naam&&!p.verjaardag) return '';
    return `<div style="background:var(--surface-2);border:1.5px solid var(--border);border-radius:var(--radius-sm);padding:10px 14px;margin-bottom:8px;">
      <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">Partner ${i+1}</div>
      ${naam?`<div style="font-size:15px;font-weight:600;color:var(--ink);">${escHtml(naam)}</div>`:''}
      ${p.verjaardag?`<div style="font-size:12px;color:var(--muted);margin-top:3px;"><i data-lucide="cake" style="width:12px;height:12px;display:inline-block;vertical-align:-0.1em;"></i> ${_formatVerjaardag(p.verjaardag)}</div>`:''}
    </div>`;
  }).join('');

  const kinderenHtml=kids.length?`
    <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin:12px 0 6px;">Kinderen</div>
    ${kids.map(k=>{
      const kn=((k.voornaam||'')+' '+(k.achternaam||'')).trim();
      return `<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border);">
        <i data-lucide="baby" style="width:16px;height:16px;flex-shrink:0;color:var(--muted-2);"></i>
        <div><div style="font-size:14px;font-weight:500;color:var(--ink);">${escHtml(kn||'Kind')}</div>
        ${k.verjaardag?`<div style="font-size:12px;color:var(--muted);"><i data-lucide="cake" style="width:12px;height:12px;display:inline-block;vertical-align:-0.1em;"></i> ${_formatVerjaardag(k.verjaardag)}</div>`:''}
        </div>
      </div>`;
    }).join('')}
  `:'';

  return `
  <div class="fiche-header">
    <div class="fiche-naam"><i data-lucide="users" style="width:16px;height:16px;display:inline-block;vertical-align:-0.1em;margin-right:4px;"></i>${escHtml(nm)}</div>
    <div class="fiche-acties">
      ${kanBewerken?`
        <button class="btn btn-secondary btn-sm" data-action="edit-contact" data-id="${c.id}" title="Bewerken"><i data-lucide="pencil" class="icon-inline"></i></button>
        <button class="btn btn-danger btn-sm" data-action="verwijder-contact" data-id="${c.id}" title="Verwijderen"><i data-lucide="trash-2" class="icon-inline"></i></button>
      `:''}
      ${metSluitknop?`<button class="btn btn-secondary btn-sm" data-action="sluit-contact-fiche" title="Sluiten">✕</button>`:''}
    </div>
  </div>
  ${personenHtml}
  ${kinderenHtml}
  ${c.adres?`<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.adres)}" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--surface-2);border:1.5px solid var(--border);border-radius:var(--radius-sm);margin-top:10px;text-decoration:none;">
    <i data-lucide="map-pin" style="width:18px;height:18px;flex-shrink:0;color:var(--muted-2);"></i>
    <span style="flex:1;font-size:13px;color:var(--ink);">${escHtml(c.adres)}</span>
    <span style="font-size:12px;color:var(--accent);flex-shrink:0;">Kaart ↗</span>
  </a>`:''}
  <div class="fiche-meta" style="margin-top:10px;">
    <span style="font-size:12px;padding:4px 12px;border-radius:99px;font-weight:600;background:${kerstmis?'var(--rustig-bg)':'var(--bg-2)'};color:${kerstmis?'var(--rustig-clr)':'var(--muted)'};display:inline-flex;align-items:center;gap:4px;"><i data-lucide="tree-pine" style="width:12px;height:12px;"></i> Kerstkaart: ${kerstmis?'Ja':'Nee'}</span>
  </div>
  ${(c.belangrijkeDatums||[]).length?`
    <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin:14px 0 6px;">Belangrijke datums</div>
    ${(c.belangrijkeDatums||[]).map(bd=>{
      const d=new Date((bd.datum||'')+'T12:00:00');
      const dagStr=bd.datum?(bd.herhalend
        ?d.toLocaleDateString('nl-BE',{day:'numeric',month:'long'})
        :d.toLocaleDateString('nl-BE',{day:'numeric',month:'long',year:'numeric'})):'—';
      const dagen=bd.datum?_dagenTotVolgende(bd.datum,bd.herhalend):null;
      const binnenkort=dagen!==null&&dagen>=0&&dagen<=14;
      return `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--surface-2);border:1.5px solid var(--border);border-radius:var(--radius-sm);margin-bottom:6px;">
        ${bd.herhalend?'<i data-lucide="repeat" style="width:18px;height:18px;flex-shrink:0;color:var(--muted-2);"></i>':'<i data-lucide="calendar" style="width:18px;height:18px;flex-shrink:0;color:var(--muted-2);"></i>'}
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:600;color:var(--ink);">${escHtml(bd.label||'Datum')}</div>
          <div style="font-size:12px;color:var(--muted);">${dagStr}${bd.herhalend?' · jaarlijks':''}</div>
        </div>
        ${binnenkort?`<span style="font-size:11px;padding:2px 8px;border-radius:99px;background:var(--normaal-bg);color:var(--normaal-clr);font-weight:600;flex-shrink:0;">${dagen===0?'vandaag':dagen===1?'morgen':'over '+dagen+'d'}</span>`:''}
      </div>`;
    }).join('')}
  `:''}
  ${c.cadeauNj||c.cadeauVj?`<div class="fiche-sectie-label" style="margin-top:14px;">Cadeaus</div>`:''}
  ${c.cadeauNj?`<div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--radius-sm);padding:12px 14px;margin-bottom:10px;"><div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;display:flex;align-items:center;gap:4px;"><i data-lucide="party-popper" style="width:12px;height:12px;"></i> NIEUWJAAR</div><div style="font-size:14px;color:var(--ink);line-height:1.6;">${escHtml(c.cadeauNj)}</div></div>`:''}
  ${c.cadeauVj?`<div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--radius-sm);padding:12px 14px;margin-bottom:10px;"><div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;display:flex;align-items:center;gap:4px;"><i data-lucide="cake" style="width:12px;height:12px;"></i> VERJAARDAG</div><div style="font-size:14px;color:var(--ink);line-height:1.6;">${escHtml(c.cadeauVj)}</div></div>`:''}
  `;
}

function sluitContactFiche(){
  document.getElementById('crm-fiche-overlay').classList.remove('open');
}

// ── Modal openen ──────────────────────────────────────────────
function openCrmModal(contact){
  document.getElementById('crm-modal-titel').textContent=contact?'Contact bewerken':'Contact toevoegen';
  // Partner 1
  const p1=_parseObj(contact?.partner1)||{};
  document.getElementById('c-p1-voornaam').value=p1.voornaam||'';
  document.getElementById('c-p1-achternaam').value=p1.achternaam||'';
  document.getElementById('c-p1-verjaardag').value=p1.verjaardag||'';
  // Partner 2
  const p2=_parseObj(contact?.partner2)||{};
  document.getElementById('c-p2-voornaam').value=p2.voornaam||'';
  document.getElementById('c-p2-achternaam').value=p2.achternaam||'';
  document.getElementById('c-p2-verjaardag').value=p2.verjaardag||'';
  // Kinderen
  const kids=_parseObj(contact?.kinderenData)||[];
  _renderKinderenRijen(kids);
  // Kerstkaart
  _kerstkaartAan=contact?contact.kerstmis===true||contact.kerstmis==='ja'||contact.kerstmis===1:true;
  document.getElementById('c-kerstkaart-switch').className='ios-switch'+(_kerstkaartAan?' on':'');
  // Adres
  document.getElementById('c-adres').value=contact?.adres||'';
  // Belangrijke datums
  _renderDatumsRijen(contact?.belangrijkeDatums||[]);
  // Cadeaus
  document.getElementById('c-cadeau-nj').value=contact?.cadeauNj||'';
  document.getElementById('c-cadeau-vj').value=contact?.cadeauVj||'';
  document.getElementById('crm-modal-bg').dataset.editId=contact?.id||'';
  const el=document.getElementById('crm-modal-bg');
  el.classList.add('open');
  el.querySelector('.modal').scrollTop=0;
  // Google Places autocomplete op adresveld
  Maps.autocomplete(document.getElementById('c-adres'), adres => {
    document.getElementById('c-adres').value = adres;
  });
}
function closeCrmModal(){document.getElementById('crm-modal-bg').classList.remove('open');}

function saveContact(){
  const p1v=document.getElementById('c-p1-voornaam').value.trim();
  const p1a=document.getElementById('c-p1-achternaam').value.trim();
  if(!p1v&&!p1a){toonOpslagStatus('❌ Vul minstens de voornaam of achternaam van Partner 1 in.');return;}

  const partner1={voornaam:p1v,achternaam:p1a,verjaardag:document.getElementById('c-p1-verjaardag').value||''};
  const p2v=document.getElementById('c-p2-voornaam').value.trim();
  const p2a=document.getElementById('c-p2-achternaam').value.trim();
  const p2vj=document.getElementById('c-p2-verjaardag').value||'';
  const partner2=(p2v||p2a||p2vj)?{voornaam:p2v,achternaam:p2a,verjaardag:p2vj}:null;

  const kinderenData=_leesKinderenVelden();
  const editId=document.getElementById('crm-modal-bg').dataset.editId;
  const bestaande=editId?contacten.find(c=>c.id===editId):null;

  // Auto-generate family name
  const ach1=partner1.achternaam||'';
  const ach2=partner2?.achternaam||'';
  const naam=(ach1&&ach2&&ach1!==ach2)?`Familie ${ach1} ${ach2}`:
             ach1?`Familie ${ach1}`:
             `${partner1.voornaam} ${partner1.achternaam}`.trim();

  const contact={
    id:editId?parseInt(editId)||editId:Date.now(),
    _sbId:bestaande?._sbId,
    naam,
    partner1,
    partner2:partner2||null,
    kinderenData,
    kerstmis:_kerstkaartAan,
    cadeauNj:document.getElementById('c-cadeau-nj').value,
    cadeauVj:document.getElementById('c-cadeau-vj').value,
    adres:document.getElementById('c-adres').value.trim()||null,
    belangrijkeDatums:_leesDatumsVelden(),
  };

  if(editId)contacten=contacten.map(c=>c.id===editId?contact:c);
  else contacten.push(contact);
  closeCrmModal();renderCrm();renderVerjaarDagAlerts();slaLokaalOp();sbSaveContact(contact);toonOpslagStatus('✅ Opgeslagen');
}

function editContact(id){openCrmModal(contacten.find(c=>c.id===id||c.id===id));}
function verwijderContact(id){
  _bevestig('Contact verwijderen?', function(){
    const c=contacten.find(c=>c.id===id||c.id===id);
    contacten=contacten.filter(c=>c.id!==id&&c.id!=id);
    if(actieveContactId==id){ actieveContactId=null; _clearContactFiche(); document.getElementById('crm-fiche-overlay').classList.remove('open'); }
    renderCrm();slaLokaalOp();if(c?._sbId)sbDeleteContact(c._sbId);toonOpslagStatus('✅ Verwijderd');
  });
}
document.getElementById('crm-modal-bg').addEventListener('click',e=>{if(e.target===document.getElementById('crm-modal-bg'))closeCrmModal();});

// ── Extra event listeners ─────────────────────────────────────
document.getElementById('crm-search')?.addEventListener('input', renderCrm);

document.getElementById('crm-fiche-overlay')?.addEventListener('click', function(e) {
  if (e.target === this) sluitContactFiche();
});

// ── Profiel dropdown ──────────────────────────────────────────
document.addEventListener('click', function(e){
  if (!e.target.closest('#topbar-user') && !e.target.closest('#profiel-menu'))
    document.getElementById('profiel-menu')?.classList.remove('open');
});

// ── Event delegation ──────────────────────────────────────────
document.addEventListener('click', function(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  switch (action) {
    case 'open-contact-fiche':
      openContactFiche(el.dataset.id);
      break;
    case 'edit-contact':
      e.stopPropagation();
      editContact(el.dataset.id);
      break;
    case 'verwijder-contact':
      e.stopPropagation();
      verwijderContact(el.dataset.id);
      break;
    case 'sluit-contact-fiche':
      e.stopPropagation();
      sluitContactFiche();
      break;
    case 'verwijder-kind':
      e.stopPropagation();
      verwijderKind(Number(el.dataset.index));
      break;
    case 'verwijder-datum':
      e.stopPropagation();
      verwijderDatum(Number(el.dataset.index));
      break;
    case 'toggle-profiel-menu':
      document.getElementById('profiel-menu')?.classList.toggle('open');
      break;
    case 'open-crm-modal':
      openCrmModal();
      break;
    case 'voeg-kind-toe':
      voegKindToe();
      break;
    case 'voeg-datum-toe':
      voegBelangrijkeDatumToe();
      break;
    case 'toggle-kerstkaart':
      toggleKerstkaart();
      break;
    case 'close-crm-modal':
      closeCrmModal();
      break;
    case 'save-contact':
      saveContact();
      break;
  }
});

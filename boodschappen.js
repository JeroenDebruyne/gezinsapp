Auth.initPagina('boodschappen');
let activeWinkel=sessionStorage.getItem('bood_winkel')||'Alles';
// afgevinkt: volledig vanuit Supabase, localStorage als offline-fallback
let afgevinkt={};

function _slaAfgevinktOp(){localStorage.setItem('gezinsapp_afgevinkt',JSON.stringify(afgevinkt));}

function _herbouwAfgevinkt(){
  afgevinkt={};
  boodschappenReceptItems.forEach(i=>{ if(i.afgevinkt) afgevinkt['ing_'+i.naam.toLowerCase()]=true; });
  extraItems.forEach(i=>{ if(i.afgevinkt) afgevinkt['extra_'+i.id]=true; });
  _slaAfgevinktOp();
}

laadOp().then(()=>{
  _herbouwAfgevinkt();
  renderWinkelTabs();renderBoodschappen();renderExtraItems();initBoodWinkelSel();
}).catch(()=>{
  afgevinkt=JSON.parse(localStorage.getItem('gezinsapp_afgevinkt')||'{}');
  laadLokaal();renderWinkelTabs();renderBoodschappen();renderExtraItems();initBoodWinkelSel();
});
onGezinsappUpdate(()=>{ _herbouwAfgevinkt(); renderWinkelTabs(); renderBoodschappen(); renderExtraItems(); initBoodWinkelSel(); });
AppState.subscribe('extraItems', ()=>{ renderBoodschappen(); renderExtraItems(); });
AppState.subscribe('boodschappenReceptItems', renderBoodschappen);

function renderWinkelTabs(){
  document.getElementById('winkel-tabs').innerHTML=['Alles',...WINKELS].map(w=>
    `<button class="ptab${activeWinkel===w?' active':''}" data-action="switch-winkel" data-winkel="${escHtml(w)}">${escHtml(w)}</button>`
  ).join('');
  const mobSel=document.getElementById('winkel-sel-mob');
  if(mobSel){mobSel.innerHTML=['Alles',...WINKELS].map(w=>`<option value="${w}"${activeWinkel===w?' selected':''}>${w}</option>`).join('');}
}
function switchWinkel(w){activeWinkel=w;sessionStorage.setItem('bood_winkel',w);renderWinkelTabs();renderBoodschappen();renderExtraItems();}

// Groepeer boodschappenReceptItems per naam voor een winkel
function _ingVoorWinkel(w){
  const perNaam={};
  boodschappenReceptItems.filter(i=>i.winkel===w).forEach(i=>{
    const key=i.naam.toLowerCase();
    if(!perNaam[key]) perNaam[key]={naam:i.naam,eenheid:i.eenheid,_sbId:i._sbId,gebruiken:[]};
    (i.receptNaam||'').split(', ').forEach(r=>{ if(r&&!perNaam[key].gebruiken.find(g=>g.recept===r)) perNaam[key].gebruiken.push({hoev:i.hoev,recept:r}); });
  });
  return Object.values(perNaam);
}

function _ingItemHtml(item){
  const key='ing_'+item.naam.toLowerCase();const gedaan=afgevinkt[key];
  return `<div class="boodschap-item" data-action="toggle-afgevinkt" data-key="${key}" style="${gedaan?'opacity:.4;':''}">
    <div class="boodschap-cirkel${gedaan?' gedaan':''}"></div>
    <div style="flex:1;">
      <div style="font-size:14px;font-weight:500;color:var(--ink);${gedaan?'text-decoration:line-through;':''}">${escHtml(item.naam)}</div>
      ${item.gebruiken.map(g=>`<div style="font-size:12px;color:var(--muted);display:flex;justify-content:space-between;"><span>${escHtml(g.recept)}</span><span style="font-weight:500;">${escHtml(g.hoev||'')} ${escHtml(item.eenheid||'')}</span></div>`).join('')}
      ${item.gebruiken.length>1?`<div style="font-size:11px;color:var(--muted-2);margin-top:2px;">${item.gebruiken.length}× nodig</div>`:''}
    </div>
  </div>`;
}

function _extraItemHtml(i){
  const key='extra_'+i.id;const gedaan=afgevinkt[key];
  return `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);">
    <div class="boodschap-cirkel${gedaan?' gedaan':''}" data-action="toggle-afgevinkt" data-key="${key}" style="${gedaan?'opacity:.5;':''}"></div>
    <span style="flex:1;font-size:14px;font-weight:500;color:var(--ink);${gedaan?'text-decoration:line-through;opacity:.5;':''}">${escHtml(i.naam)}</span>
    <span class="extra-badge">Extra</span>
    <button data-action="verwijder-extra" data-id="${i.id}" style="background:none;border:none;cursor:pointer;color:var(--muted-2);font-size:18px;line-height:1;">×</button>
  </div>`;
}

function _updateVoortgang(aantalAfgevinkt,totaal){
  const wrap=document.getElementById('voortgang-wrap');
  if(totaal>0){
    wrap.style.display='block';
    document.getElementById('voortgang-tekst').textContent=`${aantalAfgevinkt} van ${totaal} in mandje`;
    document.getElementById('btn-verwijder-afgevinkt').style.display=aantalAfgevinkt>0?'flex':'none';
  } else {
    wrap.style.display='none';
  }
}

const _geenLijstHtml=`<div class="empty-state"><i data-lucide="shopping-cart" class="empty-icon"></i><p>Nog geen boodschappenlijst.<br>Ga naar <a href="weekplanner.html" style="color:var(--accent);">Maaltijden</a> en klik <strong><i data-lucide="shopping-cart" class="icon-inline"></i> Voeg toe aan lijst</strong>.</p></div>`;

function renderBoodschappen(){
  const label=document.getElementById('extra-items-label');
  const geenSnap=!boodschappenReceptItems.length;

  if(activeWinkel==='Alles'){
    if(label)label.style.display='none';
    if(geenSnap&&!extraItems.length){
      document.getElementById('boodschappen-inhoud').innerHTML=_geenLijstHtml;
      _updateVoortgang(0,0); return;
    }
    let totaal=0,afgevinktAantal=0,html='';
    WINKELS.forEach(w=>{
      const items=_ingVoorWinkel(w);
      const extras=extraItems.filter(i=>i.winkel===w);
      if(!items.length&&!extras.length)return;
      totaal+=items.length+extras.length;
      afgevinktAantal+=items.filter(i=>afgevinkt['ing_'+i.naam.toLowerCase()]).length
                       +extras.filter(i=>afgevinkt['extra_'+i.id]).length;
      html+=`<div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.09em;margin:1.25rem 0 6px;padding-bottom:6px;border-bottom:2px solid var(--accent-l);">🏪 ${w}</div>`;
      html+=items.map(i=>_ingItemHtml(i)).join('');
      html+=extras.map(i=>_extraItemHtml(i)).join('');
    });
    _updateVoortgang(afgevinktAantal,totaal);
    document.getElementById('boodschappen-inhoud').innerHTML=html;
    return;
  }

  if(label)label.style.display='';
  const items=_ingVoorWinkel(activeWinkel);
  if(geenSnap&&!items.length){
    document.getElementById('boodschappen-inhoud').innerHTML=_geenLijstHtml;
    _updateVoortgang(0,0); return;
  }
  const aantalAfgevinkt=items.filter(i=>afgevinkt['ing_'+i.naam.toLowerCase()]).length;
  _updateVoortgang(aantalAfgevinkt,items.length);
  document.getElementById('boodschappen-inhoud').innerHTML=items.length===0
    ?`<div class="empty-state"><i data-lucide="check-circle" class="empty-icon"></i><p>Geen items meer voor ${activeWinkel}</p></div>`
    :items.map(i=>_ingItemHtml(i)).join('');
}

function renderExtraItems(){
  if(activeWinkel==='Alles'){document.getElementById('extra-items-lijst').innerHTML='';return;}
  const voor=extraItems.filter(i=>i.winkel===activeWinkel);
  document.getElementById('extra-items-lijst').innerHTML=voor.length===0
    ?`<p style="font-size:13px;color:var(--muted);padding:6px 0;">Geen extra items voor ${activeWinkel}</p>`
    :voor.map(i=>_extraItemHtml(i)).join('');
}

function _getSbIdVoorKey(key){
  if(key.startsWith('ing_')){
    const naam=key.slice(4);
    return boodschappenReceptItems.find(i=>i.naam.toLowerCase()===naam)?._sbId||null;
  }
  if(key.startsWith('extra_')){
    return extraItems.find(i=>i.id===+key.slice(6))?._sbId||null;
  }
  return null;
}

let _undoTimer = null;
function _toonUndoToast(bericht, onUndo) {
  clearTimeout(_undoTimer);
  let toast = document.getElementById('bood-undo-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'bood-undo-toast';
    toast.className = 'undo-toast';
    document.body.appendChild(toast);
  }
  toast.innerHTML = `<span>${escHtml(bericht)}</span><button class="undo-toast-btn">Ongedaan maken</button>`;
  toast.classList.add('open');
  toast.querySelector('.undo-toast-btn').addEventListener('click', function() {
    onUndo();
    toast.classList.remove('open');
    clearTimeout(_undoTimer);
  }, { once: true });
  _undoTimer = setTimeout(() => toast.classList.remove('open'), 4000);
}

function toggleAfgevinkt(key){
  const wasAfgevinkt = !!afgevinkt[key];
  afgevinkt[key]=!afgevinkt[key];
  _slaAfgevinktOp();
  // Sync to Supabase
  if(key.startsWith('ing_')){
    const naam=key.slice(4);
    const item=boodschappenReceptItems.find(i=>i.naam.toLowerCase()===naam);
    if(item?._sbId) sbToggleAfgevinktItem(item._sbId, !!afgevinkt[key]);
  } else if(key.startsWith('extra_')){
    const id=key.slice(6);
    const item=extraItems.find(i=>String(i.id)===id||String(i._sbId)===id);
    if(item?._sbId) sbToggleAfgevinktItem(item._sbId, !!afgevinkt[key]);
  }
  renderBoodschappen();renderExtraItems();
  // Undo toast alleen bij afvinken (niet bij terugzetten)
  if (!wasAfgevinkt) {
    const naam = key.startsWith('ing_') ? key.slice(4) : (extraItems.find(i=>'extra_'+i.id===key)?.naam||'');
    if (naam) _toonUndoToast(naam.charAt(0).toUpperCase()+naam.slice(1) + ' afgevinkt', function() { toggleAfgevinkt(key); });
  }
}

function resetAfgevinkt(){
  afgevinkt={};_slaAfgevinktOp();
  renderBoodschappen();renderExtraItems();
}

function verwijderAfgevinkt(){
  // Verwijder afgevinkte recept-items — per item op _sbId zodat Supabase sync betrouwbaar is
  const wegRecept=boodschappenReceptItems.filter(i=>afgevinkt['ing_'+i.naam.toLowerCase()]);
  wegRecept.forEach(i=>{ if(i._sbId) sbDeleteExtra(i._sbId); });
  boodschappenReceptItems=boodschappenReceptItems.filter(i=>!afgevinkt['ing_'+i.naam.toLowerCase()]);
  // Verwijder afgevinkte extra-items
  const wegExtra=extraItems.filter(i=>afgevinkt['extra_'+i.id]);
  wegExtra.forEach(i=>{extraItems=extraItems.filter(e=>e.id!==i.id);if(i._sbId)sbDeleteExtra(i._sbId);});
  afgevinkt={};_slaAfgevinktOp();
  slaLokaalOp();renderBoodschappen();renderExtraItems();
}
function initBoodWinkelSel(){
  const sel=document.getElementById('bood-winkel-sel');
  if(!sel)return;
  sel.innerHTML=WINKELS.map(w=>`<option${w===activeWinkel?' selected':''}>${w}</option>`).join('');
}

function filterBoodCombo(){
  const input=document.getElementById('bood-combo-input');
  const dd=document.getElementById('bood-combo-dd');
  const zoek=(input.value||'').toLowerCase().trim();
  const matches=standaardIngredienten.filter(i=>i.naam.toLowerCase().includes(zoek)).slice(0,8);
  let html=matches.map(i=>`
    <div class="ing-combo-option" data-action="kies-bood-ing" data-naam="${escHtml(i.naam)}" data-winkel="${escHtml(i.winkel)}">
      <span>${escHtml(i.naam)}</span>
      <span class="winkel-hint"><i data-lucide="store" style="width:11px;height:11px;display:inline-block;vertical-align:-0.1em;"></i> ${escHtml(i.winkel)}</span>
    </div>`).join('');
  const bestaatExact=standaardIngredienten.some(i=>i.naam.toLowerCase()===zoek);
  if(zoek&&!bestaatExact){
    html+=`<div class="ing-combo-nieuw" data-action="kies-bood-nieuw" data-naam="${escHtml(input.value)}">
      ✨ Nieuw ingrediënt: <strong>${escHtml(input.value)}</strong>
    </div>`;
  }
  dd.innerHTML=html;
  dd.classList.toggle('open',html.length>0);
}

function kiesBoodIng(naam,winkel){
  document.getElementById('bood-combo-input').value=naam;
  const sel=document.getElementById('bood-winkel-sel');
  if(sel&&winkel){for(let o of sel.options){if(o.value===winkel){sel.value=winkel;break;}}}
  sluitBoodCombo();
}

function kiesBoodNieuw(naam){
  document.getElementById('bood-combo-input').value=naam;
  sluitBoodCombo();
}

function sluitBoodCombo(){
  document.getElementById('bood-combo-dd')?.classList.remove('open');
}

function voegExtraToe(){
  const input=document.getElementById('bood-combo-input');
  const naam=(input?.value||'').trim();
  if(!naam){ toonOpslagStatus('❌ Vul een naam in.'); return; }
  const winkel=document.getElementById('bood-winkel-sel')?.value||activeWinkel;
  // Sla op als nieuw standaard-ingrediënt als het nog niet bestaat
  const bestaatAl=standaardIngredienten.some(i=>i.naam.toLowerCase()===naam.toLowerCase());
  if(!bestaatAl){
    const nieuwIng={id:_maakId(),naam,winkel,categorie:'',productLink:null};
    standaardIngredienten.push(nieuwIng);
    sbSaveIngredient(nieuwIng);
  } else {
    // Update winkel als die veranderd is
    const ing=standaardIngredienten.find(i=>i.naam.toLowerCase()===naam.toLowerCase());
    if(ing&&ing.winkel!==winkel){ing.winkel=winkel;sbSaveIngredient(ing);}
  }
  const nieuwItem={id:_maakId(),naam,winkel};
  extraItems.push(nieuwItem);
  if(input)input.value='';
  renderBoodschappen();renderExtraItems();slaLokaalOp();sbSaveExtra(nieuwItem);toonOpslagStatus('✅ Toegevoegd');
}

function verwijderExtra(id){const item=extraItems.find(i=>i.id===id);extraItems=extraItems.filter(i=>i.id!==id);renderBoodschappen();renderExtraItems();slaLokaalOp();if(item?._sbId)sbDeleteExtra(item._sbId);toonOpslagStatus('✅ Verwijderd');}

function wijzigIngWinkel(naam,nieuweWinkel){
  const ing=standaardIngredienten.find(i=>i.naam.toLowerCase()===naam.toLowerCase());
  if(ing){ing.winkel=nieuweWinkel;slaLokaalOp();sbSaveIngredient(ing);toonOpslagStatus('✅ Opgeslagen');}
  activeWinkel=nieuweWinkel;
  renderWinkelTabs();renderBoodschappen();renderExtraItems();
}

// ── Combo input & winkel select event listeners ───────────────
const _boodCombo = document.getElementById('bood-combo-input');
if (_boodCombo) {
  _boodCombo.addEventListener('input', filterBoodCombo);
  _boodCombo.addEventListener('focus', filterBoodCombo);
  _boodCombo.addEventListener('blur', () => setTimeout(sluitBoodCombo, 150));
  _boodCombo.addEventListener('keydown', function(e) {
    const dd = document.getElementById('bood-combo-dd');
    if (e.key === 'Escape') { sluitBoodCombo(); return; }
    if (dd && dd.classList.contains('open')) {
      const items = [...dd.querySelectorAll('[data-action="kies-bood-ing"],[data-action="kies-bood-nieuw"]')];
      const current = dd.querySelector('.combo-focus');
      let idx = current ? items.indexOf(current) : -1;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (current) current.classList.remove('combo-focus');
        idx = (idx + 1) % items.length;
        items[idx].classList.add('combo-focus');
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (current) current.classList.remove('combo-focus');
        idx = (idx - 1 + items.length) % items.length;
        items[idx].classList.add('combo-focus');
        return;
      }
      if (e.key === 'Enter' && current) {
        e.preventDefault();
        if (current.dataset.action === 'kies-bood-ing') kiesBoodIng(current.dataset.naam, current.dataset.winkel);
        else kiesBoodNieuw(current.dataset.naam);
        return;
      }
    }
    if (e.key === 'Enter') voegExtraToe();
  });
}
document.getElementById('winkel-sel-mob')?.addEventListener('change', e => switchWinkel(e.target.value));

// ── Profiel dropdown ──────────────────────────────────────────
document.addEventListener('click', function(e){
  if (!e.target.closest('#topbar-user') && !e.target.closest('#profiel-menu'))
    document.getElementById('profiel-menu')?.classList.remove('open');
});

// ── Event delegation (click) ──────────────────────────────────
document.addEventListener('click', function(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  switch (action) {
    case 'toggle-afgevinkt': toggleAfgevinkt(el.dataset.key); break;
    case 'verwijder-extra': verwijderExtra(+el.dataset.id); break;
    case 'verwijder-afgevinkt': verwijderAfgevinkt(); break;
    case 'reset-afgevinkt': resetAfgevinkt(); break;
    case 'voeg-extra-toe': voegExtraToe(); break;
    case 'switch-winkel': switchWinkel(el.dataset.winkel); break;
    case 'toggle-profiel-menu': document.getElementById('profiel-menu')?.classList.toggle('open'); break;
  }
});

// ── Event delegation (mousedown — combo dropdown) ─────────────
document.addEventListener('mousedown', function(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  if (action === 'kies-bood-ing') kiesBoodIng(el.dataset.naam, el.dataset.winkel);
  else if (action === 'kies-bood-nieuw') kiesBoodNieuw(el.dataset.naam);
});

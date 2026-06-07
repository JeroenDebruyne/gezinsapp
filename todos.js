// ── Init ──────────────────────────────────────────────────────
Auth.initPagina('todos');

let actieveFilter = 'mijn';
let todoEditId    = null;
let priveAan      = false;
let geselecteerdePersonen = [];
let geselecteerdePrio = 'middel';

const _KLEUR_ROT = ['#5e5ce6','#ff6b9d','#30d158','#ff9f0a','#007aff','#ff3b30','#34c759','#5ac8fa'];
function getKleur(key) {
  const idx = Auth.getProfielen().findIndex(p => p.persoonKey === key);
  return _KLEUR_ROT[(idx >= 0 ? idx : 0) % _KLEUR_ROT.length];
}
const PRIO_KLEUR = { hoog:'#ff453a', middel:'#ff9f0a', laag:'#30d158' };

// ── Laden ─────────────────────────────────────────────────────
laadOp().then(renderTodos).catch(()=>{ laadLokaal(); renderTodos(); });

if(typeof BroadcastChannel!=='undefined'){
  new BroadcastChannel('gezinsapp_data').onmessage=()=>{ laadLokaal(); renderTodos(); };
}
onGezinsappUpdate(renderTodos);

// ── Filter ────────────────────────────────────────────────────
function setFilter(filter, el) {
  actieveFilter = filter;
  document.querySelectorAll('.filter-tab').forEach(t=>t.classList.remove('active'));
  if(el) el.classList.add('active');
  else document.querySelector(`.filter-tab[data-filter="${filter}"]`)?.classList.add('active');
  const sel=document.getElementById('filter-sel-mob');
  if(sel) sel.value=filter;
  renderTodos();
}

// ── Render ────────────────────────────────────────────────────
function renderTodos() {
  const vandaagISO = fDateISO(new Date());
  const mijnKey    = Auth.profiel()?.persoonKey;

  // Privé filter: anderen zien jouw privé niet
  const zichtbaar = todos.filter(t => {
    if (!t.prive) return true;
    if (Auth.kan('kanAllesZien')) return true;
    return (t.wie||[]).includes(mijnKey);
  });

  // Filter toepassen
  let gefilterd;
  switch (actieveFilter) {
    case 'mijn':
      gefilterd = zichtbaar.filter(t=>!t.gedaan && (t.wie||[]).includes(mijnKey));
      break;
    case 'vandaag':
      gefilterd = zichtbaar.filter(t=>!t.gedaan && t.deadline===vandaagISO);
      break;
    default:
      gefilterd = todos.slice(); // alle to-do's van iedereen, ook afgewerkt
  }

  // Sorteren: verlopen eerst, dan prioriteit, dan deadline
  gefilterd.sort((a,b)=>{
    if (a.gedaan !== b.gedaan) return a.gedaan?1:-1;
    const verlA = !a.gedaan && a.deadline && a.deadline < vandaagISO;
    const verlB = !b.gedaan && b.deadline && b.deadline < vandaagISO;
    if (verlA !== verlB) return verlA?-1:1;
    const prioOrder = { hoog:0, middel:1, laag:2 };
    const po = (prioOrder[a.prioriteit]??1) - (prioOrder[b.prioriteit]??1);
    if (po!==0) return po;
    if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return 0;
  });

  // Badge counts
  const cntMijn    = zichtbaar.filter(t=>!t.gedaan&&(t.wie||[]).includes(mijnKey)).length;
  const cntVandaag = zichtbaar.filter(t=>!t.gedaan&&t.deadline===vandaagISO).length;
  const cntAlle    = todos.length;
  function _setBadge(id, n) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = n > 0 ? n : '';
    el.style.display = n > 0 ? '' : 'none';
  }
  _setBadge('badge-mijn',    cntMijn);
  _setBadge('badge-vandaag', cntVandaag);
  _setBadge('badge-alle',    cntAlle);

  // Lijst
  const el = document.getElementById('todo-lijst');
  if (!gefilterd.length) {
    const labels = { mijn:'Geen openstaande to-do\'s voor jou', vandaag:'Niets gepland voor vandaag', alle:'Nog geen to-do\'s' };
    el.innerHTML = `<div class="leeg">
      <div class="leeg-icon"><i data-lucide="check-circle" class="leeg-icon"></i></div>
      <div class="leeg-titel">${labels[actieveFilter]||'Geen to-do\'s'}</div>
      <div class="leeg-sub">${actieveFilter==='mijn'?'Tik op + om een to-do toe te voegen':''}</div>
    </div>`;
    return;
  }

  el.innerHTML = gefilterd.map(t => {
    const deadlineBadge = maakDeadlineBadge(t.deadline, vandaagISO, t.gedaan);
    const wieBadges = (t.wie||[]).map(w=>`
      <span class="todo-badge" style="background:${getKleur(w)}22;color:${getKleur(w)};">
        ${PEMOJI[w]||''} ${escHtml(PLABEL[w]||w)}
      </span>`).join('');
    const duurLabel = t.duur ? `<i data-lucide="timer" class="icon-inline"></i> ${t.duur>=60?Math.round(t.duur/60)+'u':t.duur+'min'}` : '';
    const kanBewerken = Auth.kan('kanTodosBeheren') || (t.wie||[]).includes(mijnKey);

    return `
    <div class="todo-item${t.gedaan?' gedaan':''}">
      <button class="todo-cirkel${t.gedaan?' gedaan':''}${!t.gedaan?' '+t.prioriteit:''}"
        data-action="toggle-todo" data-id="${Number(t.id)}"></button>
      <div class="todo-body${kanBewerken?' todo-body-bewerkbaar':''}" ${kanBewerken?`data-action="edit-todo" data-id="${Number(t.id)}"`:'style="cursor:default"'}>
        <div class="todo-titel${t.gedaan?' gedaan':''}">${escHtml(t.titel)}</div>
        ${t.notitie?`<div style="font-size:12px;color:var(--muted);margin-top:2px;">${escHtml(t.notitie)}</div>`:''}
        <div class="todo-meta" style="margin-top:5px;">
          ${deadlineBadge}
          ${duurLabel?`<span style="font-size:11px;">${duurLabel}</span>`:''}
          ${wieBadges}
          ${t.prive?`<span class="prive-badge"><i data-lucide="lock" class="icon-inline"></i> Privé</span>`:''}
        </div>
      </div>
      ${kanBewerken?`<div class="todo-acties">
        <button class="todo-icon-btn" data-action="verwijder-todo" data-id="${t.id}" title="Verwijderen"><i data-lucide="trash-2" class="icon-inline"></i></button>
      </div>`:''}
    </div>`;
  }).join('');
}

function maakDeadlineBadge(deadline, vandaag, gedaan) {
  if (!deadline || gedaan) return '';
  const morgen = new Date(); morgen.setDate(morgen.getDate()+1);
  const morgenISO = fDateISO(morgen);
  const d = new Date(deadline+'T12:00:00');
  const label = d.toLocaleDateString('nl-BE',{day:'numeric',month:'short'});
  if (deadline < vandaag) return `<span class="todo-deadline-badge deadline-verlopen"><i data-lucide="triangle-alert" class="icon-inline"></i> Verlopen: ${label}</span>`;
  if (deadline === vandaag) return `<span class="todo-deadline-badge deadline-vandaag"><i data-lucide="calendar" class="icon-inline"></i> Vandaag</span>`;
  if (deadline === morgenISO) return `<span class="todo-deadline-badge deadline-morgen"><i data-lucide="calendar" class="icon-inline"></i> Morgen</span>`;
  return `<span class="todo-deadline-badge deadline-ok"><i data-lucide="calendar" class="icon-inline"></i> ${label}</span>`;
}

// ── Toggle gedaan ─────────────────────────────────────────────
function toggleTodo(id) {
  const t = todos.find(x=>x.id==id);
  if (!t) return;
  t.gedaan = !t.gedaan;
  t.gedaanOp = t.gedaan ? fDateISO(new Date()) : null;
  slaLokaalOp();
  sbSaveTodo(t);
  renderTodos();
}

// ── Modal ─────────────────────────────────────────────────────
function openModal(todo) {
  todoEditId = todo?.id || null;
  priveAan   = todo?.prive || false;
  geselecteerdePersonen = todo ? [...(todo.wie||[])] : [Auth.profiel()?.persoonKey].filter(Boolean);
  geselecteerdePrio = todo?.prioriteit || 'middel';

  document.getElementById('modal-titel').textContent = todo ? 'To-do bewerken' : 'Nieuwe to-do';
  document.getElementById('t-titel').value    = todo?.titel||'';
  document.getElementById('t-notitie').value  = todo?.notitie||'';
  document.getElementById('t-deadline').value = todo?.deadline||'';
  document.getElementById('t-duur').value     = todo?.duur||'';

  updatePriveSwitch();
  renderPersonenMS();
  updatePrioBtns();

  // Verwijder knop tonen bij bewerken
  const actions = document.getElementById('modal-actions');
  actions.innerHTML = todo
    ? `<button class="modal-btn modal-btn-danger" data-action="verwijder-todo" data-id="${todo.id}">Verwijderen</button>
       <button class="modal-btn modal-btn-cancel" data-action="close-modal">Annuleren</button>
       <button class="modal-btn modal-btn-primary" data-action="save-todo">Opslaan</button>`
    : `<button class="modal-btn modal-btn-cancel" data-action="close-modal">Annuleren</button>
       <button class="modal-btn modal-btn-primary" data-action="save-todo">Opslaan</button>`;

  document.getElementById('todo-modal-bg').classList.add('open');
  setTimeout(()=>document.getElementById('t-titel').focus(), 100);
}
function editTodo(id) { openModal(todos.find(t=>t.id==id)); }
function _teugNaarHome(){ if (new URLSearchParams(location.search).get('van')==='home') location.href='index.html'; }
function closeModal() {
  const el=document.getElementById('todo-modal-bg');
  const wasOpen=el.classList.contains('open');
  el.classList.remove('open');
  if(wasOpen) _teugNaarHome();
}

function renderPersonenMS() {
  document.getElementById('t-wie-ms').innerHTML = PERSONEN.map(p=>
    `<div class="persoon-chip${geselecteerdePersonen.includes(p)?' selected':''}" data-action="toggle-persoon" data-persoon="${p}">
      ${PEMOJI[p]} ${PLABEL[p]}
    </div>`).join('');
}
function togglePersoon(p) {
  geselecteerdePersonen = geselecteerdePersonen.includes(p)
    ? geselecteerdePersonen.filter(x=>x!==p)
    : [...geselecteerdePersonen, p];
  renderPersonenMS();
}
function setPrio(prio, el) {
  geselecteerdePrio = prio;
  updatePrioBtns();
}
function updatePrioBtns() {
  document.querySelectorAll('.prio-btn').forEach(btn=>{
    btn.classList.toggle('selected', btn.classList.contains(geselecteerdePrio));
  });
}
function togglePrive() { priveAan=!priveAan; updatePriveSwitch(); }
function updatePriveSwitch() {
  document.getElementById('prive-switch').className='ios-switch'+(priveAan?' on':'');
}

function saveTodo() {
  const titel = document.getElementById('t-titel').value.trim();
  if (!titel) {
    const inp = document.getElementById('t-titel');
    inp.style.borderColor = 'var(--accent)';
    inp.focus();
    let err = document.getElementById('t-titel-err');
    if (!err) { err = document.createElement('p'); err.id = 't-titel-err'; err.style.cssText = 'color:var(--accent);font-size:12px;margin-top:4px;'; inp.parentNode.insertBefore(err, inp.nextSibling); }
    err.textContent = 'Geef een beschrijving in.';
    inp.addEventListener('input', function() { inp.style.borderColor = ''; if (err) err.textContent = ''; }, { once: true });
    return;
  }

  const bestaande = todoEditId ? todos.find(t=>t.id==todoEditId) : null;
  const todo = {
    id:       todoEditId || String(_maakId()),
    _sbId:    bestaande?._sbId,
    titel,
    notitie:  document.getElementById('t-notitie').value.trim(),
    deadline: document.getElementById('t-deadline').value,
    duur:     parseInt(document.getElementById('t-duur').value)||null,
    prioriteit: geselecteerdePrio,
    wie:      geselecteerdePersonen,
    prive:    priveAan,
    gedaan:   bestaande?.gedaan||false,
    gedaanOp: bestaande?.gedaanOp||null,
    aangemaaktDoor: Auth.profiel()?.persoonKey,
    aangemaaktOp:   bestaande?.aangemaaktOp || fDateISO(new Date()),
  };

  if (todoEditId) todos = todos.map(t=>t.id==todoEditId?todo:t);
  else todos.push(todo);

  slaLokaalOp();
  sbSaveTodo(todo);
  toonOpslagStatus('✅ Opgeslagen');
  closeModal();
  renderTodos();
}

function verwijderTodo(id) {
  _bevestig('To-do verwijderen?', function() {
    const t = todos.find(x=>x.id==id);
    todos = todos.filter(x=>x.id!=id);
    closeModal();
    slaLokaalOp();
    if (t?._sbId) sbDeleteTodo(t._sbId);
    toonOpslagStatus('✅ Verwijderd');
    renderTodos();
  });
}

// sbSaveTodo en sbDeleteTodo zijn gedefinieerd in data.js (inclusief gezin_id)

// Sluit modal bij klik op achtergrond
document.getElementById('todo-modal-bg').addEventListener('click', e=>{
  if (e.target===document.getElementById('todo-modal-bg')) { closeModal(); _teugNaarHome(); }
});

// Enter = opslaan
document.getElementById('t-titel').addEventListener('keydown', e=>{
  if (e.key==='Enter') saveTodo();
});

// Auto-open als ?nieuw=1
if (new URLSearchParams(location.search).get('nieuw')==='1') {
  window.addEventListener('load',()=>setTimeout(openModal,300));
}

// ── Mobile filter select ──────────────────────────────────────
document.getElementById('filter-sel-mob')?.addEventListener('change', e => {
  setFilter(e.target.value, null);
});

// ── Profiel dropdown ──────────────────────────────────────────
document.addEventListener('click', function(e){
  if (!e.target.closest('#topbar-user') && !e.target.closest('#profiel-menu'))
    document.getElementById('profiel-menu')?.classList.remove('open');
});

// ── Sluitknop injecteren in modals ────────────────────────────
document.addEventListener('DOMContentLoaded', function(){
  document.querySelectorAll('.modal-bg .modal').forEach(modal => {
    if(modal.querySelector('.modal-sluit-btn')) return;
    const bg = modal.closest('.modal-bg');
    const btn = document.createElement('button');
    btn.className = 'modal-sluit-btn';
    btn.setAttribute('aria-label', 'Sluiten');
    btn.textContent = '✕';
    btn.addEventListener('click', function(e){
      e.stopPropagation();
      if(bg) bg.classList.remove('open');
      _teugNaarHome();
    });
    modal.insertBefore(btn, modal.firstChild);
  });
});

// ── Event delegation ──────────────────────────────────────────
document.addEventListener('click', function(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  switch (action) {
    case 'toggle-todo':
      toggleTodo(Number(el.dataset.id));
      break;
    case 'edit-todo':
      editTodo(Number(el.dataset.id));
      break;
    case 'verwijder-todo':
      verwijderTodo(el.dataset.id);
      break;
    case 'open-modal':
      openModal();
      break;
    case 'close-modal':
      closeModal();
      break;
    case 'save-todo':
      saveTodo();
      break;
    case 'set-prio':
      setPrio(el.dataset.prio, el);
      break;
    case 'toggle-prive':
      togglePrive();
      break;
    case 'toggle-persoon':
      togglePersoon(el.dataset.persoon);
      break;
    case 'filter-tab':
      setFilter(el.dataset.filter, el);
      break;
    case 'toggle-profiel-menu':
      document.getElementById('profiel-menu')?.classList.toggle('open');
      break;
  }
});

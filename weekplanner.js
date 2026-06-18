Auth.initPagina('weekplanner');
let weekOffsetP = +(sessionStorage.getItem('weekplanner_offset') || 0), activeSlot = null, selectedKeuze = null, selectedWie = [];
let aiMenuVoorstel = null, chatGeschiedenisWP = [];
let _openDagen = new Set();

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
  toonOpslagStatus('✅ Opgeslagen');
}

function _persKok() {
  return Auth.getProfielen().filter(p => p.rol !== 'kind').map(p => p.persoonKey);
}

laadOp().then(renderPlanner).catch(() => { laadLokaal(); renderPlanner(); });

if (typeof BroadcastChannel !== 'undefined') {
  new BroadcastChannel('gezinsapp_data').onmessage = () => { laadLokaal(); renderPlanner(); };
}
onGezinsappUpdate(renderPlanner);
AppState.subscribe('planning', renderPlanner);
AppState.subscribe('recepten', renderPlanner);

function changeWeekP(dir) { weekOffsetP += dir; sessionStorage.setItem('weekplanner_offset', weekOffsetP); _openDagen.clear(); renderPlanner(); }

function renderPlanner() {
  const dates = getWeekDates(weekOffsetP);
  document.getElementById('week-lbl-p').textContent = wLabel(dates);
  const today = fDateISO(new Date());
  const weekHeeftVandaag = dates.some(d => fDateISO(d) === today);
  document.getElementById('planner-grid').innerHTML = dates.map((date, i) => {
    const key = fDateISO(date); const isW = WEEKEND.includes(i);
    const dagPlan = planning[key] || {};
    const drukte = getDagDrukte(key);
    const eetGroo = activiteiten.some(a => (a.dagen || []).includes(DAGKEYS[i]) && Object.values(a.transport || {}).some(t => t?.eetGroo));
    const defaultOpen = weekHeeftVandaag ? (key === today) : (i === 0);
    const isOpen = _openDagen.size ? _openDagen.has(key) : defaultOpen;
    const previewItems = SLOTS.map(slot => {
      const items = getSlotItems(dagPlan, slot.key); if (!items.length) return null;
      const first = items[0];
      const naam = SPEC[first.waarde] ? SPEC[first.waarde] : (first.naam_override || recepten.find(r => r.id === first.waarde || r.id === parseInt(first.waarde))?.naam || null);
      if (!naam) return null;
      return escHtml(naam) + (items.length > 1 ? ` +${items.length - 1}` : '');
    }).filter(Boolean);
    const preview = previewItems.join(' · ');
    const slotsHtml = SLOTS.map(slot => {
      const items = getSlotItems(dagPlan, slot.key);
      if (!items.length) {
        return `<div class="slot" data-action="open-plan-modal" data-dk="${key}" data-slot="${slot.key}" data-dagnaam="${escHtml(DLANG[i])}" data-dag-index="${i}"><div class="slot-lbl">${slot.lbl}</div><span class="slot-leeg">+ Toevoegen</span></div>`;
      }
      const itemsHtml = items.map((item, idx) => {
        const isSpec = !!SPEC[item.waarde];
        const r = !isSpec ? recepten.find(r => r.id === item.waarde || r.id === parseInt(item.waarde)) : null;
        const naam = isSpec ? SPEC[item.waarde] : (item.naam_override || (r ? r.naam : '?'));
        const w = r && r.tijd > DRUKTE_MAX[drukte];
        const wieLeeg = !item.wie || item.wie.length === 0;
        const wieActief = wieLeeg ? PERSONEN : (item.wie || []);
        const wieRoChips = wieActief.map(p => `<span class="wie-chip sel slot-wie-ro" title="${escHtml(PLABEL[p] || p)}" style="pointer-events:none;">${escHtml(PEMOJI[p] || '👤')}</span>`).join('');
        const kokLabel = item.kok ? `${escHtml(PEMOJI[item.kok] || '👤')} ${escHtml(PLABEL[item.kok] || item.kok)}` : '—';
        const totalItems = items.length;
        const isLast = idx === totalItems - 1;
        const borderRadius = totalItems === 1 ? '0 0 var(--radius-sm) var(--radius-sm)' : (isLast ? '0 0 var(--radius-sm) var(--radius-sm)' : '0');
        return `<div class="slot-item" data-action="open-slot-detail" data-dk="${key}" data-slot="${slot.key}" data-dagnaam="${escHtml(DLANG[i])}" data-dag-index="${i}" style="border-radius:${borderRadius};">
          <div class="slot-item-top">
            ${isSpec ? `<span class="special-badge sb-${item.waarde}">${naam}</span>` : `<span class="slot-item-naam">${escHtml(naam)}${w ? ' <span class="warn"><i data-lucide="triangle-alert" style="width:12px;height:12px;"></i></span>' : ''}</span>`}
            <button class="slot-item-wis" data-action="wis-item" data-dk="${key}" data-slot="${slot.key}" data-idx="${idx}">×</button>
          </div>
          <div class="slot-item-meta">
            <div class="slot-wie-ro-wrap">${wieRoChips}</div>
            <div class="slot-kok-ro">${kokLabel}</div>
          </div>
        </div>`;
      }).join('');
      return `<div class="slot slot-filled">
        <div class="slot-lbl-bar">${slot.lbl}</div>
        ${itemsHtml}
        <button class="slot-add-btn" data-action="open-plan-modal" data-dk="${key}" data-slot="${slot.key}" data-dagnaam="${escHtml(DLANG[i])}" data-dag-index="${i}">+ Toevoegen</button>
      </div>`;
    }).join('');
    return `<div class="dag-rij${isW ? ' weekend' : ''}${key === today ? ' vandaag' : ''}" id="dag-rij-${key}">
      <div class="dag-rij-header" data-action="toggle-dag" data-key="${key}">
        <div class="dag-rij-links">
          <span class="dag-rij-naam">${DKORT[i]}</span>
          <span class="dag-rij-datum">${fDate(date)}</span>
          ${eetGroo ? `<span class="eetgroo-badge">Bij opa/oma</span>` : ''}
        </div>
        <div class="dag-rij-preview">${preview}</div>
        <div class="dag-rij-rechts">
          <div class="drukte-strip"><div class="drukte-dot ${drukte}"></div></div>
          <span class="dag-rij-chevron">${isOpen ? '▾' : '›'}</span>
        </div>
      </div>
      <div class="dag-rij-body${isOpen ? ' open' : ''}">
        <div class="dag-slots">${slotsHtml}</div>
      </div>
    </div>`;
  }).join('');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function toggleDag(key) {
  const rij = document.getElementById('dag-rij-' + key);
  const body = rij.querySelector('.dag-rij-body');
  const chevron = rij.querySelector('.dag-rij-chevron');
  const isOpen = body.classList.toggle('open');
  chevron.textContent = isOpen ? '▾' : '›';
  if (isOpen) _openDagen.add(key); else _openDagen.delete(key);
}

let planReceptenGefilterd = [];

function getTop3Recepten(types) {
  const telling = {};
  Object.entries(planning).forEach(([datum, dag]) => {
    SLOTS.forEach(slot => {
      getSlotItems(dag, slot.key).forEach(item => {
        if (item.waarde && !SPEC[item.waarde]) telling[item.waarde] = (telling[item.waarde] || 0) + 1;
      });
    });
  });
  return recepten
    .filter(r => _receptMatchTypes(r, types))
    .sort((a, b) => (telling[b.id] || 0) - (telling[a.id] || 0))
    .slice(0, 3)
    .filter(r => (telling[r.id] || 0) > 0);
}

function _receptMatchTypes(r, types) {
  const rt = r.types && r.types.length ? r.types : [r.type].filter(Boolean);
  return types.some(t => rt.includes(t));
}

function openPlanModal(dk, slotKey, dagnaam, dagIndex) {
  activeSlot = { dagKey: dk, slotKey, dagIndex };
  const drukte = getDagDrukte(dk);
  document.getElementById('plan-titel').textContent = dagnaam + ' — ' + SLOTS.find(s => s.key === slotKey).lbl;
  document.getElementById('drukte-info-box').innerHTML = `<div style="background:${DRUKTE_BG[drukte]};border-radius:var(--radius-sm);padding:8px 12px;font-size:13px;color:${DRUKTE_CLR[drukte]};font-weight:500;display:flex;align-items:center;gap:6px;"><span style="width:8px;height:8px;border-radius:50%;background:${{ rustig: 'var(--rustig-dot)', normaal: 'var(--normaal-dot)', druk: 'var(--druk-dot)' }[drukte]};flex-shrink:0;"></span>${{ rustig: 'Rustige dag', normaal: 'Drukke dag', druk: 'Zeer drukke dag' }[drukte]}</div>`;
  const isW = WEEKEND.includes(dagIndex);
  const slot = SLOTS.find(s => s.key === slotKey);
  const types = isW ? ['weekend'] : slot.types;

  let specHtml = '';
  specHtml += `<button class="spec-btn sb-shake" data-action="kies-plan-k" data-k="shake"><i data-lucide="cup-soda" class="icon-inline"></i> Maaltijdshake</button>`;
  specHtml += `<button class="spec-btn sb-uiteten" data-action="kies-plan-k" data-k="uiteten"><i data-lucide="utensils" class="icon-inline"></i> Uit eten</button>`;
  specHtml += `<button class="spec-btn sb-afhalen" data-action="kies-plan-k" data-k="afhalen"><i data-lucide="package" class="icon-inline"></i> Afhalen</button>`;
  specHtml += `<button class="spec-btn sb-restjes" data-action="kies-plan-k" data-k="restjes"><i data-lucide="refresh-cw" class="icon-inline"></i> Restjes</button>`;
  document.getElementById('spec-opties').innerHTML = specHtml;

  const top3 = getTop3Recepten(types);
  const top3El = document.getElementById('top3-sectie');
  if (top3.length) {
    document.getElementById('top3-recepten').innerHTML = top3.map(r =>
      `<button data-action="kies-plan-k" data-k="${r.id}" style="padding:6px 12px;border-radius:99px;border:1.5px solid var(--accent);background:var(--accent-l);color:var(--accent);font-size:13px;font-weight:600;cursor:pointer;">${escHtml(r.naam)}</button>`
    ).join('');
    top3El.style.display = 'block';
  } else { top3El.style.display = 'none'; }

  planReceptenGefilterd = recepten.filter(r => _receptMatchTypes(r, types));
  document.getElementById('plan-zoek').value = '';
  renderPlanRecepten(planReceptenGefilterd);
  document.getElementById('plan-modal-bg').classList.add('open');
  setTimeout(() => document.getElementById('plan-zoek').focus(), 150);
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderPlanRecepten(lijst) {
  document.getElementById('plan-recepten').innerHTML = lijst.length
    ? lijst.map(r => `<button class="plan-recept-btn" data-action="kies-plan-k" data-k="${r.id}">${escHtml(r.naam)}<span style="font-size:11px;color:var(--muted);margin-left:6px;">${r.tijd}m</span></button>`).join('')
    : `<p style="font-size:13px;color:var(--muted);padding:8px 0;">Geen recepten gevonden.</p>`;
}

function zoekRecepten(q) {
  const zoek = q.toLowerCase().trim();
  renderPlanRecepten(zoek
    ? planReceptenGefilterd.filter(r => r.naam.toLowerCase().includes(zoek))
    : planReceptenGefilterd
  );
}

function toonPickStap() {
  document.getElementById('pick-sectie').style.display = '';
  document.getElementById('wie-sectie').style.display = 'none';
  selectedKeuze = null;
}
function kiesPlanK(k) {
  if (!activeSlot) return;
  selectedKeuze = k;
  const naam = SPEC[k] || recepten.find(r => r.id === k || r.id === parseInt(k))?.naam || String(k);
  document.getElementById('wie-gekozen-naam').textContent = naam;
  selectedWie = [];
  const chipsHtml = PERSONEN.map(p => `<div class="wie-stap-chip sel" data-action="toggle-wie-stap" data-p="${escHtml(p)}">${escHtml(PEMOJI[p] || '👤')} ${escHtml(PLABEL[p] || p)}</div>`).join('');
  document.getElementById('wie-chips-wrap').innerHTML = chipsHtml;
  const kokOpts = _persKok().map(p => `<option value="${escHtml(p)}">${escHtml(PEMOJI[p] || '👤')} ${escHtml(PLABEL[p] || p)}</option>`).join('');
  document.getElementById('wie-kok-sel').innerHTML = `<option value="" selected>Te bepalen</option><option value="niemand">Niemand</option>${kokOpts}`;
  document.getElementById('pick-sectie').style.display = 'none';
  document.getElementById('wie-sectie').style.display = '';
}
function toggleWieStap(el, p) {
  el.classList.toggle('sel');
  const geselecteerd = [...document.querySelectorAll('#wie-chips-wrap .wie-stap-chip.sel')].map(e => e.dataset.p);
  selectedWie = geselecteerd.length === PERSONEN.length ? [] : geselecteerd;
}
function voegItemToe() {
  if (!activeSlot || selectedKeuze == null) return;
  const { dagKey, slotKey } = activeSlot;
  const kok = document.getElementById('wie-kok-sel').value || null;
  const dagPlan = planning[dagKey] || {};
  const items = getSlotItems(dagPlan, slotKey);
  items.push({ waarde: selectedKeuze, wie: [...selectedWie], kok, extra_eters: 0 });
  _saveItems(dagKey, slotKey, items);
  closePlanModal();
  renderPlanner();
}

function wisItem(dagKey, slotKey, idx) {
  _bevestig('Maaltijd verwijderen?', function() {
    const items = getSlotItems(planning[dagKey] || {}, slotKey);
    items.splice(idx, 1);
    _saveItems(dagKey, slotKey, items);
    renderPlanner();
  });
}
function wijzigExtraEters(dagKey, slotKey, idx, delta) {
  const items = getSlotItems(planning[dagKey] || {}, slotKey);
  items[idx].extra_eters = Math.max(0, Math.min(20, (items[idx].extra_eters || 0) + delta));
  _saveItems(dagKey, slotKey, items);
  renderPlanner();
}
function wijzigKokItem(dagKey, slotKey, idx, kokKey) {
  const items = getSlotItems(planning[dagKey] || {}, slotKey);
  items[idx].kok = (kokKey && kokKey !== 'niemand') ? kokKey : null;
  _saveItems(dagKey, slotKey, items);
  renderPlanner();
}
function toggleWieItem(dagKey, slotKey, idx, persoon) {
  const items = getSlotItems(planning[dagKey] || {}, slotKey);
  const item = items[idx];
  let wie = item.wie || [];
  if (wie.length === 0) wie = PERSONEN.filter(p => p !== persoon);
  else if (wie.includes(persoon)) {
    wie = wie.filter(p => p !== persoon);
  } else {
    wie = [...wie, persoon];
    if (wie.length === PERSONEN.length) wie = [];
  }
  items[idx].wie = wie;
  _saveItems(dagKey, slotKey, items);
  renderPlanner();
}
function openSlotDetail(dk, slotKey, dagnaam, dagIndex) {
  activeSlot = { dagKey: dk, slotKey, dagIndex };
  const slotDef = SLOTS.find(s => s.key === slotKey);
  document.getElementById('slot-detail-titel').textContent = dagnaam + ' — ' + slotDef.lbl;
  renderSlotDetail(dk, slotKey);
  const btn = document.getElementById('sd-voeg-toe-btn');
  btn.dataset.dk = dk; btn.dataset.slot = slotKey; btn.dataset.dagnaam = dagnaam; btn.dataset.dagIndex = dagIndex;
  document.getElementById('slot-detail-modal-bg').classList.add('open');
}

function renderSlotDetail(dk, slotKey) {
  const dagPlan = planning[dk] || {};
  const items = getSlotItems(dagPlan, slotKey);
  const drukte = getDagDrukte(dk);
  const kokPers = _persKok();
  const html = items.map((item, idx) => {
    const isSpec = !!SPEC[item.waarde];
    const r = !isSpec ? recepten.find(r => r.id === item.waarde || r.id === parseInt(item.waarde)) : null;
    const naam = isSpec ? SPEC[item.waarde] : (item.naam_override || (r ? r.naam : '?'));
    const w = r && r.tijd > DRUKTE_MAX[drukte];
    const itemPorties = _berekenPorties(item, dk);
    const extraEters = item.extra_eters || 0;
    const wieLeeg = !item.wie || item.wie.length === 0;
    const wieHtml = PERSONEN.map(p => `<span class="wie-chip${wieLeeg || (item.wie || []).includes(p) ? ' sel' : ''}" data-action="sd-toggle-wie" data-dk="${dk}" data-slot="${slotKey}" data-idx="${idx}" data-p="${p}">${escHtml(PEMOJI[p] || '👤')}</span>`).join('');
    const persOpts = kokPers.map(p => `<option value="${escHtml(p)}"${p === item.kok ? ' selected' : ''}>${escHtml(PEMOJI[p] || '👤')} ${escHtml(PLABEL[p] || p)}</option>`).join('');
    const teBepalenSel = !item.kok ? ' selected' : '';
    return `<div style="padding:12px 0;border-bottom:1px solid var(--border);">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
        ${isSpec
          ? `<span class="special-badge sb-${item.waarde}" style="flex:1;">${naam}</span>`
          : `<input type="text" class="sd-naam-input" value="${escHtml(naam)}" data-action="sd-hernoem" data-dk="${dk}" data-slot="${slotKey}" data-idx="${idx}" style="flex:1;font-size:15px;font-weight:700;border:1.5px solid var(--border);border-radius:var(--radius-sm);padding:5px 10px;background:var(--surface);color:var(--ink);font-family:inherit;"${w ? ' title="Recept lang voor drukke dag ⚠️"' : ''}>`}
        <button class="slot-item-wis" style="font-size:20px;" data-action="sd-wis-item" data-dk="${dk}" data-slot="${slotKey}" data-idx="${idx}">×</button>
      </div>
      <div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;margin-bottom:10px;">
        <div style="flex:1;min-width:120px;">
          <div class="section-label" style="margin-bottom:6px;">Wie eet dit?</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">${wieHtml}</div>
        </div>
        <div style="flex:1;min-width:120px;">
          <div class="section-label" style="margin-bottom:6px;">Wie kookt?</div>
          <select class="slot-kok-sel" style="width:100%;min-width:max-content;" data-action="sd-wijzig-kok" data-dk="${dk}" data-slot="${slotKey}" data-idx="${idx}">
            <option value=""${teBepalenSel}>Te bepalen</option>
            <option value="niemand">Niemand</option>
            ${persOpts}
          </select>
        </div>
      </div>
      ${r ? `<div class="section-label" style="margin-bottom:6px;">Porties</div>
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
        <button class="slot-ctrl-btn" data-action="sd-extra-eters" data-dk="${dk}" data-slot="${slotKey}" data-idx="${idx}" data-delta="-1">−</button>
        <span style="font-size:13px;color:var(--muted);">+${extraEters} extra gasten</span>
        <button class="slot-ctrl-btn" data-action="sd-extra-eters" data-dk="${dk}" data-slot="${slotKey}" data-idx="${idx}" data-delta="1">+</button>
        <span style="font-size:13px;color:var(--muted);margin-left:4px;"><i data-lucide="users" style="width:13px;height:13px;display:inline-block;vertical-align:-0.1em;"></i> ${itemPorties} porties</span>
      </div>` : ''}
    </div>`;
  }).join('');
  document.getElementById('slot-detail-inhoud').innerHTML = html || '<p style="color:var(--muted);font-size:14px;">Geen maaltijd ingepland.</p>';
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeSlotDetail() {
  document.getElementById('slot-detail-modal-bg').classList.remove('open');
  activeSlot = null;
}

function closePlanModal() {
  document.getElementById('plan-modal-bg').classList.remove('open');
  activeSlot = null;
  toonPickStap();
}

function _getWeekKey(offset) {
  const dates = getWeekDates(offset);
  const d = dates[0];
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const week = Math.ceil(((d - jan4) / 86400000 + jan4.getDay() + 1) / 7);
  return d.getFullYear() + '-W' + String(week).padStart(2, '0');
}

async function _voegToeIntern(weekKey) {
  const dates = getWeekDates(weekOffsetP);
  const perIng = {};
  dates.forEach(date => {
    const datum = fDateISO(date);
    const dag = planning[datum] || {};
    SLOTS.forEach(slot => {
      const slotItems = getSlotItems(dag, slot.key);
      slotItems.filter(item => !SPEC[item.waarde]).forEach(item => {
        const r = recepten.find(r => r.id === item.waarde || r.id === parseInt(item.waarde)); if (!r) return;
        const receptPorties = r.porties || 4;
        const geplandPorties = _berekenPorties(item, datum) || receptPorties;
        const schaal = geplandPorties / receptPorties;
        (r.ingredienten || []).forEach(ing => {
          const key = (ing.naam || '').toLowerCase() + '|' + (ing.winkel || 'Andere');
          const hoevNum = parseFloat(ing.hoev) || null;
          const geschaaldHoev = hoevNum ? Math.round(hoevNum * schaal * 100) / 100 : null;
          if (!perIng[key]) {
            perIng[key] = { naam: ing.naam, winkel: ing.winkel || 'Andere', eenheid: ing.eenheid || null, hoev: geschaaldHoev || ing.hoev || null, receptNaam: r.naam, weekKey };
          } else if (hoevNum && geschaaldHoev) {
            const huidig = parseFloat(perIng[key].hoev) || 0;
            perIng[key].hoev = Math.round((huidig + geschaaldHoev) * 100) / 100;
          }
        });
      });
    });
  });
  const snapshot = Object.values(perIng);
  if (!snapshot.length) { toonOpslagStatus('❌ Geen ingrediënten gevonden in het weekmenu.'); return; }
  await sbDeleteAlleReceptItems();
  boodschappenReceptItems = snapshot;
  slaLokaalOp();
  localStorage.setItem('gezinsapp_boodschappen_week', weekKey);
  for (const item of snapshot) { await sbSaveBoodschapReceptItem(item); }
  slaLokaalOp();
  toonOpslagStatus('✅ ' + snapshot.length + ' ingrediënten opgeslagen');
  _bevestig(snapshot.length + ' ingrediënten toegevoegd. Ga nu naar boodschappen?', function(){ location.href = 'boodschappen.html'; }, {bevestigLabel:'Naar boodschappen', cancelLabel:'Blijf hier', danger:false});
}

async function voegToeAanBoodschappenlijst() {
  const weekKey = _getWeekKey(weekOffsetP);
  const opgeslagenWeek = localStorage.getItem('gezinsapp_boodschappen_week');
  if (opgeslagenWeek === weekKey) {
    _bevestig('Boodschappenlijst overschrijven?', function(){ _voegToeIntern(weekKey); }, {sub:'Je hebt al boodschappen toegevoegd voor deze week.', bevestigLabel:'Overschrijven', danger:false});
    return;
  }
  _voegToeIntern(weekKey);
}

document.getElementById('plan-modal-bg').addEventListener('click', e => { if (e.target === document.getElementById('plan-modal-bg')) closePlanModal(); });

function openWpAgent() { document.getElementById('wp-agent-panel').style.display = 'block'; }

function _wpThuiskomstCtx() {
  const profielen = Auth.getProfielen().filter(p => p.rol === 'gezinshoofd');
  if (!profielen.length) return '';
  const dates = _atGetWeekDates(0);
  const dagKeys = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
  const lines = [];
  dates.forEach((d, i) => {
    const datum = fDateISO(d);
    const dagKey = dagKeys[d.getDay()];
    const dagInfo = [];
    profielen.forEach(p => {
      const rooster = (vasteRoosters[p.persoonKey] || {})[dagKey];
      if (!rooster || !rooster.actief) return;
      const locatie = rooster.locatie || 'thuis';
      const tot = rooster.tot || '17:00';
      if (locatie === 'kantoor') {
        const reistijd = parseInt(localStorage.getItem(`gezinsapp_reistijd_${p.persoonKey}`) || '0') || 0;
        const [h, m] = (tot || '17:00').split(':').map(Number);
        const thuisTot = (h * 60 + m + reistijd);
        const thuisTijd = `${String(Math.floor(thuisTot / 60)).padStart(2, '0')}:${String(thuisTot % 60).padStart(2, '0')}`;
        dagInfo.push(`${p.naam}: kantoor tot ${tot} + ${reistijd}min pendelen → thuis ~${thuisTijd}`);
      } else {
        dagInfo.push(`${p.naam}: thuis/remote tot ${tot}`);
      }
    });
    if (dagInfo.length) lines.push(`  ${DKORT[i]} ${datum}: ${dagInfo.join('; ')}`);
  });
  return lines.length ? '\n\nTHUISKOMST DEZE WEEK:\n' + lines.join('\n') : '';
}

function _wpSysteemPrompt() {
  const vandaagISO = _atNuISO();
  const dagNaamNL = DLANG_GD[new Date(vandaagISO + 'T12:00:00').getDay()];
  let planCtx = '';
  try {
    const dates = _atGetWeekDates(0);
    planCtx = '\n\nHUIDIGE WEEK (' + wLabel(dates) + '):\n' + dates.map((d, i) => {
      const key = fDateISO(d);
      const dag = planning[key] || {};
      const acts = activiteiten.filter(a => isActiefOpDatum(a, key)).map(a => a.naam + (a.start ? ' ' + a.start : '')).join(', ');
      const _slotStr = (s) => getSlotItems(dag, s).map(it => { const n = _atGetNaam(it.waarde); const w = it.wie && it.wie.length ? '(' + it.wie.map(p => PLABEL[p] || p).join('/') + ')' : ''; return n + w; }).join('+');
      return '  ' + DKORT[i] + ' ' + key + (key === vandaagISO ? ' ←VANDAAG' : '') +
        ': O=' + _slotStr('ontbijt') + ' L=' + _slotStr('lunch') + ' A=' + _slotStr('avond') +
        (acts ? ' [' + acts + ']' : '');
    }).join('\n');
  } catch (e) { }
  const thuiskomstCtx = _wpThuiskomstCtx();
  const _ghNamen = Auth.getProfielen().filter(p => !p.isKind).map(p => p.naam).join(' en ');
  const _kindNamen = Auth.getProfielen().filter(p => p.isKind).map(p => p.naam).join(', ');
  return `Je bent de maaltijdassistent.
Vandaag: ${dagNaamNL} ${vandaagISO}.
${bouwGezinsContext()}
Week loopt ma→zo. Op schooldagen (ma-vr) eten de kinderen 's middags op school${_ghNamen ? ' (' + _ghNamen + ' eten wel thuis of doen lunch zelf)' : ''}.${planCtx}${thuiskomstCtx}

REGELS:
- Vraag ALTIJD bevestiging vóór elke schrijfactie (bevestiging_vereist:true).
- Roep get_eethistoriek(8) aan VÓÓR je een weekmenu plant. Vermijd recepten die de afgelopen 8 weken al voorkwamen.
- Bij stel_weekmenu_in: gebruik NUMERIEK recept-id uit get_recepten, nooit de naam.
- Focus op maaltijdplanning: ontbijt, lunch en avondeten.
- Antwoord altijd in het Nederlands. Wees bondig en concreet.
- Geef voorkeur aan recepten met score ≥ 4. Vermijd recepten met score ≤ 2 tenzij de gebruiker ze expliciet vraagt.

TIJDSBEWUSTZIJN:
- Bereken per avond of ${_ghNamen || 'gezinshoofden'} nog op kantoor zijn geweest en wanneer ze thuis zijn (zie THUISKOMST DEZE WEEK).
- Als iemand pas na 18:30 thuis is en er nog activiteiten zijn, is er weinig tijd voor koken: stel maaltijdshake, afhalen of een snel recept (<30min) voor.
- Vraag altijd expliciet: "Wie eet er mee?" als er twijfel is over aanwezigheid van gezinsleden.
- Een maaltijdshake = een shake als maaltijdvervanging (bijv. Herbalife). Stel dit voor bij erg krappe avonden.

KOKEN:
- Per maaltijdslot kan aangeduid worden wie kookt. Gebruik de persoonKey (kleine letters) in stel_weekmenu_in.kok. Enkel volwassenen en jeugd kunnen koken${_kindNamen ? ' (dus NIET ' + _kindNamen + ')' : ''}.
- Als de aangewezen kok die avond laat thuis is (kantoor + pendeltijd), stel dan automatisch een sneller recept voor (<30 min) of een maaltijdshake.
- Verspreid kookbeurten eerlijk over ${_ghNamen || 'de gezinshoofden'}. Vraag wie er kookt als het niet ingesteld is voor een avond.

RESTJESDAG:
- "Restjes" = de resten van het gerecht van de vorige avond worden opgegeten.
- Noteer mentaal welk recept het was de avond voor de restjes-dag. Vermeld dit bij je voorstel ("Restjes van [gerecht]").
- Plan restjes na gerechten die voldoende overblijven: pasta bolognese, stoofpot, soep, lasagne, gratin...
- Bij de boodschappenlijst: toon de restjes-dag zonder extra ingrediënten (die staan al bij de vorige dag).

PORTIES & BOODSCHAPPENLIJST:
- Porties worden automatisch berekend op basis van wie er eet: kind${_kindNamen ? ' (' + _kindNamen + ')' : ''} telt voor 0,5 portie; volwassene en jeugd${_ghNamen ? ' (' + _ghNamen + ')' : ''} telt voor 1 portie. Extra gasten (extra_eters) tellen elk voor 1 portie.
- Totaal porties = som gewichten aangevinkte gezinsleden + extra_eters.
- Gebruik extra_eters in stel_weekmenu_in en voeg_maaltijd_toe om gasten aan te duiden.
- Bij get_boodschappenlijst worden ingrediënten automatisch geschaald op basis van berekende porties.
- De kok kan enkel een volwassene of jeugdlid zijn${_kindNamen ? ' (niet ' + _kindNamen + ')' : ''}.${geheugen.length ? '\n\nGEHEUGEN (onthouden voorkeuren en feiten):\n' + geheugen.map((g, i) => `${i + 1}. ${g.tekst}`).join('\n') : ''}`;
}

const wpAgent = createAgentChat({
  tools: AGENT_TOOLS,
  buildSystemPrompt: _wpSysteemPrompt,
  execute: agentExecute,
  ids: { berichten: 'wp-chat-berichten', input: 'wp-chat-input', bevestiging: 'wp-bevestiging-panel', bevestigingTekst: 'wp-bevestiging-tekst' },
});

function wpStuurVoorbeeldVraag(tekst) {
  document.getElementById('wp-agent-panel').style.display = 'block';
  wpAgent.stuurVoorbeeldVraag(tekst);
}

// ── Event listeners ───────────────────────────────────────────
document.addEventListener('click', function (e) {
  if (!e.target.closest('#topbar-user') && !e.target.closest('#profiel-menu'))
    document.getElementById('profiel-menu')?.classList.remove('open');
});

const _wpInp = document.getElementById('wp-chat-input');
if (_wpInp) _wpInp.addEventListener('keydown', e => { if (e.key === 'Enter') wpAgent.stuurBericht(e.target.value); });

document.getElementById('plan-zoek')?.addEventListener('input', e => zoekRecepten(e.target.value));

document.getElementById('slot-detail-modal-bg').addEventListener('click', e => {
  if (e.target === document.getElementById('slot-detail-modal-bg')) closeSlotDetail();
});

document.addEventListener('change', function (e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  if (el.dataset.action === 'sd-wijzig-kok') {
    wijzigKokItem(el.dataset.dk, el.dataset.slot, parseInt(el.dataset.idx), el.value);
    renderSlotDetail(el.dataset.dk, el.dataset.slot);
  }
  if (el.dataset.action === 'wijzig-kok-item') {
    wijzigKokItem(el.dataset.dk, el.dataset.slot, parseInt(el.dataset.idx), el.value);
  }
});

document.addEventListener('blur', function (e) {
  const el = e.target.closest('[data-action="sd-hernoem"]');
  if (!el) return;
  const { dk, slot, idx } = el.dataset;
  const items = getSlotItems(planning[dk] || {}, slot);
  if (!items[idx]) return;
  const newNaam = el.value.trim();
  if (newNaam) { items[parseInt(idx)].naam_override = newNaam; _saveItems(dk, slot, items); renderPlanner(); }
}, true);

document.addEventListener('click', function (e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  switch (el.dataset.action) {
    case 'toggle-profiel-menu': document.getElementById('profiel-menu')?.classList.toggle('open'); break;
    case 'change-week-p': changeWeekP(parseInt(el.dataset.dir)); break;
    case 'open-wp-agent': openWpAgent(); break;
    case 'voeg-toe-boodschappen': voegToeAanBoodschappenlijst(); break;
    case 'ga-boodschappen': location.href = 'boodschappen.html'; break;
    case 'sluit-wp-panel': document.getElementById('wp-agent-panel').style.display = 'none'; break;
    case 'wp-voorbeeld': wpStuurVoorbeeldVraag(el.dataset.tekst); break;
    case 'wp-bevestig': wpAgent.bevestig(); break;
    case 'wp-annuleer': wpAgent.annuleer(); break;
    case 'wp-stuur': wpAgent.stuurBericht(document.getElementById('wp-chat-input').value); break;
    case 'close-plan-modal': closePlanModal(); break;
    case 'toon-pick-stap': toonPickStap(); break;
    case 'voeg-item-toe': voegItemToe(); break;
    case 'toggle-dag': toggleDag(el.dataset.key); break;
    case 'open-plan-modal':
      openPlanModal(el.dataset.dk, el.dataset.slot, el.dataset.dagnaam, parseInt(el.dataset.dagIndex));
      break;
    case 'toggle-wie-item':
      toggleWieItem(el.dataset.dk, el.dataset.slot, parseInt(el.dataset.idx), el.dataset.p);
      break;
    case 'wis-item':
      e.stopPropagation();
      wisItem(el.dataset.dk, el.dataset.slot, parseInt(el.dataset.idx));
      break;
    case 'wijzig-extra-eters':
      wijzigExtraEters(el.dataset.dk, el.dataset.slot, parseInt(el.dataset.idx), parseInt(el.dataset.delta));
      break;
    case 'kies-plan-k': {
      const k = el.dataset.k;
      kiesPlanK(isNaN(k) ? k : parseFloat(k));
      break;
    }
    case 'toggle-wie-stap':
      toggleWieStap(el, el.dataset.p);
      break;
    case 'open-slot-detail':
      openSlotDetail(el.dataset.dk, el.dataset.slot, el.dataset.dagnaam, parseInt(el.dataset.dagIndex));
      break;
    case 'close-slot-detail':
      closeSlotDetail();
      break;
    case 'sd-toggle-wie':
      toggleWieItem(el.dataset.dk, el.dataset.slot, parseInt(el.dataset.idx), el.dataset.p);
      renderSlotDetail(el.dataset.dk, el.dataset.slot);
      break;
    case 'sd-wis-item':
      wisItem(el.dataset.dk, el.dataset.slot, parseInt(el.dataset.idx));
      renderSlotDetail(el.dataset.dk, el.dataset.slot);
      break;
    case 'sd-extra-eters':
      wijzigExtraEters(el.dataset.dk, el.dataset.slot, parseInt(el.dataset.idx), parseInt(el.dataset.delta));
      renderSlotDetail(el.dataset.dk, el.dataset.slot);
      break;
    case 'sd-voeg-toe':
      closeSlotDetail();
      openPlanModal(el.dataset.dk, el.dataset.slot, el.dataset.dagnaam, parseInt(el.dataset.dagIndex));
      break;
  }
});


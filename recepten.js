Auth.initPagina('recepten');

let activeRType = 'alle';
let geimporteerdRecept = null;
let geselecteerdeTypes = [];
let actieveFicheId = null;

laadOp().then(() => {
  renderRecepten();
  const params = new URLSearchParams(location.search);
  const bewerkId = params.get('bewerk');
  if (bewerkId) {
    const r = recepten.find(r => String(r.id) === bewerkId);
    if (r) { actieveFicheId = r.id; setTimeout(() => { openReceptModal(r); openFiche(r.id); }, 300); }
  }
}).catch(() => { laadLokaal(); renderRecepten(); });

AppState.subscribe('recepten', renderRecepten);

function filterRType(type, el) {
  activeRType = type;
  document.querySelectorAll('#recept-type-tabs .ptab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  else document.querySelector(`#recept-type-tabs .ptab[data-type="${type}"]`)?.classList.add('active');
  const sel = document.getElementById('recept-type-sel-mob');
  if (sel) sel.value = type;
  renderRecepten();
}

function renderRecepten() {
  const search = (document.getElementById('recept-search') || {}).value || '';
  let filtered = recepten;
  if (activeRType !== 'alle') {
    filtered = filtered.filter(r => {
      const types = r.types && r.types.length ? r.types : [r.type].filter(Boolean);
      return types.includes(activeRType);
    });
  }
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(r => r.naam.toLowerCase().includes(q) || (r.tags || []).some(t => t.toLowerCase().includes(q)) || (r.ingredienten || []).some(i => i.naam.toLowerCase().includes(q)));
  }
  const typeLabels = { avond: '<i data-lucide="utensils" class="icon-inline"></i> Avond', lunch: '<i data-lucide="leaf" class="icon-inline"></i> Lunch', weekend: '<i data-lucide="utensils" class="icon-inline"></i> Weekend', ontbijt: '<i data-lucide="coffee" class="icon-inline"></i> Ontbijt' };
  const _thumbIcon = { avond: 'utensils', lunch: 'leaf', weekend: 'star', ontbijt: 'coffee' };
  document.getElementById('recipes-grid').innerHTML = filtered.map(r => {
    const types = r.types && r.types.length ? r.types : [r.type].filter(Boolean);
    const eersteType = types[0] || 'avond';
    const isActief = actieveFicheId != null && actieveFicheId == r.id;
    return `
    <div class="recept-card${isActief ? ' actief' : ''}" data-id="${r.id}" data-action="open-fiche" data-fiche-id="${r.id}">
      <div class="recept-thumb thumb-${eersteType}"><i data-lucide="${_thumbIcon[eersteType]||'utensils'}" style="width:28px;height:28px;stroke-width:1.75;color:var(--surface);opacity:.8;"></i></div>
      <div class="recept-info">
        <div class="recept-naam">${escHtml(r.naam)}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:2px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
          ${r.tijd ? `<span><i data-lucide="timer" class="icon-inline"></i> ${r.tijd} min</span>` : ''}
          ${r.porties ? `<span><i data-lucide="utensils" class="icon-inline"></i> ${r.porties}p</span>` : ''}
          ${r.moeilijk ? `<span>${escHtml(r.moeilijk)}</span>` : ''}
          ${r.score ? _sterHtml(r.score) : ''}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:5px;">
          ${types.map(t => `<span class="tag-pill">${typeLabels[t] || t}</span>`).join('')}
          ${(r.tags || []).slice(0, 2).map(t => `<span class="tag-pill">${escHtml(t)}</span>`).join('')}
        </div>
      </div>
    </div>`;
  }).join('') || `<div class="empty-state"><i data-lucide="book-open" class="empty-icon"></i><p>Geen recepten gevonden</p></div>`;
  if (actieveFicheId) {
    const r = recepten.find(r => r.id === actieveFicheId);
    if (r) _renderFicheInDesktop(r);
    else { actieveFicheId = null; _clearFiche(); }
  }
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function openFiche(id) {
  actieveFicheId = id;
  const r = recepten.find(r => r.id === id);
  if (!r) return;
  _renderFicheInDesktop(r);
  if (window.innerWidth < 768) {
    document.getElementById('recept-fiche-mobiel').innerHTML = renderFicheHtml(r, true);
    document.getElementById('recept-fiche-overlay').classList.add('open');
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
  document.querySelectorAll('.recept-card').forEach(c => {
    c.classList.toggle('actief', c.dataset.id === id);
  });
}

function _renderFicheInDesktop(r) {
  const el = document.getElementById('recept-fiche');
  const ph = document.getElementById('fiche-placeholder');
  if (!el) return;
  el.innerHTML = renderFicheHtml(r, false);
  el.style.display = 'block';
  if (ph) ph.style.display = 'none';
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function _clearFiche() {
  const el = document.getElementById('recept-fiche');
  const ph = document.getElementById('fiche-placeholder');
  if (el) { el.innerHTML = ''; el.style.display = 'none'; }
  if (ph) ph.style.display = 'flex';
}

function renderFicheHtml(r, metSluitknop) {
  const kanBewerken = Auth.kan('kanReceptenBeheren');
  const typeLabels = { avond: '<i data-lucide="utensils" class="icon-inline"></i> Avond', lunch: '<i data-lucide="leaf" class="icon-inline"></i> Lunch', weekend: '<i data-lucide="utensils" class="icon-inline"></i> Weekend', ontbijt: '<i data-lucide="coffee" class="icon-inline"></i> Ontbijt' };
  const types = r.types && r.types.length ? r.types : [r.type].filter(Boolean);
  const _bronUrl = r.bron && /^https?:\/\//i.test(r.bron) ? r.bron : '';
  const bronDom = _bronUrl ? `<a href="${escHtml(_bronUrl)}" target="_blank" rel="noopener" style="color:var(--accent);">${escHtml(_bronUrl.replace(/^https?:\/\//, '').split('/').slice(0, 2).join('/'))}</a>` : '';
  return `
  <div class="fiche-header">
    <div class="fiche-naam">${escHtml(r.naam)}</div>
    <div class="fiche-acties">
      ${kanBewerken ? `
        <button class="btn btn-secondary btn-sm" data-action="bewerk-recept" data-id="${r.id}" title="Bewerken"><i data-lucide="pencil" class="icon-inline"></i></button>
        <button class="btn btn-danger btn-sm" data-action="verwijder-recept" data-id="${r.id}" title="Verwijderen"><i data-lucide="trash-2" class="icon-inline"></i></button>
      ` : ''}
      ${metSluitknop ? `<button class="btn btn-secondary btn-sm" data-action="sluit-fiche" title="Sluiten">✕</button>` : ''}
    </div>
  </div>
  <div class="fiche-meta">
    ${types.map(t => `<span class="tag-pill">${typeLabels[t] || t}</span>`).join('')}
    ${r.tijd ? `<span class="fiche-meta-item"><i data-lucide="timer" class="icon-inline"></i> ${r.tijd} min</span>` : ''}
    ${r.porties ? `<span class="fiche-meta-item"><i data-lucide="utensils" class="icon-inline"></i> ${r.porties} p.</span>` : ''}
    ${r.moeilijk ? `<span class="fiche-meta-item">${escHtml(r.moeilijk)}</span>` : ''}
    ${r.score ? `<span class="fiche-meta-item">${_sterHtml(r.score)}</span>` : ''}
  </div>
  ${(r.tags || []).length ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:1rem;">${r.tags.map(t => `<span class="tag-pill">${escHtml(t)}</span>`).join('')}</div>` : ''}
  ${bronDom ? `<div style="font-size:12px;color:var(--muted);margin-bottom:1.2rem;"><i data-lucide="link" class="icon-inline"></i> ${bronDom}</div>` : ''}
  ${(r.ingredienten || []).length ? `
    <div class="fiche-sectie-label">Ingrediënten (${r.ingredienten.length})</div>
    <div>
      ${r.ingredienten.map(i => `
        <div class="fiche-ing-rij">
          <span class="fiche-ing-naam">${escHtml(i.naam)}</span>
          ${i.hoev || i.eenheid ? `<span class="fiche-ing-hoev">${i.hoev ? escHtml(i.hoev) : ''}${i.eenheid ? ' ' + escHtml(i.eenheid) : ''}</span>` : ''}
        </div>`).join('')}
    </div>
  ` : ''}
  ${r.bereiding ? `
    <div class="fiche-sectie-label">Bereiding</div>
    <div class="fiche-bereiding">${escHtml(r.bereiding)}</div>
  ` : ''}`;
}

function sluitFiche() {
  document.getElementById('recept-fiche-overlay').classList.remove('open');
}

function setSter(v) {
  const cur = parseInt(document.getElementById('f-score').value) || 0;
  const nieuw = cur === v ? 0 : v;
  document.getElementById('f-score').value = nieuw || '';
  document.querySelectorAll('#ster-input span').forEach(s => {
    s.classList.toggle('vol', parseInt(s.dataset.v) <= nieuw);
  });
}
function _laadSter(score) {
  document.getElementById('f-score').value = score || '';
  document.querySelectorAll('#ster-input span').forEach(s => {
    s.classList.toggle('vol', parseInt(s.dataset.v) <= (score || 0));
  });
}
function _sterHtml(score) {
  if (!score) return '';
  return `<span class="ster-display">${'★'.repeat(score)}${'☆'.repeat(5 - score)}</span>`;
}

function toggleType(el) {
  el.classList.toggle('selected');
  geselecteerdeTypes = getGeselecteerdeTypes();
}
function getGeselecteerdeTypes() {
  return [...document.querySelectorAll('#f-type-ms .type-chip.selected')].map(el => el.dataset.type);
}
function setTypes(types) {
  document.querySelectorAll('#f-type-ms .type-chip').forEach(chip => {
    chip.classList.toggle('selected', (types || []).includes(chip.dataset.type));
  });
  geselecteerdeTypes = types || [];
}

function ingRow(naam = '', hoev = '', eenheid = '', winkel = '', isNieuw = false) {
  const w = winkel || zoekStandaardWinkel(naam);
  const bestaatAl = naam ? standaardIngredienten.some(i => i.naam.toLowerCase() === naam.toLowerCase()) : false;
  const rowId = 'ing-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  const baseI = 'padding:8px 5px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:13px;box-sizing:border-box;width:100%;background:var(--surface);color:var(--ink);font-family:inherit;min-width:0;';
  return `<div id="${rowId}" style="display:grid;grid-template-columns:minmax(0,1.85fr) minmax(0,0.5fr) minmax(0,0.6fr) minmax(0,0.75fr) 28px;gap:5px;align-items:center;margin-bottom:8px;">
    <div class="ing-combo-wrap" style="min-width:0;position:relative;">
      <input class="ing-combo-input" type="text" placeholder="Ingrediënt…" value="${escHtml(naam)}" autocomplete="off"/>
      ${isNieuw ? `<span class="ing-nieuw-badge">Nieuw</span>` : ''}
      <div class="ing-combo-dropdown" id="dd-${rowId}"></div>
    </div>
    <input style="${baseI}text-align:center;" type="text" placeholder="…" value="${escHtml(hoev)}"/>
    <input style="${baseI}" type="text" placeholder="gram" value="${escHtml(eenheid)}"/>
    <select class="winkel-sel" style="${baseI}${bestaatAl ? 'opacity:.6;' : ''}" ${bestaatAl ? 'disabled title="Wijzig winkel via Ingrediënten"' : ''}>
      ${WINKELS.map(ww => `<option${ww === w ? ' selected' : ''}>${ww}</option>`).join('')}
    </select>
    <button data-action="verwijder-ing-rij" style="background:none;border:none;cursor:pointer;font-size:18px;color:var(--muted-2);padding:0;">×</button>
  </div>`;
}

function filterIngCombo(input, rowId) {
  const zoek = input.value.toLowerCase().trim();
  const dd = document.getElementById('dd-' + rowId);
  const matches = standaardIngredienten.filter(i => i.naam.toLowerCase().includes(zoek)).slice(0, 8);
  let html = matches.map(i => `
    <div class="ing-combo-option" data-action="kies-ing" data-rowid="${rowId}" data-naam="${escHtml(i.naam)}" data-winkel="${escHtml(i.winkel)}">
      <span>${escHtml(i.naam)}</span>
      <span class="winkel-hint">🏪 ${escHtml(i.winkel)}</span>
    </div>`).join('');
  const bestaatExact = standaardIngredienten.some(i => i.naam.toLowerCase() === zoek);
  if (zoek && !bestaatExact) {
    html += `<div class="ing-combo-nieuw" data-action="maak-nieuw-ing" data-rowid="${rowId}" data-naam="${escHtml(input.value)}">
      ✨ Nieuw ingrediënt: <strong>${escHtml(input.value)}</strong>
    </div>`;
  }
  dd.innerHTML = html;
  dd.classList.toggle('open', html.length > 0);
}

function kiesIng(rowId, naam, winkel) {
  const row = document.getElementById(rowId);
  row.querySelector('.ing-combo-input').value = naam;
  const sel = row.querySelector('.winkel-sel');
  if (sel && winkel) { for (let o of sel.options) { if (o.value === winkel) { sel.value = winkel; break; } } }
  if (sel) { sel.disabled = true; sel.style.opacity = '.6'; }
  sluitIngCombo(rowId);
}

function maakNieuwIng(rowId, naam) {
  const row = document.getElementById(rowId);
  const input = row.querySelector('.ing-combo-input');
  input.value = naam;
  row.dataset.nieuw = '1';
  row.dataset.nieuwNaam = naam;
  const sel = row.querySelector('.winkel-sel');
  if (sel) { sel.disabled = false; sel.style.opacity = '1'; }
  let badge = row.querySelector('.ing-nieuw-badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'ing-nieuw-badge';
    badge.textContent = 'Nieuw';
    badge.style.cssText = 'position:absolute;top:-6px;right:4px;font-size:9px;background:var(--rustig-bg);color:var(--rustig-clr);padding:1px 5px;border-radius:99px;font-weight:700;';
    row.querySelector('.ing-combo-wrap').style.position = 'relative';
    row.querySelector('.ing-combo-wrap').appendChild(badge);
  }
  sluitIngCombo(rowId);
}

function sluitIngCombo(rowId) {
  const dd = document.getElementById('dd-' + rowId);
  if (dd) dd.classList.remove('open');
}

function addIngredient() {
  document.getElementById('ingredients-container').insertAdjacentHTML('beforeend', ingRow());
}

function zoekStandaardWinkel(naam) {
  if (!naam) return '';
  const m = standaardIngredienten.find(i => i.naam.toLowerCase() === naam.toLowerCase().trim());
  return m ? m.winkel : '';
}

function openReceptModal(recept, vanImport = false) {
  const titel = vanImport ? 'Geïmporteerd recept — nakijken & opslaan' : recept ? 'Recept bewerken' : 'Nieuw recept';
  document.getElementById('recept-modal-titel').textContent = titel;
  const types = recept ? (recept.types && recept.types.length ? recept.types : [recept.type].filter(Boolean)) : [];
  setTypes(types);
  document.getElementById('tag-selector').innerHTML = ALLE_TAGS.map(t => {
    const sel = recept && (recept.tags || []).includes(t);
    return `<span data-action="toggle-tag"
      style="padding:5px 12px;border-radius:99px;font-size:12px;cursor:pointer;border:1.5px solid ${sel ? 'var(--accent)' : 'var(--border-2)'};background:${sel ? 'var(--accent)' : 'var(--surface)'};color:${sel ? '#fff' : 'var(--muted)'};font-weight:500;"
      data-sel="${sel ? '1' : '0'}">${escHtml(t)}</span>`;
  }).join('');
  if (recept) {
    document.getElementById('f-naam').value = recept.naam || '';
    document.getElementById('f-tijd').value = recept.tijd || '';
    document.getElementById('f-porties').value = recept.porties || 4;
    document.getElementById('f-moeilijk').value = recept.moeilijk || 'Normaal';
    document.getElementById('f-bron').value = recept.bron || '';
    document.getElementById('f-bereiding').value = recept.bereiding || '';
    _laadSter(recept.score || 0);
    document.getElementById('ingredients-container').innerHTML = (recept.ingredienten || []).map(i => ingRow(i.naam, i.hoev, i.eenheid, i.winkel)).join('');
    document.getElementById('recept-modal-bg').dataset.editId = vanImport ? '' : (recept.id || '');
  } else {
    ['f-naam', 'f-bron', 'f-bereiding'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('f-tijd').value = '';
    document.getElementById('f-porties').value = '4';
    _laadSter(0);
    document.getElementById('ingredients-container').innerHTML = ingRow();
    document.getElementById('recept-modal-bg').dataset.editId = '';
  }
  document.getElementById('recept-modal-bg').classList.add('open');
  setTimeout(() => document.getElementById('f-naam').focus(), 150);
}

function closeReceptModal() { document.getElementById('recept-modal-bg').classList.remove('open'); }

function saveRecept() {
  const naam = document.getElementById('f-naam').value.trim();
  if (!naam) { toonOpslagStatus('❌ Geef een naam in.'); return; }
  const types = getGeselecteerdeTypes();
  if (!types.length) { toonOpslagStatus('❌ Selecteer minstens één type.'); return; }
  const editId = document.getElementById('recept-modal-bg').dataset.editId;
  const tags = [...document.querySelectorAll('#tag-selector span[data-sel="1"]')].map(el => el.textContent);
  const nieuweIngs = [];
  const ings = [...document.querySelectorAll('#ingredients-container > div[id]')].map(row => {
    const input = row.querySelector('.ing-combo-input');
    const inputs = row.querySelectorAll('input');
    const winkelSel = row.querySelector('.winkel-sel');
    const ingNaam = input ? input.value.trim() : '';
    const hoev = inputs[1] ? inputs[1].value : '';
    const eenheid = inputs[2] ? inputs[2].value : '';
    const winkel = winkelSel ? winkelSel.value : 'Colruyt';
    if (!ingNaam) return null;
    return { naam: ingNaam, hoev, eenheid, winkel };
  }).filter(Boolean);
  ings.forEach(ing => {
    const bestaatAl = standaardIngredienten.some(i => i.naam.toLowerCase() === ing.naam.toLowerCase());
    if (!bestaatAl) {
      const nieuwIng = { id: _maakId(), naam: ing.naam, winkel: ing.winkel || 'Colruyt', categorie: '' };
      standaardIngredienten.push(nieuwIng);
      sbSaveIngredient(nieuwIng);
      nieuweIngs.push(nieuwIng);
    }
  });
  const bestaande = editId ? recepten.find(r => r.id === editId) : null;
  const recept = {
    id: editId ? parseFloat(editId) || editId : _maakId(),
    _sbId: bestaande?._sbId,
    naam,
    types,
    type: types[0] || 'avond',
    tijd: parseInt(document.getElementById('f-tijd').value) || 30,
    porties: parseInt(document.getElementById('f-porties').value) || 4,
    moeilijk: document.getElementById('f-moeilijk').value,
    score: parseInt(document.getElementById('f-score').value) || null,
    wie: [...PERSONEN],
    bron: document.getElementById('f-bron').value,
    bereiding: document.getElementById('f-bereiding').value,
    tags,
    ingredienten: ings
  };
  if (editId) recepten = recepten.map(r => r.id === editId ? recept : r);
  else recepten.push(recept);
  closeReceptModal();
  renderRecepten();
  slaLokaalOp();
  sbSaveRecept(recept);
  geimporteerdRecept = null;
  if (nieuweIngs.length) {
    toonOpslagStatus(`✅ Opgeslagen + ${nieuweIngs.length} nieuw ingrediënt${nieuweIngs.length > 1 ? 'en' : ''} toegevoegd`);
  } else {
    toonOpslagStatus('✅ Opgeslagen');
  }
}

function verwijderRecept(id) {
  _bevestig('Recept verwijderen?', function() {
    const r = recepten.find(r => r.id === id || r.id === id);
    recepten = recepten.filter(r => r.id !== id);
    if (actieveFicheId === id) { actieveFicheId = null; _clearFiche(); document.getElementById('recept-fiche-overlay').classList.remove('open'); }
    renderRecepten(); slaLokaalOp(); if (r?._sbId) sbDeleteRecept(r._sbId);
    toonOpslagStatus('✅ Verwijderd');
  });
}

function openImportModal() {
  document.getElementById('import-url').value = '';
  naarStap(1);
  document.getElementById('import-modal-bg').classList.add('open');
  setTimeout(() => document.getElementById('import-url').focus(), 200);
}
function closeImportModal() { document.getElementById('import-modal-bg').classList.remove('open'); }
function naarStap(n) {
  document.querySelectorAll('.import-stap').forEach(el => el.classList.remove('actief'));
  document.getElementById('import-stap-' + n).classList.add('actief');
}

async function startImport() {
  const url = document.getElementById('import-url').value.trim();
  if (!url || !url.startsWith('http')) { toonOpslagStatus('❌ Plak een geldige URL.'); return; }
  const apiKey = localStorage.getItem('anthropic_api_key') || ''; // CodeQL[js/clear-text-storage-of-sensitive-information]: client-side app, geen backend
  if (!apiKey) {
    document.getElementById('import-error-tekst').innerHTML = '<strong>❌ Geen API-sleutel</strong><br><br>Stel je Anthropic API-sleutel in via <a href="instellingen.html" style="color:var(--accent)">Instellingen</a>.';
    naarStap(4); return;
  }
  naarStap(2);
  document.getElementById('import-loader-tekst').textContent = 'Recept ophalen van ' + url.replace(/^https?:\/\//, '').split('/')[0] + '…';
  try {
    const systeemprompt = `Je bent een recept-extractie assistent. Haal het recept op van de opgegeven URL en geef UITSLUITEND geldige JSON terug zonder markdown backticks.
Formaat:
{
  "naam": "string",
  "types": ["avond|lunch|weekend|ontbijt"],
  "tijd": 30,
  "porties": 4,
  "moeilijk": "Snel|Normaal|Uitgebreid",
  "bereiding": "string",
  "ingredienten": [{"naam":"string","hoev":"500","eenheid":"gram"}],
  "tags": [],
  "bron": "url"
}
types is een array, kies uit: avond, lunch, weekend, ontbijt. Meerdere zijn mogelijk.
tijd en porties zijn getallen. Geef ENKEL de JSON terug.`;
    let berichten = [{ role: 'user', content: `Haal het recept op van: ${url}` }];
    let data = await agentFetch(apiKey, { model: AGENT_MODEL, max_tokens: 2000, system: systeemprompt, tools: [{ type: 'web_search_20250305', name: 'web_search' }], messages: berichten });
    let max = 5;
    while (data.stop_reason === 'tool_use' && max-- > 0) {
      document.getElementById('import-loader-tekst').textContent = 'Pagina wordt gelezen…';
      const toolResults = [];
      for (const block of data.content) {
        if (block.type === 'tool_use') toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: 'Extraheer het recept van: ' + url });
      }
      berichten.push({ role: 'assistant', content: data.content });
      berichten.push({ role: 'user', content: toolResults });
      data = await agentFetch(apiKey, { model: AGENT_MODEL, max_tokens: 2000, system: systeemprompt, tools: [{ type: 'web_search_20250305', name: 'web_search' }], messages: berichten });
    }
    const tekst = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    const jsonStr = tekst.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    let recept;
    try { recept = JSON.parse(jsonStr); }
    catch (e) { const m = jsonStr.match(/\{[\s\S]*\}/); if (!m) throw new Error('Geen recept gevonden op deze pagina.'); recept = JSON.parse(m[0]); }
    if (!recept.naam) throw new Error('Geen receptnaam gevonden. Is dit een receptpagina?');
    recept.ingredienten = (recept.ingredienten || []).map(i => ({ naam: i.naam || '', hoev: String(i.hoev || ''), eenheid: i.eenheid || '', winkel: zoekStandaardWinkel(i.naam) || 'Colruyt' }));
    recept.bron = recept.bron || url;
    geimporteerdRecept = recept;
    toonImportPreview(recept);
    naarStap(3);
  } catch (e) {
    document.getElementById('import-error-tekst').innerHTML = `<strong>❌ Import mislukt</strong><br><br>${escHtml(e.message)}`;
    naarStap(4);
  }
}

function toonImportPreview(r, containerId = 'import-preview') {
  const typeLabels = { avond: '<i data-lucide="utensils" class="icon-inline"></i> Avond', lunch: '<i data-lucide="leaf" class="icon-inline"></i> Lunch', weekend: '<i data-lucide="utensils" class="icon-inline"></i> Weekend', ontbijt: '<i data-lucide="coffee" class="icon-inline"></i> Ontbijt' };
  const types = (r.types || [r.type]).filter(Boolean).map(t => typeLabels[t] || t).join(', ');
  const ingLijst = (r.ingredienten || []).slice(0, 8).map(i => `<span>${i.hoev ? escHtml(i.hoev) + ' ' + escHtml(i.eenheid) + ' ' : ''}${escHtml(i.naam)}</span>`).join('');
  const meer = (r.ingredienten || []).length > 8 ? `<span style="color:var(--muted);">+${r.ingredienten.length - 8} meer</span>` : '';
  document.getElementById(containerId).innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px;">
      <div class="import-preview-naam">${escHtml(r.naam)}</div>
      <span class="import-success-badge">✅ Gevonden</span>
    </div>
    <div class="import-preview-meta">
      ${r.tijd ? `<span><i data-lucide="timer" class="icon-inline"></i> ${r.tijd} min</span>` : ''}
      ${r.porties ? `<span><i data-lucide="utensils" class="icon-inline"></i> ${r.porties} porties</span>` : ''}
      ${types ? `<span><i data-lucide="clipboard-list" class="icon-inline"></i> ${types}</span>` : ''}
      ${r.moeilijk ? `<span>${r.moeilijk}</span>` : ''}
    </div>
    ${r.bereiding ? `<div style="font-size:12px;color:var(--muted);margin-bottom:10px;line-height:1.5;max-height:60px;overflow:hidden;">${escHtml(r.bereiding.slice(0, 200))}${r.bereiding.length > 200 ? '…' : ''}</div>` : ''}
    <div style="font-size:11px;font-weight:600;color:var(--muted);margin-bottom:6px;">INGREDIËNTEN (${(r.ingredienten || []).length})</div>
    <div style="font-size:12px;">${ingLijst}${meer}</div>
    ${r.bron ? `<div style="font-size:11px;color:var(--muted-2);margin-top:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"><i data-lucide="link" class="icon-inline"></i> ${escHtml(r.bron)}</div>` : ''}`;
}

function openReceptVanImport() {
  if (!geimporteerdRecept) return;
  closeImportModal();
  setTimeout(() => openReceptModal(geimporteerdRecept, true), 100);
}

function openKeuzeModal() { document.getElementById('keuze-modal-bg').classList.add('open'); }
function sluitKeuzeModal() { document.getElementById('keuze-modal-bg').classList.remove('open'); }

// ── Foto-scan ────────────────────────────────────────────────
let _fotoBase64 = null;
let _fotoMimeType = 'image/jpeg';
let _geimporteerdFotoRecept = null;

function _naarFotoStap(n) {
  document.querySelectorAll('#foto-modal-bg .import-stap').forEach(el => el.classList.remove('actief'));
  document.getElementById('foto-stap-' + n).classList.add('actief');
}

function openFotoModal() {
  _fotoBase64 = null;
  _geimporteerdFotoRecept = null;
  document.getElementById('foto-preview-wrap').style.display = 'none';
  document.getElementById('foto-drop-zone').style.display = 'block';
  document.getElementById('foto-scan-btn').disabled = true;
  document.getElementById('foto-scan-input').value = '';
  _naarFotoStap(1);
  document.getElementById('foto-modal-bg').classList.add('open');
}
function sluitFotoModal() { document.getElementById('foto-modal-bg').classList.remove('open'); }

function _verwerkFotoBestand(file) {
  if (!file || !file.type.startsWith('image/')) return;
  _fotoMimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      // Verklein naar max 1280px en max ~800KB voor efficiëntie
      const MAX = 1280;
      let w = img.width, h = img.height;
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
        else       { w = Math.round(w * MAX / h); h = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL(_fotoMimeType, 0.82);
      _fotoBase64 = dataUrl.split(',')[1];
      // Toon preview
      document.getElementById('foto-preview-img').src = dataUrl;
      document.getElementById('foto-preview-wrap').style.display = 'block';
      document.getElementById('foto-drop-zone').style.display = 'none';
      document.getElementById('foto-scan-btn').disabled = false;
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

async function startFotoScan() {
  if (!_fotoBase64) return;
  const apiKey = localStorage.getItem('anthropic_api_key') || ''; // CodeQL[js/clear-text-storage-of-sensitive-information]
  if (!apiKey) {
    document.getElementById('foto-error-tekst').innerHTML = '<strong>❌ Geen API-sleutel</strong><br><br>Stel je Anthropic API-sleutel in via <a href="instellingen.html" style="color:var(--accent)">Instellingen</a>.';
    _naarFotoStap(4); return;
  }
  _naarFotoStap(2);
  try {
    const systeemprompt = `Je bent een recept-extractie assistent. De gebruiker stuurt een foto van een recept (uit een kookboek, tijdschrift of handgeschreven). Analyseer de afbeelding en geef UITSLUITEND geldige JSON terug zonder markdown backticks of uitleg.
Formaat:
{
  "naam": "string",
  "types": ["avond|lunch|weekend|ontbijt"],
  "tijd": 30,
  "porties": 4,
  "moeilijk": "Snel|Normaal|Uitgebreid",
  "bereiding": "string — volledige bereidingswijze, stap voor stap",
  "ingredienten": [{"naam":"string","hoev":"500","eenheid":"gram"}],
  "tags": [],
  "bron": "foto"
}
types is een array, kies uit: avond, lunch, weekend, ontbijt. Meerdere zijn mogelijk.
tijd en porties zijn getallen. hoev is altijd een string. Geef ENKEL de JSON terug, niets anders.`;
    const data = await agentFetch(apiKey, {
      model: AGENT_MODEL,
      max_tokens: 2000,
      system: systeemprompt,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: _fotoMimeType, data: _fotoBase64 } },
          { type: 'text', text: 'Extraheer het recept uit deze afbeelding en geef het terug als JSON.' },
        ],
      }],
    });
    const tekst = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    const jsonStr = tekst.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    let recept;
    try { recept = JSON.parse(jsonStr); }
    catch (e) { const m = jsonStr.match(/\{[\s\S]*\}/); if (!m) throw new Error('Geen recept herkend in de foto.'); recept = JSON.parse(m[0]); }
    if (!recept.naam) throw new Error('Geen receptnaam gevonden. Is dit een foto van een recept?');
    recept.ingredienten = (recept.ingredienten || []).map(i => ({
      naam: i.naam || '', hoev: String(i.hoev || ''), eenheid: i.eenheid || '',
      winkel: zoekStandaardWinkel(i.naam) || '',
    }));
    _geimporteerdFotoRecept = recept;
    toonImportPreview(recept, 'foto-import-preview');
    _naarFotoStap(3);
  } catch(e) {
    document.getElementById('foto-error-tekst').innerHTML = `<strong>❌ Scannen mislukt</strong><br><br>${escHtml(e?.message || String(e))}`;
    _naarFotoStap(4);
  }
}

function openReceptVanFoto() {
  if (!_geimporteerdFotoRecept) return;
  sluitFotoModal();
  setTimeout(() => openReceptModal(_geimporteerdFotoRecept, true), 100);
}

function openLinkModal() {
  document.getElementById('link-url').value = '';
  document.getElementById('link-status').textContent = '';
  document.getElementById('btn-scrape').disabled = false;
  document.getElementById('btn-scrape').innerHTML = '<i data-lucide="search" class="icon-inline"></i> Importeren';
  document.getElementById('link-modal-bg').classList.add('open');
  setTimeout(() => document.getElementById('link-url').focus(), 150);
  if (typeof lucide !== 'undefined') lucide.createIcons();
}
function sluitLinkModal() { document.getElementById('link-modal-bg').classList.remove('open'); }

async function startScrape() {
  const url = document.getElementById('link-url').value.trim();
  if (!url || !url.startsWith('http')) { toonOpslagStatus('❌ Plak een geldige URL (begin met https://).'); return; }
  const statusEl = document.getElementById('link-status');
  const btn = document.getElementById('btn-scrape');
  btn.disabled = true; btn.textContent = '⏳ Bezig…';
  statusEl.textContent = 'Pagina ophalen via corsproxy…';
  try {
    const proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(url);
    const res = await fetch(proxyUrl);
    if (!res.ok) throw new Error('Kon pagina niet laden (' + res.status + ')');
    const html = await res.text();
    const recept = parseJsonLd(html, url);
    if (!recept) throw new Error('NO_JSON_LD');
    sluitLinkModal();
    setTimeout(() => openReceptModal(recept, true), 100);
  } catch (e) {
    if (e.message === 'NO_JSON_LD') {
      statusEl.innerHTML = '<i data-lucide="triangle-alert" class="icon-inline"></i> Geen gestructureerde receptdata gevonden op deze site.<br><button class="link-btn" data-action="wissel-naar-import" style="color:var(--accent);font-weight:600;background:none;border:none;cursor:pointer;padding:0;font-family:inherit;font-size:inherit;">Probeer via AI-import (vereist API key) →</button>';
      if (typeof lucide !== 'undefined') lucide.createIcons();
    } else {
      statusEl.textContent = '❌ ' + e.message;
    }
    btn.disabled = false; btn.textContent = '🔍 Importeren';
  }
}

function parseJsonLd(html, url) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const scripts = [...doc.querySelectorAll('script[type="application/ld+json"]')];
  for (const s of scripts) {
    try {
      const data = JSON.parse(s.textContent);
      const recipe = vindRecipe(data);
      if (recipe) return maakReceptVanJsonLd(recipe, url);
    } catch (e) { }
  }
  return null;
}

function vindRecipe(data) {
  if (!data) return null;
  const t = data['@type'];
  if (t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'))) return data;
  if (data['@graph']) { for (const i of data['@graph']) { const r = vindRecipe(i); if (r) return r; } }
  if (Array.isArray(data)) { for (const i of data) { const r = vindRecipe(i); if (r) return r; } }
  return null;
}

function parseerDuur(iso) {
  if (!iso) return null;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  return m ? (parseInt(m[1] || 0) * 60 + parseInt(m[2] || 0)) : null;
}

function parseerIngredienten(lijst) {
  return (lijst || []).map(ing => {
    const s = String(ing).trim();
    const m = s.match(/^([\d.,½¼¾]+)?\s*(g|kg|ml|l|el|tl|tsp|tbsp|cup|dl|oz|stuks?|blik|pak|snuf)?\s*(.+)/i);
    const naam = m ? m[3].trim() : s;
    return { naam, hoev: m ? m[1]?.replace(',', '.') || '' : '', eenheid: m ? m[2]?.toLowerCase() || '' : '', winkel: zoekStandaardWinkel(naam) || '' };
  });
}

function maakReceptVanJsonLd(data, url) {
  const tijd = parseerDuur(data.cookTime) || parseerDuur(data.totalTime) || parseerDuur(data.prepTime) || 30;
  const porties = parseInt(String(data.recipeYield || '4').match(/\d+/)?.[0]) || 4;
  const inst = Array.isArray(data.recipeInstructions)
    ? data.recipeInstructions.map(i => typeof i === 'string' ? i : (i.text || '')).join('\n\n')
    : String(data.recipeInstructions || '');
  return {
    naam: data.name || '',
    types: [], type: 'avond',
    tijd, porties,
    moeilijk: 'Normaal',
    bron: url,
    bereiding: inst.slice(0, 3000),
    ingredienten: parseerIngredienten(data.recipeIngredient || []),
    tags: [], wie: [...PERSONEN], prive: false,
  };
}

// ── Event listeners ───────────────────────────────────────────
document.addEventListener('click', function (e) {
  if (!e.target.closest('#topbar-user') && !e.target.closest('#profiel-menu'))
    document.getElementById('profiel-menu')?.classList.remove('open');
});

const _modalCloses = {
  'recept-modal-bg': closeReceptModal,
  'import-modal-bg': closeImportModal,
  'keuze-modal-bg': sluitKeuzeModal,
  'link-modal-bg': sluitLinkModal,
  'foto-modal-bg': sluitFotoModal,
};
Object.entries(_modalCloses).forEach(([id, closeFn]) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', e => { if (e.target === el) closeFn(); });
});

document.getElementById('recept-fiche-overlay')?.addEventListener('click', function (e) {
  if (e.target === this) sluitFiche();
});

document.getElementById('recept-type-sel-mob')?.addEventListener('change', e => filterRType(e.target.value, null));

document.getElementById('recept-search')?.addEventListener('input', () => renderRecepten());

// ── Foto-scan: file input + drag-and-drop ────────────────────
document.getElementById('foto-scan-input')?.addEventListener('change', function() {
  if (this.files[0]) _verwerkFotoBestand(this.files[0]);
});

const _fotoDrop = document.getElementById('foto-drop-zone');
if (_fotoDrop) {
  _fotoDrop.addEventListener('dragover', e => { e.preventDefault(); _fotoDrop.style.borderColor = 'var(--accent)'; });
  _fotoDrop.addEventListener('dragleave', () => { _fotoDrop.style.borderColor = 'var(--border-2)'; });
  _fotoDrop.addEventListener('drop', e => {
    e.preventDefault();
    _fotoDrop.style.borderColor = 'var(--border-2)';
    const file = e.dataTransfer?.files?.[0];
    if (file) _verwerkFotoBestand(file);
  });
}

document.addEventListener('focusin', function (e) {
  if (e.target.classList.contains('ing-combo-input')) {
    const row = e.target.closest('[id^="ing-"]');
    if (row) filterIngCombo(e.target, row.id);
  }
});
document.addEventListener('focusout', function (e) {
  if (e.target.classList.contains('ing-combo-input')) {
    const row = e.target.closest('[id^="ing-"]');
    if (row) setTimeout(() => sluitIngCombo(row.id), 150);
  }
});
document.addEventListener('input', function (e) {
  if (e.target.classList.contains('ing-combo-input')) {
    const row = e.target.closest('[id^="ing-"]');
    if (row) filterIngCombo(e.target, row.id);
  }
});

document.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') {
    if (e.target.id === 'import-url') startImport();
    if (e.target.id === 'link-url') startScrape();
  }
});

document.addEventListener('mousedown', function (e) {
  const el = e.target.closest('[data-action="kies-ing"],[data-action="maak-nieuw-ing"]');
  if (!el) return;
  e.preventDefault();
  if (el.dataset.action === 'kies-ing') {
    kiesIng(el.dataset.rowid, el.dataset.naam, el.dataset.winkel);
  } else {
    maakNieuwIng(el.dataset.rowid, el.dataset.naam);
  }
});

document.addEventListener('click', function (e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  switch (el.dataset.action) {
    case 'toggle-profiel-menu': document.getElementById('profiel-menu')?.classList.toggle('open'); break;
    case 'open-keuze-modal': openKeuzeModal(); break;
    case 'filter-rtype': filterRType(el.dataset.type, el); break;
    case 'open-fiche': openFiche(el.dataset.ficheId); break;
    case 'sluit-fiche': sluitFiche(); break;
    case 'bewerk-recept': openReceptModal(recepten.find(r => r.id === el.dataset.id)); break;
    case 'verwijder-recept': verwijderRecept(el.dataset.id); break;
    case 'close-import-modal': closeImportModal(); break;
    case 'start-import': startImport(); break;
    case 'naar-stap-1': naarStap(1); break;
    case 'recept-van-import': openReceptVanImport(); break;
    case 'manueel-invoeren': openReceptModal(); closeImportModal(); break;
    case 'sluit-keuze-modal': sluitKeuzeModal(); break;
    case 'keuze-manueel': sluitKeuzeModal(); openReceptModal(); break;
    case 'keuze-foto': sluitKeuzeModal(); openFotoModal(); break;
    case 'keuze-link': sluitKeuzeModal(); openLinkModal(); break;
    case 'sluit-foto-modal': sluitFotoModal(); break;
    case 'klik-foto-input': document.getElementById('foto-scan-input').click(); break;
    case 'start-foto-scan': startFotoScan(); break;
    case 'recept-van-foto': openReceptVanFoto(); break;
    case 'foto-opnieuw': _naarFotoStap(1); _fotoBase64 = null; document.getElementById('foto-preview-wrap').style.display='none'; document.getElementById('foto-drop-zone').style.display='block'; document.getElementById('foto-scan-btn').disabled=true; break;
    case 'sluit-link-modal': sluitLinkModal(); break;
    case 'start-scrape': startScrape(); break;
    case 'wissel-naar-import': sluitLinkModal(); openImportModal(); break;
    case 'toggle-type': toggleType(el); break;
    case 'set-ster': setSter(parseInt(el.dataset.v)); break;
    case 'add-ingredient': addIngredient(); break;
    case 'verwijder-ing-rij': { const row = el.closest('div[id^="ing-"]'); if (row) row.remove(); break; }
    case 'toggle-tag': {
      const isSel = el.dataset.sel === '1';
      el.dataset.sel = isSel ? '0' : '1';
      el.style.background = !isSel ? 'var(--accent)' : 'var(--surface)';
      el.style.color = !isSel ? '#fff' : 'var(--muted)';
      el.style.borderColor = !isSel ? 'var(--accent)' : 'var(--border-2)';
      break;
    }
    case 'close-recept-modal': closeReceptModal(); break;
    case 'save-recept': saveRecept(); break;
  }
});


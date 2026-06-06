Auth.initPagina('ingredienten');
laadOp().then(renderIngredienten).catch(()=>{laadLokaal();renderIngredienten();});

let activeIngWinkelFilter = 'alle';

function renderIngredienten() {
  const search = (document.getElementById('ing-search')||{}).value || '';
  const winkels = ['alle', ...new Set(standaardIngredienten.map(i => i.winkel).filter(Boolean))];
  document.getElementById('ing-winkel-filter').innerHTML = winkels.map(w =>
    `<button class="ptab${activeIngWinkelFilter===w?' active':''}" data-action="filter-ing-winkel" data-winkel="${escHtml(w)}">${w==='alle'?'Alle winkels':escHtml(w)}</button>`
  ).join('');
  const mobSel=document.getElementById('ing-winkel-sel-mob');
  if(mobSel){mobSel.innerHTML=winkels.map(w=>`<option value="${w}"${activeIngWinkelFilter===w?' selected':''}>${w==='alle'?'Alle winkels':w}</option>`).join('');}
  let filtered = standaardIngredienten;
  if (activeIngWinkelFilter !== 'alle') filtered = filtered.filter(i => i.winkel === activeIngWinkelFilter);
  if (search) filtered = filtered.filter(i => i.naam.toLowerCase().includes(search.toLowerCase()));
  filtered = [...filtered].sort((a, b) => a.naam.localeCompare(b.naam));
  const el = document.getElementById('ingredienten-lijst');
  if (!filtered.length) {
    el.innerHTML = `<div class="empty-state"><span class="empty-icon">🥦</span><p>Geen ingrediënten gevonden</p></div>`;
    return;
  }
  const perWinkel = {};
  filtered.forEach(i => { if (!perWinkel[i.winkel]) perWinkel[i.winkel] = []; perWinkel[i.winkel].push(i); });
  el.innerHTML = Object.entries(perWinkel).map(([winkel, items]) => `
    <div style="margin-bottom:1.2rem;">
      <div style="font-size:12px;font-weight:700;color:var(--ink);margin-bottom:6px;padding-bottom:4px;border-bottom:1.5px solid var(--border);">🏪 ${escHtml(winkel)}</div>
      ${items.map(i => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--bg-2);">
          <div style="display:flex;align-items:center;gap:8px;min-width:0;">
            <span style="font-size:14px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(i.naam)}</span>
            ${i.productLink && /^https?:\/\//i.test(i.productLink) ? `<a href="${escHtml(i.productLink)}" target="_blank" rel="noopener" title="Productlink openen" style="color:var(--accent);font-size:16px;line-height:1;flex-shrink:0;"><i data-lucide="link" style="width:14px;height:14px;display:inline-block;vertical-align:-0.15em;"></i></a>` : ''}
          </div>
          <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;margin-left:8px;">
            <select style="font-size:12px;padding:4px 8px;border:1.5px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);color:var(--ink);font-family:inherit;" data-action="wijzig-winkel" data-id="${i.id}">
              ${WINKELS.map(w => `<option${w===i.winkel?' selected':''}>${escHtml(w)}</option>`).join('')}
            </select>
            <button class="btn btn-secondary btn-sm" data-action="bewerk-ingredient" data-id="${i.id}">✏️</button>
            <button class="btn btn-danger btn-sm" data-action="verwijder-ingredient" data-id="${i.id}">×</button>
          </div>
        </div>`).join('')}
    </div>`).join('');
}

function filterIngWinkel(w) { activeIngWinkelFilter = w; renderIngredienten(); }

function openIngModal(ing) {
  document.getElementById('ing-modal-titel').textContent = ing ? 'Ingrediënt bewerken' : 'Ingrediënt toevoegen';
  document.getElementById('i-naam').value = ing ? ing.naam : '';
  const winkelSel = document.getElementById('i-winkel');
  winkelSel.innerHTML = WINKELS.map(w => `<option>${escHtml(w)}</option>`).join('');
  winkelSel.value = ing ? ing.winkel : (WINKELS[0] || '');
  document.getElementById('i-link').value = ing ? (ing.productLink || '') : '';
  document.getElementById('ing-modal-bg').dataset.editId = ing ? ing.id : '';
  document.getElementById('ing-modal-bg').classList.add('open');
  setTimeout(() => document.getElementById('i-naam').focus(), 150);
}
function closeIngModal() { document.getElementById('ing-modal-bg').classList.remove('open'); }

function saveIngredient() {
  const naam = document.getElementById('i-naam').value.trim();
  if (!naam) return;
  const editId = document.getElementById('ing-modal-bg').dataset.editId;
  const winkel = document.getElementById('i-winkel').value;
  const productLink = document.getElementById('i-link').value.trim() || null;
  if (standaardIngredienten.some(i => i.naam.toLowerCase() === naam.toLowerCase() && i.id != editId)) {
    alert(`"${naam}" bestaat al in de ingrediëntenlijst.`);
    return;
  }
  if (editId) {
    const ing = standaardIngredienten.find(i => i.id == editId);
    if (ing) { ing.naam = naam; ing.winkel = winkel; ing.productLink = productLink; sbSaveIngredient(ing); }
  } else {
    const n = { id: _maakId(), naam, winkel, categorie: '', productLink };
    standaardIngredienten.push(n);
    sbSaveIngredient(n);
  }
  closeIngModal();
  slaLokaalOp();
  renderIngredienten();
}

function wijzigWinkel(id, winkel) {
  const ing = standaardIngredienten.find(i => i.id === id || i.id == id);
  if (ing) { ing.winkel = winkel; slaLokaalOp(); sbSaveIngredient(ing); }
}

function verwijderIngredient(id) {
  if (!confirm('Ingrediënt verwijderen?')) return;
  const ing = standaardIngredienten.find(i => i.id === id || i.id == id);
  standaardIngredienten = standaardIngredienten.filter(i => i.id !== id && i.id != id);
  slaLokaalOp();
  if (ing?._sbId) sbDeleteIngredient(ing._sbId);
  renderIngredienten();
}

// ── Event delegation: clicks ──────────────────────────────────
document.addEventListener('click', function(e) {
  const el = e.target.closest('[data-action]');
  if (!el) {
    if (!e.target.closest('#topbar-user') && !e.target.closest('#profiel-menu'))
      document.getElementById('profiel-menu')?.classList.remove('open');
    return;
  }
  switch (el.dataset.action) {
    case 'toggle-profiel-menu':
      document.getElementById('profiel-menu')?.classList.toggle('open');
      break;
    case 'open-ing-modal':
      openIngModal();
      break;
    case 'close-ing-modal':
      closeIngModal();
      break;
    case 'save-ingredient':
      saveIngredient();
      break;
    case 'filter-ing-winkel':
      filterIngWinkel(el.dataset.winkel);
      break;
    case 'bewerk-ingredient':
      openIngModal(standaardIngredienten.find(x => x.id == el.dataset.id));
      break;
    case 'verwijder-ingredient':
      verwijderIngredient(parseFloat(el.dataset.id) || el.dataset.id);
      break;
  }
});

// ── Event delegation: changes ─────────────────────────────────
document.addEventListener('change', function(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  if (el.dataset.action === 'wijzig-winkel') {
    wijzigWinkel(parseFloat(el.dataset.id) || el.dataset.id, el.value);
  } else if (el.dataset.action === 'filter-ing-winkel-mob') {
    filterIngWinkel(el.value);
  }
});

// ── Event delegation: search input ────────────────────────────
document.getElementById('ing-search')?.addEventListener('input', renderIngredienten);

// ── Modal overlay sluiten ─────────────────────────────────────
document.getElementById('ing-modal-bg').addEventListener('click', e => {
  if (e.target === document.getElementById('ing-modal-bg')) closeIngModal();
});

// ── Sluitknop injecteren in alle modals ───────────────────────
document.addEventListener('DOMContentLoaded', function(){
  document.querySelectorAll('.modal-bg .modal').forEach(modal => {
    if(modal.querySelector('.modal-sluit-btn')) return;
    const bg = modal.closest('.modal-bg');
    const btn = document.createElement('button');
    btn.className = 'modal-sluit-btn';
    btn.setAttribute('aria-label', 'Sluiten');
    btn.textContent = '✕';
    btn.onclick = function(e){ e.stopPropagation(); if(bg) bg.classList.remove('open'); };
    modal.insertBefore(btn, modal.firstChild);
  });
});

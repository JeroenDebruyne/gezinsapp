Auth.initPagina('index');
Promise.race([laadOp(), new Promise((_,r) => setTimeout(() => r(new Error('timeout')), 8000))])
  .then(renderHomepage).catch(() => { laadLokaal(); renderHomepage(); });

if (typeof Maps !== 'undefined' && !Maps.getCoords() && Maps.getThuisadres())
  Maps.geocodeerAdres(Maps.getThuisadres()).catch(() => {});

onGezinsappUpdate(renderHomepage);
AppState.subscribe('activiteiten', renderHomepage);
AppState.subscribe('todos', renderHomepage);

(function () {
  const welkom = document.getElementById('home-chat-welkom');
  if (!welkom) return;
  const heeftKey = !!localStorage.getItem('anthropic_api_key');
  welkom.innerHTML = heeftKey
    ? '<div class="chat-bubble-bot">Hallo! Ik heb toegang tot jullie agenda, recepten en planning. Waarmee kan ik helpen?</div>'
    : '<div class="chat-bubble-bot"><i data-lucide="key" class="icon-inline"></i> Gezinsassistent is niet actief. Stel je API key in via <i data-lucide="settings" class="icon-inline"></i> Instellingen om mij te activeren.</div>';
})();

function openActDetail(id) {
  const a = activiteiten.find(x => x.id == id);
  if (!a) return;
  const emoji = a.wie?.length === 1 ? (PEMOJI[a.wie[0]] || null) : null;
  const emojiFallback = emoji ? escHtml(emoji) : '<i data-lucide="users" style="width:22px;height:22px;"></i>';
  const wieHtml = (a.wie || []).map(w => `<span class="badge ${PBADGE[w] || ''}">${escHtml(PLABEL[w] || w)}</span>`).join(' ');
  const freq = { wekelijks: 'Wekelijks', tweewekelijks: 'Tweewekelijks', eenmalig: 'Eenmalig', maandelijks: 'Maandelijks' };
  document.getElementById('act-detail-inhoud').innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;font-size:18px;font-weight:700;color:var(--ink);padding-bottom:12px;margin-bottom:14px;border-bottom:1px solid var(--border);">
      <span style="font-size:22px;display:flex;align-items:center;">${emojiFallback}</span><span>${escHtml(a.naam)}${a.prive ? ' <i data-lucide="lock" style="width:14px;height:14px;display:inline-block;vertical-align:-0.1em;"></i>' : ''}</span>
    </div>
    <div style="display:flex;flex-direction:column;gap:10px;font-size:14px;color:var(--ink-2);">
      ${a.start ? `<div><i data-lucide="clock" class="icon-inline"></i> <strong>${escHtml(a.start)}${a.eindUur ? ' – ' + escHtml(a.eindUur) : ''}</strong></div>` : ''}
      ${a.locatie ? `<div><i data-lucide="map-pin" class="icon-inline"></i> ${escHtml(a.locatie)}</div>` : ''}
      ${a.wie?.length ? `<div><i data-lucide="user" class="icon-inline"></i> ${wieHtml}</div>` : ''}
      ${a.freq && a.freq !== 'eenmalig' ? `<div><i data-lucide="refresh-cw" class="icon-inline"></i> ${escHtml(freq[a.freq] || a.freq)}</div>` : ''}
      ${a.beginDatum ? `<div><i data-lucide="calendar" class="icon-inline"></i> ${escHtml(a.beginDatum)}${a.eindDatum && a.eindDatum !== a.beginDatum ? ' – ' + escHtml(a.eindDatum) : ''}</div>` : ''}
      ${a.informatief ? `<span class="badge" style="background:var(--bg-2);color:var(--muted);"><i data-lucide="pin" class="icon-inline"></i> Informatief</span>` : ''}
    </div>`;
  document.getElementById('act-detail-agenda-btn').onclick = () => location.href = `agenda.html?datum=${_atNuISO()}`;
  document.getElementById('act-detail-bg').classList.add('open');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function sluitActDetail() {
  document.getElementById('act-detail-bg').classList.remove('open');
}

function renderHomepage() {
  const nu = new Date(); const datumISO = fDateISO(nu); const p = Auth.profiel();
  localStorage.setItem('gezinsapp_vandaag', datumISO);
  const dagNamen = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
  const maandNamen = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
  document.getElementById('dag-datum').textContent =
    dagNamen[nu.getDay()].charAt(0).toUpperCase() + dagNamen[nu.getDay()].slice(1) +
    ' ' + nu.getDate() + ' ' + maandNamen[nu.getMonth()] + ' ' + nu.getFullYear();
  const uur = nu.getHours();
  document.getElementById('dag-begroeting').textContent =
    (uur < 12 ? 'Goedemorgen' : uur < 18 ? 'Goedemiddag' : 'Goedenavond') + ', ' + (p?.naam || '...') + '!';
  const drukte = getDagDrukte(datumISO);
  document.getElementById('dag-drukte-dot').style.background = { rustig: 'var(--rustig-dot)', normaal: 'var(--normaal-dot)', druk: 'var(--druk-dot)' }[drukte];
  document.getElementById('dag-drukte-label').textContent = { rustig: 'Rustige dag', normaal: 'Drukke dag', druk: 'Zeer drukke dag' }[drukte];
  renderPersoonStrip(p);
  renderVandaag(datumISO, p);
  renderTodosPreview(p);
  renderVerjaardagHome();
}

function _vhParseObj(v) { if (!v) return null; if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } } return v; }
function _vhDagen(datumStr, herhalend) {
  if (!datumStr) return null;
  const nu = new Date(); nu.setHours(0, 0, 0, 0);
  const d = new Date(datumStr + 'T12:00:00');
  if (!herhalend) return Math.round((d - nu) / 86400000);
  let jaar = nu.getFullYear();
  let vl = new Date(jaar, d.getMonth(), d.getDate());
  if (vl < nu) vl = new Date(jaar + 1, d.getMonth(), d.getDate());
  return Math.round((vl - nu) / 86400000);
}
function renderVerjaardagHome() {
  const el = document.getElementById('verjaardag-home');
  if (!el) return;
  const VENSTER = 7;
  const items = [];
  (Auth.getProfielen() || []).forEach(p => {
    if (!p.geboortedatum) return;
    const d = _vhDagen(p.geboortedatum, true);
    if (d !== null && d >= 0 && d <= VENSTER)
      items.push({ icon: 'cake', label: p.naam, dagen: d, datum: p.geboortedatum });
  });
  contacten.forEach(c => {
    const nm = c.naam || 'Contact';
    [_vhParseObj(c.partner1), _vhParseObj(c.partner2)].filter(Boolean).forEach(p => {
      if (!p.verjaardag) return;
      const pnm = ((p.voornaam || '') + ' ' + (p.achternaam || '')).trim() || nm;
      const d = _vhDagen(p.verjaardag, true);
      if (d !== null && d >= 0 && d <= VENSTER) items.push({ icon: 'cake', label: pnm, dagen: d, datum: p.verjaardag });
    });
    (_vhParseObj(c.kinderenData) || []).forEach(k => {
      if (!k.verjaardag) return;
      const kn = ((k.voornaam || '') + ' ' + (k.achternaam || '')).trim() || 'Kind';
      const d = _vhDagen(k.verjaardag, true);
      if (d !== null && d >= 0 && d <= VENSTER) items.push({ icon: 'cake', label: kn, dagen: d, datum: k.verjaardag });
    });
    (c.belangrijkeDatums || []).forEach(bd => {
      if (!bd.datum) return;
      const d = _vhDagen(bd.datum, bd.herhalend);
      if (d !== null && d >= 0 && d <= VENSTER) items.push({ icon: 'calendar', label: `${bd.label || 'Datum'} — ${nm}`, dagen: d, datum: bd.datum });
    });
  });
  items.sort((a, b) => a.dagen - b.dagen);
  if (!items.length) { el.innerHTML = ''; return; }
  el.innerHTML = items.map(it => {
    const datObj = new Date(it.datum + 'T12:00:00');
    const dagStr = datObj.toLocaleDateString('nl-BE', { day: 'numeric', month: 'long' });
    const wanneer = it.dagen === 0 ? 'Vandaag!' : it.dagen === 1 ? 'Morgen' : `Over ${it.dagen} dagen`;
    const vandaag = it.dagen === 0;
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;
      background:${vandaag ? 'var(--normaal-bg)' : 'var(--surface-2)'};
      border:1.5px solid ${vandaag ? 'var(--normaal-dot)' : 'var(--border)'};
      border-radius:var(--radius-sm);margin-bottom:6px;">
      <div style="flex:1;font-size:14px;font-weight:${vandaag ? 700 : 500};color:var(--ink);display:flex;align-items:center;gap:6px;">${it.icon ? `<i data-lucide="${escHtml(it.icon)}" style="width:14px;height:14px;flex-shrink:0;"></i>` : ''} ${escHtml(it.label)}</div>
      <div style="text-align:right;flex-shrink:0;">
        <div style="font-size:13px;font-weight:600;color:${vandaag ? 'var(--normaal-clr)' : 'var(--accent)'};">${wanneer}</div>
        <div style="font-size:11px;color:var(--muted);">${dagStr}</div>
      </div>
    </div>`;
  }).join('');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderPersoonStrip(p) {
  const huidig = sessionStorage.getItem('perspectief') || p?.persoonKey;
  const profielen = Auth.PROFIELEN;
  const n = profielen.length;
  const cols = (n % 3 === 0) ? 3 : (n % 2 === 0) ? 2 : 3;
  const strip = document.getElementById('persoon-strip');
  strip.style.setProperty('--avatar-cols', cols);
  strip.innerHTML = profielen.map(pr => `
    <div class="avatar-chip${pr.persoonKey === huidig ? ' active' : ''}" data-action="wissel-persoon" data-key="${escHtml(pr.persoonKey)}">
      <span>${escHtml(pr.emoji)}</span><span>${escHtml(pr.naam)}</span>
    </div>`).join('');
}

function wisselPersoon(key) { sessionStorage.setItem('perspectief', key); renderHomepage(); }

function renderVandaag(datumISO, p) {
  const el = document.getElementById('vandaag-lijst');
  const perspectief = sessionStorage.getItem('perspectief') || p?.persoonKey;
  const dagActs = activiteiten.filter(a => {
    if (!isActiefOpDatum(a, datumISO)) return false;
    if (a.prive && !Auth.kan('kanAllesZien') && !a.wie?.includes(perspectief)) return false;
    if (perspectief) return !a.wie || a.wie.includes(perspectief) || a.wie.includes('familie');
    return true;
  }).sort((a, b) => tijdMinuten(a.start) - tijdMinuten(b.start));
  if (!dagActs.length) { el.innerHTML = '<div class="empty-state"><i data-lucide="sun" class="empty-icon"></i><p>Geen activiteiten vandaag</p><a href="agenda.html" class="btn btn-secondary btn-sm" style="margin-top:10px;display:inline-flex;">Plan activiteit →</a></div>'; return; }
  el.innerHTML = dagActs.map(a => `
    <div class="card" style="display:flex;align-items:center;gap:12px;cursor:pointer;" data-action="open-act-detail" data-id="${Number(a.id)}">
      <div style="font-size:22px;display:flex;align-items:center;">${a.wie?.length === 1 ? (PEMOJI[a.wie[0]] ? `<span>${escHtml(PEMOJI[a.wie[0]])}</span>` : '<i data-lucide="calendar-range" style="width:20px;height:20px;"></i>') : '<i data-lucide="users" style="width:20px;height:20px;"></i>'}</div>
      <div style="flex:1;">
        <div class="card-title">${a.informatief ? '<i data-lucide="pin" style="width:13px;height:13px;display:inline-block;vertical-align:-0.1em;"></i> ' : ''}${escHtml(a.naam)}${a.prive ? ' <i data-lucide="lock" style="width:13px;height:13px;display:inline-block;vertical-align:-0.1em;"></i>' : ''}</div>
        <div class="meta">
          ${a.start ? `<span><i data-lucide="clock" style="width:12px;height:12px;display:inline-block;vertical-align:-0.1em;"></i> ${escHtml(a.start)}${a.eindUur ? ' – ' + escHtml(a.eindUur) : ''}</span>` : ''}
          ${a.locatie ? `<span><i data-lucide="map-pin" style="width:12px;height:12px;display:inline-block;vertical-align:-0.1em;"></i> ${escHtml(a.locatie)}</span>` : ''}
          ${(a.wie || []).map(w => `<span class="badge ${PBADGE[w] || ''}">${escHtml(PLABEL[w] || w)}</span>`).join('')}
        </div>
      </div>
      <div style="color:var(--muted);font-size:14px;flex-shrink:0;">›</div>
    </div>`).join('');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderTodosPreview(p) {
  const el = document.getElementById('todos-preview');
  const perspectief = sessionStorage.getItem('perspectief') || p?.persoonKey;
  const open = todos.filter(t => !t.gedaan && (!t.wie || t.wie.includes(perspectief))).slice(0, 5);
  if (!open.length) { el.innerHTML = '<div class="leeg"><div class="leeg-icon"><i data-lucide="check-circle" style="width:32px;height:32px;color:var(--muted-2);"></i></div><div class="leeg-titel">Geen openstaande to-do\'s</div><div class="leeg-sub">Tik op + om een taak toe te voegen</div></div>'; return; }
  el.innerHTML = open.map(t => `
    <div class="todo-item${t.gedaan ? ' gedaan' : ''}">
      <button class="todo-cirkel${t.gedaan ? ' gedaan' : ''}${!t.gedaan && t.prioriteit ? ' ' + t.prioriteit : ''}" data-action="toggle-todo-preview" data-id="${Number(t.id)}"></button>
      <div class="todo-body" style="cursor:pointer;" data-action="ga-todos">
        <div class="todo-titel${t.gedaan ? ' gedaan' : ''}">${escHtml(t.titel)}</div>
        <div class="todo-meta">
          ${t.deadline ? `<span><i data-lucide="calendar" style="width:12px;height:12px;display:inline-block;vertical-align:-0.1em;"></i> ${escHtml(t.deadline)}</span>` : ''}
          ${(t.wie || []).map(w => `<span class="badge ${PBADGE[w] || ''}">${escHtml(PLABEL[w] || w)}</span>`).join('')}
        </div>
      </div>
    </div>`).join('') +
    '<a href="todos.html" style="display:block;text-align:center;font-size:12px;color:var(--muted);padding:8px;margin-top:4px;">Alle to-do\'s bekijken →</a>';
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function toggleTodo(id) {
  const t = todos.find(x => x.id == id);
  if (!t) return;
  t.gedaan = !t.gedaan; t.gedaanOp = t.gedaan ? fDateISO(new Date()) : null;
  slaLokaalOp(); sbSaveTodo(t);
  renderTodosPreview(Auth.profiel());
}

function _hSysteemPrompt() {
  const vandaagISO = _atNuISO();
  const dagNaamNL = DLANG_GD[new Date(vandaagISO + 'T12:00:00').getDay()];
  let planCtx = '';
  try {
    const dates = _atGetWeekDates(0);
    planCtx = '\n\nHUIDIGE WEEK:\n' + dates.map((d, i) => {
      const key = fDateISO(d); const dag = planning[key] || {};
      const acts = activiteiten.filter(a => isActiefOpDatum(a, key)).map(a => a.naam + (a.start ? ' ' + a.start : '')).join(', ');
      return '  ' + DKORT[i] + ' ' + key + (key === vandaagISO ? ' ←VANDAAG' : '') +
        ': O=' + _atGetNaam(dag.ontbijt) + ' L=' + _atGetNaam(dag.lunch) + ' A=' + _atGetNaam(dag.avond) + (acts ? ' [' + acts + ']' : '');
    }).join('\n');
  } catch (e) { }
  return `Je bent de gezinsassistent.
Vandaag: ${dagNaamNL} ${vandaagISO}.
${bouwGezinsContext()}
Week loopt ma→zo. Op schooldagen (ma-vr) eten kinderen 's middags op school.${planCtx}

REGELS:
- Vraag ALTIJD bevestiging vóór elke schrijfactie (bevestiging_vereist:true).
- Roep get_eethistoriek(8) aan VÓÓR je een weekmenu plant.
- Bij stel_weekmenu_in: gebruik NUMERIEK recept-id uit get_recepten, nooit de naam.
- Antwoord altijd in het Nederlands. Wees bondig en concreet.${geheugen.length ? '\n\nGEHEUGEN (onthouden voorkeuren en feiten):\n' + geheugen.map((g, i) => `${i + 1}. ${g.tekst}`).join('\n') : ''}`;
}

const homeAgent = createAgentChat({
  tools: AGENT_TOOLS,
  buildSystemPrompt: _hSysteemPrompt,
  execute: agentExecute,
  ids: { berichten: 'home-chat-berichten-desktop', input: 'home-chat-input-desktop', bevestiging: 'home-bevestiging-desktop', bevestigingTekst: 'home-bevestiging-tekst-desktop', storageKey: 'home_chat_history' },
});

function stuurVoorbeeldHome(tekst) { homeAgent.stuurVoorbeeldVraag(tekst); }
function homeWisChat() { homeAgent.wis('<div style="align-self:flex-start;"><div class="chat-bubble-bot">Chat gewist. Waarmee kan ik helpen?</div></div>'); }

async function laadWeer() {
  try {
    const stored = JSON.parse(localStorage.getItem('gezinsapp_thuisadres_coords') || 'null');
    const coords = stored || { lat: 50.97, lng: 3.19 };
    let buienUrl = 'https://www.buienradar.be';
    try { const _u = new URL(localStorage.getItem('gezinsapp_buienradar_url') || ''); if (_u.protocol === 'https:') buienUrl = _u.href; } catch { }
    const wLink = document.getElementById('weer-widget');
    if (wLink) { wLink.href = buienUrl; wLink.onclick = function (e) { e.preventDefault(); window.open(buienUrl, '_blank', 'noopener'); }; }
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lng}&current=temperature_2m,weather_code&timezone=Europe%2FBrussels`);
    const d = await r.json();
    if (d.error) throw new Error(d.reason || 'API fout');
    const temp = Math.round(d.current.temperature_2m);
    const code = d.current.weather_code ?? 0;
    document.getElementById('weer-icon').innerHTML = weerIcon(code);
    document.getElementById('weer-temp').textContent = temp + '°C';
  } catch (e) { console.warn('[Weer]', e); document.getElementById('weer-temp').textContent = '—'; }
}
function weerIcon(code) {
  const s = 'width:16px;height:16px;display:inline-block;vertical-align:-0.15em;';
  if (code === 0) return `<i data-lucide="sun" style="${s}"></i>`;
  if (code <= 2) return `<i data-lucide="cloud-sun" style="${s}"></i>`;
  if (code <= 3) return `<i data-lucide="cloud" style="${s}"></i>`;
  if (code <= 67) return `<i data-lucide="cloud-rain" style="${s}"></i>`;
  if (code <= 77) return `<i data-lucide="cloud-snow" style="${s}"></i>`;
  if (code <= 82) return `<i data-lucide="cloud-drizzle" style="${s}"></i>`;
  if (code <= 99) return `<i data-lucide="cloud-lightning" style="${s}"></i>`;
  return `<i data-lucide="cloud-sun" style="${s}"></i>`;
}
laadWeer();

// ── Event listeners ───────────────────────────────────────────
document.addEventListener('click', function (e) {
  if (!e.target.closest('#topbar-user') && !e.target.closest('#profiel-menu'))
    document.getElementById('profiel-menu')?.classList.remove('open');
});

document.getElementById('act-detail-bg')?.addEventListener('click', function (e) {
  if (e.target === this) sluitActDetail();
});

const _chatInp = document.getElementById('home-chat-input-desktop');
if (_chatInp) {
  _chatInp.addEventListener('keydown', e => { if (e.key === 'Enter') homeAgent.stuurBericht(e.target.value); });
  _chatInp.addEventListener('focus', () => {
    setTimeout(() => _chatInp.scrollIntoView({ behavior: 'smooth', block: 'center' }), 350);
  });
}

if (window.visualViewport) {
  const _setVVH = () => document.documentElement.style.setProperty('--vvh', window.visualViewport.height + 'px');
  window.visualViewport.addEventListener('resize', _setVVH);
  _setVVH();
}

document.addEventListener('click', function (e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  switch (el.dataset.action) {
    case 'toggle-profiel-menu': document.getElementById('profiel-menu')?.classList.toggle('open'); break;
    case 'stuur-voorbeeld-home': stuurVoorbeeldHome(el.dataset.tekst); break;
    case 'home-wis-chat': homeWisChat(); break;
    case 'home-bevestig': homeAgent.bevestig(); break;
    case 'home-annuleer': homeAgent.annuleer(); break;
    case 'home-stuur': homeAgent.stuurBericht(document.getElementById('home-chat-input-desktop').value); break;
    case 'navigeer': location.href = el.dataset.href; break;
    case 'sluit-act-detail': sluitActDetail(); break;
    case 'wissel-persoon': wisselPersoon(el.dataset.key); break;
    case 'open-act-detail': openActDetail(parseFloat(el.dataset.id) || el.dataset.id); break;
    case 'toggle-todo-preview': toggleTodo(parseFloat(el.dataset.id) || el.dataset.id); break;
    case 'ga-todos': location.href = 'todos.html'; break;
  }
});

// ── Sluitknop injecteren in alle modals ──────────────────────
document.querySelectorAll('.modal-bg .modal').forEach(modal => {
  if (modal.querySelector('.modal-sluit-btn')) return;
  const bg = modal.closest('.modal-bg');
  const btn = document.createElement('button');
  btn.className = 'modal-sluit-btn';
  btn.setAttribute('aria-label', 'Sluiten');
  btn.textContent = '✕';
  btn.onclick = function (e) {
    e.stopPropagation();
    if (bg) bg.classList.remove('open');
  };
  modal.insertBefore(btn, modal.firstChild);
});

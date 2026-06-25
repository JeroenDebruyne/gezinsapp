Auth.initPagina('agent');

// iOS keyboard: pas --vvh aan zodat de chat-container krimpt ipv wegschuift
if (window.visualViewport) {
  const _setVVH = () => document.documentElement.style.setProperty('--vvh', window.visualViewport.height + 'px');
  window.visualViewport.addEventListener('resize', _setVVH);
  _setVVH();
}

let _dataGeladen = false;
let _vandaagISO = null, _dagNaamNL = null;

laadOp().catch(() => laadLokaal()).finally(() => { _dataGeladen = true; });
Promise.all([_laadDatum(), _laadWeer()]);
if (typeof BroadcastChannel !== 'undefined')
  new BroadcastChannel('gezinsapp_data').onmessage = () => { laadLokaal(); };


// ── Systeemprompt ────────────────────────────────────────────────
function _bouwSysteemPrompt() {
  const vandaagISO = _atNuISO();
  const dagNaamNL = _dagNaamNL || DLANG_GD[new Date(vandaagISO + 'T12:00:00').getDay()];
  let planCtx = '';
  try {
    const dates = _atGetWeekDates(0);
    planCtx = '\n\nHUIDIGE WEEK (' + wLabel(dates) + '):\n' + dates.map((d, i) => {
      const key = fDateISO(d);
      const dag = planning[key] || {};
      const acts = activiteiten.filter(a => isActiefOpDatum(a, key)).map(a => a.naam + (a.start ? ' ' + a.start : '')).join(', ');
      return '  ' + DKORT[i] + ' ' + key + (key === vandaagISO ? ' ←VANDAAG' : '') +
        ': O=' + _atGetNaam(dag.ontbijt) + ' L=' + _atGetNaam(dag.lunch) + ' A=' + _atGetNaam(dag.avond) +
        (acts ? ' [' + acts + ']' : '');
    }).join('\n');
  } catch(e) { console.warn('[systeemprompt planCtx]', e); }
  return `Je bent de gezinsassistent.
Vandaag: ${dagNaamNL} ${vandaagISO}.
${bouwGezinsContext()}
Week loopt ma→zo. Op schooldagen (ma-vr) eten kinderen 's middags op school.${planCtx}

REGELS:
- Vraag ALTIJD bevestiging vóór elke schrijfactie (bevestiging_vereist:true).
- Roep get_eethistoriek(8) aan VÓÓR je een weekmenu plant. Vermijd recepten die de afgelopen 8 weken al voorkwamen.
- Bij stel_weekmenu_in: gebruik NUMERIEK recept-id uit get_recepten, nooit de naam.
- Antwoord altijd in het Nederlands. Wees bondig en concreet.${geheugen.length ? '\n\nGEHEUGEN (onthouden voorkeuren en feiten):\n' + geheugen.map((g, i) => `${i+1}. ${g.tekst}`).join('\n') : ''}`;
}

// ── Datum laden (agent-specifiek: toont in chat-bubble) ──────────
async function _laadDatum() {
  const opgeslagen = localStorage.getItem('gezinsapp_vandaag');
  if (opgeslagen && /^\d{4}-\d{2}-\d{2}$/.test(opgeslagen)) {
    _vandaagISO = opgeslagen; _dagNaamNL = DLANG_GD[new Date(opgeslagen + 'T12:00:00').getDay()];
    _toonDatumInChat(); return;
  }
  try {
    const fmt = new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit'});
    const iso = fmt.format(new Date());
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      _vandaagISO = iso; _dagNaamNL = DLANG_GD[new Date(iso + 'T12:00:00').getDay()];
      _toonDatumInChat(); return;
    }
  } catch(e) {}
  const nu = new Date();
  _vandaagISO = fDateISO(nu); _dagNaamNL = DLANG_GD[nu.getDay()];
  _toonDatumInChat();
}

function _toonDatumInChat() {
  if (!_vandaagISO || !_dagNaamNL) return;
  const versieEl = document.getElementById('agent-versie');
  if (versieEl) versieEl.textContent = 'v2026-05-21c · ' + _vandaagISO;
  const el = document.querySelector('#chat-berichten .chat-bubble-bot');
  if (el) el.innerHTML = `Hallo! 👋 Ik ben jullie gezinsassistent. Vandaag is het <strong>${_dagNaamNL} ${_vandaagISO}</strong>.<br>Ik heb volledige toegang tot jullie agenda, recepten, weekplanning, to-do's, contacten en kinderlogistiek. Ik vraag altijd bevestiging voor ik iets aanpas. Hoe kan ik helpen?`;
}

// ── Agent instantie ─────────────────────────────────────────────
const agent = createAgentChat({
  tools: AGENT_TOOLS,
  buildSystemPrompt: _bouwSysteemPrompt,
  execute: agentExecute,
  isDataGeladen: () => _dataGeladen,
  ids: { berichten:'chat-berichten', input:'chat-input', bevestiging:'bevestiging-panel', bevestigingTekst:'bevestiging-tekst', storageKey:'agent_chat_history' },
});

function stuurVoorbeeldVraag(tekst){ agent.stuurVoorbeeldVraag(tekst); }
function clearChat(){ agent.wis('<div style="align-self:flex-start;"><div class="chat-bubble-bot">Chat gewist. Hoe kan ik helpen? 👋</div></div>'); }

// ── iOS keyboard fix ─────────────────────────────────────────────
// --vvh volgt de visual viewport zodat de chat-layout krimpt zodra het
// toetsenbord verschijnt (fallback voor iOS < 15.4 zonder dvh)
if (window.visualViewport) {
  const _setVVH = () => document.documentElement.style.setProperty('--vvh', window.visualViewport.height + 'px');
  window.visualViewport.addEventListener('resize', _setVVH);
  _setVVH();
}

// ── Event delegation: clicks ─────────────────────────────────────
document.addEventListener('click', function(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  switch (el.dataset.action) {
    case 'nav-instellingen': location.href = 'instellingen.html'; break;
    case 'stuur-voorbeeld': stuurVoorbeeldVraag(el.dataset.tekst); break;
    case 'clear-chat': clearChat(); break;
    case 'agent-bevestig': agent.bevestig(); break;
    case 'agent-annuleer': agent.annuleer(); break;
    case 'agent-stuur': agent.stuurBericht(document.getElementById('chat-input').value); break;
  }
});

// ── Chat input: Enter verstuurt ──────────────────────────────────
document.getElementById('chat-input')?.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') agent.stuurBericht(this.value);
});

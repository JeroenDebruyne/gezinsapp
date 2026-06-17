Auth.initPagina('kinderlogistiek');

// Transportopties worden dynamisch geladen uit transportPersonen (instellingen)
function getTransportOpties() {
  const personen = (typeof transportPersonen !== 'undefined' ? transportPersonen : []).map(p => p.naam || p);
  return ['', ...personen];
}

let weekOffsetKL = 0;
let kindFilter = 'alle';

laadOp().then(()=>{ renderKindFilterTabs(); renderStandaardRooster(); renderKL(); }).catch(()=>{ laadLokaal(); renderKindFilterTabs(); renderStandaardRooster(); renderKL(); });
onGezinsappUpdate(()=>{ renderKindFilterTabs(); renderStandaardRooster(); renderKL(); });
AppState.subscribe('activiteiten', renderKL);
AppState.subscribe('transportUitzonderingen', renderKL);
AppState.subscribe('standaardTransport', ()=>{ renderStandaardRooster(); renderKL(); });

function renderKindFilterTabs(){
  const kinderen = Auth.getProfielen().filter(p=>p.isKind);
  const container = document.getElementById('kl-filter-tabs');
  if(!container) return;
  container.innerHTML =
    `<button class="filter-tab${kindFilter==='alle'?' active':''}" data-action="set-kind-filter" data-filter="alle"><i data-lucide="users" class="icon-inline"></i> Alle</button>` +
    kinderen.map(k=>`<button class="filter-tab${kindFilter===k.persoonKey?' active':''}" data-action="set-kind-filter" data-filter="${k.persoonKey}">${k.emoji||'👧'} ${k.naam}</button>`).join('');
  const klMobSel=document.getElementById('kl-sel-mob');
  if(klMobSel){klMobSel.innerHTML=`<option value="alle"${kindFilter==='alle'?' selected':''}>Alle</option>`+kinderen.map(k=>`<option value="${k.persoonKey}"${kindFilter===k.persoonKey?' selected':''}>${k.naam}</option>`).join('');}
}

function changeWeekKL(dir){ weekOffsetKL+=dir; renderKL(); }

function setKindFilter(filter, el){
  kindFilter=filter;
  document.querySelectorAll('#kl-filter-tabs .filter-tab').forEach(t=>t.classList.remove('active'));
  if(el) el.classList.add('active');
  const klMobSel=document.getElementById('kl-sel-mob');if(klMobSel)klMobSel.value=filter;
  renderKL();
}

function getTransport(datum, kind){
  const dagKey = DAGMAP[new Date(datum+'T12:00:00').getDay()];
  const std = standaardTransport[kind]?.[dagKey] || {};
  const uitz = transportUitzonderingen[datum]?.[kind] || {};
  return {
    brengt: uitz.brengt !== undefined ? uitz.brengt : (std.brengt||''),
    haalt:  uitz.haalt  !== undefined ? uitz.haalt  : (std.haalt||''),
    eetGroo: uitz.eetGroo !== undefined ? uitz.eetGroo : (std.eetGroo||false),
    isOverride: Object.keys(uitz).length > 0,
  };
}

function isSchoolDag(datum){
  const d = new Date(datum+'T12:00:00');
  const dw = d.getDay();
  if(dw===0||dw===6) return false;
  if(isSchoolvakantie(datum)) return false;
  return true;
}

function renderKL(){
  const dates = getWeekDates(weekOffsetKL);
  document.getElementById('week-lbl-kl').textContent = wLabel(dates);
  const today = fDateISO(new Date());
  const weekHeeftVandaag = dates.some(d=>fDateISO(d)===today);

  const alleKinderenCheck = Auth.getProfielen().filter(p=>p.isKind);
  if (!alleKinderenCheck.length) {
    const _ghNamen = Auth.getProfielen().filter(p=>!p.isKind).map(p=>p.naam);
    const _ghLabel = _ghNamen.length ? _ghNamen.join(' of ') : 'een gezinshoofd';
    document.getElementById('kl-grid').innerHTML = `<div class="empty-state"><i data-lucide="baby" class="empty-icon"></i><p>Geen kinderen ingesteld.</p><p style="font-size:13px;color:var(--muted);">Ga naar <i data-lucide="settings" class="icon-inline"></i> Instellingen en stel een gezinslid in op de rol "Kind".</p></div>`;
    return;
  }

  document.getElementById('kl-grid').innerHTML = dates.map((date,i)=>{
    const datum = fDateISO(date);
    const dagKey = DAGMAP[date.getDay()];
    const isW = date.getDay()===0||date.getDay()===6;
    const isVandaag = datum===today;
    const isOpen = weekHeeftVandaag?(datum===today):(i===0);
    const school = isSchoolDag(datum);
    const vakantie = isSchoolvakantie(datum);

    // Activiteiten voor de kinderen vandaag (excl. informatief + gezinshoofd doet mee)
    const alleKinderen = alleKinderenCheck.map(p=>p.persoonKey);
    const kinderen = kindFilter==='alle' ? alleKinderen : [kindFilter];
    const gezinshoofden = Auth.getProfielen().filter(p=>!p.isKind).map(p=>p.persoonKey);
    const kindActs = activiteiten.filter(a=>
      isActiefOpDatum(a,datum) &&
      !a.informatief &&
      (a.wie||[]).some(w=>kinderen.includes(w)) &&
      !(a.wie||[]).some(w=>gezinshoofden.includes(w))
    );

    // Badges in header
    let badgesHtml = '';
    if(vakantie) badgesHtml+=`<span class="kl-vakantie-badge"><i data-lucide="umbrella" style="width:12px;height:12px;display:inline-block;vertical-align:-0.1em;"></i> ${getVakantieNaam(datum)}</span>`;
    else if(school) badgesHtml+=`<span class="kl-act-badge"><i data-lucide="graduation-cap" style="width:12px;height:12px;display:inline-block;vertical-align:-0.1em;"></i> School</span>`;
    kindActs.forEach(a=>{badgesHtml+=`<span class="kl-act-badge"><i data-lucide="pin" style="width:12px;height:12px;display:inline-block;vertical-align:-0.1em;"></i> ${escHtml(a.naam)}</span>`;});

    // Per-kind body
    const kindBodyHtml = kinderen.map(kind=>{
      if(isW) return `<div class="kl-kind-sectie"><div class="kl-kind-titel">${PEMOJI[kind]} ${PLABEL[kind]}<span style="font-weight:400;font-size:11px;color:var(--muted);">— Weekend</span></div></div>`;
      const t = getTransport(datum, kind);
      const heeftOverride = t.isOverride;

      // Activiteiten voor dit kind (excl. informatief + gezinshoofd doet mee)
      const kindActsHtml = activiteiten
        .filter(a=>
          isActiefOpDatum(a,datum) &&
          !a.informatief &&
          (a.wie||[]).includes(kind) &&
          !(a.wie||[]).some(w=>gezinshoofden.includes(w))
        )
        .map(a=>{
          const cap = kind.charAt(0).toUpperCase()+kind.slice(1);
          const brengt = a[`brengt${cap}`]||'';
          const haalt  = a[`haalt${cap}`]||'';
          const transportInfo = [
            brengt ? `<i data-lucide="car" style="width:12px;height:12px;display:inline-block;vertical-align:-0.1em;"></i>→ ${escHtml(brengt)}` : '',
            haalt  ? `←<i data-lucide="car" style="width:12px;height:12px;display:inline-block;vertical-align:-0.1em;"></i> ${escHtml(haalt)}` : '',
          ].filter(Boolean).join(' · ');
          return `
          <div class="kl-act-rij">
            <div class="kl-act-info">
              <span class="kl-act-badge"><i data-lucide="pin" style="width:12px;height:12px;display:inline-block;vertical-align:-0.1em;"></i> ${escHtml(a.naam)}${a.start?' ('+escHtml(a.start)+')':''}</span>
              ${transportInfo?`<span class="kl-act-transport">${transportInfo}</span>`:''}
            </div>
            <button class="kl-edit-btn" data-action="open-transport-modal" data-id="${a.id}" data-datum="${datum}" data-kind="${kind}" title="Transport bewerken"><i data-lucide="pencil" style="width:13px;height:13px;"></i></button>
          </div>`;
        })
        .join('');

      const dagKeyStr = `${datum}_${kind}`;
      return `
      <div class="kl-kind-sectie">
        <div class="kl-kind-titel">
          ${PEMOJI[kind]} ${PLABEL[kind]}
          ${heeftOverride?`<button class="kl-reset-btn" data-action="reset-transport" data-datum="${datum}" data-kind="${kind}">Herstel standaard</button>`:''}
        </div>
        ${kindActsHtml?`<div class="kl-acts-wrap">${kindActsHtml}</div>`:''}
        <div class="kl-transport-rij">
          <div class="kl-transport-veld">
            <label><i data-lucide="car" class="icon-inline"></i>→ School: wie brengt?</label>
            <select id="brengt-${dagKeyStr}" data-action="transport-change" data-datum="${datum}" data-kind="${kind}"
              class="${heeftOverride&&transportUitzonderingen[datum]?.[kind]?.brengt!==undefined?'override':''}">
              ${getTransportOpties().map(o=>`<option value="${o}"${t.brengt===o?' selected':''}>${o||'— Standaard —'}</option>`).join('')}
            </select>
          </div>
          <div class="kl-transport-veld">
            <label>←<i data-lucide="car" class="icon-inline"></i> School: wie haalt?</label>
            <select id="haalt-${dagKeyStr}" data-action="transport-change" data-datum="${datum}" data-kind="${kind}"
              class="${heeftOverride&&transportUitzonderingen[datum]?.[kind]?.haalt!==undefined?'override':''}">
              ${getTransportOpties().map(o=>`<option value="${o}"${t.haalt===o?' selected':''}>${o||'— Standaard —'}</option>`).join('')}
            </select>
          </div>
          <div class="kl-transport-veld" style="display:flex;align-items:flex-end;padding-bottom:4px;">
            <label class="kl-eetgroo" data-action="toggle-eetgroo" data-datum="${datum}" data-kind="${kind}">
              <div class="ios-switch${t.eetGroo?' on':''}" id="eetgroo-${dagKeyStr}" style="flex-shrink:0;"></div>
              <span><i data-lucide="utensils" class="icon-inline"></i> Eet bij grootouders</span>
            </label>
          </div>
        </div>
      </div>`;
    }).join('');

    return `
    <div class="kl-dag-rij${isVandaag?' vandaag':''}${isW?' weekend':''}">
      <div class="kl-dag-header" data-action="toggle-kl-dag" data-datum="${datum}">
        <span class="kl-dag-naam">${DKORT[i]}</span>
        <span class="kl-dag-datum">${fDate(date)}</span>
        <div class="kl-dag-badges">${badgesHtml}</div>
        <span class="kl-dag-chevron">${isOpen?'▾':'›'}</span>
      </div>
      <div class="kl-dag-body${isOpen?' open':''}" id="kl-body-${datum}">
        ${isW&&!vakantie
          ? `<div style="font-size:13px;color:var(--muted);padding:4px 0;">Weekend — geen schooltransport</div>`
          : kindBodyHtml
        }
      </div>
    </div>`;
  }).join('');
}

function toggleKLDag(datum){
  const body = document.getElementById('kl-body-'+datum);
  const rij = body?.closest('.kl-dag-rij');
  if(!body) return;
  const isOpen = body.classList.toggle('open');
  const chevron = rij?.querySelector('.kl-dag-chevron');
  if(chevron) chevron.textContent = isOpen?'▾':'›';
}

function slaTransportOp(datum, kind){
  const dagKeyStr = `${datum}_${kind}`;
  const brengt = document.getElementById('brengt-'+dagKeyStr)?.value ?? '';
  const haalt  = document.getElementById('haalt-'+dagKeyStr)?.value ?? '';
  const eetGrooEl = document.getElementById('eetgroo-'+dagKeyStr);
  const eetGroo = eetGrooEl ? eetGrooEl.classList.contains('on') : false;

  if(!transportUitzonderingen[datum]) transportUitzonderingen[datum]={};
  transportUitzonderingen[datum][kind] = { brengt, haalt, eetGroo };
  slaLokaalOp();
  sbSaveInstellingen();
  maakTransportActiviteit(datum, kind, brengt, haalt);
  // Accent kleur bij override
  document.getElementById('brengt-'+dagKeyStr)?.classList.toggle('override', true);
  document.getElementById('haalt-'+dagKeyStr)?.classList.toggle('override', true);
  toonOpslagStatus('✅ Transport opgeslagen');
}

function toggleEetGroo(datum, kind){
  const dagKeyStr = `${datum}_${kind}`;
  const el = document.getElementById('eetgroo-'+dagKeyStr);
  if(!el) return;
  el.classList.toggle('on');
  slaTransportOp(datum, kind);
}

function resetTransport(datum, kind){
  if(!confirm('Standaard transport herstellen voor '+PLABEL[kind]+' op '+datum+'?')) return;
  if(transportUitzonderingen[datum]) delete transportUitzonderingen[datum][kind];
  if(transportUitzonderingen[datum]&&!Object.keys(transportUitzonderingen[datum]).length)
    delete transportUitzonderingen[datum];
  slaLokaalOp();
  sbSaveInstellingen();
  toonOpslagStatus('✅ Uitzondering verwijderd');
  renderKL();
}

const KL_WEEKDAGEN = DAGKEYS.slice(0,5);
const KL_WEEKDAGLABELS = DLANG.slice(0,5);

function renderStandaardRooster() {
  const kinderen = Auth.getProfielen().filter(p=>p.isKind);
  const el = document.getElementById('standaard-rooster-inhoud');
  if (!el) return;
  if (!kinderen.length) {
    el.innerHTML = '<div style="font-size:13px;color:var(--muted);padding:6px 0;">Geen kinderen geconfigureerd. Ga naar <i data-lucide="settings" class="icon-inline"></i> Instellingen → Profielen en stel de rol in op "Kind".</div>';
    return;
  }
  el.innerHTML = kinderen.map(kind => {
    const p = kind.persoonKey;
    return `
    <div class="kl-std-kind">
      <div class="kl-std-kind-naam">${kind.emoji||'👧'} ${kind.naam}</div>
      ${KL_WEEKDAGEN.map((dag, i) => {
        const std = (standaardTransport[p]||{})[dag] || {};
        return `
        <div class="kl-std-rij">
          <span class="kl-std-dag">${KL_WEEKDAGLABELS[i].slice(0,2)}</span>
          <select class="kl-std-select${std.brengt?' ingevuld':''}"
            data-action="std-transport-change" data-kind="${p}" data-dag="${dag}" data-veld="brengt">
            ${getTransportOpties().map(o=>`<option value="${o}"${(std.brengt||'')=== o?' selected':''}>${o||'— Brengt? —'}</option>`).join('')}
          </select>
          <select class="kl-std-select${std.haalt?' ingevuld':''}"
            data-action="std-transport-change" data-kind="${p}" data-dag="${dag}" data-veld="haalt">
            ${getTransportOpties().map(o=>`<option value="${o}"${(std.haalt||'')=== o?' selected':''}>${o||'— Haalt? —'}</option>`).join('')}
          </select>
        </div>
        <div class="kl-std-rij" style="margin-top:-2px;margin-bottom:8px;">
          <span></span>
          <label class="kl-std-eetgroo kl-std-eetgroo-rij" data-action="toggle-std-eetgroo" data-kind="${p}" data-dag="${dag}">
            <div class="ios-switch${std.eetGroo?' on':''}" id="std-eetgroo-${p}-${dag}"></div>
            <span><i data-lucide="utensils" class="icon-inline"></i> Eet bij grootouders</span>
          </label>
        </div>`;
      }).join('')}
    </div>`;
  }).join('');
}

function slaStandaardOp(kind, dag, veld, waarde) {
  if (!standaardTransport[kind]) standaardTransport[kind] = {};
  if (!standaardTransport[kind][dag]) standaardTransport[kind][dag] = {};
  standaardTransport[kind][dag][veld] = waarde;
  slaLokaalOp();
  sbSaveInstellingen();
  toonOpslagStatus('✅ Standaard opgeslagen');
}

function toggleStdEetGroo(kind, dag) {
  if (!standaardTransport[kind]) standaardTransport[kind] = {};
  if (!standaardTransport[kind][dag]) standaardTransport[kind][dag] = {};
  const huidig = standaardTransport[kind][dag].eetGroo || false;
  standaardTransport[kind][dag].eetGroo = !huidig;
  const el = document.getElementById(`std-eetgroo-${kind}-${dag}`);
  if (el) el.className = 'ios-switch' + (!huidig ? ' on' : '');
  slaLokaalOp();
  sbSaveInstellingen();
}

let standaardRoosterOpen = false;
function toggleStandaardRooster() {
  standaardRoosterOpen = !standaardRoosterOpen;
  const body = document.getElementById('standaard-rooster-body');
  const chevron = document.getElementById('standaard-chevron');
  if (body) body.style.display = standaardRoosterOpen ? 'block' : 'none';
  if (chevron) chevron.textContent = standaardRoosterOpen ? '▾' : '›';
}

// ── Modal: transport per activiteit ──────────────────────────
let _modalActId = null, _modalDatum = null, _modalKind = null;

function _vulModalOpties() {
  ['kl-modal-brengt','kl-modal-haalt'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel || sel.children.length > 1) return;
    sel.innerHTML = getTransportOpties().map(o=>`<option value="${o}">${o||'— Niet van toepassing —'}</option>`).join('');
  });
}

function openActTransportModal(actId, datum, kind) {
  _vulModalOpties();
  const act = activiteiten.find(a=>a.id===actId||a.id==actId);
  if (!act) return;
  _modalActId = actId; _modalDatum = datum; _modalKind = kind;
  const cap = kind.charAt(0).toUpperCase()+kind.slice(1);
  document.getElementById('kl-modal-titel').textContent = act.naam;
  document.getElementById('kl-modal-sub').textContent =
    [act.start, act.eindUur].filter(Boolean).join(' – ') +
    (act.locatie ? ' · ' + act.locatie : '') +
    (act.reisHeen ? ' · Reistijd heen: '+act.reisHeen+' min' : '');
  document.getElementById('kl-modal-brengt').value = act[`brengt${cap}`]||'';
  document.getElementById('kl-modal-haalt').value  = act[`haalt${cap}`]||'';
  document.getElementById('kl-act-modal').classList.remove('hidden');
}

function sluitActModal(e) {
  if (e && e.target !== document.getElementById('kl-act-modal')) return;
  document.getElementById('kl-act-modal').classList.add('hidden');
  _modalActId = _modalDatum = _modalKind = null;
}

function slaActTransportOp() {
  const act = activiteiten.find(a=>a.id===_modalActId||a.id==_modalActId);
  if (!act || !_modalKind) return;
  const cap = _modalKind.charAt(0).toUpperCase()+_modalKind.slice(1);
  const brengt = document.getElementById('kl-modal-brengt').value;
  const haalt  = document.getElementById('kl-modal-haalt').value;
  act[`brengt${cap}`] = brengt;
  act[`haalt${cap}`]  = haalt;
  slaLokaalOp();
  sbSaveActiviteit(act);
  toonOpslagStatus('✅ Opgeslagen');
  // Todo aanmaken/bijwerken voor gezinshoofd
  beheerTransportTodo(act, _modalDatum, _modalKind, 'brengt', brengt);
  beheerTransportTodo(act, _modalDatum, _modalKind, 'haalt',  haalt);
  document.getElementById('kl-act-modal').classList.add('hidden');
  _modalActId = _modalDatum = _modalKind = null;
  renderKL();
  toonOpslagStatus('✅ Transport opgeslagen');
}

// ── Todo beheer voor gezinshoofd transport ────────────────────
function _subTijdstip(tijd, minuten) {
  if (!tijd || !minuten) return tijd || null;
  const tot = tijdMinuten(tijd) - minuten;
  if (tot < 0 || tot > 1439) return tijd;
  return String(Math.floor(tot/60)).padStart(2,'0') + ':' + String(tot%60).padStart(2,'0');
}

function beheerTransportTodo(act, datum, kind, type, vervoerder) {
  const kindNaam = PLABEL[kind] || kind;
  const titel = type === 'brengt'
    ? `Breng ${kindNaam} naar ${act.naam}`
    : `Haal ${kindNaam} op van ${act.naam}`;
  const tijdstip = type === 'brengt'
    ? _subTijdstip(act.start,   act.reisHeen)
    : _subTijdstip(act.eindUur, act.reisTerug);

  const ghProfielen = Auth.getProfielen().filter(p=>!p.isKind);
  const isGH = ghProfielen.some(p =>
    p.naam === vervoerder || p.persoonKey === vervoerder.toLowerCase()
  );

  const bestaandeIdx = todos.findIndex(t => t.deadline === datum && t.titel === titel);
  if (bestaandeIdx >= 0) {
    if (!isGH) {
      const todo = todos[bestaandeIdx];
      if (todo._sbId) sbDeleteTodo(todo._sbId);
      todos.splice(bestaandeIdx, 1);
    } else {
      const todo = todos[bestaandeIdx];
      todo.notitie = tijdstip ? `Vertrek om ${tijdstip}` : '';
      const persoon = ghProfielen.find(p => p.naam === vervoerder || p.persoonKey === vervoerder.toLowerCase());
      todo.wie = persoon ? [persoon.persoonKey] : [];
      sbSaveTodo(todo);
    }
    slaLokaalOp();
    return;
  }

  if (!isGH) return;

  const persoon = ghProfielen.find(p => p.naam === vervoerder || p.persoonKey === vervoerder.toLowerCase());
  const todo = {
    id: Date.now() + Math.round(Math.random()*1000),
    titel,
    notitie: tijdstip ? `Vertrek om ${tijdstip}` : '',
    deadline: datum,
    prioriteit: 'middel',
    wie: persoon ? [persoon.persoonKey] : [],
    gedaan: false,
    aangemaaktDoor: Auth.profiel()?.persoonKey || null,
    aangemaaktOp: new Date().toISOString(),
  };
  todos.push(todo);
  slaLokaalOp();
  sbSaveTodo(todo);
  toonOpslagStatus('✅ Todo aangemaakt voor ' + vervoerder);
}

// ── Centrale event delegation ─────────────────────────────────
document.addEventListener('click', function(e) {
  // Stop propagation voor modal inner content
  const modalInner = e.target.closest('.kl-modal');
  if (modalInner) {
    e.stopPropagation();
    // Fall through to handle data-action buttons inside modal
  }

  const btn = e.target.closest('[data-action]');
  if (!btn) return;

  const action = btn.dataset.action;

  switch (action) {
    case 'toggle-profiel-menu':
      document.getElementById('profiel-menu')?.classList.toggle('open');
      break;

    case 'change-week': {
      const dir = parseInt(btn.dataset.dir, 10);
      changeWeekKL(dir);
      break;
    }

    case 'set-kind-filter':
      setKindFilter(btn.dataset.filter, btn);
      break;

    case 'toggle-standaard-rooster':
      toggleStandaardRooster();
      break;

    case 'toggle-kl-dag':
      toggleKLDag(btn.dataset.datum);
      break;

    case 'open-transport-modal':
      openActTransportModal(btn.dataset.id, btn.dataset.datum, btn.dataset.kind);
      break;

    case 'reset-transport':
      resetTransport(btn.dataset.datum, btn.dataset.kind);
      break;

    case 'toggle-eetgroo':
      toggleEetGroo(btn.dataset.datum, btn.dataset.kind);
      break;

    case 'toggle-std-eetgroo':
      toggleStdEetGroo(btn.dataset.kind, btn.dataset.dag);
      break;

    case 'sluit-act-modal':
      document.getElementById('kl-act-modal').classList.add('hidden');
      _modalActId = _modalDatum = _modalKind = null;
      break;

    case 'sla-act-transport-op':
      slaActTransportOp();
      break;
  }
});

// Sluit modal bij klik op overlay (buiten .kl-modal)
document.addEventListener('click', function(e) {
  const overlay = document.getElementById('kl-act-modal');
  if (overlay && !overlay.classList.contains('hidden') && e.target === overlay) {
    overlay.classList.add('hidden');
    _modalActId = _modalDatum = _modalKind = null;
  }
});

// ── Mobile kind select ────────────────────────────────────────
document.getElementById('kl-sel-mob')?.addEventListener('change', e => setKindFilter(e.target.value, null));

// ── Change delegation (transport selects) ─────────────────────
document.addEventListener('change', function(e) {
  const el = e.target;
  if (el.dataset.action === 'transport-change') {
    slaTransportOp(el.dataset.datum, el.dataset.kind);
  } else if (el.dataset.action === 'std-transport-change') {
    slaStandaardOp(el.dataset.kind, el.dataset.dag, el.dataset.veld, el.value);
  }
});

// ── Modal overlay click (buiten .kl-modal sluiten) ────────────
document.getElementById('kl-act-modal')?.addEventListener('click', function(e) {
  if (e.target === this) {
    this.classList.add('hidden');
    _modalActId = _modalDatum = _modalKind = null;
  }
});

// ── Profiel dropdown ──────────────────────────────────────────
document.addEventListener('click', function(e){
  if (!e.target.closest('#topbar-user') && !e.target.closest('#profiel-menu'))
    document.getElementById('profiel-menu')?.classList.remove('open');
});

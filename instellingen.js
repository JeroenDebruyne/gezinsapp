// instellingen.js — Instellingenpagina logica
Auth.initPagina('instellingen');

const WERKDAGEN_KEYS=DAGKEYS.slice(0,5);
const WERKDAGEN_LABELS=DLANG.slice(0,5);
const SB_ANON_KEY='sb_publishable_pJgY7XEt_wZrxVQcd-bP4A_dSVcsgYa';
const SB_AUTH_URL='https://ceeplmghvcaqvlpicwyi.supabase.co/auth/v1';

laadOp().then(async ()=>{ await Auth.laadProfielen(); renderInstellingen(); renderIcalAbonnementen(); renderGezinsDatums(); initMobileAccordion(); }).catch(async ()=>{ laadLokaal(); await Auth.laadProfielen().catch(()=>{}); renderInstellingen(); renderGezinsDatums(); initMobileAccordion(); });

function renderInstellingen(){
  // Profiel
  const p=Auth.profiel();
  if(p){
    document.getElementById('profiel-emoji').textContent=p.emoji;
    document.getElementById('profiel-naam').textContent=p.naam;
    document.getElementById('profiel-rol').textContent=Auth.ROLLEN[p.rol]?.label||p.rol;
    document.getElementById('profiel-email').textContent=p.email;
  }
  // API keys
  const apiKey=localStorage.getItem('anthropic_api_key');
  document.getElementById('api-key-status').textContent=apiKey?'✅ Ingesteld (sk-ant-…'+apiKey.slice(-6)+')'  :'❌ Nog niet ingesteld';
  const mapsKey=Maps.getKey();
  document.getElementById('maps-key-status').textContent=mapsKey?'✅ Ingesteld':'❌ Nog niet ingesteld';
  document.getElementById('inst-thuisadres').value=Maps.getThuisadres();
  document.getElementById('inst-buienradar-url').value=localStorage.getItem('gezinsapp_buienradar_url')||'';
  // Roosters
  renderRoosters();
  // Schoolvakanties, feestdagen, transport
  renderSchoolvakanties();
  renderFeestdagen();
  renderTransportPersonen();
  renderWinkels();
  const pkEl = document.getElementById('inst-porties-kind');
  if (pkEl) pkEl.value = portiesKindRatio;
  // Feestdagen iCal kaart initialiseren
  renderFeestdagenKaart();
  // Werkadressen
  renderWerkadressen();
  // Admin sectie
  function _toonAdminSectie(){
    document.getElementById('admin-sectie').style.display='block';
    document.getElementById('nav-gebruikers').style.display='block';
    laadGebruikersLijst();
    if(window.innerWidth<768){
      const admin=document.getElementById('admin-sectie');
      if(admin) _bouwAccordion(admin,false);
    }
  }
  if(Auth.kan('kanGebruikersBeheren')){
    _toonAdminSectie();
  } else {
    // Profielen nog niet geladen — herlaad en probeer opnieuw
    Auth.laadProfielen().then(()=>{
      if(Auth.kan('kanGebruikersBeheren')) _toonAdminSectie();
    });
  }
}

function renderRoosters(){
  const personen = Auth.getProfielen().map(p => ({
    key: p.persoonKey,
    label: `${p.emoji} ${p.naam}`,
    metLocatie: p.rol === 'gezinshoofd',
  }));
  document.getElementById('roosters-container').innerHTML=personen.map(p=>`
    <div class="card" style="margin-bottom:10px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <div style="font-size:14px;font-weight:600;">${p.label}</div>
      </div>
      <div id="rooster-${p.key}"></div>
    </div>`).join('');
  personen.forEach(p=>renderVastRoosterPersoon(p.key,p.metLocatie));
}

function renderVastRoosterPersoon(persoon,metLocatie){
  const el=document.getElementById('rooster-'+persoon);if(!el)return;
  const rooster=vasteRoosters[persoon]||{};
  const inputStijl='padding:7px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:13px;font-family:inherit;background:var(--surface);color:var(--ink);';
  el.innerHTML=WERKDAGEN_KEYS.map((dag,i)=>{
    const d=rooster[dag]||{actief:false,van:'08:00',tot:'17:00'};
    return `
    <div class="rooster-dag-rij" style="display:grid;grid-template-columns:130px 1fr${metLocatie?' 120px':''};gap:8px;align-items:center;">
      <label class="rooster-dag-label-wrap" style="font-size:13px;cursor:pointer;${d.actief?'font-weight:600;':'color:var(--muted-2);'}">
        <input type="checkbox" ${d.actief?'checked':''} onchange="toggleVastDag('${persoon}','${dag}',this.checked)" style="width:auto;accent-color:var(--accent);flex-shrink:0;"/>
        ${WERKDAGEN_LABELS[i]}
      </label>
      <div class="rooster-tijden-wrap" style="display:flex;gap:6px;align-items:center;${d.actief?'':'opacity:.3;pointer-events:none;'}">
        <input type="time" value="${d.van||'08:00'}" onchange="updateVastRooster('${persoon}','${dag}','van',this.value)" style="flex:1;${inputStijl}"/>
        <span style="font-size:12px;color:var(--muted);flex-shrink:0;">→</span>
        <input type="time" value="${d.tot||'17:00'}" onchange="updateVastRooster('${persoon}','${dag}','tot',this.value)" style="flex:1;${inputStijl}"/>
      </div>
      ${metLocatie?`<div class="rooster-locatie-wrap" style="${d.actief?'':'opacity:.3;'}">
        <select onchange="updateVastRooster('${persoon}','${dag}','locatie',this.value)" style="width:100%;padding:7px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:12px;font-family:inherit;background:var(--surface);color:var(--ink);">
          <option value="thuis"${(d.locatie||'thuis')==='thuis'?' selected':''}>🏠 Thuis</option>
          <option value="kantoor"${d.locatie==='kantoor'?' selected':''}>🏢 Kantoor</option>
        </select>
      </div>`:''}
    </div>`;
  }).join('');
}

function toggleVastDag(persoon,dag,actief){
  if(!vasteRoosters[persoon])vasteRoosters[persoon]={};
  if(!vasteRoosters[persoon][dag])vasteRoosters[persoon][dag]={van:'08:00',tot:'17:00'};
  vasteRoosters[persoon][dag].actief=actief;
  const p=Auth.getProfielen().find(p=>p.persoonKey===persoon);
  renderVastRoosterPersoon(persoon, p?.rol==='gezinshoofd');
}
function updateVastRooster(persoon,dag,veld,waarde){
  if(!vasteRoosters[persoon])vasteRoosters[persoon]={};
  if(!vasteRoosters[persoon][dag])vasteRoosters[persoon][dag]={};
  vasteRoosters[persoon][dag][veld]=waarde;
}
function slaVastRoosterOp(){slaLokaalOp();sbSaveInstellingen();toonOpslagStatus('✅ Roosters opgeslagen');setTimeout(()=>toonOpslagStatus('💾 Automatisch opgeslagen'),2000);}

function openApiKeyForm() {
  document.getElementById('api-key-form').style.display = 'block';
  document.getElementById('api-key-wijzig-btn').style.display = 'none';
  document.getElementById('api-key-input').focus();
}
function sluitApiKeyForm() {
  document.getElementById('api-key-form').style.display = 'none';
  document.getElementById('api-key-wijzig-btn').style.display = '';
  document.getElementById('api-key-input').value = '';
  document.getElementById('api-key-input').type = 'password';
  document.getElementById('api-key-toon').textContent = '👁';
}
function toggleApiKeyZicht() {
  const inp = document.getElementById('api-key-input');
  inp.type = inp.type === 'password' ? 'text' : 'password';
  document.getElementById('api-key-toon').textContent = inp.type === 'password' ? '👁' : '🙈';
}
function slaApiKeyOp() {
  const key = document.getElementById('api-key-input').value.trim();
  if (!key) { toonOpslagStatus('❌ Vul een API key in.'); return; }
  localStorage.setItem('anthropic_api_key', key); // CodeQL[js/clear-text-storage-of-sensitive-information]
  sbSaveInstellingen();
  sluitApiKeyForm();
  renderInstellingen();
  toonOpslagStatus('✅ API key opgeslagen');
}
function verwijderApiKey() {
  if (!confirm('Anthropic API key verwijderen?')) return;
  localStorage.removeItem('anthropic_api_key');
  sbSaveInstellingen();
  sluitApiKeyForm();
  renderInstellingen();
  toonOpslagStatus('✅ API key verwijderd');
}

function openMapsKeyForm() {
  document.getElementById('maps-key-form').style.display = 'block';
  document.getElementById('maps-key-wijzig-btn').style.display = 'none';
  document.getElementById('maps-key-input').focus();
}
function sluitMapsKeyForm() {
  document.getElementById('maps-key-form').style.display = 'none';
  document.getElementById('maps-key-wijzig-btn').style.display = '';
  document.getElementById('maps-key-input').value = '';
  document.getElementById('maps-key-input').type = 'password';
  document.getElementById('maps-key-toon').textContent = '👁';
}
function toggleMapsKeyZicht() {
  const inp = document.getElementById('maps-key-input');
  inp.type = inp.type === 'password' ? 'text' : 'password';
  document.getElementById('maps-key-toon').textContent = inp.type === 'password' ? '👁' : '🙈';
}
function slaMapsKeyOp() {
  const key = document.getElementById('maps-key-input').value.trim();
  if (!key) { toonOpslagStatus('❌ Vul een Maps key in.'); return; }
  localStorage.setItem(Maps.KEY_KEY, key); // CodeQL[js/clear-text-storage-of-sensitive-information]
  sbSaveInstellingen();
  sluitMapsKeyForm();
  renderInstellingen();
  toonOpslagStatus('✅ Maps key opgeslagen');
}
function verwijderMapsKey() {
  if (!confirm('Google Maps API key verwijderen?')) return;
  localStorage.removeItem(Maps.KEY_KEY);
  sbSaveInstellingen();
  sluitMapsKeyForm();
  renderInstellingen();
  toonOpslagStatus('✅ Maps key verwijderd');
}
function slaaThuisadresOp(){
  const adres=document.getElementById('inst-thuisadres').value.trim();
  localStorage.setItem(Maps.THUIS_KEY,adres);
  sbSaveInstellingen();
  toonOpslagStatus('✅ Thuisadres opgeslagen');
  if(adres) Maps.geocodeerAdres(adres).catch(()=>{});
}
function slaaBuienradarUrlOp(){
  const url=document.getElementById('inst-buienradar-url').value.trim();
  if(url) localStorage.setItem('gezinsapp_buienradar_url',url);
  else localStorage.removeItem('gezinsapp_buienradar_url');
  sbSaveInstellingen();
  toonOpslagStatus('✅ Buienradar link opgeslagen');
}
function renderWerkadressen(){
  const container=document.getElementById('werkadres-container');if(!container)return;
  const ghProfielen=Auth.getProfielen().filter(p=>p.rol==='gezinshoofd');
  if(!ghProfielen.length){container.innerHTML='<p style="font-size:13px;color:var(--muted);">Geen gezinshoofden gevonden.</p>';return;}
  const inputStijl='width:100%;box-sizing:border-box;padding:10px 12px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:14px;font-family:inherit;background:var(--bg);color:var(--ink);outline:none;margin-bottom:6px;';
  container.innerHTML=ghProfielen.map(p=>{
    const geslagenReistijd=localStorage.getItem('gezinsapp_reistijd_'+p.persoonKey)||'';
    return `
    <div style="margin-bottom:14px;">
      <div style="font-size:13px;font-weight:600;margin-bottom:6px;">${escHtml(p.emoji)} ${escHtml(p.naam)}</div>
      <input type="text" id="werkadres-${p.persoonKey}" placeholder="Werkadres" style="${inputStijl}" value="${escHtml(localStorage.getItem('gezinsapp_werkadres_'+p.persoonKey)||'')}"/>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
        <span id="reistijd-lbl-${p.persoonKey}" style="font-size:13px;color:var(--muted);">${geslagenReistijd?'🚗 Pendeltijd: <b>'+escHtml(geslagenReistijd)+' min</b>':'⏳ Pendeltijd wordt automatisch berekend na adresselectie'}</span>
        <span id="reistijd-spinner-${p.persoonKey}" style="display:none;font-size:12px;color:var(--muted);">⏳ Berekenen…</span>
      </div>
      <input type="hidden" id="reistijd-${p.persoonKey}" value="${escHtml(geslagenReistijd)}"/>
    </div>`;
  }).join('')+`<button class="btn btn-primary btn-sm" onclick="slaaWerkadressen()">💾 Opslaan</button>`;
  ghProfielen.forEach(p=>{
    const el=document.getElementById('werkadres-'+p.persoonKey);
    if(!el) return;
    Maps.autocomplete(el, async (adres)=>{
      localStorage.setItem('gezinsapp_werkadres_'+p.persoonKey, adres);
      const lbl=document.getElementById('reistijd-lbl-'+p.persoonKey);
      const spinner=document.getElementById('reistijd-spinner-'+p.persoonKey);
      const hidden=document.getElementById('reistijd-'+p.persoonKey);
      if(lbl) lbl.style.display='none';
      if(spinner) spinner.style.display='inline';
      const minuten=await Maps.reistijd(adres);
      if(spinner) spinner.style.display='none';
      if(lbl) lbl.style.display='';
      if(minuten!==null){
        if(hidden) hidden.value=minuten;
        if(lbl) lbl.innerHTML=`🚗 Pendeltijd: <b>${minuten} min</b> <span style="font-size:11px;color:var(--muted);">(automatisch berekend)</span>`;
        localStorage.setItem('gezinsapp_reistijd_'+p.persoonKey, minuten);
      } else {
        if(lbl) lbl.innerHTML=`⚠️ Kon pendeltijd niet berekenen. Controleer thuisadres en Maps API key.`;
      }
    });
  });
}

function slaaWerkadressen(){
  const ghProfielen=Auth.getProfielen().filter(p=>p.rol==='gezinshoofd');
  ghProfielen.forEach(p=>{
    const adres=document.getElementById('werkadres-'+p.persoonKey)?.value.trim();
    const reistijd=document.getElementById('reistijd-'+p.persoonKey)?.value;
    if(adres!==undefined) localStorage.setItem('gezinsapp_werkadres_'+p.persoonKey, adres);
    if(reistijd) localStorage.setItem('gezinsapp_reistijd_'+p.persoonKey, reistijd);
  });
  sbSaveInstellingen();
  toonOpslagStatus('✅ Werkadressen opgeslagen');
}

document.addEventListener('DOMContentLoaded',()=>{
  Maps.autocomplete(document.getElementById('inst-thuisadres'), adres=>{
    localStorage.setItem(Maps.THUIS_KEY,adres);
    sbSaveInstellingen();
    toonOpslagStatus('✅ Thuisadres opgeslagen');
  });
});

// ── Admin: hulpfuncties nieuw account ────────────────────────
function kiesEmoji(emoji) {
  document.getElementById('nu-emoji').value = emoji;
}
function suggestKey() {
  const keyEl = document.getElementById('nu-key');
  if (keyEl && !keyEl.dataset.manualEdit) {
    const naam = document.getElementById('nu-naam').value.trim();
    keyEl.value = naam.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
  }
}
function toggleKindVelden() {
  const isKind = document.getElementById('nu-rol').value === 'kind';
  document.getElementById('nu-auth-velden').style.display = isKind ? 'none' : '';
}
document.getElementById('nu-key').addEventListener('input', function(){ this.dataset.manualEdit = '1'; });

async function maakNieuwAccount() {
  const naam        = document.getElementById('nu-naam').value.trim();
  const emoji       = document.getElementById('nu-emoji').value.trim() || '👤';
  const rol         = document.getElementById('nu-rol').value;
  const key         = document.getElementById('nu-key').value.trim().toLowerCase().replace(/\s+/g,'_');
  const isKind      = rol === 'kind';
  const email       = isKind ? null : document.getElementById('nu-email').value.trim();
  const pw          = isKind ? null : document.getElementById('nu-pw').value;
  const verjaardag  = document.getElementById('nu-verjaardag').value || null;
  const msgEl  = document.getElementById('nu-msg');
  const btnEl  = document.getElementById('nu-btn');

  function toonMsg(tekst, ok) {
    msgEl.textContent = tekst; msgEl.style.display = 'block';
    msgEl.style.background = ok ? 'var(--rustig-bg)' : 'var(--druk-bg)';
    msgEl.style.color = ok ? 'var(--rustig-clr)' : 'var(--druk-clr)';
  }

  if (!naam)  { toonMsg('Vul een naam in.', false); return; }
  if (!key)   { toonMsg('Vul een persoon-ID in.', false); return; }
  if (!isKind && !email) { toonMsg('Vul een e-mailadres in.', false); return; }
  if (!isKind && (!pw || pw.length < 8)) { toonMsg('Wachtwoord min. 8 tekens.', false); return; }

  btnEl.disabled = true; btnEl.textContent = 'Bezig…';
  try {
    if (!isKind) {
      const res = await fetch(`${SB_AUTH_URL}/signup`, {
        method: 'POST',
        headers: { 'apikey': SB_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pw, data: { naam, rol } })
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error_description || data.msg || data.error || 'Aanmaken mislukt');
    }

    await sbFetch('gezin_profielen', 'POST', {
      naam, emoji, rol,
      persoon_key: key,
      email: email || null,
      is_kind: isKind,
      geboortedatum: verjaardag,
      gezin_id: Auth.getGezinId(),
    });

    toonMsg(`✅ ${naam} aangemaakt!`, true);
    document.getElementById('nu-naam').value = '';
    document.getElementById('nu-emoji').value = '👤';
    document.getElementById('nu-key').value = '';
    document.getElementById('nu-verjaardag').value = '';
    delete document.getElementById('nu-key').dataset.manualEdit;
    if (!isKind) { document.getElementById('nu-email').value = ''; document.getElementById('nu-pw').value = ''; }
    await Auth.laadProfielen();
    laadGebruikersLijst();
  } catch(e) { toonMsg('❌ ' + e.message, false); }
  btnEl.disabled = false; btnEl.textContent = 'Aanmaken';
}

async function laadGebruikersLijst() {
  const el = document.getElementById('gebruikers-lijst'); if (!el) return;
  try {
    let profielen = Auth.getProfielen().filter(p => p.id);
    if (!profielen.length) {
      // Fallback: haal vers op als cache leeg is
      profielen = await sbFetch('gezin_profielen' + _gidQ('?order=naam')).catch(() => []);
      if (!profielen.length) { el.innerHTML = '<div style="font-size:13px;color:var(--muted);padding:6px 0;">Nog geen profielen in de tabel.</div>'; return; }
    }
    const ROLKLEUR = { gezinshoofd:'var(--druk-bg)', jeugd:'var(--normaal-bg)', kind:'var(--rustig-bg)' };
    const ROLTXT   = { gezinshoofd:'var(--druk-clr)', jeugd:'var(--normaal-clr)', kind:'var(--rustig-clr)' };
    const ROLLABEL = { gezinshoofd:'Gezinshoofd', jeugd:'Jeugd', kind:'Kind' };
    el.innerHTML = profielen.map(p => {
      const verjaardag = p.geboortedatum ? '🎂 ' + new Date(p.geboortedatum+'T12:00').toLocaleDateString('nl-BE',{day:'numeric',month:'long'}) : '';
      return `
      <div class="card" id="gcard-${escHtml(p.id)}" style="margin-bottom:8px;padding:12px 14px;">
        <!-- Weergave modus -->
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="font-size:26px;line-height:1;">${escHtml(p.emoji||'👤')}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:14px;font-weight:600;">${escHtml(p.naam)}</div>
            <div style="font-size:12px;color:var(--muted);display:flex;gap:10px;flex-wrap:wrap;">
              ${p.is_kind ? '<span>👶 Kind-sessie</span>' : `<span>${escHtml(p.email||'')}</span>`}
              ${verjaardag ? `<span>${verjaardag}</span>` : ''}
            </div>
          </div>
          <span style="font-size:11px;padding:3px 9px;border-radius:99px;background:${ROLKLEUR[p.rol]||'var(--bg-2)'};color:${ROLTXT[p.rol]||'var(--muted)'};font-weight:600;flex-shrink:0;">${ROLLABEL[p.rol]||p.rol}</span>
          <button class="btn btn-secondary btn-sm" onclick="toggleGebruikerEdit('${escHtml(p.id)}')" style="flex-shrink:0;">✏️ Bewerken</button>
        </div>
        <!-- Bewerk modus (verborgen) -->
        <div id="gedit-${escHtml(p.id)}" style="display:none;margin-top:14px;padding-top:14px;border-top:1px solid var(--border);">
          <div class="form-grid">
            <div class="form-row">
              <label>Naam</label>
              <input type="text" id="gedit-naam-${escHtml(p.id)}" value="${escHtml(p.naam)}"/>
            </div>
            <div class="form-row">
              <label>Emoji</label>
              <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:6px;">
                ${['🧑','👩','👧','👦','🧒','👶','👨','👵'].map(e=>`<button type="button" onclick="document.getElementById('gedit-emoji-${escHtml(p.id)}').value='${e}'" class="btn btn-secondary btn-sm">${e}</button>`).join('')}
              </div>
              <input type="text" id="gedit-emoji-${escHtml(p.id)}" value="${escHtml(p.emoji||'👤')}" style="max-width:70px;font-size:18px;text-align:center;"/>
            </div>
            <div class="form-row">
              <label>Rol</label>
              <select id="gedit-rol-${escHtml(p.id)}">
                <option value="gezinshoofd"${p.rol==='gezinshoofd'?' selected':''}>Gezinshoofd</option>
                <option value="jeugd"${p.rol==='jeugd'?' selected':''}>Jeugd</option>
                <option value="kind"${p.rol==='kind'?' selected':''}>Kind (logt in zonder account)</option>
              </select>
            </div>
            <div class="form-row">
              <label>Verjaardag</label>
              <input type="date" id="gedit-verjaardag-${escHtml(p.id)}" value="${escHtml(p.geboortedatum||'')}"/>
            </div>
          </div>
          <div id="gedit-msg-${escHtml(p.id)}" style="display:none;padding:8px 12px;border-radius:var(--radius-sm);font-size:13px;margin-top:10px;"></div>
          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;">
            <button class="btn btn-secondary btn-sm" onclick="toggleGebruikerEdit('${escHtml(p.id)}')">Annuleren</button>
            <button class="btn btn-primary" onclick="slaGebruikerOp('${escHtml(p.id)}')">💾 Opslaan</button>
          </div>
        </div>
      </div>`;
    }).join('');
  } catch(e) { if (el) el.innerHTML = '<div style="font-size:13px;color:var(--muted);">Kan lijst niet laden.</div>'; }
}

function toggleGebruikerEdit(id) {
  const editEl = document.getElementById('gedit-' + id);
  if (!editEl) return;
  editEl.style.display = editEl.style.display === 'none' ? 'block' : 'none';
}

async function slaGebruikerOp(id) {
  const naam       = document.getElementById('gedit-naam-' + id)?.value.trim();
  const emoji      = document.getElementById('gedit-emoji-' + id)?.value.trim() || '👤';
  const rol        = document.getElementById('gedit-rol-' + id)?.value;
  const verjaardag = document.getElementById('gedit-verjaardag-' + id)?.value || null;
  const msgEl      = document.getElementById('gedit-msg-' + id);

  function toonEditMsg(tekst, ok) {
    msgEl.textContent = tekst; msgEl.style.display = 'block';
    msgEl.style.background = ok ? 'var(--rustig-bg)' : 'var(--druk-bg)';
    msgEl.style.color = ok ? 'var(--rustig-clr)' : 'var(--druk-clr)';
  }

  if (!naam) { toonEditMsg('Vul een naam in.', false); return; }
  try {
    await sbFetch(`gezin_profielen?id=eq.${id}`, 'PATCH', { naam, emoji, rol, is_kind: rol==='kind', geboortedatum: verjaardag });
    await Auth.laadProfielen();
    laadGebruikersLijst();
    toonOpslagStatus('✅ Opgeslagen');
  } catch(e) { toonEditMsg('❌ ' + e.message, false); }
}

// ── Mobile accordion ─────────────────────────────────────────
function initMobileAccordion(){
  if(window.innerWidth>=768) return;
  // Top-level secties in page-content
  _bouwAccordion(document.querySelector('.page-content'), true);
  // Admin-sectie (enkel als zichtbaar)
  const admin=document.getElementById('admin-sectie');
  if(admin && admin.style.display!=='none') _bouwAccordion(admin, false);
}

function _bouwAccordion(container, eersteOpen){
  if(!container) return;
  const labels=[...container.querySelectorAll(':scope > .section-label')];
  labels.forEach((label,idx)=>{
    if(label.dataset.acc==='1') return; // al verwerkt
    label.dataset.acc='1';
    // Chevron toevoegen
    const chev=document.createElement('span');
    chev.className='sect-chevron';
    chev.textContent=(eersteOpen&&idx===0)?'▲':'▼';
    label.appendChild(chev);
    // Wrapper aanmaken direct na label
    const isEerste=(eersteOpen&&idx===0);
    const body=document.createElement('div');
    body.className='sect-body'+(isEerste?' open':'');
    if(isEerste) label.classList.add('sect-open');
    label.after(body);
    // Siblings verplaatsen naar body (tot volgende section-label of admin-sectie)
    let sib=body.nextElementSibling;
    while(sib&&!sib.classList.contains('section-label')&&sib.id!=='admin-sectie'){
      const mv=sib; sib=sib.nextElementSibling; body.appendChild(mv);
    }
    // Klik-handler
    label.addEventListener('click',()=>{
      const open=body.classList.toggle('open');
      label.classList.toggle('sect-open',open);
      chev.textContent=open?'▲':'▼';
    });
  });
}

// ── Topics nav: scroll naar sectie ───────────────────────────
function scrollNaar(sectionId){
  const el=document.getElementById(sectionId);
  if(!el) return;
  // Op mobiel: accordion openen als die gesloten is
  if(window.innerWidth<768){
    const body=el.nextElementSibling;
    if(body&&body.classList.contains('sect-body')&&!body.classList.contains('open')){
      body.classList.add('open');
      const chev=el.querySelector('.sect-chevron');
      if(chev) chev.textContent='▲';
    }
    setTimeout(()=>el.scrollIntoView({behavior:'smooth',block:'start'}),60);
    return;
  }
  const scroller=document.querySelector('.main-content');
  if(scroller){
    const top=el.getBoundingClientRect().top-scroller.getBoundingClientRect().top+scroller.scrollTop-16;
    scroller.scrollTo({top,behavior:'smooth'});
  }
  document.querySelectorAll('.inst-nav-item').forEach(btn=>{
    btn.classList.toggle('actief',btn.getAttribute('onclick')?.includes(sectionId));
  });
}

// Highlight nav-item op scroll (desktop)
(function(){
  const scroller=document.querySelector('.main-content');
  if(!scroller) return;
  const secties=['sect-profiel','sect-roosters','sect-kalenders','sect-data','sect-adressen','sect-transport','sect-api','sect-gebruikers'];
  scroller.addEventListener('scroll',()=>{
    let actief='sect-profiel';
    for(const id of secties){
      const el=document.getElementById(id);
      if(!el) continue;
      const top=el.getBoundingClientRect().top-scroller.getBoundingClientRect().top;
      if(top<=40) actief=id;
    }
    document.querySelectorAll('.inst-nav-item').forEach(btn=>{
      btn.classList.toggle('actief',btn.getAttribute('onclick')?.includes(actief));
    });
  },{passive:true});
})();

// ── Gezinsdatums ─────────────────────────────────────────────
const EMOJI_OPTIES = ['🎉','💍','🏖️','🎂','🎄','❤️','🏆','✈️','🎓','🎊','🌟','📅'];

function renderGezinsDatums() {
  const wrap = document.getElementById('gezinsdatums-lijst');
  if (!wrap) return;
  if (!gezinsDatums.length) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = gezinsDatums.map((d, i) => `
    <div class="card" style="margin-bottom:8px;">
      <div style="display:flex;align-items:flex-start;gap:10px;">
        <div style="position:relative;">
          <button onclick="_kiesEmoji(event,${i})" style="font-size:22px;background:none;border:none;cursor:pointer;padding:2px 4px;border-radius:6px;line-height:1.2;" title="Emoji kiezen">${d.emoji||'📅'}</button>
          <div id="emoji-picker-${i}" style="display:none;position:absolute;top:34px;left:0;z-index:200;background:var(--bg);border:1.5px solid var(--border);border-radius:var(--radius-sm);padding:6px;display:none;flex-wrap:wrap;width:160px;gap:4px;box-shadow:0 4px 16px rgba(0,0,0,0.12);">
            ${EMOJI_OPTIES.map(e=>`<span onclick="_setEmoji(${i},'${e}')" style="font-size:20px;cursor:pointer;padding:2px 4px;border-radius:4px;" onmouseover="this.style.background='var(--bg-2)'" onmouseout="this.style.background=''">${e}</span>`).join('')}
          </div>
        </div>
        <div style="flex:1;display:flex;flex-direction:column;gap:6px;">
          <input type="text" value="${escHtml(d.label||'')}" placeholder="Naam (bijv. Huwelijksverjaardag)"
            oninput="gezinsDatums[${i}].label=this.value"
            style="width:100%;box-sizing:border-box;padding:7px 10px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:13px;font-family:inherit;background:var(--bg);color:var(--ink);"/>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
            <div style="display:flex;flex-direction:column;gap:2px;">
              <label style="font-size:10px;color:var(--muted);font-weight:600;">Startdatum</label>
              <input type="date" value="${d.startDatum||''}" oninput="gezinsDatums[${i}].startDatum=this.value"
                style="padding:6px 8px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:12px;font-family:inherit;background:var(--bg);color:var(--ink);"/>
            </div>
            <div style="display:flex;flex-direction:column;gap:2px;">
              <label style="font-size:10px;color:var(--muted);font-weight:600;">Einddatum <span style="font-weight:400;">(opt.)</span></label>
              <input type="date" value="${d.eindDatum||''}" oninput="gezinsDatums[${i}].eindDatum=this.value||null"
                style="padding:6px 8px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:12px;font-family:inherit;background:var(--bg);color:var(--ink);"/>
            </div>
            <div style="display:flex;flex-direction:column;gap:2px;">
              <label style="font-size:10px;color:var(--muted);font-weight:600;">&nbsp;</label>
              <label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer;padding:6px 0;">
                <input type="checkbox" ${d.herhalend?'checked':''} onchange="gezinsDatums[${i}].herhalend=this.checked" style="width:14px;height:14px;cursor:pointer;"/>
                Jaarlijks herhalen
              </label>
            </div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;">
          <button class="btn btn-primary btn-sm" onclick="slaGezinsDatumOp(${i})" style="white-space:nowrap;">Opslaan</button>
          <button class="btn btn-sm" style="color:var(--druk-clr);border-color:var(--druk-clr);white-space:nowrap;" onclick="verwijderGezinsDatum(${i})">🗑 Verwijder</button>
        </div>
      </div>
    </div>`).join('');
}

function _kiesEmoji(e, i) {
  e.stopPropagation();
  document.querySelectorAll('[id^="emoji-picker-"]').forEach(p => { if (p.id !== `emoji-picker-${i}`) p.style.display = 'none'; });
  const p = document.getElementById(`emoji-picker-${i}`);
  p.style.display = p.style.display === 'flex' ? 'none' : 'flex';
}
function _setEmoji(i, emoji) {
  gezinsDatums[i].emoji = emoji;
  document.getElementById(`emoji-picker-${i}`).style.display = 'none';
  renderGezinsDatums();
}
document.addEventListener('click', () => {
  document.querySelectorAll('[id^="emoji-picker-"]').forEach(p => { p.style.display = 'none'; });
});

function voegGezinsDatumToe() {
  gezinsDatums.push({label:'', startDatum:'', eindDatum:null, herhalend:false, emoji:'📅'});
  renderGezinsDatums();
  document.getElementById('gezinsdatums-lijst').lastElementChild?.scrollIntoView({behavior:'smooth',block:'nearest'});
}

async function slaGezinsDatumOp(i) {
  const d = gezinsDatums[i];
  if (!d.label?.trim() || !d.startDatum) { toonOpslagStatus('❌ Vul naam en startdatum in.'); return; }
  if (d.eindDatum && d.eindDatum < d.startDatum) { toonOpslagStatus('❌ Einddatum mag niet voor startdatum liggen.'); return; }
  await slaGezinsDatumsOp();
  toonOpslagStatus('✅ Opgeslagen');
  renderGezinsDatums();
}

async function verwijderGezinsDatum(i) {
  if (!confirm('Datum verwijderen?')) return;
  gezinsDatums.splice(i, 1);
  await slaGezinsDatumsOp();
  renderGezinsDatums();
}

// ── Schoolvakanties beheer ────────────────────────────────────
function _svJaar(datum) {
  const d = new Date(datum + 'T12:00:00');
  const y = d.getFullYear();
  return d.getMonth() >= 8 ? `${y}–${y+1}` : `${y-1}–${y}`;
}

function _svItemHtml(v, isIngebouwd, idx) {
  const dot = `<div style="width:10px;height:10px;border-radius:50%;background:${escHtml(v.kleur||'#e1f5ee')};flex-shrink:0;border:1px solid rgba(0,0,0,.08);"></div>`;
  if (isIngebouwd) {
    return `<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border);">
      ${dot}
      <div style="flex:1;">
        <div style="font-size:13px;font-weight:600;">${escHtml(v.naam)}</div>
        <div style="font-size:11px;color:var(--muted);">${v.van===v.tot?v.van:v.van+' → '+v.tot}</div>
      </div>
      <button class="btn btn-secondary btn-sm" style="white-space:nowrap;" onclick="dupliceerVakantie(${idx})">Dupliceer</button>
    </div>`;
  }
  return `<div style="display:flex;align-items:center;gap:6px;padding:6px 0;border-bottom:1px solid var(--border);flex-wrap:wrap;">
    <input type="color" value="${escHtml(v.kleur||'#e1f5ee')}" oninput="customSchoolvakanties[${idx}].kleur=this.value"
      style="width:28px;height:28px;border:1px solid var(--border);border-radius:4px;cursor:pointer;padding:1px;flex-shrink:0;"/>
    <input type="text" value="${escHtml(v.naam||'')}" placeholder="Naam"
      oninput="customSchoolvakanties[${idx}].naam=this.value"
      style="flex:1;min-width:100px;padding:5px 8px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:12px;font-family:inherit;background:var(--bg);color:var(--ink);"/>
    <input type="date" value="${v.van||''}" oninput="customSchoolvakanties[${idx}].van=this.value"
      style="padding:4px 6px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:12px;font-family:inherit;background:var(--bg);color:var(--ink);"/>
    <span style="font-size:11px;color:var(--muted);">→</span>
    <input type="date" value="${v.tot||''}" oninput="customSchoolvakanties[${idx}].tot=this.value"
      style="padding:4px 6px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:12px;font-family:inherit;background:var(--bg);color:var(--ink);"/>
    <button class="btn btn-primary btn-sm" onclick="slaCustomVakantieOp(${idx})">✓</button>
    <button onclick="verwijderCustomVakantie(${idx})" style="background:none;border:none;cursor:pointer;color:var(--druk-clr);font-size:18px;line-height:1;padding:0 2px;">×</button>
  </div>`;
}

function renderSchoolvakanties() {
  const alle = [
    ...SCHOOLVAKANTIES.map((v, i) => ({...v, _ingebouwd: true, _idx: i})),
    ...customSchoolvakanties.map((v, i) => ({...v, _ingebouwd: false, _idx: i})),
  ].sort((a, b) => a.van.localeCompare(b.van));
  const groepen = {};
  alle.forEach(v => {
    const k = _svJaar(v.van);
    if (!groepen[k]) groepen[k] = [];
    groepen[k].push(v);
  });
  document.getElementById('schoolvakanties-lijst').innerHTML = Object.entries(groepen).map(([lbl, items]) =>
    `<div style="margin-bottom:10px;">
      <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">Schooljaar ${lbl}</div>
      ${items.map(v => _svItemHtml(v, v._ingebouwd, v._idx)).join('')}
    </div>`
  ).join('');
}

function dupliceerVakantie(idx) {
  const v = SCHOOLVAKANTIES[idx];
  customSchoolvakanties.push({naam: v.naam + ' (kopie)', van: v.van, tot: v.tot, kleur: v.kleur});
  renderSchoolvakanties();
}

async function slaCustomVakantieOp(idx) {
  const v = customSchoolvakanties[idx];
  if (!v.naam?.trim() || !v.van) { toonOpslagStatus('❌ Vul naam en startdatum in.'); return; }
  if (!v.tot) customSchoolvakanties[idx].tot = v.van;
  await slaCustomSchoolvakantiesOp();
  slaLokaalOp();
  toonOpslagStatus('✅ Opgeslagen');
  renderSchoolvakanties();
}

async function verwijderCustomVakantie(idx) {
  customSchoolvakanties.splice(idx, 1);
  await slaCustomSchoolvakantiesOp();
  slaLokaalOp();
  toonOpslagStatus('✅ Verwijderd');
  renderSchoolvakanties();
}

function voegCustomVakantieTO() {
  customSchoolvakanties.push({naam: '', van: '', tot: '', kleur: '#e1f5ee'});
  renderSchoolvakanties();
  document.getElementById('schoolvakanties-lijst').lastElementChild?.scrollIntoView({behavior:'smooth',block:'nearest'});
}

// ── Feestdagen beheer ─────────────────────────────────────────
function _fdItemHtml(v, isIngebouwd, idx) {
  const dot = `<div style="width:10px;height:10px;border-radius:50%;background:${escHtml(v.kleur||'#fbeaf0')};flex-shrink:0;border:1px solid rgba(0,0,0,.08);"></div>`;
  if (isIngebouwd) {
    return `<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border);">
      ${dot}
      <div style="flex:1;">
        <div style="font-size:13px;font-weight:600;">${escHtml(v.naam)}</div>
        <div style="font-size:11px;color:var(--muted);">${v.van}</div>
      </div>
      <button class="btn btn-secondary btn-sm" style="white-space:nowrap;" onclick="dupliceerFeestdag(${idx})">Dupliceer</button>
    </div>`;
  }
  return `<div style="display:flex;align-items:center;gap:6px;padding:6px 0;border-bottom:1px solid var(--border);flex-wrap:wrap;">
    <input type="color" value="${escHtml(v.kleur||'#fbeaf0')}" oninput="customFeestdagen[${idx}].kleur=this.value"
      style="width:28px;height:28px;border:1px solid var(--border);border-radius:4px;cursor:pointer;padding:1px;flex-shrink:0;"/>
    <input type="text" value="${escHtml(v.naam||'')}" placeholder="Naam"
      oninput="customFeestdagen[${idx}].naam=this.value"
      style="flex:1;min-width:100px;padding:5px 8px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:12px;font-family:inherit;background:var(--bg);color:var(--ink);"/>
    <input type="date" value="${v.van||''}" oninput="customFeestdagen[${idx}].van=this.value;customFeestdagen[${idx}].tot=this.value"
      style="padding:4px 6px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:12px;font-family:inherit;background:var(--bg);color:var(--ink);"/>
    <button class="btn btn-primary btn-sm" onclick="slaCustomFeestdagOp(${idx})">✓</button>
    <button onclick="verwijderCustomFeestdag(${idx})" style="background:none;border:none;cursor:pointer;color:var(--druk-clr);font-size:18px;line-height:1;padding:0 2px;">×</button>
  </div>`;
}

function renderFeestdagen() {
  const alle = [
    ...FEESTDAGEN.map((v, i) => ({...v, _ingebouwd: true, _idx: i})),
    ...customFeestdagen.map((v, i) => ({...v, _ingebouwd: false, _idx: i})),
  ].sort((a, b) => a.van.localeCompare(b.van));
  const groepen = {};
  alle.forEach(v => {
    const y = new Date(v.van + 'T12:00:00').getFullYear();
    if (!groepen[y]) groepen[y] = [];
    groepen[y].push(v);
  });
  document.getElementById('feestdagen-lijst').innerHTML = Object.entries(groepen).map(([jaar, items]) =>
    `<div style="margin-bottom:10px;">
      <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">${jaar}</div>
      ${items.map(v => _fdItemHtml(v, v._ingebouwd, v._idx)).join('')}
    </div>`
  ).join('');
}

function dupliceerFeestdag(idx) {
  const v = FEESTDAGEN[idx];
  customFeestdagen.push({naam: v.naam + ' (kopie)', van: v.van, tot: v.van, kleur: v.kleur});
  renderFeestdagen();
}

async function slaCustomFeestdagOp(idx) {
  const v = customFeestdagen[idx];
  if (!v.naam?.trim() || !v.van) { toonOpslagStatus('❌ Vul naam en datum in.'); return; }
  await slaCustomFeestdagenOp();
  slaLokaalOp();
  toonOpslagStatus('✅ Opgeslagen');
  renderFeestdagen();
}

async function verwijderCustomFeestdag(idx) {
  customFeestdagen.splice(idx, 1);
  await slaCustomFeestdagenOp();
  slaLokaalOp();
  toonOpslagStatus('✅ Verwijderd');
  renderFeestdagen();
}

function voegCustomFeestdagTO() {
  customFeestdagen.push({naam: '', van: '', tot: '', kleur: '#fbeaf0'});
  renderFeestdagen();
  document.getElementById('feestdagen-lijst').lastElementChild?.scrollIntoView({behavior:'smooth',block:'nearest'});
}

// ── Transport personen ────────────────────────────────────────
function renderTransportPersonen() {
  const el = document.getElementById('transportpersonen-lijst');
  if (!el) return;
  if (!transportPersonen.length) {
    el.innerHTML = '<div style="font-size:13px;color:var(--muted);padding:8px 0;">Nog geen transportpersonen.</div>';
    return;
  }
  el.innerHTML = transportPersonen.map((p, i) => {
    const naam = typeof p === 'object' ? (p.naam || '') : p;
    return `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);">
      <input type="text" value="${escHtml(naam)}"
        oninput="transportPersonen[${i}] = typeof transportPersonen[${i}]==='object' ? {...transportPersonen[${i}],naam:this.value} : {naam:this.value}"
        style="flex:1;padding:7px 10px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:13px;font-family:inherit;background:var(--bg);color:var(--ink);"/>
      <button class="btn btn-primary btn-sm" onclick="slaTransportPersoonNaamOp(${i},this.previousElementSibling.value)">✓</button>
      <button onclick="verwijderTransportPersoon(${i})" style="background:none;border:none;cursor:pointer;color:var(--druk-clr);font-size:18px;line-height:1;padding:0 2px;">×</button>
    </div>`;
  }).join('');
}

async function voegTransportPersoonToe() {
  const input = document.getElementById('nieuw-transport-naam');
  const naam = input?.value?.trim();
  if (!naam) return;
  transportPersonen.push({naam});
  await slaTransportPersonenOp();
  slaLokaalOp();
  toonOpslagStatus('✅ Opgeslagen');
  if (input) input.value = '';
  renderTransportPersonen();
}

async function slaTransportPersoonNaamOp(idx, naam) {
  if (!naam?.trim()) return;
  transportPersonen[idx] = typeof transportPersonen[idx] === 'object'
    ? {...transportPersonen[idx], naam: naam.trim()}
    : {naam: naam.trim()};
  await slaTransportPersonenOp();
  slaLokaalOp();
  toonOpslagStatus('✅ Opgeslagen');
}

async function verwijderTransportPersoon(idx) {
  transportPersonen.splice(idx, 1);
  await slaTransportPersonenOp();
  slaLokaalOp();
  toonOpslagStatus('✅ Verwijderd');
  renderTransportPersonen();
}

// ── Maaltijden ────────────────────────────────────────────────
async function slaPortiesKindOp() {
  const v = parseFloat(document.getElementById('inst-porties-kind')?.value);
  if (isNaN(v) || v <= 0) return;
  portiesKindRatio = Math.round(v * 100) / 100;
  await slaPortiesKindRatioOp();
  slaLokaalOp();
  toonOpslagStatus('✅ Opgeslagen');
}

// ── Winkels ──────────────────────────────────────────────────
function renderWinkels() {
  const el = document.getElementById('winkels-lijst');
  if (!el) return;
  if (!WINKELS.length) {
    el.innerHTML = '<div style="font-size:13px;color:var(--muted);padding:8px 0;">Nog geen winkels.</div>';
    return;
  }
  el.innerHTML = WINKELS.map((w, i) => `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);">
    <input type="text" value="${escHtml(w)}"
      oninput="WINKELS[${i}]=this.value"
      style="flex:1;padding:7px 10px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:13px;font-family:inherit;background:var(--bg);color:var(--ink);"/>
    <button class="btn btn-primary btn-sm" onclick="slaWinkelNaamOp(${i},this.previousElementSibling.value)">✓</button>
    <button onclick="verwijderWinkel(${i})" style="background:none;border:none;cursor:pointer;color:var(--druk-clr);font-size:18px;line-height:1;padding:0 2px;">×</button>
  </div>`).join('');
}

async function voegWinkelToe() {
  const input = document.getElementById('nieuw-winkel-naam');
  const naam = input?.value?.trim();
  if (!naam) return;
  WINKELS.push(naam);
  input.value = '';
  await slaWinkelsOp();
  slaLokaalOp();
  toonOpslagStatus('✅ Opgeslagen');
  renderWinkels();
}

async function slaWinkelNaamOp(idx, naam) {
  if (!naam?.trim()) return;
  WINKELS[idx] = naam.trim();
  await slaWinkelsOp();
  slaLokaalOp();
  toonOpslagStatus('✅ Opgeslagen');
}

async function verwijderWinkel(idx) {
  WINKELS.splice(idx, 1);
  await slaWinkelsOp();
  slaLokaalOp();
  toonOpslagStatus('✅ Verwijderd');
  renderWinkels();
}

// ── Feestdagen ────────────────────────────────────────────────
const FEESTDAGEN_NAAM = 'Belgische feestdagen';
const FEESTDAGEN_SYS  = 'feestdagen';

function _feestdagenAbo() {
  return icalAbonnementen.find(a => a.systeem === FEESTDAGEN_SYS);
}

function renderFeestdagenKaart() {
  const abo = _feestdagenAbo();
  const badge    = document.getElementById('feestdagen-badge');
  const invoer   = document.getElementById('feestdagen-invoer-rij');
  const acties   = document.getElementById('feestdagen-acties');
  const actInfo  = document.getElementById('feestdagen-actief-info');
  if (abo && !abo.paused) {
    if (badge)   { badge.style.display='inline'; badge.textContent='Actief'; }
    if (invoer)  invoer.style.display='none';
    if (acties)  acties.style.display='flex';
    if (actInfo) { actInfo.style.display='block'; actInfo.textContent='🔗 ' + abo.url; }
  } else {
    if (badge)   badge.style.display='none';
    if (invoer)  invoer.style.display='flex';
    if (acties)  acties.style.display='none';
    if (actInfo) actInfo.style.display='none';
    if (abo?.url) document.getElementById('feestdagen-url').value = abo.url;
  }
}

async function koppelFeestdagen() {
  const url = document.getElementById('feestdagen-url').value.trim();
  if (!url) { toonOpslagStatus('❌ Vul een iCal-link in.'); return; }
  toonOpslagStatus('⏳ Feestdagen ophalen…');
  try {
    const text   = await icalFetchUrl(url);
    const events = parseIcal(text, url);
    const {nieuw, geupdate} = await icalMerge(events, [], url, {informatief: true});
    const idx = icalAbonnementen.findIndex(a => a.systeem === FEESTDAGEN_SYS);
    const abo = {url, naam: FEESTDAGEN_NAAM, wie: [], systeem: FEESTDAGEN_SYS, informatief: true, lastSync: new Date().toISOString()};
    if (idx >= 0) icalAbonnementen[idx] = abo; else icalAbonnementen.push(abo);
    await slaIcalAbonnementenOp();
    slaLokaalOp();
    toonOpslagStatus(`✅ Feestdagen: ${nieuw} toegevoegd, ${geupdate} bijgewerkt`);
    renderFeestdagenKaart();
    renderIcalAbonnementen();
  } catch(e) { toonOpslagStatus('❌ ' + e.message); }
}

async function syncFeestdagen() {
  const abo = _feestdagenAbo(); if (!abo) return;
  toonOpslagStatus('⏳ Feestdagen synchroniseren…');
  try {
    const text   = await icalFetchUrl(abo.url);
    const events = parseIcal(text, abo.url);
    const {nieuw, geupdate} = await icalMerge(events, [], abo.url, {informatief: true});
    _feestdagenAbo().lastSync = new Date().toISOString();
    await slaIcalAbonnementenOp();
    slaLokaalOp();
    toonOpslagStatus(`✅ Feestdagen: ${nieuw} nieuw, ${geupdate} bijgewerkt`);
  } catch(e) { toonOpslagStatus('❌ ' + e.message); }
}

async function ontkoppelFeestdagen() {
  const abo = _feestdagenAbo(); if (!abo) return;
  if (!confirm('Feestdagen verwijderen?\n\nAlle feestdagactiviteiten worden uit de agenda gewist.')) return;
  toonOpslagStatus('⏳ Verwijderen…');
  await sbVerwijderIcalActiviteiten(abo.url);
  const idx = icalAbonnementen.findIndex(a => a.systeem === FEESTDAGEN_SYS);
  if (idx >= 0) icalAbonnementen.splice(idx, 1);
  await slaIcalAbonnementenOp();
  slaLokaalOp();
  toonOpslagStatus('✅ Feestdagen verwijderd');
  renderFeestdagenKaart();
}

// ── iCal Abonnementen beheer ──────────────────────────────────
// parseIcal, icalFetchUrl, icalMerge, laadIcalAbonnementen,
// slaIcalAbonnementenOp, sbVerwijderIcalActiviteiten → zie data.js
async function renderIcalAbonnementen(){
  await laadIcalAbonnementen();
  renderFeestdagenKaart();
  const kaarten = document.getElementById('ical-abo-kaarten');
  const leeg    = document.getElementById('ical-abo-leeg');
  if (!kaarten) return;
  // Filter systeem-abonnementen eruit (worden apart getoond)
  const persoonlijk = icalAbonnementen.filter(a => !a.systeem);
  if (!persoonlijk.length) {
    leeg.style.display = 'block'; kaarten.innerHTML = ''; return;
  }
  leeg.style.display = 'none';
  kaarten.innerHTML = persoonlijk.map((abo) => {
    const i = icalAbonnementen.indexOf(abo);
    const opgeschort = abo.paused || false;
    const lastSync   = abo.lastSync ? new Date(abo.lastSync).toLocaleDateString('nl-BE') : '—';
    const wie        = (abo.wie||[]).map(k => PEMOJI[k]||k).join(' ') || '—';
    return `
    <div class="card" style="margin-bottom:8px;">
      <div style="display:flex;align-items:flex-start;gap:12px;">
        <div style="flex:1;min-width:0;">
          <div style="font-size:15px;font-weight:600;color:var(--ink);display:flex;align-items:center;gap:8px;">
            ${escHtml(abo.naam||abo.url)}
            ${opgeschort?'<span style="font-size:11px;padding:2px 8px;border-radius:99px;background:var(--normaal-bg);color:var(--normaal-clr);font-weight:600;">Opgeschort</span>':''}
          </div>
          <div style="font-size:11px;color:var(--muted);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(abo.url)}">${escHtml(abo.url)}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:4px;">Voor: ${wie} &nbsp;·&nbsp; Laatste sync: ${lastSync}</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
        ${opgeschort
          ? `<button class="btn btn-primary btn-sm" onclick="aboHervatten(${i})">▶ Hervatten</button>`
          : `<button class="btn btn-secondary btn-sm" onclick="aboOpschorten(${i})">⏸ Opschorten</button>
             <button class="btn btn-secondary btn-sm" onclick="aboSyncNu(${i})">↻ Sync nu</button>`
        }
        <button class="btn btn-sm" style="color:var(--druk-clr);border-color:var(--druk-clr);" onclick="aboVerwijderen(${i})">🗑 Verwijderen</button>
      </div>
    </div>`;
  }).join('');
}

async function aboOpschorten(i){
  const abo = icalAbonnementen[i]; if (!abo) return;
  if (!confirm(`"${abo.naam||abo.url}" opschorten?\n\nAlle activiteiten uit dit abonnement worden uit je agenda verwijderd.`)) return;
  toonOpslagStatus('⏳ Opschorten…');
  await sbVerwijderIcalActiviteiten(abo.url);
  icalAbonnementen[i].paused = true;
  await slaIcalAbonnementenOp();
  slaLokaalOp();
  toonOpslagStatus('✅ Abonnement opgeschort, activiteiten verwijderd');
  renderIcalAbonnementen();
}

async function aboHervatten(i){
  const abo = icalAbonnementen[i]; if (!abo) return;
  toonOpslagStatus('⏳ Hervatten en synchroniseren…');
  try {
    const text   = await icalFetchUrl(abo.url);
    const events = parseIcal(text, abo.url);
    const {nieuw, geupdate} = await icalMerge(events, abo.wie||[], abo.url, {informatief:!!abo.informatief});
    icalAbonnementen[i].paused   = false;
    icalAbonnementen[i].lastSync = new Date().toISOString();
    await slaIcalAbonnementenOp();
    slaLokaalOp();
    toonOpslagStatus(`✅ Hervat: ${nieuw} toegevoegd, ${geupdate} bijgewerkt`);
    renderIcalAbonnementen();
  } catch(e) {
    toonOpslagStatus('❌ ' + e.message);
  }
}

async function aboSyncNu(i){
  const abo = icalAbonnementen[i]; if (!abo || abo.paused) return;
  toonOpslagStatus('⏳ Synchroniseren…');
  try {
    const text   = await icalFetchUrl(abo.url);
    const events = parseIcal(text, abo.url);
    const {nieuw, geupdate} = await icalMerge(events, abo.wie||[], abo.url, {informatief:!!abo.informatief});
    icalAbonnementen[i].lastSync = new Date().toISOString();
    await slaIcalAbonnementenOp();
    slaLokaalOp();
    toonOpslagStatus(`✅ ${abo.naam||'Agenda'}: ${nieuw} nieuw, ${geupdate} bijgewerkt`);
    renderIcalAbonnementen();
  } catch(e) { toonOpslagStatus('❌ ' + e.message); }
}

async function aboVerwijderen(i){
  const abo = icalAbonnementen[i]; if (!abo) return;
  const metActiviteiten = confirm(`"${abo.naam||abo.url}" verwijderen?\n\nKlik OK om ook alle bijhorende activiteiten te wissen.\nKlik Annuleren om alleen het abonnement te verwijderen maar de activiteiten te bewaren.`);
  if (metActiviteiten) await sbVerwijderIcalActiviteiten(abo.url);
  icalAbonnementen.splice(i, 1);
  await slaIcalAbonnementenOp();
  slaLokaalOp();
  toonOpslagStatus('✅ Abonnement verwijderd');
  renderIcalAbonnementen();
}

// ── Sidebar (desktop) ────────────────────────────────────────
// ── Profiel dropdown ─────────────────────────────────────────
function toggleProfielMenu(e){
  e && e.stopPropagation();
  document.getElementById('profiel-menu')?.classList.toggle('open');
}
document.addEventListener('click', function(){
  document.getElementById('profiel-menu')?.classList.remove('open');
});
document.addEventListener('DOMContentLoaded', function(){
  // ── Sluitknop injecteren in alle modals ──────────────────────
  document.querySelectorAll('.modal-bg .modal').forEach(modal => {
    if(modal.querySelector('.modal-sluit-btn')) return;
    const bg = modal.closest('.modal-bg');
    const btn = document.createElement('button');
    btn.className = 'modal-sluit-btn';
    btn.setAttribute('aria-label', 'Sluiten');
    btn.textContent = '✕';
    btn.onclick = function(e){
      e.stopPropagation();
      if(bg) bg.classList.remove('open');
    };
    modal.insertBefore(btn, modal.firstChild);
  });
});


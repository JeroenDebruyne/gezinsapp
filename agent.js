// agent.js — Gedeelde chat-engine voor alle gezinsassistenten
// Gebruik: const myAgent = createAgentChat({ tools, buildSystemPrompt, execute, ids, isDataGeladen })

const AGENT_MODEL = 'claude-sonnet-4-6';

// ── Rate limiter: max 10 requests per 60 seconden ─────────────
const _rateLimiter = (() => {
  const MAX = 10;
  const VENSTER_MS = 60_000;
  const tijden = [];
  return {
    check() {
      const nu = Date.now();
      while (tijden.length && tijden[0] < nu - VENSTER_MS) tijden.shift();
      if (tijden.length >= MAX) {
        const wacht = Math.ceil((tijden[0] + VENSTER_MS - nu) / 1000);
        throw new Error(`Te veel berichten. Wacht nog ${wacht} seconden.`);
      }
      tijden.push(nu);
    },
  };
})();

function _agentHeaders() {
  const s = typeof Auth !== 'undefined' ? Auth.session() : null;
  const h = { 'Content-Type': 'application/json' };
  if (s?.access_token) h['Authorization'] = 'Bearer ' + s.access_token;
  return h;
}

async function agentFetch(body) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/ai-proxy`, {
    method: 'POST',
    headers: _agentHeaders(),
    body: JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error?.message || d.error || 'API fout ' + r.status);
  return d;
}

// Bouwt een dynamische gezinsbeschrijving op basis van de geladen profielen.
// Voorbeeld: "Gezin: Jeroen (gezinshoofd, key:jeroen), Kelly (gezinshoofd, key:kelly), Nora (kind 6j, key:nora)."
function bouwGezinsContext() {
  const profielen = (typeof Auth !== 'undefined' ? Auth.getProfielen() : []);
  if (!profielen.length) return 'Gezin: onbekend (profielen nog niet geladen).';
  const jaar = new Date().getFullYear();
  const delen = profielen.map(p => {
    let label = (typeof Auth !== 'undefined' ? Auth.ROLLEN[p.rol]?.label?.toLowerCase() : null) || p.rol || 'gezinslid';
    if (p.geboortedatum) {
      const leeftijd = jaar - new Date(p.geboortedatum + 'T12:00:00').getFullYear();
      if (leeftijd > 0 && leeftijd < 25) label += ` ${leeftijd}j`;
    }
    return `${p.naam} (${label}, key:${p.persoonKey})`;
  });
  return 'Gezin: ' + delen.join(', ') + '.';
}

function createAgentChat({ tools, buildSystemPrompt, execute, ids, isDataGeladen }) {
  // ids: { berichten, input, bevestiging, bevestigingTekst?, storageKey? }
  let chatGeschiedenis = [];
  let _pending = null;
  let _bevestigingTimeout = null;

  const _sk = ids.storageKey || null;
  if (_sk) {
    try { chatGeschiedenis = JSON.parse(localStorage.getItem(_sk) || '[]'); } catch {}
  }

  function _slaGeschiedenisOp() {
    if (!_sk) return;
    try { localStorage.setItem(_sk, JSON.stringify(chatGeschiedenis.slice(-40))); } catch {}
  }

  // Strip internal tracking fields before sending to the Anthropic API.
  // tool_use blocks may only contain type/id/name/input.
  function _cleanMessages(messages) {
    return messages.map(m => ({
      role: m.role,
      content: Array.isArray(m.content)
        ? m.content.map(b => {
            if (!b || typeof b !== 'object') return b;
            if (b.type === 'tool_use') return { type: b.type, id: b.id, name: b.name, input: b.input ?? {} };
            if (b.type === 'text') return { type: b.type, text: b.text ?? '' };
            return b;
          })
        : m.content,
    }));
  }

  async function _fetch(body) {
    return agentFetch({ ...body, messages: _cleanMessages(body.messages || []) });
  }

  async function _fetchStream(body, onChunk) {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/ai-proxy`, {
      method: 'POST',
      headers: _agentHeaders(),
      body: JSON.stringify({ ...body, stream: true, messages: _cleanMessages(body.messages || []) }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d.error?.message || d.error || 'API fout ' + r.status);
    }
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    const msg = { content: [], stop_reason: null };
    const blks = {};
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        let ev; try { ev = JSON.parse(line.slice(6)); } catch { continue; }
        if (ev.type === 'content_block_start') {
          blks[ev.index] = { ...ev.content_block };
          if (ev.content_block.type === 'tool_use') blks[ev.index]._json = '';
        } else if (ev.type === 'content_block_delta') {
          const b = blks[ev.index]; if (!b) continue;
          if (ev.delta.type === 'text_delta') { b.text = (b.text || '') + ev.delta.text; onChunk(ev.delta.text); }
          else if (ev.delta.type === 'input_json_delta') { b._json = (b._json || '') + ev.delta.partial_json; }
        } else if (ev.type === 'content_block_stop') {
          const b = blks[ev.index]; if (!b) continue;
          if (b._json) { try { b.input = JSON.parse(b._json); } catch {} }
          delete b._json;
          msg.content.push(b);
        } else if (ev.type === 'message_delta') {
          msg.stop_reason = ev.delta.stop_reason;
        }
      }
    }
    return msg;
  }

  function formateerAntwoord(tekst) {
    return escHtml(tekst)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/^#{1,3}\s(.+)$/gm, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  }

  function voegBerichtToe(rol, tekst, isTyping = false) {
    const container = document.getElementById(ids.berichten);
    if (!container) return null;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'align-self:' + (rol === 'user' ? 'flex-end' : 'flex-start') + ';max-width:90%;';
    const bubble = document.createElement('div');
    bubble.className = rol === 'user' ? 'chat-bubble-user' : 'chat-bubble-bot';
    if (rol === 'user') {
      bubble.textContent = tekst;
    } else if (isTyping) {
      bubble.textContent = tekst;
    } else {
      bubble.innerHTML = formateerAntwoord(tekst);
    }
    wrap.appendChild(bubble);
    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;
    return isTyping ? wrap : null;
  }

  function _toonBevestiging(bericht) {
    const panel = document.getElementById(ids.bevestiging);
    if (!panel) return;
    if (ids.bevestigingTekst) {
      const el = document.getElementById(ids.bevestigingTekst);
      if (el) el.textContent = bericht;
    }
    panel.style.display = 'block';
    _bevestigingTimeout = setTimeout(() => annuleer(), 5 * 60 * 1000);
  }

  function _verbergBevestiging() {
    clearTimeout(_bevestigingTimeout);
    _bevestigingTimeout = null;
    const panel = document.getElementById(ids.bevestiging);
    if (panel) panel.style.display = 'none';
  }

  async function _toolLoop(data) {
    while (data.stop_reason === 'tool_use') {
      const toolResults = [];
      for (const block of (data.content || [])) {
        if (block.type !== 'tool_use') continue;
        if (block.input?.bevestiging_vereist) {
          _pending = { naam: block.name, input: JSON.parse(JSON.stringify(block.input)), toolUseId: block.id };
          _toonBevestiging(block.input.bevestiging_bericht || 'Wil je dit uitvoeren?');
          chatGeschiedenis.push({ role: 'assistant', content: data.content });
          chatGeschiedenis.push({ role: 'user', content: [...toolResults, { type: 'tool_result', tool_use_id: block.id, content: 'Wacht op gebruikersbevestiging.' }] });
          _slaGeschiedenisOp();
          return null;
        }
        const result = await execute(block.name, block.input);
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: String(result) });
      }
      chatGeschiedenis.push({ role: 'assistant', content: data.content });
      chatGeschiedenis.push({ role: 'user', content: toolResults });
      _slaGeschiedenisOp();
      data = await _fetch({ model: AGENT_MODEL, max_tokens: 4000, system: buildSystemPrompt(), tools, messages: chatGeschiedenis });
    }
    return data;
  }

  function _checkPrivacyConsent() {
    if (localStorage.getItem('gezinsapp_ai_consent')) return true;
    const container = document.getElementById(ids.berichten);
    if (!container) return false;
    if (container.querySelector('.privacy-consent-bubble')) return false;
    const wrap = document.createElement('div');
    wrap.className = 'privacy-consent-bubble';
    wrap.style.cssText = 'align-self:flex-start;max-width:95%;';
    wrap.innerHTML = '<div class="chat-bubble-bot" style="background:var(--surface-2);border:1.5px solid var(--border-2);">'
      + '<strong>Privacy-melding</strong><br><br>'
      + 'Door de gezinsassistent te gebruiken stuur je gezinsgegevens (namen, agenda, planning) naar <strong>Anthropic</strong> voor verwerking. '
      + 'Zie hun <a href="https://www.anthropic.com/privacy" target="_blank" rel="noopener" style="color:var(--accent)">privacybeleid</a>.<br><br>'
      + 'Berichten worden niet langer dan nodig bewaard. Geen tracking of advertenties.<br><br>'
      + '<button onclick="(function(b){localStorage.setItem(\'gezinsapp_ai_consent\',\'1\');b.closest(\'.privacy-consent-bubble\').remove();})(this)" '
      + 'style="padding:8px 18px;background:var(--accent);color:white;border:none;border-radius:99px;cursor:pointer;font-weight:600;font-family:inherit;">Akkoord — doorgaan</button>'
      + '</div>';
    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;
    return false;
  }

  async function stuurBericht(tekst) {
    tekst = (tekst || '').trim();
    if (!tekst) return;
    if (!_checkPrivacyConsent()) return;
    try { _rateLimiter.check(); } catch (e) { voegBerichtToe('assistant', '⏱️ ' + (e?.message || e)); return; }
    // Wacht tot data geladen is (optioneel)
    if (isDataGeladen && !isDataGeladen()) {
      const typWait = voegBerichtToe('assistant', '⏳ Even wachten, data wordt nog geladen…', true);
      await new Promise(r => { const start = Date.now(); const t = setInterval(() => { if (isDataGeladen() || Date.now() - start > 8000) { clearInterval(t); r(); } }, 200); });
      typWait?.remove();
    }
    const inputEl = document.getElementById(ids.input);
    if (inputEl) inputEl.value = '';
    voegBerichtToe('user', tekst);
    chatGeschiedenis.push({ role: 'user', content: tekst });
    if (chatGeschiedenis.length > 40) chatGeschiedenis = chatGeschiedenis.slice(-40);
    _slaGeschiedenisOp();
    const container = document.getElementById(ids.berichten);
    let streamWrap = null, streamBubble = null, streamedText = '';
    if (container) {
      streamWrap = document.createElement('div');
      streamWrap.style.cssText = 'align-self:flex-start;max-width:90%;';
      streamBubble = document.createElement('div');
      streamBubble.className = 'chat-bubble-bot';
      streamBubble.textContent = '⏳';
      streamWrap.appendChild(streamBubble);
      container.appendChild(streamWrap);
      container.scrollTop = container.scrollHeight;
    }
    try {
      let data = await _fetchStream({ model: AGENT_MODEL, max_tokens: 4000, system: buildSystemPrompt(), tools, messages: chatGeschiedenis }, chunk => {
        if (!streamedText && streamBubble) streamBubble.textContent = '';
        streamedText += chunk;
        if (streamBubble) { streamBubble.innerHTML = formateerAntwoord(streamedText); if (container) container.scrollTop = container.scrollHeight; }
      });
      if (data.stop_reason === 'tool_use') {
        if (streamWrap) { streamWrap.remove(); streamWrap = null; }
        const typingEl = voegBerichtToe('assistant', '⏳…', true);
        const result = await _toolLoop(data);
        typingEl?.remove();
        if (!result) return;
        const finaleTekst = (result.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
        voegBerichtToe('assistant', finaleTekst);
        chatGeschiedenis.push({ role: 'assistant', content: finaleTekst });
        _slaGeschiedenisOp();
      } else {
        const finaleTekst = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
        if (streamBubble) streamBubble.innerHTML = formateerAntwoord(finaleTekst);
        chatGeschiedenis.push({ role: 'assistant', content: finaleTekst });
        _slaGeschiedenisOp();
      }
    } catch (e) {
      if (streamWrap) streamWrap.remove();
      voegBerichtToe('assistant', '❌ Fout: ' + (e?.message || e));
    }
  }

  async function bevestig() {
    if (!_pending) return;
    _verbergBevestiging();
    const { naam, input, toolUseId } = _pending;
    _pending = null;
    const typingEl = voegBerichtToe('assistant', '⏳…', true);
    try {
      const result = await execute(naam, input);
      const last = chatGeschiedenis[chatGeschiedenis.length - 1];
      if (last?.role === 'user' && Array.isArray(last.content)) {
        const ph = last.content.find(b => b.type === 'tool_result' && b.tool_use_id === toolUseId);
        if (ph) ph.content = String(result);
      }
      let data = await _fetch({ model: AGENT_MODEL, max_tokens: 4000, system: buildSystemPrompt(), tools, messages: chatGeschiedenis });
      typingEl?.remove();
      const resultData = await _toolLoop(data);
      if (!resultData) return;
      const tekst = (resultData.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
      voegBerichtToe('assistant', tekst);
      chatGeschiedenis.push({ role: 'assistant', content: tekst });
      _slaGeschiedenisOp();
    } catch (e) {
      typingEl?.remove();
      voegBerichtToe('assistant', '❌ Fout: ' + (e?.message || e));
    }
  }

  function annuleer() {
    _pending = null;
    _verbergBevestiging();
    const msg = '❌ Geannuleerd.';
    voegBerichtToe('assistant', msg);
    chatGeschiedenis.push({ role: 'assistant', content: msg });
    _slaGeschiedenisOp();
  }

  function wis(welkomHtml) {
    chatGeschiedenis = [];
    if (_sk) try { localStorage.removeItem(_sk); } catch {}
    const container = document.getElementById(ids.berichten);
    if (container) container.innerHTML = welkomHtml || '';
  }

  function stuurVoorbeeldVraag(tekst) {
    const inputEl = document.getElementById(ids.input);
    if (inputEl) inputEl.value = tekst;
    stuurBericht(tekst);
  }

  return { stuurBericht, stuurVoorbeeldVraag, voegBerichtToe, bevestig, annuleer, wis };
}

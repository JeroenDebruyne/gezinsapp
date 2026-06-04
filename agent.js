// agent.js — Gedeelde chat-engine voor alle gezinsassistenten
// Gebruik: const myAgent = createAgentChat({ tools, buildSystemPrompt, execute, ids, isDataGeladen })

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
  // ids: { berichten, input, bevestiging, bevestigingTekst? }
  let chatGeschiedenis = [];
  let _pending = null;

  async function _fetch(apiKey, body) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok) {
      if (r.status === 401) localStorage.removeItem('anthropic_api_key');
      throw new Error(d.error?.message || 'API fout ' + r.status);
    }
    return d;
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
  }

  function _verbergBevestiging() {
    const panel = document.getElementById(ids.bevestiging);
    if (panel) panel.style.display = 'none';
  }

  async function _toolLoop(apiKey, data) {
    while (data.stop_reason === 'tool_use') {
      const toolResults = [];
      for (const block of (data.content || [])) {
        if (block.type !== 'tool_use') continue;
        if (block.input?.bevestiging_vereist) {
          _pending = { naam: block.name, input: JSON.parse(JSON.stringify(block.input)), toolUseId: block.id };
          _toonBevestiging(block.input.bevestiging_bericht || 'Wil je dit uitvoeren?');
          chatGeschiedenis.push({ role: 'assistant', content: data.content });
          chatGeschiedenis.push({ role: 'user', content: [...toolResults, { type: 'tool_result', tool_use_id: block.id, content: 'Wacht op gebruikersbevestiging.' }] });
          return null;
        }
        const result = await execute(block.name, block.input);
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: String(result) });
      }
      chatGeschiedenis.push({ role: 'assistant', content: data.content });
      chatGeschiedenis.push({ role: 'user', content: toolResults });
      data = await _fetch(apiKey, { model: 'claude-sonnet-4-6', max_tokens: 4000, system: buildSystemPrompt(), tools, messages: chatGeschiedenis });
    }
    return data;
  }

  async function stuurBericht(tekst) {
    tekst = (tekst || '').trim();
    if (!tekst) return;
    // Wacht tot data geladen is (optioneel)
    if (isDataGeladen && !isDataGeladen()) {
      const typWait = voegBerichtToe('assistant', '⏳ Even wachten, data wordt nog geladen…', true);
      await new Promise(r => { const t = setInterval(() => { if (isDataGeladen()) { clearInterval(t); r(); } }, 200); });
      typWait?.remove();
    }
    let apiKey = localStorage.getItem('anthropic_api_key') || ''; // CodeQL[js/clear-text-storage-of-sensitive-information]
    if (!apiKey) {
      apiKey = prompt('Anthropic API key (sk-ant-…):');
      if (!apiKey) return;
      localStorage.setItem('anthropic_api_key', apiKey); // CodeQL[js/clear-text-storage-of-sensitive-information]
    }
    const inputEl = document.getElementById(ids.input);
    if (inputEl) inputEl.value = '';
    voegBerichtToe('user', tekst);
    chatGeschiedenis.push({ role: 'user', content: tekst });
    if (chatGeschiedenis.length > 40) chatGeschiedenis = chatGeschiedenis.slice(-40);
    const typingEl = voegBerichtToe('assistant', '⏳…', true);
    try {
      let data = await _fetch(apiKey, { model: 'claude-sonnet-4-6', max_tokens: 4000, system: buildSystemPrompt(), tools, messages: chatGeschiedenis });
      typingEl?.remove();
      const result = await _toolLoop(apiKey, data);
      if (!result) return;
      const finaleTekst = (result.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
      voegBerichtToe('assistant', finaleTekst);
      chatGeschiedenis.push({ role: 'assistant', content: finaleTekst });
    } catch (e) {
      typingEl?.remove();
      voegBerichtToe('assistant', '❌ Fout: ' + e.message);
      if (e.message.includes('401')) localStorage.removeItem('anthropic_api_key');
    }
  }

  async function bevestig() {
    if (!_pending) return;
    _verbergBevestiging();
    const { naam, input, toolUseId } = _pending;
    _pending = null;
    const apiKey = localStorage.getItem('anthropic_api_key') || ''; // CodeQL[js/clear-text-storage-of-sensitive-information]
    const typingEl = voegBerichtToe('assistant', '⏳…', true);
    try {
      const result = await execute(naam, input);
      const last = chatGeschiedenis[chatGeschiedenis.length - 1];
      if (last?.role === 'user' && Array.isArray(last.content)) {
        const ph = last.content.find(b => b.type === 'tool_result' && b.tool_use_id === toolUseId);
        if (ph) ph.content = String(result);
      }
      let data = await _fetch(apiKey, { model: 'claude-sonnet-4-6', max_tokens: 4000, system: buildSystemPrompt(), tools, messages: chatGeschiedenis });
      typingEl?.remove();
      const resultData = await _toolLoop(apiKey, data);
      if (!resultData) return;
      const tekst = (resultData.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
      voegBerichtToe('assistant', tekst);
      chatGeschiedenis.push({ role: 'assistant', content: tekst });
    } catch (e) {
      typingEl?.remove();
      voegBerichtToe('assistant', '❌ Fout: ' + e.message);
    }
  }

  function annuleer() {
    _pending = null;
    _verbergBevestiging();
    const msg = '❌ Geannuleerd.';
    voegBerichtToe('assistant', msg);
    chatGeschiedenis.push({ role: 'assistant', content: msg });
  }

  function wis(welkomHtml) {
    chatGeschiedenis = [];
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

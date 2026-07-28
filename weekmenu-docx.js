// weekmenu-docx.js — Weekmenu als Word-document (.docx) genereren en terug inlezen.
// Geen externe libraries: eigen minimale ZIP-writer (store) en ZIP-reader
// (DecompressionStream voor deflate). Bedoeld voor de flow:
//   1. App genereert weekmenu.docx  →  Kelly bewaart/bewerkt het in Word (iCloud Drive)
//   2. Kelly leest het bestand terug in  →  app vult de planner en maakt de boodschappenlijst

// ── ZIP: schrijven (store, geen compressie) ───────────────────
const _crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
function _crc32(u8) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < u8.length; i++) c = _crcTable[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function _zipStore(files) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  files.forEach(f => {
    const nameB = enc.encode(f.name);
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = _crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true);
    lh.setUint32(22, data.length, true);
    lh.setUint16(26, nameB.length, true);
    parts.push(lh.buffer, nameB, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
    ch.setUint16(28, nameB.length, true);
    ch.setUint32(42, offset, true);
    central.push(ch.buffer, nameB);
    offset += 30 + nameB.length + data.length;
  });
  let cdSize = 0;
  central.forEach(p => cdSize += p.byteLength);
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, files.length, true);
  eocd.setUint16(10, files.length, true);
  eocd.setUint32(12, cdSize, true);
  eocd.setUint32(16, offset, true);
  return new Blob([...parts, ...central, eocd.buffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

// ── ZIP: lezen (store + deflate) ──────────────────────────────
async function _zipLees(buf, gezochtNaam) {
  const dv = new DataView(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 22 - 65536); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Geen geldig .docx-bestand (zip niet herkend).');
  const count = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(off, true) !== 0x02014b50) break;
    const method = dv.getUint16(off + 10, true);
    const csize = dv.getUint32(off + 20, true);
    const nlen = dv.getUint16(off + 28, true), elen = dv.getUint16(off + 30, true), clen = dv.getUint16(off + 32, true);
    const lho = dv.getUint32(off + 42, true);
    const naam = dec.decode(new Uint8Array(buf, off + 46, nlen));
    if (naam === gezochtNaam) {
      const lnlen = dv.getUint16(lho + 26, true), lelen = dv.getUint16(lho + 28, true);
      const data = new Uint8Array(buf, lho + 30 + lnlen + lelen, csize);
      if (method === 0) return dec.decode(data);
      if (method === 8) {
        if (typeof DecompressionStream === 'undefined') throw new Error('Deze browser kan het bestand niet uitpakken. Probeer een recente browser.');
        const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return await new Response(stream).text();
      }
      throw new Error('Onbekende compressiemethode in .docx.');
    }
    off += 46 + nlen + elen + clen;
  }
  throw new Error(gezochtNaam + ' niet gevonden — is dit wel een Word-document?');
}

// ── Docx genereren ────────────────────────────────────────────
function _xmlEsc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function _docxCel(teksten, opts = {}) {
  const breed = opts.breed || 2600;
  const shd = opts.vulling ? `<w:shd w:val="clear" w:fill="${opts.vulling}"/>` : '';
  const runPr = (opts.vet ? '<w:b/>' : '') + '<w:sz w:val="21"/>';
  const paras = (teksten.length ? teksten : ['']).map(t =>
    `<w:p><w:r><w:rPr>${runPr}</w:rPr><w:t xml:space="preserve">${_xmlEsc(t)}</w:t></w:r></w:p>`).join('');
  return `<w:tc><w:tcPr><w:tcW w:w="${breed}" w:type="dxa"/>${shd}</w:tcPr>${paras}</w:tc>`;
}

function _maakWeekmenuDocx() {
  const dates = getWeekDates(weekOffsetP);
  const titel = `Weekmenu ${wLabel(dates)} ${dates[0].getFullYear()}`;
  const profielen = Auth.getProfielen();
  const kokNamen = profielen.filter(p => !p.isKind).map(p => p.naam).join(' / ');
  const border = '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
    .map(z => `<w:${z} w:val="single" w:sz="6" w:color="BBBBBB"/>`).join('') + '</w:tblBorders>';

  const kop = '<w:tr>' + [
    _docxCel(['Dag'], { vet: true, vulling: 'F2E8DC', breed: 2200 }),
    _docxCel(['Ontbijt'], { vet: true, vulling: 'F2E8DC' }),
    _docxCel(['Lunch'], { vet: true, vulling: 'F2E8DC' }),
    _docxCel(['Avond'], { vet: true, vulling: 'F2E8DC' }),
    _docxCel(['Kok'], { vet: true, vulling: 'F2E8DC', breed: 1800 }),
  ].join('') + '</w:tr>';

  const rijen = dates.map((d, i) => {
    const key = fDateISO(d);
    const dag = planning[key] || {};
    const perSlot = {};
    let kokNaam = '';
    SLOTS.forEach(slot => {
      const items = getSlotItems(dag, slot.key);
      perSlot[slot.key] = items.map(it =>
        SPEC[it.waarde] || it.naam_override || recepten.find(r => String(r.id) === String(it.waarde))?.naam || String(it.waarde || '')
      ).filter(Boolean);
      if (slot.key === 'avond' && items[0]?.kok) {
        const p = profielen.find(x => x.persoonKey === items[0].kok);
        kokNaam = p?.naam || '';
      }
    });
    const dagLbl = `${DLANG[i]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    return '<w:tr>' + [
      _docxCel([dagLbl], { vet: true, breed: 2200 }),
      _docxCel(perSlot.ontbijt),
      _docxCel(perSlot.lunch),
      _docxCel(perSlot.avond),
      _docxCel(kokNaam ? [kokNaam] : [], { breed: 1800 }),
    ].join('') + '</w:tr>';
  }).join('');

  const hint = `Pas de maaltijden gewoon aan in de tabel. Meerdere gerechten in één vak? Zet een + ertussen. ` +
    `Snelle opties: uit eten, afhalen, restjes, shake. Kok = wie 's avonds kookt (${kokNamen}). ` +
    `Klaar? Lees dit bestand terug in via Maaltijden → Word.`;

  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>${_xmlEsc(titel)}</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:sz w:val="18"/><w:color w:val="777777"/></w:rPr><w:t xml:space="preserve">${_xmlEsc(hint)}</w:t></w:r></w:p>
<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>${border}</w:tblPr>${kop}${rijen}</w:tbl>
<w:p/>
<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="1000" w:right="1000" w:bottom="1000" w:left="1000"/></w:sectPr>
</w:body></w:document>`;

  return _zipStore([
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { name: 'word/document.xml', data: doc },
  ]);
}

function wordDownload() {
  const dates = getWeekDates(weekOffsetP);
  const blob = _maakWeekmenuDocx();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `weekmenu-${fDateISO(dates[0])}.docx`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  toonOpslagStatus('✅ Weekmenu gedownload');
}

// ── Docx parsen ───────────────────────────────────────────────
function _xmlOntEsc(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}
// Haalt platte tekst per cel uit de eerste tabel: [[cel,cel,…],…]
function _parseTabel(xml) {
  const tblMatch = xml.match(/<w:tbl(?:[ >])[\s\S]*?<\/w:tbl>/);
  if (!tblMatch) return null;
  const rijen = tblMatch[0].match(/<w:tr(?:[ >])[\s\S]*?<\/w:tr>/g) || [];
  return rijen.map(rij => {
    const cellen = rij.match(/<w:tc(?:[ >])[\s\S]*?<\/w:tc>/g) || [];
    return cellen.map(cel =>
      cel.split(/<\/w:p>/).map(seg =>
        (seg.match(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g) || [])
          .map(t => _xmlOntEsc(t.replace(/<[^>]+>/g, ''))).join('')
      ).filter(s => s !== '').join('\n').trim()
    );
  });
}

function _dagIndexVoorTekst(t) {
  const n = (t || '').toLowerCase().trim();
  for (let i = 0; i < 7; i++) {
    if (n.startsWith(DLANG[i].toLowerCase()) || n.replace(/[^a-z]/g, '').startsWith(DKORT[i].toLowerCase())) return i;
  }
  return -1;
}

function _matchKeuze(naam) {
  const n = naam.toLowerCase().trim();
  if (/uit\s*eten|restaurant/.test(n)) return { waarde: 'uiteten' };
  if (/afhalen|afhaal|take\s*away|bestell/.test(n)) return { waarde: 'afhalen' };
  if (/restje|resten|overschot/.test(n)) return { waarde: 'restjes' };
  if (/\bshake\b/.test(n)) return { waarde: 'shake' };
  let r = recepten.find(x => x.naam.toLowerCase() === n);
  if (!r) r = recepten.find(x => x.naam.toLowerCase().includes(n) || n.includes(x.naam.toLowerCase()));
  if (!r) {
    // Woord-gebaseerd: "wrap kip" matcht "Wrap met kip"
    const tokens = n.split(/\s+/).filter(w => w.length > 1);
    if (tokens.length) r = recepten.find(x => { const rn = x.naam.toLowerCase(); return tokens.every(t => rn.includes(t)); });
  }
  if (r) return { waarde: String(r.id), receptNaam: r.naam };
  return { waarde: naam, naam_override: naam, onbekend: true };
}

function _matchKok(t) {
  const n = (t || '').toLowerCase().trim();
  if (!n) return null;
  const p = Auth.getProfielen().find(x =>
    x.naam.toLowerCase().startsWith(n) || n.startsWith(x.naam.toLowerCase()));
  return p ? p.persoonKey : null;
}

let _wordParsed = null;

function _parseWeekmenuXml(xml) {
  const tabel = _parseTabel(xml);
  if (!tabel || tabel.length < 2) throw new Error('Geen tabel gevonden in het document.');
  // Kolommen herkennen op basis van de koprij
  const kop = tabel[0].map(c => c.toLowerCase());
  const kolom = {};
  kop.forEach((c, i) => {
    if (/ontbijt/.test(c)) kolom.ontbijt = i;
    else if (/lunch|middag/.test(c)) kolom.lunch = i;
    else if (/avond/.test(c)) kolom.avond = i;
    else if (/kok|kookt/.test(c)) kolom.kok = i;
    else if (/dag/.test(c) && kolom.dag === undefined) kolom.dag = i;
  });
  if (kolom.dag === undefined) kolom.dag = 0;
  const slotKolommen = new Set(SLOTS.map(s => s.key).filter(k => kolom[k] !== undefined));
  if (!slotKolommen.size) throw new Error('Geen maaltijdkolommen (Ontbijt/Lunch/Avond) herkend in de tabel.');

  const dagen = {}; // dagIndex → {slotKey: [items]}
  const warnings = [];
  tabel.slice(1).forEach(rij => {
    const di = _dagIndexVoorTekst(rij[kolom.dag]);
    if (di < 0) return;
    dagen[di] = dagen[di] || {};
    const kokKey = kolom.kok !== undefined ? _matchKok(rij[kolom.kok]) : null;
    if (kolom.kok !== undefined && rij[kolom.kok]?.trim() && !kokKey)
      warnings.push(`${DLANG[di]}: kok “${rij[kolom.kok].trim()}” niet herkend`);
    slotKolommen.forEach(slotKey => {
      const cel = rij[kolom[slotKey]] || '';
      const namen = cel.split(/\n|\+|·/).map(s => s.trim()).filter(Boolean);
      dagen[di][slotKey] = namen.map((naam, idx) => {
        const m = _matchKeuze(naam);
        if (m.onbekend) warnings.push(`${DLANG[di]} ${slotKey}: “${naam}” is geen gekend recept (wordt bewaard zonder ingrediënten)`);
        const item = { waarde: m.waarde, wie: [], kok: slotKey === 'avond' && idx === 0 ? kokKey : null, extra_eters: 0 };
        if (m.naam_override) item.naam_override = m.naam_override;
        return item;
      });
    });
  });
  if (!Object.keys(dagen).length) throw new Error('Geen dagen (Maandag…Zondag) herkend in de eerste kolom.');
  return { dagen, slotKolommen, warnings };
}

function _wordItemLabel(item) {
  return SPEC[item.waarde] || item.naam_override || recepten.find(r => String(r.id) === String(item.waarde))?.naam || String(item.waarde);
}

function _toonWordPreview() {
  const el = document.getElementById('word-preview');
  const dates = getWeekDates(weekOffsetP);
  const slotLbl = Object.fromEntries(SLOTS.map(s => [s.key, s.lbl]));
  const rijen = dates.map((d, i) => {
    const slots = _wordParsed.dagen[i];
    const delen = [...(_wordParsed.slotKolommen)].map(sk => {
      const items = slots?.[sk] || [];
      if (!items.length) return `<span style="color:var(--muted-2);">${slotLbl[sk]}: —</span>`;
      return `${slotLbl[sk]}: <strong>${items.map(it => escHtml(_wordItemLabel(it))).join(' + ')}</strong>`;
    }).join(' &nbsp;·&nbsp; ');
    return `<div style="padding:6px 0;border-bottom:1px solid var(--border);font-size:13px;"><strong>${DKORT[i]}</strong> &nbsp;${delen}</div>`;
  }).join('');
  const warns = _wordParsed.warnings.length
    ? `<div style="margin-top:8px;font-size:12px;color:var(--normaal-clr);">${_wordParsed.warnings.map(w => `<div>⚠️ ${escHtml(w)}</div>`).join('')}</div>` : '';
  el.innerHTML = `
    <div class="section-label" style="margin-top:14px;">Gelezen uit het document</div>
    ${rijen}${warns}
    <div style="margin-top:8px;font-size:12px;color:var(--muted);">Dit vervangt het weekmenu van de getoonde week (${escHtml(wLabel(dates))}). Kolommen die niet in het document staan blijven ongewijzigd.</div>`;
  el.style.display = 'block';
  document.getElementById('word-apply-btn').style.display = '';
}

async function _leesWordBestand(file) {
  const status = document.getElementById('word-status');
  try {
    status.textContent = '⏳ Bestand lezen…';
    const xml = await _zipLees(await file.arrayBuffer(), 'word/document.xml');
    _wordParsed = _parseWeekmenuXml(xml);
    status.textContent = '';
    _toonWordPreview();
  } catch (e) {
    _wordParsed = null;
    document.getElementById('word-preview').style.display = 'none';
    document.getElementById('word-apply-btn').style.display = 'none';
    status.textContent = '❌ ' + e.message;
  }
}

function wordApply() {
  if (!_wordParsed) return;
  const dates = getWeekDates(weekOffsetP);
  dates.forEach((d, i) => {
    _wordParsed.slotKolommen.forEach(slotKey => {
      const items = _wordParsed.dagen[i]?.[slotKey] || [];
      _saveItems(fDateISO(d), slotKey, items);
    });
  });
  renderPlanner();
  sluitWordModal();
  toonOpslagStatus('✅ Weekmenu overgenomen uit Word');
  setTimeout(() => {
    _bevestig('Meteen de boodschappenlijst maken van dit weekmenu?', () => voegToeAanBoodschappenlijst(),
      { bevestigLabel: 'Maak lijst', cancelLabel: 'Later', danger: false });
  }, 350);
}

// ── Modal ─────────────────────────────────────────────────────
function openWordModal() {
  _wordParsed = null;
  document.getElementById('word-preview').style.display = 'none';
  document.getElementById('word-apply-btn').style.display = 'none';
  document.getElementById('word-status').textContent = '';
  document.getElementById('word-file-input').value = '';
  const dates = getWeekDates(weekOffsetP);
  document.getElementById('word-modal-weeklbl').textContent = 'Week ' + wLabel(dates) + ' ' + dates[0].getFullYear();
  document.getElementById('word-modal-bg').classList.add('open');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}
function sluitWordModal() { document.getElementById('word-modal-bg').classList.remove('open'); }

document.getElementById('word-file-input')?.addEventListener('change', e => {
  if (e.target.files?.[0]) _leesWordBestand(e.target.files[0]);
});
const _wordDrop = document.getElementById('word-drop-zone');
if (_wordDrop) {
  _wordDrop.addEventListener('dragover', e => { e.preventDefault(); _wordDrop.classList.add('word-drop-actief'); });
  _wordDrop.addEventListener('dragleave', () => _wordDrop.classList.remove('word-drop-actief'));
  _wordDrop.addEventListener('drop', e => {
    e.preventDefault();
    _wordDrop.classList.remove('word-drop-actief');
    if (e.dataTransfer.files?.[0]) _leesWordBestand(e.dataTransfer.files[0]);
  });
}
document.getElementById('word-modal-bg')?.addEventListener('click', e => {
  if (e.target === document.getElementById('word-modal-bg')) sluitWordModal();
});

document.addEventListener('click', function (e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  switch (el.dataset.action) {
    case 'open-word-modal': openWordModal(); break;
    case 'close-word-modal': sluitWordModal(); break;
    case 'word-download': wordDownload(); break;
    case 'word-klik-input': document.getElementById('word-file-input').click(); break;
    case 'word-apply': wordApply(); break;
  }
});

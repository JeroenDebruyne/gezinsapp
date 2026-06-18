/**
 * maps.js — Google Maps hulpfuncties (Places + Distance Matrix)
 * Laden na auth.js en data.js
 */
const Maps = (() => {
  const KEY_KEY    = 'google_maps_key';
  const THUIS_KEY  = 'gezinsapp_thuisadres';
  const COORDS_KEY = 'gezinsapp_thuisadres_coords';

  let _ready = false, _loading = false, _queue = [];
  let _key = ''; // in-memory, nooit in localStorage

  function getKey()        { return _key || localStorage.getItem(KEY_KEY) || ''; }
  function setKey(k)       { _key = k || ''; }
  function getThuisadres() { return localStorage.getItem(THUIS_KEY) || ''; }

  // Geeft {lat, lng} terug vanuit cache, of null als er nog geen coords zijn.
  function getCoords() {
    try { return JSON.parse(localStorage.getItem(COORDS_KEY) || 'null'); } catch { return null; }
  }

  function _slaCoördinatenOp(lat, lng) {
    localStorage.setItem(COORDS_KEY, JSON.stringify({ lat, lng }));
  }

  // Geocodeer een adresstring via Nominatim (OSM, geen API-key nodig).
  // Slaat het resultaat op in localStorage voor hergebruik.
  async function geocodeerAdres(adres) {
    if (!adres) return null;
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(adres)}&format=json&limit=1&countrycodes=be`;
      const r = await fetch(url, { headers: { 'Accept-Language': 'nl', 'User-Agent': 'GezinsApp/1.0' } });
      const data = await r.json();
      if (data[0]) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        _slaCoördinatenOp(lat, lng);
        return { lat, lng };
      }
    } catch (e) { console.warn('[Maps] Geocoderen mislukt:', e); }
    return null;
  }

  function laad(cb) {
    if (_ready)   { cb && cb(); return; }
    if (cb)       _queue.push(cb);
    if (_loading) return;
    const key = getKey();
    if (!key) { console.warn('[Maps] Geen API key ingesteld.'); return; }
    _loading = true;
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&language=nl&region=BE`;
    s.async = s.defer = true;
    s.onload = () => {
      _ready = true; _loading = false;
      _queue.forEach(f => f()); _queue = [];
    };
    s.onerror = () => { _loading = false; console.error('[Maps] Laden mislukt — controleer de API key.'); };
    document.head.appendChild(s);
  }

  // Zoek de dichtstbijzijnde scrollende voorouder van een element.
  function _scrollParent(el) {
    let node = el.parentNode;
    while (node && node !== document.body) {
      const s = window.getComputedStyle(node);
      if (/(auto|scroll)/.test(s.overflow + s.overflowY + s.overflowX)) return node;
      node = node.parentNode;
    }
    return window;
  }

  // Koppel Google Places autocomplete aan een input-element.
  // onKeuze(adres: string, place: PlaceResult) wordt aangeroepen bij selectie.
  // Voorkomt dubbele instanties via el._mapsAC.
  function autocomplete(el, onKeuze) {
    if (!el) return;
    if (el._mapsAC) return; // al gekoppeld, niet opnieuw aanmaken
    laad(() => {
      if (el._mapsAC) return;
      const ac = new google.maps.places.Autocomplete(el, {
        fields: ['formatted_address', 'name', 'geometry'],
        componentRestrictions: { country: 'be' },
      });
      el._mapsAC = ac;
      ac.addListener('place_changed', () => {
        const p = ac.getPlace();
        const adres = p.formatted_address || p.name || el.value;
        onKeuze && onKeuze(adres, p);
      });

      // Fix: herpositioneer de dropdown wanneer de scrollende ouder scrolt.
      // .pac-container wordt absoluut gepositioneerd in het document — bij modal-
      // scroll raakt die los van het input-veld zonder deze correctie.
      const reposition = () => {
        const pac = document.querySelector('.pac-container');
        if (!pac) return;
        const rect = el.getBoundingClientRect();
        pac.style.top   = (rect.bottom + window.scrollY) + 'px';
        pac.style.left  = (rect.left   + window.scrollX) + 'px';
        pac.style.width = rect.width + 'px';
      };
      const sp = _scrollParent(el);
      sp.addEventListener('scroll', reposition, { passive: true });
      el._mapsACUnbind = () => sp.removeEventListener('scroll', reposition);
    });
  }

  // Reset de autocomplete-koppeling op een element (bijv. bij hergebruik van modal).
  function resetAutocomplete(el) {
    if (!el) return;
    if (el._mapsACUnbind) { el._mapsACUnbind(); delete el._mapsACUnbind; }
    delete el._mapsAC;
  }

  // Bereken rijdtijd in minuten van thuisadres naar bestemming.
  // Geeft null terug bij fout of ontbrekende configuratie.
  function reistijd(bestemming) {
    return new Promise(resolve => {
      const thuis = getThuisadres();
      if (!thuis || !bestemming) { resolve(null); return; }
      laad(() => {
        new google.maps.DistanceMatrixService().getDistanceMatrix({
          origins: [thuis], destinations: [bestemming],
          travelMode: google.maps.TravelMode.DRIVING,
          language: 'nl',
        }, (res, st) => {
          if (st !== 'OK') { resolve(null); return; }
          const el = res.rows[0]?.elements[0];
          resolve(el?.status === 'OK' ? Math.ceil(el.duration.value / 60) : null);
        });
      });
    });
  }

  return { laad, autocomplete, resetAutocomplete, reistijd, getKey, setKey, getThuisadres, getCoords, geocodeerAdres, KEY_KEY, THUIS_KEY, COORDS_KEY };
})();

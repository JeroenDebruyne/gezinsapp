/**
 * maps.js — Google Maps hulpfuncties (Places + Distance Matrix)
 * Laden na auth.js en data.js
 */
const Maps = (() => {
  const KEY_KEY   = 'google_maps_key';
  const THUIS_KEY = 'gezinsapp_thuisadres';

  let _ready = false, _loading = false, _queue = [];

  function getKey()        { return localStorage.getItem(KEY_KEY)   || ''; }
  function getThuisadres() { return localStorage.getItem(THUIS_KEY) || ''; }

  function laad(cb) {
    if (_ready)   { cb && cb(); return; }
    if (cb)       _queue.push(cb);
    if (_loading) return;
    const key = getKey();
    if (!key) { console.warn('[Maps] Geen API key ingesteld.'); return; }
    _loading = true;
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&loading=async&language=nl&region=BE`;
    s.async = s.defer = true;
    s.onload = () => {
      google.maps.importLibrary('places').then(() => {
        _ready = true; _loading = false;
        _queue.forEach(f => f()); _queue = [];
      });
    };
    s.onerror = () => { _loading = false; console.error('[Maps] Laden mislukt — controleer de API key.'); };
    document.head.appendChild(s);
  }

  // Koppel Google Places autocomplete aan een input-element.
  // onKeuze(adres: string, place: PlaceResult) wordt aangeroepen bij selectie.
  function autocomplete(el, onKeuze) {
    if (!el) return;
    laad(() => {
      const ac = new google.maps.places.Autocomplete(el, {
        fields: ['formatted_address', 'name', 'geometry'],
        componentRestrictions: { country: 'be' },
      });
      ac.addListener('place_changed', () => {
        const p = ac.getPlace();
        const adres = p.formatted_address || p.name || el.value;
        onKeuze && onKeuze(adres, p);
      });
    });
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

  return { laad, autocomplete, reistijd, getKey, getThuisadres, KEY_KEY, THUIS_KEY };
})();

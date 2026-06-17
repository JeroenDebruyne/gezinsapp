/**
 * state.js — Centrale state store
 * Laad vóór data.js. Vervangt losse globale variabelen door één beheerde store
 * met get/set/subscribe interface. Bestaande code blijft werken via window-proxies.
 */

const AppState = (() => {
  const _state = {
    activiteiten:            [],
    recepten:                [],
    planning:                {},
    extraItems:              [],
    boodschappenReceptItems: [],
    drukteOverride:          {},
    standaardIngredienten:   [],
    contacten:               [],
    todos:                   [],
    geheugen:                [],
    uitzonderingen:          [],
    transportUitzonderingen: {},
    standaardTransport:      {},
    vasteRoosters:           {},
    customSchoolvakanties:   [],
    customFeestdagen:        [],
    transportPersonen:       [],
    portiesKindRatio:        0.5,
    gezinsDatums:            [],
    WINKELS:                 ['Colruyt','Delhaize','Lidl','Albert Heijn','Beenhouwerij','Markt','Andere'],
  };

  const _listeners = {};

  // Lees een waarde uit de store
  function get(key) {
    return _state[key];
  }

  // Schrijf een waarde naar de store en notificeer subscribers
  function set(key, value) {
    _state[key] = value;
    (_listeners[key]  || []).forEach(fn => { try { fn(value);      } catch(e) { console.warn('[AppState]', e); } });
    (_listeners['*']  || []).forEach(fn => { try { fn(key, value); } catch(e) {} });
  }

  // Stuur een notificatie zonder de waarde te wijzigen
  // Handig na in-place mutaties (bijv. array.push) zodat subscribers toch worden gewekt
  function notify(key) {
    const v = _state[key];
    (_listeners[key] || []).forEach(fn => { try { fn(v);      } catch(e) {} });
    (_listeners['*'] || []).forEach(fn => { try { fn(key, v); } catch(e) {} });
  }

  // Abonneer op wijzigingen van één sleutel (of '*' voor alle wijzigingen)
  // Geeft een unsubscribe-functie terug
  function subscribe(key, fn) {
    if (!_listeners[key]) _listeners[key] = [];
    _listeners[key].push(fn);
    return () => { _listeners[key] = _listeners[key].filter(f => f !== fn); };
  }

  // Window-proxies: verwijder `let`-declaraties uit data.js zodat
  // ongewijzigde code (bijv. `activiteiten.push(x)` of `activiteiten = [...]`)
  // automatisch door de store loopt
  Object.keys(_state).forEach(key => {
    Object.defineProperty(window, key, {
      get: ()  => _state[key],
      set: (v) => { set(key, v); },
      configurable: true,
    });
  });

  return { get, set, notify, subscribe };
})();

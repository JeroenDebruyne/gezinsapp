(function () {
  const PAGINAS = [
    { id: 'index',           href: 'index.html',           icon: 'home',          label: 'Home' },
    { id: 'agenda',          href: 'agenda.html',           icon: 'calendar',      label: 'Agenda' },
    { id: 'todos',           href: 'todos.html',            icon: 'list-todo',     label: "To-do's" },
    { id: 'weekplanner',     href: 'weekplanner.html',      icon: 'utensils',      label: 'Maaltijden' },
    { id: 'recepten',        href: 'recepten.html',         icon: 'book-open',     label: 'Recepten' },
    { id: 'boodschappen',    href: 'boodschappen.html',     icon: 'shopping-cart', label: 'Boodschappen' },
    { id: 'ingredienten',    href: 'ingredienten.html',     icon: 'leaf',          label: 'Ingrediënten' },
    { id: 'contacten',       href: 'contacten.html',        icon: 'users',         label: 'Contacten' },
    { id: 'kinderlogistiek', href: 'kinderlogistiek.html',  icon: 'baby',          label: 'Kinderen' },
    { id: 'agent',           href: 'agent.html',            icon: 'bot',           label: 'Agent' },
  ];

  if (!document.body.dataset.noNav) {
    const navItems = PAGINAS.map(p =>
      `<a class="bottom-nav-item" data-pagina="${p.id}" href="${p.href}"><span class="nav-icon"><i data-lucide="${p.icon}"></i></span><span class="nav-label">${p.label}</span></a>`
    ).join('\n  ');

    const moduleTiles = [...PAGINAS, { id: 'instellingen', href: 'instellingen.html', icon: 'settings', label: 'Instellingen' }].map(p =>
      `<a class="module-tile" href="${p.href}"><span class="module-tile-icon"><i data-lucide="${p.icon}"></i></span><span class="module-tile-naam">${p.label}</span></a>`
    ).join('\n      ');

    const html = `<nav class="bottom-nav" id="sidebar">
  ${navItems}
  <div class="sidebar-footer">
    <div class="sidebar-sync" id="sidebar-sync"><i data-lucide="loader-2" class="icon-spin" style="width:12px;height:12px;display:inline-block;vertical-align:-0.1em;"></i> Laden…</div>
    <a class="bottom-nav-item" href="instellingen.html" data-pagina="instellingen">
      <span class="nav-icon"><i data-lucide="settings"></i></span><span class="nav-label">Instellingen</span>
    </a>
    <div class="sidebar-user">
      <span class="sidebar-user-avatar" id="sidebar-avatar">🧑</span>
      <div class="sidebar-user-info">
        <span class="sidebar-user-naam" id="sidebar-naam">…</span>
        <span class="sidebar-user-sub" id="sidebar-rol">…</span>
      </div>
      <button class="sidebar-logout" onclick="Auth.logout()" title="Uitloggen"><i data-lucide="log-out" style="width:14px;height:14px;"></i></button>
    </div>
  </div>
</nav>
<nav class="bottom-nav-mobile">
  <a class="mobile-nav-item" href="index.html" data-pagina="index">
    <span class="mobile-nav-icon"><i data-lucide="home"></i></span>
    <span class="mobile-nav-label">Home</span>
  </a>
  <button class="mobile-nav-item" onclick="toggleModules()">
    <span class="mobile-nav-icon"><i data-lucide="menu"></i></span>
    <span class="mobile-nav-label">Alles</span>
  </button>
</nav>
<div class="module-overlay" id="module-overlay" onclick="sluitModules(event)">
  <div class="module-sheet" onclick="event.stopPropagation()">
    <div class="module-sheet-handle"></div>
    <div class="module-tiles">
      ${moduleTiles}
    </div>
  </div>
</div>`;

    document.currentScript.insertAdjacentHTML('beforebegin', html);
  }

  // Active state
  const pagina = window.location.pathname.split('/').pop().replace('.html', '') || 'index';
  document.querySelectorAll('.mobile-nav-item[data-pagina], .bottom-nav-item[data-pagina]').forEach(el => {
    el.classList.toggle('active', el.dataset.pagina === pagina);
  });

  // Module overlay controls
  window.toggleModules = function () { document.getElementById('module-overlay')?.classList.toggle('open'); };
  window.sluitModules = function (e) {
    if (e.target === document.getElementById('module-overlay'))
      document.getElementById('module-overlay').classList.remove('open');
  };
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.getElementById('module-overlay')?.classList.remove('open');
  });

  // Service worker registratie
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');

  // Lucide Icons — automatisch initialiseren bij DOM-wijzigingen
  document.addEventListener('DOMContentLoaded', function () {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/lucide@latest/dist/umd/lucide.min.js';
    s.onload = function () {
      lucide.createIcons();
      var _t = null;
      new MutationObserver(function () {
        clearTimeout(_t);
        _t = setTimeout(function () { lucide.createIcons(); }, 40);
      }).observe(document.body, { childList: true, subtree: true });
    };
    document.head.appendChild(s);
  });

  // Persoonkleuren dynamisch toepassen vanuit localStorage
  function _pasPersonKleurenToe() {
    if (typeof Auth === 'undefined') return;
    const kleuren = JSON.parse(localStorage.getItem('gezinsapp_persoon_kleuren') || '{}');
    Auth.getProfielen().forEach(function(p) {
      const key = p.persoonKey; if (!key || !kleuren[key]) return;
      const hex = kleuren[key];
      const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
      document.documentElement.style.setProperty('--c-'+key, 'rgba('+r+','+g+','+b+',0.10)');
      document.documentElement.style.setProperty('--c-'+key+'-t', hex);
      document.documentElement.style.setProperty('--c-'+key+'-dot', hex);
    });
  }
  window._pasPersonKleurenToe = _pasPersonKleurenToe;

  // Fill sidebar user info after DOM is ready
  document.addEventListener('DOMContentLoaded', function () {
    if (typeof Auth !== 'undefined') {
      const p = Auth.profiel();
      if (p) {
        const av = document.getElementById('sidebar-avatar');
        const nm = document.getElementById('sidebar-naam');
        const rl = document.getElementById('sidebar-rol');
        if (av) av.textContent = p.emoji || '🧑';
        if (nm) nm.textContent = p.naam || '';
        if (rl) rl.textContent = Auth.ROLLEN[p.rol]?.label || p.rol || '';
      }
      _pasPersonKleurenToe();
    }
  });
})();

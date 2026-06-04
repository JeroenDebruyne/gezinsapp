(function () {
  const PAGINAS = [
    { id: 'index',           href: 'index.html',           icon: '🏠', label: 'Home' },
    { id: 'agenda',          href: 'agenda.html',           icon: '📅', label: 'Agenda' },
    { id: 'todos',           href: 'todos.html',            icon: '✅', label: "To-do's" },
    { id: 'weekplanner',     href: 'weekplanner.html',      icon: '🍽️', label: 'Maaltijden' },
    { id: 'recepten',        href: 'recepten.html',         icon: '📖', label: 'Recepten' },
    { id: 'boodschappen',    href: 'boodschappen.html',     icon: '🛒', label: 'Boodschappen' },
    { id: 'ingredienten',    href: 'ingredienten.html',     icon: '🌿', label: 'Ingrediënten' },
    { id: 'contacten',       href: 'contacten.html',        icon: '👥', label: 'Contacten' },
    { id: 'kinderlogistiek', href: 'kinderlogistiek.html',  icon: '👶', label: 'Kinderen' },
    { id: 'agent',           href: 'agent.html',            icon: '🤖', label: 'Agent' },
  ];

  if (!document.body.dataset.noNav) {
    const navItems = PAGINAS.map(p =>
      `<a class="bottom-nav-item" data-pagina="${p.id}" href="${p.href}"><span class="nav-icon">${p.icon}</span><span class="nav-label">${p.label}</span></a>`
    ).join('\n  ');

    const moduleTiles = [...PAGINAS, { id: 'instellingen', href: 'instellingen.html', icon: '⚙️', label: 'Instellingen' }].map(p =>
      `<a class="module-tile" href="${p.href}"><span class="module-tile-icon">${p.icon}</span><span class="module-tile-naam">${p.label}</span></a>`
    ).join('\n      ');

    const html = `<nav class="bottom-nav" id="sidebar">
  ${navItems}
  <div class="sidebar-footer">
    <div class="sidebar-sync" id="sidebar-sync">⏳ Laden…</div>
    <a class="bottom-nav-item" href="instellingen.html" data-pagina="instellingen">
      <span class="nav-icon">⚙️</span><span class="nav-label">Instellingen</span>
    </a>
    <div class="sidebar-user">
      <span class="sidebar-user-avatar" id="sidebar-avatar">🧑</span>
      <div class="sidebar-user-info">
        <span class="sidebar-user-naam" id="sidebar-naam">…</span>
        <span class="sidebar-user-sub" id="sidebar-rol">…</span>
      </div>
      <button class="sidebar-logout" onclick="Auth.logout()" title="Uitloggen">⏏</button>
    </div>
  </div>
</nav>
<nav class="bottom-nav-mobile">
  <a class="mobile-nav-item" href="index.html" data-pagina="index">
    <span class="mobile-nav-icon">🏠</span>
    <span class="mobile-nav-label">Home</span>
  </a>
  <button class="mobile-nav-item" onclick="toggleModules()">
    <span class="mobile-nav-icon">☰</span>
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

  // Service worker registratie
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');

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
    }
  });
})();

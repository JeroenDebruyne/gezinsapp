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
      <button class="sidebar-logout" id="sidebar-logout-btn" title="Uitloggen"><i data-lucide="log-out" style="width:14px;height:14px;"></i></button>
    </div>
  </div>
</nav>
<nav class="bottom-nav-mobile">
  <a class="mobile-nav-item" href="index.html" data-pagina="index">
    <span class="mobile-nav-icon"><i data-lucide="home"></i></span>
    <span class="mobile-nav-label">Home</span>
  </a>
  <a class="mobile-nav-item" href="agent.html" data-pagina="agent">
    <span class="mobile-nav-icon"><i data-lucide="bot"></i></span>
    <span class="mobile-nav-label">Assistent</span>
  </a>
  <a class="mobile-nav-item" href="todos.html" data-pagina="todos">
    <span class="mobile-nav-icon"><i data-lucide="list-todo"></i></span>
    <span class="mobile-nav-label">To-do's</span>
  </a>
  <button class="mobile-nav-item" id="mobile-nav-alles-btn">
    <span class="mobile-nav-icon"><i data-lucide="menu"></i></span>
    <span class="mobile-nav-label">Alles</span>
  </button>
</nav>
<div class="module-overlay" id="module-overlay">
  <div class="module-sheet" id="module-sheet">
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
  window.sluitModules = function () { document.getElementById('module-overlay')?.classList.remove('open'); };

  // Escape: sluit module-overlay, recept-fiche of de bovenste open modal
  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape') return;
    document.getElementById('module-overlay')?.classList.remove('open');
    var openFiche = document.querySelector('.recept-fiche-overlay.open');
    if (openFiche) { openFiche.classList.remove('open'); return; }
    var openBg = document.querySelector('.modal-bg.open');
    if (openBg) {
      var sluitBtn = openBg.querySelector('.modal .modal-sluit-btn');
      if (sluitBtn) sluitBtn.click();
      else openBg.classList.remove('open');
    }
  });

  // Tab focus trap: houdt toetsenbordfocus binnen een open modal
  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Tab') return;
    var openBg = document.querySelector('.modal-bg.open');
    if (!openBg) return;
    var modal = openBg.querySelector('.modal');
    if (!modal) return;
    var all = modal.querySelectorAll('button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])');
    var focusable = Array.prototype.filter.call(all, function(el) { return el.offsetParent !== null; });
    if (!focusable.length) return;
    var first = focusable[0], last = focusable[focusable.length - 1];
    var inside = modal.contains(document.activeElement);
    if (e.shiftKey) {
      if (!inside || document.activeElement === first) { last.focus(); e.preventDefault(); }
    } else {
      if (!inside || document.activeElement === last) { first.focus(); e.preventDefault(); }
    }
  });

  // Event delegation voor nav-knoppen (geen inline onclick= nodig)
  document.addEventListener('click', function (e) {
    if (e.target.closest('#sidebar-logout-btn')) {
      if (typeof Auth !== 'undefined') Auth.logout();
    } else if (e.target.closest('#mobile-nav-alles-btn')) {
      document.getElementById('module-overlay')?.classList.toggle('open');
    } else if (e.target === document.getElementById('module-overlay')) {
      document.getElementById('module-overlay')?.classList.remove('open');
    } else if (e.target.closest('#module-sheet') && !e.target.closest('#module-overlay > *')) {
      // click inside sheet — do nothing (already handled)
    }
  });

  // Service worker registratie
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');

  // Lucide Icons — lokale bundel, automatisch bij DOM-wijzigingen
  document.addEventListener('DOMContentLoaded', function () {
    const s = document.createElement('script');
    s.src = 'lucide.min.js';
    s.onload = function () {
      lucide.createIcons();
      var _t = null;
      new MutationObserver(function () {
        clearTimeout(_t);
        _t = setTimeout(function () { lucide.createIcons(); }, 40);
      }).observe(document.body, { childList: true, subtree: true });

      // Auto-focus eerste interactief element wanneer modal opent
      new MutationObserver(function(mutations) {
        for (var i = 0; i < mutations.length; i++) {
          var m = mutations[i];
          if (m.type === 'attributes' && m.attributeName === 'class' &&
              m.target.classList && m.target.classList.contains('modal-bg') &&
              m.target.classList.contains('open')) {
            (function(bg) {
              setTimeout(function() {
                var modal = bg.querySelector('.modal');
                if (!modal || modal.contains(document.activeElement)) return;
                var first = modal.querySelector(
                  'input:not([type="hidden"]):not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled]):not(.modal-sluit-btn)'
                );
                if (first) first.focus();
              }, 70);
            })(m.target);
          }
        }
      }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });

      // Filter-tabs: wikkel in .filter-tabs-wrap voor overflow-fade
      document.querySelectorAll('.filter-tabs').forEach(function(tabs) {
        if (tabs.parentElement && !tabs.parentElement.classList.contains('filter-tabs-wrap')) {
          var wrap = document.createElement('div');
          wrap.className = 'filter-tabs-wrap';
          tabs.parentNode.insertBefore(wrap, tabs);
          wrap.appendChild(tabs);
        }
      });
    };
    document.head.appendChild(s);
  });

  // ── _bevestig: vervangt native confirm() met een bottom-sheet ──
  window._bevestig = function(bericht, onJa, opties) {
    opties = opties || {};
    var bevestigLabel = opties.bevestigLabel || 'Verwijderen';
    var cancelLabel   = opties.cancelLabel   || 'Annuleren';
    var danger        = opties.danger !== false;
    var sub           = opties.sub || '';

    var overlay = document.createElement('div');
    overlay.className = 'bevestig-overlay';

    var sheet = document.createElement('div');
    sheet.className = 'bevestig-sheet';
    var handle = document.createElement('div');
    handle.className = 'bevestig-sheet-handle';
    var berichtEl = document.createElement('p');
    berichtEl.className = 'bevestig-bericht';
    berichtEl.textContent = bericht;
    var knoppen = document.createElement('div');
    knoppen.className = 'bevestig-knoppen';
    var jaBtn = document.createElement('button');
    jaBtn.className = 'bevestig-ja' + (danger ? ' danger' : '');
    jaBtn.textContent = bevestigLabel;
    var neeBtn = document.createElement('button');
    neeBtn.className = 'bevestig-nee';
    neeBtn.textContent = cancelLabel;
    knoppen.appendChild(jaBtn);
    knoppen.appendChild(neeBtn);
    sheet.appendChild(handle);
    sheet.appendChild(berichtEl);
    if (sub) {
      var subEl = document.createElement('p');
      subEl.className = 'bevestig-sub';
      subEl.textContent = sub;
      sheet.appendChild(subEl);
    }
    sheet.appendChild(knoppen);
    overlay.appendChild(sheet);

    document.body.appendChild(overlay);
    requestAnimationFrame(function() { overlay.classList.add('open'); });

    function esc(e) { if (e.key === 'Escape') sluit(); }
    document.addEventListener('keydown', esc);

    function sluit() {
      document.removeEventListener('keydown', esc);
      overlay.classList.remove('open');
      setTimeout(function() { overlay.remove(); }, 280);
    }

    jaBtn.addEventListener('click', function() { sluit(); onJa(); });
    neeBtn.addEventListener('click', sluit);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) sluit(); });
  };

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

  // ── Modal: body scroll lock + swipe-to-dismiss ───────────────
  document.addEventListener('DOMContentLoaded', function () {
    // Body scroll lock wanneer een modal open/sluit (voorkomt iOS rubber-band)
    new MutationObserver(function(mutations) {
      mutations.forEach(function(m) {
        if (m.type !== 'attributes' || m.attributeName !== 'class') return;
        var bg = m.target;
        if (!bg.classList || !bg.classList.contains('modal-bg')) return;
        var isOpen = bg.classList.contains('open');
        if (isOpen) {
          var sy = window.scrollY;
          document.body.style.position = 'fixed';
          document.body.style.top = '-' + sy + 'px';
          document.body.style.width = '100%';
          document.body.dataset.scrollY = sy;
        } else {
          if (!document.querySelector('.modal-bg.open')) {
            var savedY = parseInt(document.body.dataset.scrollY || '0');
            document.body.style.position = '';
            document.body.style.top = '';
            document.body.style.width = '';
            window.scrollTo(0, savedY);
          }
        }
      });
    }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });

    // Swipe-to-dismiss: sleep de modal naar beneden om te sluiten
    var activeDrag = null;

    document.addEventListener('touchmove', function(e) {
      if (!activeDrag) return;
      var dy = e.touches[0].clientY - activeDrag.startY;
      if (dy <= 0) return;
      activeDrag.currentY = dy;
      activeDrag.modal.style.transform = 'translateY(' + dy + 'px)';
    }, { passive: true });

    document.addEventListener('touchend', function() {
      if (!activeDrag) return;
      var drag = activeDrag;
      activeDrag = null;
      var dt = Date.now() - drag.startT || 1;
      var velocity = drag.currentY / dt;
      var modal = drag.modal;
      var bg = modal.closest('.modal-bg');
      if (drag.currentY > 120 || velocity > 0.5) {
        modal.style.transition = 'transform .28s cubic-bezier(.4,0,.2,1)';
        modal.style.transform = 'translateY(110%)';
        setTimeout(function() {
          modal.style.transform = '';
          modal.style.transition = '';
          var btn = modal.querySelector('.modal-sluit-btn');
          if (btn) btn.click();
          else if (bg) bg.classList.remove('open');
        }, 280);
      } else {
        modal.style.transition = 'transform .28s cubic-bezier(.4,0,.2,1)';
        modal.style.transform = '';
        setTimeout(function() { modal.style.transition = ''; }, 280);
      }
    });

    document.querySelectorAll('.modal-bg').forEach(function(bg) {
      var modal = bg.querySelector('.modal');
      if (!modal) return;
      modal.addEventListener('touchstart', function(e) {
        if (window.innerWidth >= 601) return;
        if (!bg.classList.contains('open')) return;
        var rect = modal.getBoundingClientRect();
        var relY = e.touches[0].clientY - rect.top;
        if (relY > 52) return; // alleen bovenste 52px (handle-zone)
        activeDrag = { modal: modal, startY: e.touches[0].clientY, startT: Date.now(), currentY: 0 };
        modal.style.transition = 'none';
      }, { passive: true });
    });
  });

  // Injecteer sluitknop in alle modals die er nog geen hebben
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.modal-bg .modal').forEach(function(modal) {
      if (modal.querySelector('.modal-sluit-btn')) return;
      var bg = modal.closest('.modal-bg');
      var btn = document.createElement('button');
      btn.className = 'modal-sluit-btn';
      btn.setAttribute('aria-label', 'Sluiten');
      btn.textContent = '✕';
      btn.onclick = function(e) { e.stopPropagation(); if (bg) bg.classList.remove('open'); };
      modal.insertBefore(btn, modal.firstChild);
    });
  });

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

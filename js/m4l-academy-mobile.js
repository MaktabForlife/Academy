/* Shared navigation disclosure for Academy home and connected workspaces. */
(() => {
  'use strict';
  const sidebar = document.querySelector('.app > .sidebar, .academy-connected-sidebar');
  if (!sidebar || sidebar.querySelector('.academy-menu-toggle')) return;
  const brand = sidebar.querySelector('.brand, .academy-connected-brand');
  if (!brand) return;

  const desktop = matchMedia('(min-width: 901px)');
  const panel = document.createElement('div');
  panel.id = 'academy-menu-panel';
  panel.className = 'academy-menu-content';
  for (const child of [...sidebar.children]) if (child !== brand) panel.append(child);
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'academy-menu-toggle';
  toggle.setAttribute('aria-controls', panel.id);
  toggle.setAttribute('aria-expanded', 'false');
  toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg><span>Menu</span>';
  sidebar.append(toggle, panel);
  document.body.classList.add('academy-mobile-layout');

  function setOpen(open, restoreFocus = false) {
    sidebar.classList.toggle('academy-menu-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.querySelector('span').textContent = open ? 'Close' : 'Menu';
    if (restoreFocus) toggle.focus();
  }
  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  sidebar.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !desktop.matches && toggle.getAttribute('aria-expanded') === 'true') {
      event.preventDefault();
      setOpen(false, true);
    }
  });
  panel.addEventListener('click', event => {
    const destination = event.target.closest('a, button[data-nav]');
    if (!destination || desktop.matches) return;
    setOpen(false);
    if (destination.hasAttribute('data-nav')) requestAnimationFrame(() => {
      const heading = document.querySelector('.view.active h1, .view.active h2') || document.querySelector('main');
      if (heading) {
        if (!heading.hasAttribute('tabindex')) heading.tabIndex = -1;
        heading.focus();
      }
    });
    else toggle.focus({preventScroll: true});
  });
  desktop.addEventListener('change', () => setOpen(false));
})();

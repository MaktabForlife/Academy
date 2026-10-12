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

  const learningLinks = document.querySelector('.academy-connected-activities');
  let learningMenu;
  if (learningLinks) {
    learningMenu = document.createElement('details');
    learningMenu.className = 'academy-learning-menu';
    const summary = document.createElement('summary');
    summary.innerHTML = '<span><strong>Learning menu</strong><small></small></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>';
    learningLinks.before(learningMenu);
    learningMenu.append(summary, learningLinks);
    learningMenu.open = desktop.matches;
    const syncLearning = () => {
      learningMenu.hidden = learningLinks.hidden || !learningLinks.querySelector('a');
      const current = learningLinks.querySelector('a[aria-current="page"]');
      summary.querySelector('small').textContent = current?.querySelector('span')?.textContent || 'Your Programs and Courses';
    };
    new MutationObserver(syncLearning).observe(learningLinks, {childList:true, subtree:true, attributes:true, attributeFilter:['hidden','aria-current']});
    syncLearning();
    learningMenu.addEventListener('toggle', () => {
      if (learningMenu.open && !desktop.matches) setOpen(false);
    });
    learningMenu.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !desktop.matches && learningMenu.open) {
        event.preventDefault();
        learningMenu.open = false;
        summary.focus();
      }
    });
    learningLinks.addEventListener('click', event => {
      if (desktop.matches || !event.target.closest('a')) return;
      learningMenu.open = false;
      summary.focus({preventScroll:true});
    });
  }

  function setOpen(open, restoreFocus = false) {
    if (open && learningMenu && !desktop.matches) learningMenu.open = false;
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
  desktop.addEventListener('change', () => {
    setOpen(false);
    if (learningMenu) learningMenu.open = desktop.matches;
  });
})();

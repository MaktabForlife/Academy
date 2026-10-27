/* Shared Tafseer card presentation. Destinations are supplied by the Tafseer integration. */
(() => {
  'use strict';
  if (window.M4L_TAFSEER_CARDS) return;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cards = Object.freeze([
    {id:'foundations',title:'Foundations of Tafseer',arabic:'علوم القرآن',tone:'sage',access:'public',summary:'Begin with intention, revelation and Ulumul Qur’an, then explore the sources of Tafseer, early commentators and important works.'},
    {id:'yaseen',title:'Surah Yaseen',arabic:'سورة يس',tone:'plum',summary:'Reflect on revelation, the signs in creation and the return to Allah, with lessons on faith, accountability and the Hereafter.'},
    {id:'saffat',title:'Surah As-Saffat',arabic:'سورة الصافات',tone:'rose',summary:'Explore Allah’s Oneness, the angels’ devotion and the stories of His messengers, ending with remembrance, peace and praise.'},
    {id:'ankabut',title:'Surah Al-Ankabut',arabic:'سورة العنكبوت',tone:'sage',summary:'Study the trials of faith, steadfastness, fragile worldly supports and the strength of relying on Allah.'},
    {id:'luqman',title:'Surah Luqman',arabic:'سورة لقمان',tone:'gold',summary:'Discover wisdom through gratitude, Luqman’s advice, family responsibilities, worship and humble conduct.'},
    {id:'muzammil',title:'Surah Al-Muzzammil',arabic:'سورة المزمل',tone:'plum',summary:'Reflect on night prayer, measured recitation, patience and reliance on Allah, with guidance for worship within one’s ability.'},
    {id:'qasas',title:'Surah Al-Qasas',arabic:'سورة القصص',tone:'gold',summary:'Follow selected passages about Musa عليه السلام: repentance, trust, modesty, and the qualities of strength and integrity.'},
    {id:'sajdah',title:'Surah As-Sajdah',arabic:'سورة السجدة',tone:'rose',summary:'Pause over selected ayahs about Allah’s care, listening to guidance and recognising His signs in everyday life.'}
  ].map(Object.freeze));
  const contexts = new Set(['public','learn','teach','admin']);
  let accessDialog;
  const interactiveHosts = new WeakSet();
  function closeAccessPrompt() { if (accessDialog?.open) accessDialog.close(); }
  function requestAccess(card) {
    if (!accessDialog?.isConnected) {
      accessDialog = document.createElement('dialog');
      accessDialog.className = 'tf-access-dialog';
      accessDialog.setAttribute('aria-labelledby','tf-access-title');
      accessDialog.setAttribute('aria-describedby','tf-access-description');
      accessDialog.addEventListener('click',event => {
        if (event.target === accessDialog || event.target.closest('[data-tafseer-close]')) closeAccessPrompt();
      });
      document.body.append(accessDialog);
    }
    let digits = '27828478639';
    try {
      const contact = new URL(document.querySelector('[data-academy-join]')?.href || '');
      if (contact.protocol === 'https:' && contact.hostname === 'wa.me' && /^\/[1-9][0-9]{6,14}$/.test(contact.pathname)) digits = contact.pathname.slice(1);
    } catch {}
    const message = 'Assalaamu alaikum. I would like to receive access to '+card.title+'. Please assist me.';
    const href = 'https://wa.me/'+digits+'?text='+encodeURIComponent(message);
    accessDialog.innerHTML = `<header class="tf-access-heading"><h2 id="tf-access-title">Contact Admin to receive access</h2><button type="button" class="tf-access-close" data-tafseer-close aria-label="Close">×</button></header><p id="tf-access-description">Please contact the Academy Admin for access to <strong>${esc(card.title)}</strong>.</p><div class="tf-access-actions"><a href="${esc(href)}" target="_blank" rel="noopener noreferrer">Contact Admin ↗</a><button type="button" data-tafseer-close>Close</button></div>`;
    if (!accessDialog.open) accessDialog.showModal();
    accessDialog.querySelector('[data-tafseer-close]').focus();
  }
  function destination(value) {
    if (typeof value !== 'string' || !value.trim() || /[\s\\\u0000-\u001f\u007f]/.test(value)) return '';
    if (/^\/(?!\/)/.test(value) || /^#[\w/-]+$/.test(value)) return value;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
    } catch { return ''; }
  }
  function render({context='public',links={}}={}) {
    context = contexts.has(context) ? context : 'public';
    links = links && typeof links === 'object' ? links : {};
    return cards.map(card => {
      const supplied = Object.hasOwn(links,card.id) ? links[card.id] : null;
      const binding = typeof supplied === 'string' ? {href:supplied} : supplied || {};
      if (binding.visible === false) return '';
      const href = destination(binding.href), titleId = `tafseer-${context}-${card.id}`;
      const arrow = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>';
      const mayOpen = card.access === 'public' || context !== 'public' && binding.canAccess === true;
      const action = !mayOpen
        ? `<button class="tf-card-action" data-tafseer-link="${card.id}" data-tafseer-request="${card.id}" type="button" aria-haspopup="dialog" aria-label="Contact Admin to receive access: ${esc(card.title)}"><span>Request access</span>${arrow}</button>`
        : href
        ? `<a class="tf-card-action" data-tafseer-link="${card.id}" href="${esc(href)}" aria-label="${esc(binding.label||'Open lessons')}: ${esc(card.title)}"><span>${esc(binding.label||'Open lessons')}</span>${arrow}</a>`
        : `<button class="tf-card-action tf-card-pending" data-tafseer-link="${card.id}" type="button" disabled aria-label="${esc(card.title)}: coming soon"><span>Coming soon</span>${arrow}</button>`;
      const accessLabel = card.access === 'public' ? '<span class="tf-card-access">Open to all</span>' : '';
      return `<article class="tf-card tf-card-${card.tone}" data-tafseer-card="${card.id}"${binding.code?` data-tafseer-code="${esc(binding.code)}"`:''} aria-labelledby="${titleId}"><span class="tf-card-tag">TAFSEER &amp; TADABBUR</span><span class="tf-card-arabic" lang="ar" dir="rtl">${card.arabic}</span><h3 id="${titleId}">${card.title}</h3>${accessLabel}<p class="tf-card-summary">${card.summary}</p>${action}</article>`;
    }).join('');
  }
  function mount(host,options={}) {
    if (typeof host === 'string') host = document.getElementById(host);
    if (!host) return;
    closeAccessPrompt();
    const context = contexts.has(options.context) ? options.context : 'public';
    host.classList.add('tf-card-grid');
    host.dataset.tafseerContext = context;
    host.innerHTML = render({...options,context});
    if (!interactiveHosts.has(host)) {
      host.addEventListener('click',event => {
        const button = event.target.closest('[data-tafseer-request]');
        if (!button || !host.contains(button)) return;
        const card = cards.find(row => row.id === button.dataset.tafseerRequest);
        if (card) requestAccess(card);
      });
      interactiveHosts.add(host);
    }
  }
  window.M4L_TAFSEER_CARDS = Object.freeze({cards,render,mount,closeAccessPrompt});
  document.querySelectorAll('[data-tafseer-cards="public"]').forEach(host => mount(host,{context:'public',links:window.M4L_TAFSEER_PUBLIC_LINKS||{}}));
})();

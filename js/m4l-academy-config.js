// Dedicated isolated Academy preview configuration. No legacy backend fallback.
(() => {
  'use strict';
  const host=String(window.location.hostname||'').toLowerCase();
  const local=['localhost','127.0.0.1'].includes(host);
  const feature=host==='academy-feature-10660.maktab4life.workers.dev'||
    host==='feature-academy-review-fixes-10660.maktab-development.pages.dev'||
    /^[a-f0-9]{8}\.maktab-development\.pages\.dev$/.test(host);
  window.M4L_CONFIG=Object.freeze({
    ENV_NAME:feature||local?'development':'unavailable',
    API_BASE:feature?'https://academy-feature-10660.maktab4life.workers.dev':local?window.location.origin:'',
    HIFZ_PROGRAM_ID:'PRG-3d6b7972-644c-4f81-b95c-8d6c7ffb8227',
    HIFZHELPER_URL:'https://maktab.hifz-helper.app/',
    HOSTNAME:host,IS_DEVELOPMENT:feature||local,IS_PRODUCTION:false,
    isKnownProductionHost:false,isKnownDevelopmentHost:feature||local
  });
})();

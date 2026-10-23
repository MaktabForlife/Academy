// Used only when Cloudflare Pages builds feature-split-db.
(() => {
  'use strict';
  const host=String(window.location.hostname||'').toLowerCase();
  const local=['localhost','127.0.0.1'].includes(host);
  const feature=/^(?:feature-split-db|[a-f0-9]{8})\.academy-maktab4life\.pages\.dev$/.test(host);
  window.M4L_CONFIG=Object.freeze({
    ACCEPTED_SETUP:true,
    NATIVE_ATTENDANCE:true,
    MEDIA_SEPARATION:true,
    MY_LINKS:true,
    ENV_NAME:feature?'split-preview':local?'development':'unavailable',
    API_BASE:feature?'https://split-db-feature_worker.maktab4life.workers.dev':local?window.location.origin:'',
    HIFZ_PROGRAM_ID:'PRG-3d6b7972-644c-4f81-b95c-8d6c7ffb8227',
    HIFZHELPER_URL:'https://hifz.maktab4life.org/',
    HIFZ_DEVELOPMENT_URL:'https://hifzhelper-dev.pages.dev/',
    HIFZ_ENTRY_SOURCE:'1',
    HOSTNAME:host,IS_DEVELOPMENT:feature||local,IS_PRODUCTION:false,
    isKnownProductionHost:false,isKnownDevelopmentHost:feature||local
  });
})();

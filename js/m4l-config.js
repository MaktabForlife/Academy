// The selected Git branch changes application code; the Development API stays fixed.
(() => {
  'use strict';
  const host=String(window.location.hostname||'').toLowerCase();
  const local=['localhost','127.0.0.1'].includes(host);
  const development=new Set(['maktab4life.org','www.maktab4life.org','academy-maktab4life.pages.dev',
    'maktab-development.pages.dev','developmentmaktab4life.pages.dev',
    'devrebootworker.maktab4life.workers.dev','development.rebootdashboard.pages.dev']).has(host)||
    host.endsWith('.maktab-development.pages.dev')||host.endsWith('.academy-maktab4life.pages.dev');
  window.M4L_CONFIG=Object.freeze({
    ACCEPTED_SETUP:true,
    NATIVE_ATTENDANCE:true,
    MEDIA_SEPARATION:true,
    MY_LINKS:true,
    ENV_NAME:development||local?'development':'unavailable',
    API_BASE:development?'https://devrebootworker.maktab4life.workers.dev':local?window.location.origin:'',
    HIFZ_PROGRAM_ID:'PRG-3d6b7972-644c-4f81-b95c-8d6c7ffb8227',
    REBOOT_PROGRAM_ID:'PRG-46c8576d-9fcf-4000-96b9-856b00a0218a',
    HIFZHELPER_URL:'https://hifz.maktab4life.org/',
    HIFZ_DEVELOPMENT_URL:'https://hifzhelper-dev.pages.dev/',
    HIFZ_ENTRY_SOURCE:host==='www.maktab4life.org'?'www':host==='academy-maktab4life.pages.dev'?'pages':'1',
    HOSTNAME:host,IS_DEVELOPMENT:development||local,IS_PRODUCTION:false,
    isKnownProductionHost:false,isKnownDevelopmentHost:development||local
  });
})();

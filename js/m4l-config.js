/* M4L v94.1-dev-config Worker subdomain :  api.rebootyourmaktab.maktabhelper.app
   M4L v94-dev-config Domain change rebootyourmaktab.maktabhelper.app
   v86-dev-config - Runtime frontend environment config.
   Load before /app.js in both /admin/index.html and /student/index.html.

   Purpose:
   - Keep app.js free of hard-coded production/development URLs.
   - Allow the same app.js to run safely on production and development.
   - Select the correct frontend/backend URLs from the browser hostname.

   IMPORTANT:
   - Confirm DEV_API_BASE matches your actual DEV Worker URL.
   - APPS_SCRIPT_URL stays private inside the Worker environment variables.
*/
(function () {
  "use strict";

  const host = String(window.location.hostname || "").toLowerCase();

 const PRODUCTION_HOSTS = new Set([
  "rebootyourmaktab.maktabhelper.app",
  "rebootyourmaktab.maktab4life.org"
]);

  const DEVELOPMENT_HOSTS = new Set([
    "developmentmaktab4life.pages.dev"
  ]);

  const PROD_CONFIG = {
    ENV_NAME: "production",
   API_BASE: "https://api.rebootyourmaktab.maktabhelper.app"
  };

  const DEV_CONFIG = {
    ENV_NAME: "development",
    API_BASE: "https://devrebootworker.maktab4life.workers.dev"
  };
  const featurePreviewHost=host==='academy-feature-10660.maktab4life.workers.dev'||host.endsWith('.maktab-development.pages.dev')&&host!=='development.maktab-development.pages.dev';
  const FEATURE_CONFIG={ENV_NAME:'development',API_BASE:'https://academy-feature-10660.maktab4life.workers.dev'};

  function isDevelopmentHost(hostname) {
    if (DEVELOPMENT_HOSTS.has(hostname)) return true;

    // Useful for local or temporary preview testing.
    if (hostname === "localhost" || hostname === "127.0.0.1") return true;

    // Keeps Cloudflare development preview aliases safe if the exact alias changes.
    if (hostname.endsWith(".pages.dev") && hostname.includes("development")) return true;
    if (hostname.endsWith(".pages.dev") && hostname.includes("develop")) return true;

    return false;
  }

  function isProductionHost(hostname) {
    return PRODUCTION_HOSTS.has(hostname);
  }

  const selectedConfig = featurePreviewHost?FEATURE_CONFIG:isDevelopmentHost(host)
    ? DEV_CONFIG
    : PROD_CONFIG;

  window.M4L_CONFIG = Object.freeze({
    ...selectedConfig,
    HIFZ_PROGRAM_ID: "PRG-3d6b7972-644c-4f81-b95c-8d6c7ffb8227",
    HIFZHELPER_URL: "https://maktab.hifz-helper.app/",
    HOSTNAME: host,
    IS_DEVELOPMENT: selectedConfig.ENV_NAME === "development",
    IS_PRODUCTION: selectedConfig.ENV_NAME === "production",
    isKnownProductionHost: isProductionHost(host),
    isKnownDevelopmentHost: isDevelopmentHost(host)
  });

  // A confirmed save is independent of cache publication. Refresh is a separate,
  // deduplicated request, and durable pending work survives a closed browser.
  const refreshes=new Map();
  window.M4L_REFRESH_AFTER_SAVE=function(result,session) {
    if(!result?.cacheRefreshPending?.length||!session)return Promise.resolve(null);
    if(refreshes.has(session))return refreshes.get(session);
    const pending=(async()=>{
      try {
        const response=await fetch(window.M4L_CONFIG.API_BASE+'/api/academy/cache/refresh',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session},body:'{}'});
        const refreshed=await response.json();
        return response.ok&&refreshed.success?refreshed:{pending:true};
      }catch{return {pending:true};}
    })();
    refreshes.set(session,pending);pending.finally(()=>{if(refreshes.get(session)===pending)refreshes.delete(session);});return pending;
  };

  if (window.M4L_CONFIG.IS_DEVELOPMENT) {
    console.info("M4L config loaded:", window.M4L_CONFIG.ENV_NAME, window.M4L_CONFIG.API_BASE);
  }
})();

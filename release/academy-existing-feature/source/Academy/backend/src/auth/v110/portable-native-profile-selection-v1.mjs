// Fixed local design origins only. UNBOUND until a reviewed NEW synthetic fixture supplies public facts.
// No hosted readiness, keys, environment reads, storage, requests or activation at import.
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
export const selectedPortableNativeProfile=freeze({
  "capabilities": {
    "admission": false,
    "cookie": false,
    "coordinator": false,
    "http": false,
    "master": false,
    "pin": false,
    "reader": false,
    "refresh": false,
    "retry": false,
    "rootBridge": false,
    "rpc": false,
    "timetable": false
  },
  "deploymentIds": {
    "academy": null,
    "hifz": null,
    "studio": null
  },
  "executionKind": "LOCAL_SYNTHETIC",
  "issuers": {
    "academy": "https://maktabhelper.app",
    "hifz": "https://hifz.maktabhelper.app",
    "studio": "https://studio.maktabhelper.app"
  },
  "origins": {
    "academy": "https://maktabhelper.app",
    "hifz": "https://hifz.maktabhelper.app",
    "studio": "https://studio.maktabhelper.app"
  },
  "profileCommitment": null,
  "rootCookieDomain": "maktabhelper.app",
  "rootCookieMode": "APPROVED_SHARED_PARENT",
  "rootDatabaseIds": {
    "admin": null,
    "core": null
  },
  "schema": "PORTABLE_NATIVE_LOCAL_PROFILE_V1",
  "status": "UNBOUND",
  "workerNames": {
    "academy": null,
    "coordinator": null,
    "hifz": null,
    "studio": null
  }
});

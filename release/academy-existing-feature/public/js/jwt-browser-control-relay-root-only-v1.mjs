// Static same-origin UI metadata relay only; never an API authentication checkpoint.
import {startRelayDocument} from '/auth/v110/browser-entry-root-only-v1.mjs';
const config=window.M4L_V110_CONFIG;
startRelayDocument({win:window,origins:config?.origins});

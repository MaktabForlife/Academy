// Exact public browser runtime files only. Never publish an auth directory recursively.
export const jwtV110Relay='auth/v110/browser-control.html';
export const jwtV110PublicAssets=Object.freeze([
 'auth/v110/browser-display-state.mjs','auth/v110/browser-control-relay.mjs',
 'auth/v110/browser-control-client.mjs','auth/v110/browser-app-privacy.mjs',
 'auth/v110/browser-entry.mjs','auth/v110/browser-bootstrap.js',
 'auth/v110/browser-config.js','auth/v110/academy-cookie-loader.js',
 'auth/v110/academy-cookie-transport.mjs',jwtV110Relay
]);

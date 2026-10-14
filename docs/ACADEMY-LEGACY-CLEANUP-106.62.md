# Academy cleanup feature website routing V106.62

V106.62 completes the [Academy dependency cleanup](ACADEMY-LEGACY-CLEANUP-106.61.md) on `feature/academy-review-fixes-10660` only.

Cloudflare assigned the Pages branch the shorter `feature-academy-review-fixes.maktab-development.pages.dev` alias. The dedicated frontend configuration recognises that alias, and the feature API allows its exact origin. The final pinned Pages deployment origin is added to the feature API configuration after deployment.

Pages resolves directory indexes itself. The shared website handler therefore forwards `/academy/`, `/users/` and the internal `/account/` directory to Pages assets without rewriting them to `index.html`. This avoids a canonical redirect loop and preserves a personal `/account/<id>` URL in the browser. The separate Worker asset binding retains its explicit index paths because its HTML handling is configured differently.

Regression checks cover both asset-routing modes and the actual alias. D1 ownership, authentication formats, existing sessions, database and storage bindings, public media support and the absence of Google backend clients remain unchanged. Development and main are not promoted by this feature release.

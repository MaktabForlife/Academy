# PDF debugging map warning V106.64

The vendored `pdf-lib-1.17.1.min.js` ended with a `sourceMappingURL` reference to `pdf-lib.min.js.map`, which is not included in the repository. Browser developer tools requested that optional debugging file and received HTTP 404. The executable PDF library was present and loaded normally.

Remove only the missing debugging-map comment and add `?v=106.64` to the Academy's library script URL so cached copies are refreshed. The library version, executable bytes and license notice are preserved. Existing PDF.js source maps remain available.

Validation confirms the library differs only by the removed comment, and creates, saves and reloads a PDF with its page size preserved. All 17 selected PDF settings, packaging, branch compatibility and release-version checks pass. The shared and isolated Academy asset packagers include the corrected library. No build configuration, database, storage binding or authentication changes are included.

The release builds on the feature branch's existing V106.63a commit and synchronises the frontend and backend release markers to V106.64. Publishing follows the branch selected by the user in the existing Cloudflare website and Worker projects; it does not merge into the Git Development branch.

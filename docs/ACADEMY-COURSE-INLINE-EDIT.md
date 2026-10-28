# Edit website text on the page — V107.117

Signed-in Global Admins and the website's own Program Admins see **Edit text** beside the mobile course menu and below the course heading in the desktop sidebar. The button keeps the same reader and lesson, enters the existing Admin workspace, and opens the latest saved Admin draft. Click an outlined heading or passage, then **Save draft**. **Publish → Publish changes** applies that saved draft to students. Closing editing restores the published reader.

The reader's `canEdit` flag is computed from current actual authority after its ordinary website access check. It is not part of cached source facts. All draft/asset/save/publish requests still use the existing scoped Admin endpoints, revisions, operation receipts and accepted-head publication flow. No new write endpoint, schema, grant or role is introduced.

Inline editing accepts plain text only and binds a fixed field allowlist. Course/lesson/section IDs, image/file references, session settings and access fields cannot be changed through these controls. Rendering retains the existing HTML escaping. Reflection answers remain separate from editable reflection prompts. Private draft images use the existing Admin asset endpoint.

Unsaved edits survive internal page navigation and network/revision errors in memory. Saves and publications retain exact retry identifiers after an uncertain result. Account changes invalidate pending operations and clear the draft. Visibility refreshes do not replace a draft while editing. Normal navigation and page-close protection cover unsaved text and pending saves.

Verified locally:

- 32 model/editor/website, scoped access, split Surah grant and source-cache checks.
- Two native Workers/D1 runtime and source-cache cost checks, using disposable fixtures.
- Browser: enter editing from personal Learn into Admin on the same lesson; edit English and Arabic; save/close and verify students still see the old publication; reopen saved text; review/publish and verify new text in the reader.
- The same private-draft/publication check passed after integrating V107.116 source caching. Student and public readers receive no edit controls. Editing at 390 × 844 fits without horizontal overflow.

Only the matching API and Pages website need this release. The V107.116 coordinator, grants schema, source caches and all existing media publication states remain unchanged.

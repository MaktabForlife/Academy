# Native Academy playlist cards — 2 November 2026

Backend-only feature from verified V109.5 Source `64dee3c5eea27f53e3214abf5258102dc673a92a`, in `feature/academy-native-playlist-cards-20261102`. Root owns the matching Academy/Studio release; Circles owns the shared table, native wrapper, card rendering and same-screen Learn Edit/Save/Publish UI. No hosted calls, deployment, Git push, schema, dependency, version or actual recording publication occurs in this branch.

## Canonical data and publication

Each native playlist descriptor automatically derives its card from the same existing table row. The playlist ID remains the only navigation identity. The card contains no independently editable name or Teacher display string. Presentation metadata is stored in `context_json.card`; existing `published_json` holds the explicit published snapshot. Core0024 and Admin migrations are not required.

`list` and `get` keep `PLAYLIST_MODEL_V1` and add:

```js
card: {
  version: 1,
  style: 'default' | 'colour' | 'gradient' | 'image',
  colour: '#RRGGBB',
  gradient: null | 'sage' | 'plum' | 'rose' | 'gold' | 'ocean' | 'sunset',
  image: null | {assetId, sha256, type, size, alt, url},
  teacher: string | null
}
```

Native `assetId` equals `sha256`. Teacher display is derived from checked saved native Teacher accounts. Blank playlist Teacher produces `teacher:null`; UI omits the line. `default` preserves Tafseer’s existing Surah design. The colour/gradient fills a card without an image and its label band with an image. Rendering is owned by Circles. Source native playlists are `PROGRAM` only; Course image-before-first-publication policy and legacy Course preservation belong to the Studio counterpart.

Admin descriptors return draft `card` and last `publishedCard` (or null). Draft `card.image.url` is null; `publishedCard` has the stable public URL. Learner descriptors return only the published `card`, without the Admin `publishedCard` field. Private Save preserves all learner-visible name, Teacher and card values until explicit Publish. Old clients omitting `card` preserve its saved value. An existing row with no card metadata derives the default; no bulk rewrite or seeding occurs.

`save.card` accepts only `{version,style,colour,gradient,image}`. Strip derived `teacher` and `image.url`. An image input accepts `{assetId?,sha256,type,size,alt}` with assetId equal to SHA256. Version1, six-digit hex, preset gradients and PNG/JPEG/WebP only. Decorative image alt text may be empty; non-string, control characters and over240 characters are rejected. Image style requires an image; gradient style requires a preset; default/colour require null image and gradient. Default colour is `#49645C`; returned hex is uppercase. `options.cardOptions` includes the allowed styles, presets, MIME types and 5MB cap. No image bytes enter D1 or list responses.

## Optional playlist Teacher, mandatory recording Teacher

Playlist `options` reports `teacherRequired:false`, `teacherEditable:true`. `save` allows `teacherIds:[]`; omitted Teacher on a new row also means empty. IDs, if present, must be checked native accounts, with duplicate and scope validation. Native Class/Subject becomes immutable after attachment, while optional playlist Teacher metadata can be changed/cleared privately. This never edits an existing recording or its acquired rights. Partial Teacher updates may reuse the stored class/subject; they still require the current `optionsRevision`.

Recording `binding-options` remains `teacherRequired:true` and returns current bounded Teacher choices and `selectedTeacherIds` (possibly empty). For a teacherless playlist, `binding-create` MUST send one to ten actual checked `teacherIds` with `playlistId`, `playlistRevision`, `optionsRevision`, recording date and operation ID. A nonempty playlist keeps its exact existing Teacher match. There is no default, guessed attribution or empty-Teacher bypass. Existing content native guards still recheck the selected Teacher during the atomic write.

Existing-recording `attach` to a teacherless playlist likewise requires explicit checked `teacherIds` and `optionsRevision` from playlist options. Known original recording Teachers must match. Missing legacy context still requires `confirmContext:true`; confirmation is stored only in explicit membership, never by rewriting original recording anchors. Position and all original V2/legacy dated class/month/subscription audiences remain unchanged.

## Images and endpoints

All authenticated requests require the current Academy bearer token and `X-Academy-Workspace: ADMIN`. Native current account/session/credential epoch, fresh scoped Admin authority and Source ownership are checked; Learn/Teach cannot use these routes. No remote URL fetch or protected asset reference is accepted.

1. `POST /api/academy/media-playlists/card-upload?metadata=<URL-encoded JSON>` with raw bytes. Metadata: `{activityKey,playlistId,image:{assetId?,sha256,type,size,alt}}`. Preallocate the exact playlist UUID before first Save/upload. Response `{success:true,playlistId,image}` has no public URL. Upload uses a separate private `native-playlist-cards/<area>/<playlist>/<hash>` namespace, bounded bytes, MIME magic, size and SHA256 verification, and a current authority recheck after reading the request. Upload creates no database publication.
2. `POST /api/academy/media-playlists/card-preview` with JSON `{activityKey,playlistId,image}` returns private image bytes (`Cache-Control:no-store`). UI fetches a Blob and revokes the object URL on close/account/workspace change. Do not eagerly fetch private previews for every list row. Preview has current Admin checks on every request and no public token.
3. Existing `save` validates one referenced image in private storage but never promotes it. Explicit guarded `publish` commits the published snapshot first, then copies only that validated decorative image to separate `public-native-playlist-cards/<hash>` storage. Public artwork consent belongs beside Publish: **artwork becomes public when published**. A failed/stale/revoked database publication never copies public bytes.
4. `GET`/`HEAD /api/academy/media-playlist-card-image?sha256=<64hex>` serves only the public cover namespace: one R2 read, zero D1/Teacher/upstream reads. Its stable URL and immutable cache work with the existing twelve-hour screen-return cache; there are no short image tokens, refresh polling or compensating Source calls. Previously public decorative art may remain available after withdrawal, matching the agreed public Course cover semantics. Protected PDFs/videos are unaffected.

D1 and R2 cannot commit atomically. If post-commit cover copying fails, the response is retryable503 `PLAYLIST_CARD_PROMOTION_PENDING` with an explicit Retry Publish message. Retrying the exact operation uses the image reference captured in its existing publication receipt (`cardImage` in the Publish result), never a later private edit or a later publication. Older no-card receipts retain compatible snapshot recovery. It finishes copying without duplicate database writes. Until that retry, the committed card’s image may be temporarily unavailable. Failed/abandoned private uploads may leave private unreferenced objects, consistent with the existing upload mechanism; no background sweep or destructive cleanup was added.

## Learn editing capability

Native list/get descriptors expose fresh server-derived `canEdit`, from the existing current scoped Admin query; no extra permission lookup per card. `canManage` stays false for Learn. The same-screen UI can show a prominent Edit CTA when `canEdit` is true and open the existing checked editor for the exact native playlist ID, using explicit Admin transport. Learn remains read-only before Edit and never receives private draft bodies merely because `canEdit` is true. Save draft and Publish remain separate manual actions; return/dirty/account guards are UI-owned. No new Teacher/Student editing authority is introduced.

## Validation and integration

Parent evidence directory: `outputs/academy-native-playlist-cards-20261102/`.

- 220 combined split-owner, recording/Teacher, dated audience, retention, bridge and UI regressions passed. Focused native/content/card suite: 32 passed, including nine new card/optional-Teacher tests. Final card-only rerun also passes after precise public-copy error handling and cache headers.
- Card tests prove private upload/Save, explicit promotion, guarded late revocation, exact retry of a committed snapshot after a later private edit, immutable public hash delivery without D1, no instructional namespace access, default/gradient validation, checked optional Teacher and mandatory recording Teacher, Source recording identity preservation, separate canEdit/read-only Learn and no card R2 reads on list/get. Existing account-profile cache I/O is inherited, not attributed to cards.
- Actual disposable Source + split-coordinator workerd/D1 growth evidence is in the cost JSON/log. With 250 unrelated areas: warm Admin list69→70 rows/11 statements; native Admin get191→191/50; options319→325/59; warm learner list75→76/12; learner get114→114/22. Cold inherited account catalogue: Admin150→1401, learner152→1403 (17 statements). No writes in measured reads. The existing cold account catalogue growth and generic owner write-plan limitations remain; this feature adds no per-card SQL, R2 or Teacher-list queries to bounded projections. Do not equate captured rows with billed D1 scans.
- Root/Circles must compose and test the same-screen Edit/Save/Publish and card visuals using these exact routes before the paired release. This backend branch does not claim that UI acceptance is complete.

Preserve V109.5’s generic-playlist-aware recovery, existing Core0023/Studio0013, IDs, order/revision fences, ownership, account/session/epoch, twelve-hour ordinary verification and60s sensitive Admin policy, all original media/notes/retention clocks, bindings and schedules. No hosted data/media, rights or timetable changes are authorised by this local handoff.

## Recording text in the same-screen editor

The current SPLIT_V1 + accepted-setup fixture proves existing `lesson-media/save` with `state:'DRAFT'` changes only the Admin draft title/summary/state. Core’s published content stays in place, while its live revision/time advances for stale-write fencing. Learner feed, native playlist list/count/get and watch retain the old published text and access. Direct `lesson-media/get` is a staff editor API and remains403 in Learn; `media-playlists/get` is the native learner reader.

The explicit Publish operation saves the reviewed Admin draft with `state:'PUBLISHED'`, then accepts its exact returned `acceptedChange`. Preparing that change alone still leaves old reader text visible; acceptance switches to the new text. Original recording/asset IDs, class/date/context and membership position stay unchanged. Save draft returns no acceptedChange and must not be auto-published.

Reuse the canonical editor’s complete payload: current lesson revision, title, summary, commentsClosed and existing named YouTube videos/attachments. A custom text-only caller must preserve those media fields; omitting `videos` means an empty YouTube list in this existing API. Companion save/publish is a separate draft/published flow for the original temporary MP4 companion and is not a universal substitute for recording title/summary editing (YouTube and retained recordings have different existing guards).

Persistent regression: `backend/tests/academy-recording-draft-publication.test.mjs`. Synthetic before/after evidence: parent `outputs/academy-native-playlist-cards-20261102/recording-save-draft-proof.json`; test log `recording-draft-regression.log` (33 checks passed). No production fix or new runtime is needed for this verified current-baseline behavior.

### Editing the actual displayed MP4 summary

For an original MP4 with an active published companion, the existing renderer uses `companion.summary ?? row.summary` for that exact asset. The fixture proves that recording metadata Save/Publish can update `row.summary` while the visible companion summary remains unchanged. UI summary editing must therefore use the existing companion editor/save/publish when that published companion is the displayed source; use recording metadata otherwise. Preserve the complete canonical companion when changing a field, including existing topics/references/transcript and source/duration/revision checks.

`backend/tests/academy-recording-summary-publication.test.mjs` exercises the actual Source Worker, split databases and existing recording renderer: metadata draft and metadata publication preserve the old displayed companion; companion draft also keeps the old display; manual companion Publish changes the visible summary and published body/index together. Native title/state, class/date/Teacher/context, recording/asset IDs, upload clocks and membership position remain unchanged. The related Node fixture suite passes16 checks; evidence is parent `recording-companion-summary-proof.json` and `recording-companion-summary-tests.log`.

The proposed optional companion displayTitle extension was withdrawn after the existing split-publication proof. No new metadata field, canonical module change, UI change or API permission widening was committed.

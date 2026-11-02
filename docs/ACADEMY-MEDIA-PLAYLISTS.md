# Native Academy programme playlists

Current optional playlist Teacher/card presentation changes are documented in [ACADEMY-PLAYLIST-CARDS.md](ACADEMY-PLAYLIST-CARDS.md); recording Teacher checks remain mandatory.

Local feature branch `feature/academy-native-playlists`, based on Source `d11554c9c80513d0fdcafe81dfc7df2e384bcc75`. Root owns paired release integration and deployment. This feature does not attach, publish or migrate any hosted recording.

## Model and invariants

Native Academy programmes use programme → playlist → recordings. A playlist stores a reviewed native Class, Subject/Module/Surah and one to ten registered credited Teachers. The context becomes immutable after the first recording is attached. Names and optional close dates remain editable. Close dates are editorial only: they never grant access, change a recording month or affect retention.

Core migration `0023_media_playlists.sql` adds operational playlist state, private/published metadata snapshots and explicit recording membership. There is no Admin migration; reserved Admin0004 is unused. No legacy membership is seeded or inferred. A recording has at most one playlist and one positive saved position. Add assigns the next position under current list and playlist revisions; replacing media on the same lesson retains its identity and position. Ordering never uses recording date, title or timetable identity.

Existing lesson IDs, original class/date/month audiences, accepted publication, files, notes, upload dates and independent recording/companion expiry remain authoritative. Playlist metadata and Teacher attribution do not grant rights. Playlist publication and recording publication are separate explicit actions. Private metadata edits retain the previous published metadata until Publish. Neither creating a playlist nor creating a recording writes or publishes the timetable.

Operational writes use a Core atomic batch with current account/session/credential epoch, fresh Global/Programme Admin authority, active native area, Source ownership, split fence/read version, list revision and playlist revision checks. New private recording + membership uses the existing guarded split-owner transaction. Exact operation receipts support retries without duplicate membership or position. Studio/FROZEN ownership blocks Source writes. Twelve-hour ordinary verification policy, current local revocations and sensitive-write checks are unchanged.

## API contract

POST JSON to `/api/academy/media-playlists/{list,get,options,save,publish,attach}` with the current bearer token and `X-Academy-Workspace`. All requests include `activityKey` (`PROGRAM:…`). Successful responses include `success:true` and `schema:'PLAYLIST_MODEL_V1'`.

| Action | Additional input | Result |
| --- | --- | --- |
| `list` | `limit` 1–50, opaque `before?`, `view:'learner'?` | `revision`, `playlists`, `before`, `canManage`, `accessModel:'ACADEMY'` |
| `get` | `playlistId`, `limit` 1–30, opaque `before?`, `view:'learner'?` | `revision`, `playlist`, `recordings`, `before` |
| `options` | `classId?`, `playlistId?` | Bounded named classes/subjects/Teachers, `optionsRevision`, list `revision`; selected context and `contextLocked` for an existing playlist |
| `save` | `operationId`, `playlistId?`, `revision`, `playlistRevision`, `name`, `closeDate?`; native `classId`, `subjectKey`, `teacherIds`, `optionsRevision` for new/context changes | Private metadata save; IDs and new revisions |
| `publish` | `operationId`, `playlistId`, `revision`, `playlistRevision`, `published:boolean` | Explicit header publication/withdrawal; recordings are not published |
| `attach` | `operationId`, `playlistId`, `lessonId`, `revision`, `playlistRevision`, `confirmContext?:true` | Explicit existing recording membership and saved `position` |

Playlist descriptors include `id`, `activityKey`, `name`, `title`, `revision`, `state`, `enabled`, `published`, `closeDate`, empty `closeMonth`, `accessModel:'ACADEMY'`, `recordings`/`recordingCount`, native `classId`/`className`, `subjectKey`/`subjectName`, `programSubjectId`, `subjectId`, `moduleId`, `surahId`, `teacherIds`, `teachers`, `teacherName`, `context` and `canManage`. Reader descriptors use published snapshots only.

`get.recordings` preserves the existing native media DTO and adds `playlistId`, `playlist:{id,name}` and numeric `position`. The caller retains existing playback/PDF/companion handlers and permission checks. Learner preview uses accepted, published recordings and published playlist metadata; private recordings do not enter it. Counts reuse original V2/legacy class/date/month and current Teacher-class gates. No playlist entitlement replaces those gates.

Cursors are opaque authenticated ciphertext, bound to actor, session, credential epoch, workspace/view/class, scope, revisions and accepted head where applicable. Sparse recording pages advance over scanned positions, so callers must continue while `before` is non-null even if a page is empty. Reset cursors after a mutation or stale response. List pages likewise may be empty after permission filtering.

Legacy attach checks the exact saved recording and original class. Known native subject/Teacher mismatches are rejected, including conflicting source subject IDs. Missing legacy attribution requires explicit Admin `confirmContext:true`, recorded only in membership; the source row is not rewritten. No inference from a title, date or timetable is accepted.

### Creating a private recording

Existing `/api/academy/lesson-media/binding-options` accepts `{activityKey,playlistId}` and returns the playlist context, `playlistRevision` and an options hash bound to that playlist revision. `binding-create` accepts `{activityKey,playlistId,playlistRevision,optionsRevision,recordingDate,title?,operationId}`. It derives native context from the playlist, rejects conflicting caller selectors, rechecks current Teachers/native choices and atomically creates the private V2 lesson plus membership. The existing Source editor handles upload, processed package, notes and explicit publication afterwards.

The earlier non-playlist endpoint shape remains compatible for existing integrations. The normal programme Add flow now selects a playlist. Courses/Studio use the separately owned counterpart.

## Frontend integration

Root shared asset dependency: commit `84dea01129578147f5d084e33971ec5e607f5181`, `js/m4l-mou-playlists.js`, exported as `M4L_RECORDING_PLAYLISTS` (old alias retained). This feature does not modify that asset or `workspace.js`.

Load `js/m4l-academy-playlists.js` after the shared component. Use:

```js
await M4L_ACADEMY_PLAYLISTS.mount(host, {activityKey, label:'Academy playlists', onLegacy});
```

Use `M4L_ACADEMY_PLAYLISTS.canLeave()` before route/workspace changes and `unmount()` after a permitted leave. The wrapper adapts root's MOU command aliases to the native API, uses `accessModel:'ACADEMY'`, supplies named context create/edit forms, remounts after successful context edits, and supports bounded list pagination. The generic component reloads once after successful `onCreate`; cancellation returns false. Its ordinary metadata Save also stays private.

`createRecording({activityKey,playlistId?})` returns a private lesson result or false; the parent may open the existing editor. `m4l-lesson-media.js` lazily loads this creator for normal programme Add. The wrapper's own Add recording opens that editor directly. `cancelRecording`/`canLeaveRecording` coordinate editor lifecycle without recursive leave checks. Unsaved/uncertain requests, stale-choice refresh, exact retry, account/session/workspace changes and late replies are guarded. Native form actions use sage; existing page colours remain.

## Validation and measured limits

Evidence lives in parent `outputs/academy-native-playlists-20261101/`. All fixtures are disposable and synthetic; hosted calls are zero.

- Final combined split-owner, audience, editor, bridge, retention and UI suite: 211 checks passed with `--test-concurrency=4` (`regressions-final.log`). Final affected suite: 53 passed; focused native playlist suite: 14 passed. One existing UI settle-loop timing assertion failed under simultaneous browser/full-suite load and passed both its isolated repeat and the final full run; no test or production workaround was added. Nineteen changed JavaScript files passed syntax checks.
- Browser acceptance uses the actual frozen shared asset and native Source Worker: named selectors at 1280/768/390/320 widths, private saves, lost acknowledgement/exact retry, explicit playlist publication, private recording → editor, dirty cancellation and late account-reply isolation. See `browser/receipt.json` and screenshots.
- Actual local Source + split-coordinator workerd/D1 metadata includes direct Core/Admin and coordinator reads, with R2 bound. From baseline to 1,000 unrelated areas/accounts/roles/classes/media/accepted publications/playlists: warm Admin list 69→70 rows (11 statements); Admin get 191→191 (50); native options 319→325 (59); warm learner list 75→76 (12); learner get 114→114 (22). No writes occur in these measured reads. See `costs.json`.
- The accepted reader narrows live records to the server-selected ≤30 membership IDs before projection while retaining accepted head, original NOCASE joins, live hiding and all audiences. Class/definition projection is scoped to the requested programme. This avoids scanning unrelated live records through an unindexed NOCASE join.
- Cold account/profile catalogue reads remain inherited growth: Admin 150→5,151 and learner 152→5,153 rows, same 17 statements. They are not attributed away or claimed constant. The existing twelve-hour account cache is unchanged. Generic split-owner write-plan capture costs also remain inherited; this feature does not claim total write costs are constant or equate capture counts with billed reads.

Apply Core0023 before enabling the new UI and deploy matching Source API, split coordinator and frontend assets through Root's paired release. Preserve existing Core21/22/Admin3 and paired Studio compatibility. Do not change current bindings, schedules, retention or 43200/43200/60. No live schema/data/media/publication, Git push, dependency update or independent deployment is performed by this branch.

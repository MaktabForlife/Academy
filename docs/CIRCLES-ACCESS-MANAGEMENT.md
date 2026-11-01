# Access management — connected local candidate

The owner's 1 November request is implemented on the verified V109.3 Source/Target baseline. This is a local checkpoint within the complete next-UI composition, not a deployed release.

The Circles Admin action opens the exact checked native destination `/academy/admin/#administration/access`. The existing verified native account/header remains; no second login or synthetic production identity is introduced. Global and scoped Admins choose Tafseer, Mothers of the Ummah or Courses, then open a bounded learner page and the selected person's native editor. The editor retains separate paid months/original cohorts, website-only grants, participation/live allocation and Course purchases. Free/Paid Course policy remains the existing native control.

## Native catalogue contract

`POST /api/admin/platform/studio-access` with native Bearer session, matching Origin and `X-Academy-Workspace: ADMIN`:

```json
{"command":{"action":"catalogue","area":"tafseer","cursor":"","limit":50}}
```

`area` is `tafseer`, `mothers` or `courses`; omission lists supported permitted mappings. `limit` is 1–50, default50. Response schema is `STUDIO_ACCESS_CATALOGUE_V1`, containing `items`, `more` and `nextCursor`. Each item supplies exact `activityKey`, `offeringId`, native title/kind/area, enabled flag, ownership and revision. Disabled/FROZEN/Academy-owned entries remain explicit; they do not become editable from catalogue presence. Academy-owned entries offer their actual existing Participants page. Every per-offering read/save independently rechecks current authority and ownership through the existing Source/Target access protocol.

The catalogue reads current Core account, admission, native session/credential epoch and effective Admin role. It never treats supplied actor/role fields as authority, issues a new content grant, forwards a roster or reads media/month bodies. MOU is identified by its native registration, independently of Tafseer.

Indexed keyset candidates are bounded **before** filtering status/type/scoped permission. Course and Programme key ranges are separate; MOU begins at its unique programme registration. Scoped candidates begin at the account's existing active role index. The existing `website_platform_ownership_nocase` index preserves mixed-case ownership without a table scan. No new schema/index is required for Access. A sparse/empty filtered page can have `more:true`; its `nextCursor` is the final checked candidate, not necessarily the last visible item. The UI offers explicit next/previous pages and never automatically drains the catalogue.

## Client protections

The native access module still owns mutations, exact pending retries, revisions, removal reasons, account/role checks and unsaved-work protection. Area, Course and native SPA navigation respect that guard. Account changes clear the catalogue and private panels, including delayed previous-account results. Selecting a Course from the current checked page does not reload the catalogue. No polling or new per-card identity checks are added.

## Local evidence

-12Source UI checks pass (native editor, review host and production catalogue consumer).
-4paired native tests pass: catalogue authority/flags, role/session/epoch revocation, keyset and growth, and checked dashboard continuation/denials.
-10Target pure Home/navigation/dashboard checks pass. The earlier26native Access/MOU regressions remain separately saved evidence for the reused editor.
-Actual local D1 whole request with4,000other mapped Course and mixed-case ownership rows: Tafseer67→67reads, MOU61→61; each5queries/0writes after warm-up. The catalogue SQL alone remains14/8reads. Unrelated historical-right growth and change-driven cache refresh are separately logged; this is not a billing/constant-total-cost guarantee.
-Browser: genuine local sample sign-in→Circles Admin→checked connector→native Access; all three areas; native monthly and purchase Save/readback; dirty hash-navigation guard; Home→Admin;390px document width390/component358, no page overflow.

Receipt/screenshots are in the parent `outputs/circles-access-ui-20261101/`. The shared preview is `http://localhost:9064/` with native pages on9065. It uses disposable fixture data only. The earlier standalone9062review remains available. The sample native bootstrap's unrelated missing-Reboot notice is recorded, not presented as an Access failure or a production repair.

The full approved dashboard/Manage row, header selectors and remaining next-UI items are separate composition work; this checkpoint does not mark the whole release complete. Root owns eventual same-version Academy/Studio activation after all conditions pass. Original media, acquired rights and all manual content/publication holds remain.

## Matrix and Surah-table correction — 1 November 2026

Access Management is the checked Admin entry for Tafseer and MOU student matrices. Tafseer also has its editable Surah/completion-date table. Short Courses remain whole-course subscriptions/purchases with no monthly grid. The existing Academy year/All/month interactions and draft/retry controls are reused through explicit mounts; its legacy Participants tool still uses its existing transport. Studio-owned registers use the native signed Source proxy and Target guards; they never write the fenced legacy monthly tables.

Matrix reads page 25 native members before student/search filtering, with an advancing cursor even on empty filtered pages. They read only selected calendar years and visible accounts. Native original class/cohort rights remain separate from website-only months and additional grants. Whole-year selection followed by individual exceptions is one reviewed Save; removals require a reason. Refreshes, area changes, other tools and account changes preserve the existing dirty/pending rules. Source supplies bounded native class labels/history suggestions; new monthly additions reject classes from another programme.

Tafseer table edits save names and full completion dates, keeping the existing completion-month website rule. Add Surah creates an unpublished private website and its managed mapping; it does not publish content, grant anyone access or change recording-month/cohort rules. Table and matrix Saves use current authority, scope revision and exact operation receipts. A separate Tafseer-only ownership correction preserves managed website dates/mappings against late Source snapshots, excluding Courses and MOU.

The later MOU independent playlist feature is a separate authorised follow-on: an Admin-assigned access date/month will unlock its complete published playlist and support, independent of recording dates. It is not implemented by this matrix checkpoint, and the earlier proposed Academy-subject table is superseded. No existing MOU date, identity, content binding or acquired right is converted here.

# Publication admission read optimisation

Local branch: `feature/academy-publication-reads`, based on V107.119 (`75797b85`). The user authorised release as V107.120 on 28 October 2026. The local implementation and evidence below precede deployment; release results are recorded separately. Preserve newer content, source caches, grants and V107.119's safe component insertion.

## Behaviour and change

The daily allowance investigation identified publishing an accepted head as the largest query cost. The head pointer used an UPSERT even when the guarded parent already existed. SQLite executed both BEFORE INSERT and BEFORE UPDATE PDF-admission triggers. Each trigger repeatedly expanded published lesson, link and PDF JSON while counting the shared limit.

Normal publication now updates the existing singleton directly. Bootstrap still inserts it. Existing source-version, expected-parent, actor/session, immutable-component, exact retry and transaction guards remain in place.

The Core/source upgrade adds `AS MATERIALIZED` to the existing `parents`, `links` and `assets` projections in both admission triggers. This reuses data only within the current SQL statement. Every publication still validates the current candidate and current active teacher-note rows; no validation decision is cached between publications. Archived heads cannot supply candidate data.

The ten-PDF session limit, official plus active teacher-note count, withdrawn history, legacy SESSION scope, DRAFT/HIDDEN behaviour, Course attachment behaviour and video handling are unchanged. No permission, ownership, file storage or public/student access rule changes.

## Local evidence

Actual local Workers/D1 measurements for the isolated admission step:

| Published inventory present during validation | Previous reads | Optimised reads | Reduction |
| --- | ---: | ---: | ---: |
| 1 PDF and 1 video | 32 | 23 | 28.1% |
| 40 PDFs and 40 videos across 40 lessons | 19,688 | 608 | 96.9% |
| 50 PDFs across 50 lessons | 10,608 | 508 | 95.2% |

These are per-validation measurements, not whole-upload/publication or daily savings. Today's bulk setup workload is not assumed to be normal daily usage.

Tests compare original and upgraded guards on bootstrap/update paths: ten/eleven PDFs, combined official/own notes, withdrawals, videos, multiple Programs, legacy scopes, unpublished and archived data. HTTP workflow tests confirm single admission, no publication for staging/exact retry, and rejection of students, out-of-scope Admins and revoked sessions. Existing media tests run against upgraded triggers, including teacher notes arriving after an Admin draft.

Native tests use actual local D1 and private coordinator RPC. They verify single UPDATE admission, atomic schema-upgrade rollback and complete publication rollback on a PDF-limit failure. The broader suite checks immutable heads, stale drafts/actors, retries/recovery, timetable/assessment publication, media, grants and current size protections. Evidence is under project `outputs/academy-publication-reads-20261028/` outside the repository.

## Authorised release

Deployment needs the trigger upgrade in existing Development Core (`backend/migrations/academy-core/0009_publication_pdf_projection_cache.sql`) and the API change. Apply the four trigger replacement statements atomically so the checks remain continuously present. No Admin schema, bucket or binding change is needed. The existing private coordinator accepts the SQL UPDATE path; it needs no change for this optimisation.

`backend/migrations/academy/0044_publication_pdf_projection_cache.sql` is the equivalent unsplit/source upgrade. Fresh split generation from upgraded source inherits the improved guards. `backend/tools/academy-publication-admission-migration.mjs` prepares the reviewed upgrade from a local schema file, without contacting Cloudflare.

The trigger upgrade works with the previous UPSERT API; the new UPDATE API works with original triggers. Apply the Core upgrade first when authorised, then release the API with matching version/assets. Release checks must not republish production content or change media, payments or student data. Keep live checks small: targeted schema/version checks only after approval.

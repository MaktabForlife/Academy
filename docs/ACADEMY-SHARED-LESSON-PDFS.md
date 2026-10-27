# V107.83 — Shared lesson PDF storage

The user confirmed V107.82 was deployed and authorised this PDF-only release as V107.83 from `feature/academy-shared-pdfs`. It incorporates V107.82, preserves its planner/dashboard changes and requires matching Development API/website deployment only. No database migration, coordinator change or live storage backfill is required. Keep live checks small.

## Existing deployed behaviour

V107.81 selects a Public Library PDF, downloads its contents through the existing public PDF proxy, then uses the protected lesson upload. A separate attachment creates a separate private file. The recurring Teacher option already attaches one version across matching accepted occurrences, but different lesson attachments did not share their bytes.

## Local correction

New PDFs are stored at a namespace-scoped SHA-256 key. The same bytes reuse that one object across Admin lesson attachments and Teacher dated/recurring note versions. Different contents receive a different object, even when filenames match. Existing environment namespace boundaries remain.

Each attachment/version keeps its own unique database reference, name, author, audience, revision and immutable history. This preserves the existing UNIQUE object_key constraints without a database upgrade. Only the two already-authorised PDF download paths resolve the reference to shared bytes, after their existing lesson/session permission checks. Legacy object keys continue to resolve unchanged. Removing a lesson link, withdrawing a note or retrying a conflicting operation must never delete shared bytes used elsewhere.

A storage hit does not grant access by checksum: the actual submitted bytes are streamed, size/signature checked and hashed on every new attachment. A caller cannot claim an existing private file by knowing its hash. This uses Workers-native DigestStream and bounded backpressure rather than buffering a PDF in Worker memory. On a first import R2 also verifies the SHA-256. A warm repeat uses one R2 metadata lookup and no file write. Concurrent cold imports converge on one physical key; they can each perform a verified write of the same contents. No extra D1 lookup is added for deduplication.

The browser still downloads the chosen public source and submits the PDF through the existing guarded upload. This correction removes repeated storage; avoiding repeated transfer would be a separate source/reference API change. Existing V107.81 files and any earlier duplicate copies are preserved; no backfill or deletion has been run. Once this correction is deployed, new attachments use the shared store. Existing legacy copies would require a separate, bounded migration if removal is desired.

## Local checks

Tests cover sharing across independent lesson links and Teacher note versions, isolated names/removals, current permission denial, forged checksums, invalid/truncated/oversized content, concurrent first imports, environment isolation, legacy keys and uncertain database acknowledgements. A native Workers/R2 test verifies streaming hash validation on reuse. The browser fixture imports the same public PDF as an Admin, uploads it as a local file and imports it as a Teacher, confirming three independent attachment records share one stored PDF. No live checks are needed.

Evidence: project `outputs/academy-shared-pdfs-focused.log`, `outputs/academy-shared-pdfs-runtime.log`, `outputs/academy-shared-pdfs-browser/verification.json` and `outputs/academy-shared-pdfs-regression-final.log`.

## Timetable cards

The user confirmed that timetable cards are no longer an issue. No timetable-card behaviour is changed by this release. Earlier synthetic investigation evidence is retained in the local project's outputs only.

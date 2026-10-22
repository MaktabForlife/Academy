# Phase 4 — media and Library separation

V107.27 prepared on feature-admin, 22 October 2026. Implementation is authorised through Phase 4. Live preview remains V107.25 and Development V107.22 until the shared migration and release gates below are completed.

## Resulting behaviour

The existing weekly lesson calendar, attachment chooser and protected PDF/video readers remain. General media/video metadata, labels, Course-wide PDFs and reviewed publication are Admin actions. Teach has only Post/replace/withdraw for verified own PDF notes on an accepted dated session under a current teaching assignment. No legacy authorship is guessed, no parent publication is changed, and replacements retain immutable original filenames, file identity, checksum and actual uploader.

A Teacher note is a Core operational contribution; the Admin general media master stays separate. Active own notes and accepted official session PDFs share the ten-PDF cap. Replacement reuses the same slot. Reviewed publication cannot exceed the cap if Teacher notes arrived after a private Admin draft. Current hiding suppresses metadata and bytes immediately; saving a draft cannot restore them. Only reviewed accepted publication can restore general visibility. Existing source records, discussion history and R2 objects remain.

Main timetable, calendar, popup and original bytes enforce the same current audience. Dated class membership and the existing single-class fallback are preserved; attendance/substitute grants create no material entitlement. Course PDFs remain dateless and accessible through old/archived deliveries under current paid/free entitlement without reopening Course activity. Older own-note-only sessions can be found from an initially empty week. New calendar labels use accepted app-wide configuration; captured dated source facts retain their provenance.

Discussion controls and APIs are retired under the media separation flag. Private My links is an owner-only collection in the existing R2 home, using conditional writes, revision conflict handling and exact operation receipts. Initial creation needs a current Teacher/Admin role; an established owner, including an empty collection, retains add/edit/export after role loss. Current account/session checks remain. Admin cannot inspect another owner, and collection edits never enter official Academy or Open Library metadata. Provider files remain external.

PDF comparison, annotation, Whiteboard and bookmarks retain their existing tools and storage. The standalone Course media entry reuses the same lesson reader and standard navigation/mobile shell.

## Verification

- Seven isolated media checks cover actual Teacher ownership, forged Admin context denial, metadata/byte agreement, ten-PDF replacement/history, older own-note lookup, retained sessions after class retirement, the class audience fallback, hide/draft/reviewed restore, publication-time cap, archived Course access, no attendance entitlement and current role revocation.
- Three isolated My links checks cover private ownership, absence of official writes, established empty owner after all teaching roles are removed, disabled account denial, conditional concurrency and exact retry recovery.
- Existing media checks include a lost post-commit acknowledgement and failed receipt read: retain the immutable R2 object; exact retry recovers the accepted file and permitted original-byte access.
- An additional attendance check rejects an old accepted-head FIRST without creating partial native records. Normal Teacher marking requires the approved/released paper; direct Admin work and existing explicit released references remain separate.
- Desktop/phone acceptance exercises Teacher Post/replace, learner original PDF bytes, dateless Course PDFs, My links create/empty/role-loss use and export. No browser page errors; individual requests in that scenario used at most 33 database queries, within the current 50-query limit. Screenshots were inspected. These are measured fixtures, not a general scale claim.
- Private snapshot reconstruction with 0033/0034/0035 preserved every original value in 114 tables / 4,361 rows, with integrity OK and zero foreign-key errors. No physical database move was performed.
- The source ownership delta adds 26 tables and 173 columns through 0035 (134 tables / 921 columns), plus two nullable-column changes. This is source evidence, not a deployed-schema assertion.

- Full regression passed all 90 test files: 89 in the sandbox and the single local-listener permission failure passed separately with that permission. The retained-history refinement then passed the affected media checks and browser scenario. Feature Worker dry-run and feature Pages packaging passed; 740 website assets include the new reader and owner-link code. Active version markers agree at 107.27.

## Shared schema and release gate

0033 adds native attendance; 0034 preserves assessment identities/child references while allowing null duration/date and adds operational evidence; 0035 adds note entries/immutable versions/current visibility and publication cap guards. The shared database approval request names all three. Earlier approval applied only to 0032. None of 0033–0035 is applied live at this record's preparation point.

After explicit approval, refresh and verify private recovery evidence, apply only the approved migration files/ledger entries, then deploy a matching feature Worker and feature website. Verify preview before completing the [UI/Development checkpoint](ui-development-checkpoint.md). Development and its Worker must then be released compatibly under the user's checkpoint instruction. Do not begin Phase 5 database creation, copy or writer cutover.

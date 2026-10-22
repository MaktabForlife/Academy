# Phase 3 — learning operations

V107.26, prepared on feature-admin. User approval covers implementation through Phase 4. The physical database split remains after the required UI/Development checkpoint.

Native attendance uses new recorded days, sealed reusable rosters, required dated contexts, stable series and append-only register versions with sparse absences. Legacy records remain untouched and old retry generations cannot write the new format. Historical FIRST needs reliable dated evidence; future FIRST is blocked. Course attendance uses an explicitly reviewed dated delivery roster with no content/role entitlement. Substitute capabilities are exact dated sessions with separate FIRST/correction/reopening limits and no Teacher role. Current account/session/role/lifecycle checks share each write transaction.

Exams retain their captured app-clock day and midnight upload cutoff. Timed attempts begin on actual learner access once; their duration/allowance/deadline snapshot is immutable. Untimed assessments have null duration/allowance and no countdown. Assignments have independent opening and optional due dates, stay open late, and retain the acceptance deadline/Late facts when Admin extends or closes collection.

Ready is manually available after all expected answers are uploaded and checked, or on the next day after the exam/effective assignment due day. Admin must explicitly continue past the unchecked warning; Teachers cannot bypass checking. Zero answers can be Ready next day but cannot produce empty finalised/released results.

Admin has direct named-learner answer upload/replacement, marking, optional script, finalisation and explicit release/withdrawal. Normal examiner/moderation checks remain. New answers/markings preserve released references until Admin explicitly changes a category for the class or a nonempty selected set. There is no manual-case workflow or automatic replacement policy.

Files retain immutable identities, their original R2 homes, real learner owner and actual uploader. New paper approval binds the exact file checksum; marked PDFs bind their actual answer/paper. Learner JSON omits configured duration, maxima and inline marks. Reports show achieved-only values, including real zero versus Pending, and bind reviewed PDF checksum, source definition/released result, template/layout/background references. Unknown upload acknowledgements retain their immutable object for original-operation recovery.

## Verification and release gate

- Full regression: 87/88 files passed in the sandbox; the one local-listener permission failure passed separately with that permission.
- Native attendance checks include zero absence, sparse corrections, sealed membership, historical FIRST, proportional days, rollback, no-role substitutes/revocation, live Teacher revocation and reviewed Course rosters.
- Assessment checks include six-week untimed assignments, late facts/extension/closure, unchecked Ready, direct Admin finalisation/release, already released replacements, immutable first access, exact paper/script sources and reviewed achieved-only reports.
- Desktop/mobile browser acceptance passed the existing Admin attendance/assessment screens, manual upload, unchecked warning, zero-mark finalisation, selected release and learner omissions with no page errors. Measured individual requests used at most 32 database queries in that scenario.
- Reconstructed the private post-Phase-2 recovery snapshot in memory and applied 0033/0034: all 114 original tables and 4,361 rows retained their original values, integrity OK and zero foreign-key errors.
- Shared migrations 0033/0034 require the pending explicit approval. They are prepared, not applied. The live preview remains V107.25; Development remains V107.22.

Phase 4 media/library source and isolated verification are recorded in [Phase 4](phase-4.md); its shared schema and live release remain pending. The required complete-UI/Development checkpoint still precedes any physical database split.

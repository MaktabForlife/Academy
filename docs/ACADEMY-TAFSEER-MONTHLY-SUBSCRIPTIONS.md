# Tafseer monthly subscriptions — local implementation

Implemented locally on `feature/academy-tafseer-monthly-subscriptions`, based on V107.100. The release version is unchanged. Nothing has been pushed, deployed or applied to a hosted database/bucket.

## Admin workflow

Open **Programs → Tafseer → Participants → Monthly subscriptions**.

1. Global Admin prepares the monthly register. This establishes the existing Program's stable key and retained recording policy; it does not yet restrict students' existing access.
2. The register shows Tafseer students in the first column and collapsed **2024**, **2025** and **2026** year groups. Click a year to expand its January–December checkbox columns. Student names remain fixed while the months scroll. Each student has an **All** checkbox per year, available in the collapsed summary and expanded month grid. It selects all 12 months; individual months can then be unticked. The checkbox shows a partial state when only some months are selected. Collapsed years also show the count of paid months. These are drafts until **Save changes** is pressed.
3. Use **Find a student** to search by name/account ID within the Tafseer roster, including former students with class or subscription history. Load more students when available. Tick paid months across years, then **Save changes**. Search, pagination and collapsing years preserve unsaved edits, including edits to students hidden by a search. Only edited cells change; saving multiple months is atomic. Existing payment references, dates and notes are preserved. Classes are inferred from the saved grant or dated membership, with an explicit choice when ambiguous. Removing a previously saved month requires a reason. Conflicting edits and uncertain responses keep the draft; Retry reuses the original operation.
4. Record and review the historical opening register before Global Admin activates monthly access. Activation is explicit and requires a recorded paid month. No current Student role or class enrolment is automatically treated as payment history.

Scoped Tafseer Program Admins can manage grants once the register is prepared. Teachers and Admin reader previews cannot grant access. Payment references/notes are administrative records and are excluded from learner responses. This is a manual subscription register, not a payment collection or invoicing system.

## Earlier media: January–October, 2024, 2025 and other past years

Expand **Earlier lessons and media** inside Monthly subscriptions.

1. Enter the original lesson date, title and classes. Dates are not limited to the app's start date or current academic year. If the original cohort needs its own class, create that historical class through the existing Classes editor; monthly classes are unnecessary.
2. Add the historical lesson. Its draft opens in the existing attachment editor.
3. Attach MP4 recordings, YouTube recordings and/or PDFs, then save/publish through the normal media workflow. In the split-store application, explicit accepted media publication remains required. A historical entry does not invent a timetable publication, attendance session or meeting link.
4. Separately record the months each student paid for, using the original year. January 2024, January 2025 and January 2026 are independent grants. Create missing student accounts and add them to Tafseer through the normal Participants workflow before recording them in the grid.

Example: a lesson dated **16 January 2024**, whose recording is uploaded now, is available to students with **January 2024** access. An October lesson whose recording arrives in November still uses October access. The attachment's upload date never chooses the paid month.

The historical lesson date is fixed after creation in this first version. Correct a wrongly dated draft before publication by creating the correctly dated entry and withdrawing the wrong one; there is no silent cross-month date edit or upload-month override.

## Student access

Learn has a **Tafseer · Paid months** link, also available at `/academy/monthly-media/`. It shows recorded months by year and published lesson media, including Teacher PDF notes. Students retain their covered months after renewal ends or their current enrolment/class changes.

The backend checks the parent lesson/session month and recorded historical cohort for lists, metadata, PDF delivery, teacher notes, recording tickets and each MP4 range request. The same PDF reused in a second lesson requires access through that second parent. A retained-media context does not create a Student role or grant live joining, attendance, assessments or staff tools.

Account/session revocation, explicit month revocation, unpublished/withdrawn lessons and existing Program lifecycle restrictions still apply. Already downloaded copies and public/external video URLs remain outside Academy delivery control.

## Recording retention

Preparing Tafseer's policy places new native MP4s under the private namespace's `retained-program-recordings/<encoded Program key>/` prefix, separate from the existing `session-recordings/` expiry prefix. They have no automatic 14-day application expiry. Other Programs/Courses keep their existing 14-day policy.

For an existing Tafseer MP4, **Retain recording** in the media editor streams a copy into the retained prefix, verifies its byte size, and updates its reference with normal authority/revision guards. The original is left intact for safe recovery and remains subject to its existing expiry. Published reference changes use normal accepted-media publication. An uncertain save can be retried safely. If the original bytes have already been deleted, re-upload the original recording; a month grant cannot recover a deleted file.

No hosted lifecycle rule was changed or inspected during implementation. Before a future release, verify that no existing bucket-wide rule expires the retained prefix. The previously recorded narrow `dev-split-v1/session-recordings/` lifecycle does not match the new prefix. Unlinked retained copies after uncertain operations are preserved rather than deleted without evidence.

## Local sample and verification

The disposable preview uses only in-memory synthetic accounts, grants and objects. It includes January 2024, January 2025 and October 2026 sample subscriptions and earlier lesson entries. Restarting clears sample edits. Its configuration keeps all API requests on the same local server.

From this worktree's `backend/` directory, with Node 24 and development dependencies installed:

```sh
npm run preview:tafseer
```

Open [the local sample](http://127.0.0.1:4318/) and choose Admin or Student. Use one tab when switching these sample accounts. This is a sample preview, not the Development app.

```sh
npm run test:tafseer
```

Verification covers month/year boundaries, late attachments, 2024/2025 history, a 100-student atomic delta, cross-year atomic grid saves, roster search/pagination, collapsible years, hidden draft preservation, retained byte-range playback, shared PDFs, teacher notes, scoped authority, current-role removal, revocation, immutable publication, cache/proof invalidation, missing authority storage, retries, navigation guards and account switching. All 111 selected local checks passed, including existing media, workspace, Program, snapshot and split-store regressions. Source-boundary and JavaScript syntax checks also pass. DOM interaction tests exercise search, expansion, multi-year edits, removals, retries and account switching; the updated grid has also been checked in the local Chrome preview.

## Future release requirements — not performed

- Apply additive `academy-core/0005_program_monthly_subscriptions.sql` to the existing split Core store; `academy/0040_program_monthly_subscriptions.sql` is the monolithic/source equivalent. No table is seeded with paid access or an enabled Program by either migration. Do not apply both alternatives to the same database.
- Release a compatible coordinator, API and website before activation. Set `ACADEMY_MONTHLY_SUBSCRIPTIONS=1` for the API only after schema/coordinator support is ready. Missing authority schema with this feature enabled fails closed.
- Prepare the real Tafseer register against its verified existing Program key, retain still-available recordings/re-upload missing files, and review the actual historical paid-month list. No real subscriptions or historical media were imported by this local implementation.
- Activate protection explicitly after that review. Once enabled, do not disable the feature flag, delete the policy or roll back to code that ignores monthly protection. Use a compatible rollback that preserves the permission checks and stored grants.

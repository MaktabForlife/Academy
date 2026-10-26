# Local Imtihaan schedule export and assignment deadline fix

The user reported that Share PDF and Download PDF in the Imtihaan Register did not produce the schedule. Work remains local: no push, deployment, migration or live assessment edits are authorised for this fix.

## Cause and fix

The exporter appended a time suffix to every date. Native assignments provide ISO timestamps for `dueAt` and `availableFrom`, so any such row raised `RangeError: Invalid time value` before the PDF could be created. Previous browser coverage used exam-only schedules.

The exporter now handles date-only exams and timestamp-shaped assignment deadlines, sorts by actual scheduled dates, and preserves the selected due day for older midnight-exclusive records. An assignment with no optional due date says `No due date`, rather than displaying its opening date as a deadline. The PDF column reads `Exam date / Due date` and includes the assignment's actual deadline time.

Download anchors are attached to the document before clicking and are removed afterwards. Errors during a browser's native-share capability check fall back to the PDF download; cancelling a share still does not download anything. Native sharing availability and browser activation restrictions retain the existing safe download fallback.

## Assignment deadline

The user's final instruction is **13:00 on the selected due date**, in the assessment's configured time zone. This supersedes the briefly requested 18:00 value, which was never implemented.

Date selections now save a 13:00 deadline. The form labels explain the fixed time, and the timetable/PDF display preserves exactly 13:00 rather than subtracting a millisecond and showing 12:59. Existing midnight-exclusive values retain their original displayed due day for compatibility. Unrelated saves do not silently rewrite existing recorded deadlines, and no live deadlines have been changed. Explicit submission closure remains a separate manual action.

Both Academy entry pages use new cache keys for the changed assessment and export scripts. No release version has been allocated for this local fix.

## Verification

- 64 focused checks passed across assessment operations, table saves, batch saves, deadline time zones, PDF contents and sharing/download fallbacks.
- The targeted browser check uses the real Admin page, both actual SVG icon click targets, the real native Worker and disposable D1 records. A mixed exam/assignment schedule downloads as a one-page Draft PDF with a 13:00 deadline, shares the generated PDF through a simulated native share handoff, falls back to download when native sharing cannot accept files, handles cancellation, and downloads as Final after schedule release.
- Browser output, actual PDF files and the rendered schedule image are in the project output directory `outputs/imtihaan-export-fix`. No real share sheet recipient, live account or live database was used.

Run the browser check with `ASSESSMENT_BROWSER_RUNTIME` pointing to an installed Playwright package. `IMTIHAAN_EXPORT_OUTPUT` selects its output directory; `ASSESSMENT_CHROME_PATH` can select a browser executable.

Before a later authorised release, integrate the current Development branch. This checkout started at V107.71; the already-fetched Development reference includes V107.73. Preserve those later changes and the existing local `AGENTS.md` modification.

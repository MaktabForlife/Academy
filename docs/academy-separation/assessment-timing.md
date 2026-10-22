# Academy assessment timing and due dates

Final rules for staged implementation authorised on 22 October 2026. See the [final implementation brief](README.md) and [technical contracts](technical-contracts.md).

Treat timing mode, opening date and due date separately. TIMED has a positive configured writing duration and Admin-adjustable reading/printing allowance, default 15 minutes. Start once at actual first paper access; reload/download/retry does not restart it. Changed defaults do not silently alter started attempts. UNTIMED uses null duration, no countdown and no allowance/To be set placeholder. Preserve maximum-mark validation for staff.

For exams, otherwise permitted learner uploads remain accepted after countdown zero on the exam day, with Late and no automatic penalty. The exclusive cutoff is midnight ending the effective exam day in the app time zone. Later papers/answers are handled manually by Admin. Earlier individual dates and allowance adjustments are ordinary scoped Admin edits and do not create a later-day learner sitting.

An assignment may stay open for six weeks or another future due date. After due it stays open and accepted work is flagged Late until Admin extends the due date or closes submissions. Due is not a writing duration or automatic hard cutoff. Keep actual acceptance/deadline-used history; a later edit does not rewrite previous recorded timing. Explicit closure and Ready/release are separate operations.

Ready uses all expected uploaded AND checked, or the next Academy day after the effective due/exam date, and remains manual. Extension/closure does not automatically set Ready. An open late assignment remains visible when another assessment is being marked. Learner schedules/status/JSON/exports omit configured duration and inline marks; valid released reports are achieved-only.

One app-wide Time zone is editable by Global Admin only. All date resolution inherits it; retain already effective UTC instants and original history.

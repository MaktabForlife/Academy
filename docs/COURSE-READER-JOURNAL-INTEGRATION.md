# Reflection toolbar and optional personal journal

The course reader provides Copy, Share (three nodes), Save reflection and Open journal (open book), after the answer box. Guests and Admin author previews never get personal journal actions. A registered account can see the journal controls; they remain disabled with a launch message until the separate personal journal is available.

The separate journal feature is not included or deployed by this change. A later coordinated release must supply `/academy/journal/reflections.mjs`, `/academy/journal/`, their existing owner-only API/storage, and set `M4L_CONFIG.STUDENT_JOURNAL_ENABLED` to true. Do not turn this flag on before those pieces are released together.

The adapter uses the journal's `reflectionJournal` interface (`sync`, `change`, explicit `save`, `canLeave`, `stop`). It passes the existing course/surah identity and scoped browser draft helpers. It implements no second journal backend or storage format. Only the selected Save action invokes `save`; opening the journal uses the saved entry ID, without private text in its URL. Typing goes to the existing device-draft path. Account changes stop the adapter and clear private device state; a course loading failure preserves the owner's draft.

The editorial preview simulates a student's toolbar and explicit device-only Save/Open behaviour, with a separate Guest preview link. It does not authenticate, create live journal entries, upload anything or demonstrate the private API. Its labels say so.

Each lesson is one visible semantic article with its H1, complete lesson sections, Arabic, quotations and images. Navigation, completion and footer controls are outside it. This improves extraction for browser readers; Safari makes the final decision to offer Reader. Native Safari verification is pending because the available native control timed out. The existing on-page full-screen reading control remains available.

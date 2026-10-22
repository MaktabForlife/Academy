# Complete-UI and Development release checkpoint

Required by the user before any physical database separation. User authorisation covers implementation through Phase 4 and this Development release. Phase 5 is not authorised.

Current state: **prepared locally; live release pending shared migrations 0033–0035 approval**. Preview serves V107.25; Development serves V107.22. Phase 3 has local source checkpoint 275c95f8; Phase 4 is prepared for V107.27. Do not treat this document's existence as a completed checkpoint.

| Gate | Evidence / current state |
| --- | --- |
| Current layout retained; Admin Learn is student and Teach is Teacher | Phase 1 server/client tests and browser checks; reviewed projection boundaries |
| Admin setup drafts and reviewed accepted inputs | Phase 2 live accepted head and preservation record; ordinary access/disable controls remain Core |
| Learning operations and direct manual assessment controls | Phase 3 isolated API/browser checks; no manual-case workflow; shared schema/release pending |
| Media, private links and retained readers | Phase 4 API/browser verification; actual ownership and matching metadata/byte audiences |
| Field/access/data ownership map current | Baseline maps plus Phases 2–4 field delta; Teacher contributions Core, general media Admin, My links private R2 |
| Shared changes explicitly approved | 0032 approved/applied; 0033–0035 pending separate explicit approval |
| Recovery verified before application | Private original/post-Phase-2 snapshots and reconstruction; refresh before new live changes |
| Feature website and Worker compatible and verified | V107.25 live; V107.27 release pending schema approval |
| Development integration and matching website/Worker deployment | Pending successful Phase 4 preview verification; do not deploy prematurely |
| Recoverable Development release checkpoint | Pending release: record exact Git tip, website/API versions, Worker version, migration ledger and verified private snapshot |
| Phase 5 physical split | Not started; requires its own implementation request after all preceding gates |

Before marking complete, record the final verification result, exact deployed source and Worker versions, current accepted head/schema, original data/file preservation checks and recovery location/digest without exposing private data. Any failed gate remains open. Existing R2 homes and Open Library store stay in place; no cleanup or source destruction follows from this checkpoint.

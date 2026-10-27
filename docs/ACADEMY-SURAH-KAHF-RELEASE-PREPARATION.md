# Surah Kahf release preparation — held on the feature branch

User instruction: “Keep it on the new branch until the other update is finished.”

Branch: `feature/surah-kahf-course-companion`.
Baseline: V107.85, `b05ef792cf826a1a4a4cba4a3be59523207a6bff`.
Current state: locally prepared and tested; no feature push, website/API deployment, migration, live SQL, upload or settings change.

## Prepared

- Complete eleven-lesson reading edition, mobile checks and review evidence.
- Existing Academy bearer login, selected workspace and accepted publication used throughout. Protected readings and PDF delivery remain behind current course permissions. Existing lesson media and assessment components are reused.
- Surah Kahf dashboard entry and course links connect to the new course home, readings, sessions, materials and assessments. Teacher editing and administrative tools retain their existing destinations.
- Local permission, revocation, account-switch, PDF delivery and prior media/workspace regression checks pass. API and normal Pages builds pass. No schema or private coordinator change is introduced.

## After the other update is confirmed finished and deployment is authorised

1. Fetch the current `development` state and incorporate that completed release into this feature branch. Resolve any overlapping dashboard/entrance changes without dropping the other release. Do not assume that the old baseline is still current.
2. Select the next free release number and update the repository’s required matching version files, release labels and changed asset cache queries. The preparation build deliberately retains the old baseline version and must not be published as V107.85.
3. Repeat the targeted tests and normal API/Pages dry builds after reconciliation. Check the public asset allowlist still excludes `backend/src/academy/course-books/`, `course-content.js`, `verses.js`, `verses.json` and the original course PDF.
4. Preserve the existing signed-in cookie/storage origin: host the course at `/academy/course-companion/surah-kahf/?course=<actual-dashboard-course-id>&workspace=LEARN`, through the current Academy website and API. Do not link students to the private ChatGPT review site or invent a second login.
5. Publish only through the authorised existing Development website/API release workflow. No new database migration, private coordinator deployment, timetable publication or automatic material upload is required. Keep a rollback source SHA for the previous completed release; no data rollback is needed for this code-only feature.
6. Keep live verification small: matching versions/readiness, one authorised course open through its dashboard, and one published material/session view. Confirm signed-out access stays gated and the course PDF remains protected. Existing Course PDF publication is a prerequisite; unavailable/hidden collections intentionally withhold the reading edition.

The verification detail and screenshots are recorded in [the companion notes](ACADEMY-SURAH-KAHF-COMPANION.md). This document is a preparation checklist, not authorisation to deploy.

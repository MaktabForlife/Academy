# Sign-in handover — V107.75

Includes V107.74 (`473a12ea`). The user requested deploying the sign-in improvement when ready on 26 October 2026. Release the existing Academy website and matching Development API; no schema, live record correction, binding or private coordinator change is required.

The early startup script shows a neutral loading screen for stored sessions entering a dashboard. After successful sign-in the same screen bridges the login dialog and actual dashboard. It contains no cached identity, roles or private records. Explicit website visits, About/Contact and deep links retain their destinations. Desktop and phone layouts respect reduced motion.

The verified D1 login/session response already contains current contexts. Admin navigates straight to the existing Admin address, before fetching a personal timetable that would be discarded. Teach and Learn select their existing workspace before the first timetable request. Address selection grants no authority: server-side session/account/revocation and workspace checks remain unchanged. The Admin page still verifies Admin authority independently.

Cold restoration waits for the existing account validation event before fetching its timetable. Initial pageshow no longer repeats the startup validation; overlapping restoration/retry events share the same in-flight request. Returning from the browser history still validates the session. Account changes and sign-out invalidate delayed replies. A temporary account outage retains the existing sign-in/retry controls; a failed timetable load stops the animation and exposes the existing retry.

Local verification covers actual login, slow timetable responses, a cold reload with one session/timetable request, direct Admin entry without a personal timetable request, outage/retry recovery, role priority, explicit website navigation and sign-out during a delayed session response. The real local dashboard browser runner also checks the existing Learn, Teach and scoped Admin tools, snapshot refresh, private data isolation and mobile layouts. Browser traffic outside the local fixture is blocked. No hosted Academy request or SQL query is needed for implementation checks.

Evidence is in `outputs/academy-sign-in-transition-local/` and `outputs/academy-sign-in-10775/` in the project workspace. No claim about hosted elapsed time is made: local checks verify fewer discarded requests and the immediate visual handover. Keep live checks small to limit database usage.

V107.74 integration verification passed 56 focused regression cases, the full local role-dashboard browser runner, the 143-module Academy dependency boundary, and matching website/API builds. The runner's retired assessment heading assertion now checks V107.74's combined Imtihaan/class heading. Desktop, 390px and 320px loading screens were captured; no hosted data is used.

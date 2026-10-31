# V108.8 Academy side

Coordinated feature branch: `feature/academy-studio-integration-1088`. V108.8 is deployed and verified, including native registration, ownership handovers and content activation. Keep live checks small to limit database usage.

Academy continues to own master identities, credentials, sessions/epochs, admission, scoped staff authority, class allocation and published timetables/Zoom. Studio owns transferred Course/MOU material access and participation, managed through the signed native Academy Admin proxy. Preserve existing screens, current acquired rights and43200/43200/60 verification.

The new explicit `courses/register-completed` operation adopts the three confirmed existing Course identities or creates the ten other ready historical Courses. It uses current native Global Admin authority and the management transaction's existing guards. It preserves purchases and creates no timetable, fake date, Zoom link or teaching publication. Registering and transferring ownership are separate operations. Keep the hidden Spending duplicate unchanged.

`programme-studio/register` connects the exact native MOU programme as an independent monthly offering, initially Academy-owned. The existing guarded reconciliation/handover must finish before Studio access management. No old Academy MOU media is imported, and no past paid months are fabricated. The approved separately prepared Baqarah content is imported in Studio after handover.

The Source Core schemas are additive0016 Course publication,0017 monthly programme bridge,0018 completed registrations and0019 trusted Course-policy acknowledgement. The new explicit release flags are `ACADEMY_COURSE_STUDIO_PUBLICATION=1` and `ACADEMY_MOU_STUDIO=1`. All other bindings and flags must match the saved V108.7 preflight.

Use the native Global Admin handover page and reviewed private connection files. Each action is bounded and retryable. New registrations have no implicit ownership activation. Ordinary sign-in should reuse unchanged transferred access facts; active sensitive actions renew only their requested scope. Current model changes must not be overwritten by an old Course draft or timetable publication.

Studio's companion release notes describe the protected content importer and approved updated Spending podcast presentation. Private backups, exact package hashes, local test receipts and deployment evidence belong under the parent project's `outputs/academy-release-1088-20261031`.

V109 domain/DNS launch, unrelated builder changes, pushes and retiring the existing Academy Learn/Teach/Admin screens are outside this release.

## Deployment and activation verification

V108.8 is deployed on the existing Cloudflare addresses. Source runtime934550c1, Worker66dc30f9-bc88-4729-9e23-5edbc9a96493 and Pages4559ae9b-132d-427b-b683-1f35cfea913e; target runtime83a3789 and Workerff02fc61-f459-49f7-8ab1-8598e6c01b27. All41/17 bindings and43200/43200/60 remain intact.

Actual native Global Admin authority completed14 guarded handovers. All13 reviewed Course websites and the independent MOU Baqarah website are published, with59 prepared recordings; MOU has26 recordings and its56 published timetable sessions. Four Courses are paid, including the original Kahf; ten are free. Existing acquisition records, original49 enabled media and old MOU media were preserved. The final read-only postflight checked1072 rows with0 writes and no unresolved access delivery/checkpoint. It excludes the required protocol, schema and publication work.

The public R2 catalogue now contains23 items: its10 original entries are unchanged and13 verified native Course links were added.13 content-addressed public covers are uploaded. Five small unsigned HTTP requests confirmed the display catalogue, one cover and two sign-in denials; the catalogue assertion uses the deployed safe display projection rather than the private storage shape. No daily allowance estimate is implied. Live learner playback, Zoom Join and mobile/audio QA were not exercised; permission and workflow behavior were tested locally.

The user can now prepare UI releases on this baseline. Use the reviewed composition at local-content/release-1088-final/public, never a direct raw public/ deployment: obsolete anonymous Imra’tun content and private author bundles must remain excluded. DNS/V109 launch, screen retirement and Git push remain outside this release. Exact private receipts are under the parent outputs/academy-release-1088-20261031.

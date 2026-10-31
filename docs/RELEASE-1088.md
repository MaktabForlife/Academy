# V108.8 Academy side

Coordinated feature branch: `feature/academy-studio-integration-1088`. Deployment when ready is approved; the current candidate must still pass combined acceptance before publication. Keep live checks small to limit database usage.

Academy continues to own master identities, credentials, sessions/epochs, admission, scoped staff authority, class allocation and published timetables/Zoom. Studio owns transferred Course/MOU material access and participation, managed through the signed native Academy Admin proxy. Preserve existing screens, current acquired rights and43200/43200/60 verification.

The new explicit `courses/register-completed` operation adopts the three confirmed existing Course identities or creates the ten other ready historical Courses. It uses current native Global Admin authority and the management transaction's existing guards. It preserves purchases and creates no timetable, fake date, Zoom link or teaching publication. Registering and transferring ownership are separate operations. Keep the hidden Spending duplicate unchanged.

`programme-studio/register` connects the exact native MOU programme as an independent monthly offering, initially Academy-owned. The existing guarded reconciliation/handover must finish before Studio access management. No old Academy MOU media is imported, and no past paid months are fabricated. The approved separately prepared Baqarah content is imported in Studio after handover.

The Source Core schemas are additive0016 Course publication,0017 monthly programme bridge,0018 completed registrations and0019 trusted Course-policy acknowledgement. The new explicit release flags are `ACADEMY_COURSE_STUDIO_PUBLICATION=1` and `ACADEMY_MOU_STUDIO=1`. All other bindings and flags must match the saved V108.7 preflight.

Use the native Global Admin handover page and reviewed private connection files. Each action is bounded and retryable. New registrations have no implicit ownership activation. Ordinary sign-in should reuse unchanged transferred access facts; active sensitive actions renew only their requested scope. Current model changes must not be overwritten by an old Course draft or timetable publication.

Studio's companion release notes describe the protected content importer and approved updated Spending podcast presentation. Private backups, exact package hashes, local test receipts and deployment evidence belong under the parent project's `outputs/academy-release-1088-20261031`.

V109 domain/DNS launch, unrelated builder changes, pushes and retiring the existing Academy Learn/Teach/Admin screens are outside this release.

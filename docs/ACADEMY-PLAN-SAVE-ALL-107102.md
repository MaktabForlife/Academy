# V107.102 — Save lesson plan requirements together

The user requested page-level saving after V107.101 and explicitly authorised deployment on 27 October 2026. The update stays on `feature/academy-manual-lesson-plans`, based on `3df676f6`.

Admin selects any changed Plans required checkboxes, then presses Save changes once. Checkbox changes make no requests. Discard restores the saved values without writing. Save/Discard disable when there are no changes. A newly enabled row opens its plans after saving. Unsaved selections are kept per account in session storage, survive refresh, and participate in the existing navigation/unload protection. Session reset and account cleanup clear this state.

The requirements endpoint validates all selected rows and current scoped Admin authority before one guarded transaction writes them. One changed or unauthorised row prevents partial saving. The batch has one retry receipt, one audit event and one exact accepted change containing only the selected requirements. Existing single-row requests remain compatible with already-open tabs. The accepted Core view changes only after acceptance, preserving the usual separation from private Admin definitions.

The manual Submit plan button, private teacher drafts, immutable submitted versions, history, course lifecycle permissions, export/sharing and disabled Teach planner gates are unchanged. No schema migration, private coordinator update or live settings/content edits are required by this deployment.

Validation uses synthetic local data: 38 focused backend checks including multi-area acceptance, stale/unauthorised selections, duplicate/invalid input, transaction rollback and idempotent retry; 44 browser checks including no checkbox requests, one Save changes request, Discard, refresh recovery, navigation protection and existing teacher/PDF/image workflows at 320/390/768/1440 widths. Release integrity and matching website/API dry-run builds are checked separately. Hosted verification is limited to deployment metadata, changed static assets, custom-domain HTML and one API readiness call; no real account or live SQL is used.

Evidence: `outputs/academy-plan-save-all/` and `outputs/academy-plan-save-all-107102/` in the task workspace.

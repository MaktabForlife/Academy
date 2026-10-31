# Curriculum and Library UI review

Prepared for the coordinated V109.2 batch. Optimisation owns deployment after the entire UI/recording batch is ready; this checkout performs no standalone release.

Deployable changes are limited to the already-reviewed Curriculum continuation in backend/src/academy/d1/web-platform/dashboard.mjs (Source53bd44af, equivalent to migration55652467) and three native frontend files: academy/subjects/index.html, academy/pdf-reader/index.html and css/m4l-workspace-theme.css. Curriculum retains its native rights, editors and Subjects/Modules/Programs/Courses destinations. Its sheet now has readable spacing and a bounded scrolling table; narrow layouts keep table scrolling inside the sheet. Stale V108.8 page labels are aligned with the existing native V109.1 baseline, pending the release owner's combined version stamp.

Browser review used a disposable Global Admin account: the dashboard's single Manage Curriculum action reached native Curriculum; Subjects and Modules both loaded. The shared Circles shell, compact controls, Caslon headings and DM Sans body styling are present. No subject, module, role or publication was edited.

The missing local Public Library catalogue is a preview transport issue: production uses its existing Pages function, unavailable to this loopback server. Only backend/tools/ workspace preview files and tests supply two explicitly synthetic cards and one synthetic PDF. The exact encoded sample URL is intercepted locally; unknown PDF paths return404, and no Archive content is fetched or imported. Existing publicPdfFile validation remains untouched. Icons and PDF.js static assets are served locally inside the checked Source root. Search and the native reader were verified with page1of1. These adapters, synthetic data and tests are not deployable frontend/runtime assets.

The preview also accepts the new genuine shared/circles-learn-courses.mjs asset and provides one role-aware synthetic adminCourses entry, distinct from the empty purchasedCourses fixture. Ordinary sample accounts receive no Admin entries. This exercises presentation only and grants no access in production.

Seven Source preview/transport/Library tests and five paired Target navigation/dashboard checks passed with zero skips. Target renderer/composition checks also passed. Review images and combined receipt: project outputs/academy-dashboard-compact-review-20261031. The real hosted dashboard's earlier503 remains a separate incident and is not claimed resolved by these local changes.

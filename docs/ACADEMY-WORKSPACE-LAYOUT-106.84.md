# V106.84 — Learn and Teach layout

Both Learn and Teach apply the marked screenshot changes:

- The Programs and Courses panels extend farther left on desktop, using a smaller heading column. Individual Program/Course workspace proportions remain unchanged.
- The Academy name uses the same uppercase eyebrow treatment as **Across the Academy**. LEARN and TEACH use the same Georgia typeface, size and weight as **My Timetable**.
- The marked “Select a lesson for details…” sentence is hidden in Learn and Teach. Lesson selection and joining behaviour remain available.
- Phone and tablet layouts retain stacked heading, Programs and Courses blocks.

This release changes presentation and version labels only. It deploys on the existing `development` branch with the existing Development API and storage.

Verification: the entrance, shared navigation and release-integrity checks pass. Sixteen packaged browser checks cover Learn and Teach for Global Admin and teacher accounts at 390px, 1000px, 1440px and 2048px. Computed typography matches both timetable headings; panels fit without horizontal overflow and the helper sentence is hidden. Upcoming Course week selection and planning shortcuts still work. Worker and Pages bundles compile successfully.

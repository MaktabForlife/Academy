# Public homepage design review — 4 November 2026

This isolated review uses the Academy’s approved tan, bottle green, sage and cream palette. It does not change the live homepage, dashboard, login, timetable authority, access rights or publication system.

The independent page is `portal/circles/homepage-review.html`, scoped to `.flow-review`, without live API requests.

## Owner’s latest arrangement

The announcements banner follows the owner’s supplied mockup:

- Left: a complete cream timetable/course card inside a bottle-green frame. All six course tabs belong to this card and fit within its width, with a readable wrapped grid on smaller screens.
- Right: an independent 2027 enrolments lockup, full-prospectus action and typed WhatsApp/email/website contact strip. This panel does not change when a course tab is selected.
- The selected course shows its English name, typed Arabic where available, description, known schedule and fee facts. Unknown details remain unconfirmed.
- Retain the central welcome circle and four pathways, same-page course selection, general Bootcamp/prospectus news, learning and contact flow.
- Keep the separate bottom timetable removed.
- Support Arrow, Home and End navigation with stable focus.

## Prospectus remains on the owner’s Mac

The owner selected the **second** attachment, `2027 prospectus copy.pdf`. Read-only checks confirmed a seven-page, unencrypted PDF, 787,282 bytes, SHA-256 `cd0702e7c5d30eb141076923f713c376cbdca3aab7c89dc178dfa0f2bbc05632`.

Automatic approval review rejected uploading that PDF into this public GitHub repository. No PDF bytes were uploaded, no media record was created and neither supplied PDF was edited.

The downloadable standalone preview links to `../2027%20prospectus%20copy.pdf`, the existing second PDF beside the extracted review folder in Downloads. Under HTTP, the review-only prospectus link is disabled, rather than exposing a local path or pretending a public PDF exists. This local review link must not be copied into production. Final integration must resolve the exact existing full-PDF attachment from Academy Admin Announcements, as the owner requested. Do not substitute the older 2026 PDF or the HTML flyer catalogue.

## Facts and authority

Course copy is draft material from the existing 2027 catalogue and earlier owner-supplied flyers. Admin must confirm all facts before publication. Flyer-derived dates/fees are presentation only: they provide no native session, Join link, subscription or access authority.

The Studio courses link resolves from `AcademyHosting.studioOrigin`. No hosting config or backend server origin is changed.

## Cloud review only

The review branch overrides its copy of `paired-check.yml` with a manual, read-only design job. Default-branch workflows are unchanged. Dispatch only against `review/public-home-flow-20261104`; exclude that workflow override from production integration.

Disposable GitHub runners perform native boundary checks, a Pages build without deployment and browser checks against synthetic data. Checks cover all course panels, stable keyboard focus, independent right enrolments, left-card tab bounds, no overflow at 320–1920 px, enlarged rendering, general news counts/escaping and standalone HTML behaviour. Review artifacts contain images, HTML, instructions and evidence, without the supplied PDFs. No Mac files are written.

After separate design/integration approval, connect the UI to the existing Admin builder and published cached snapshots, including cached empty results. Keep editing and publication explicit and avoid per-tab/per-card requests.

## References

- [Lilian Cannam Kindergarten](https://www.liliancannamkindergarten.org.au/): joined folder-like tabs and shared course panel.
- [Benchmark Education](https://www.benchmarkeducation.com/): headline, summary and supporting visual.
- Owner’s 4 November mockup: left course card, right enrolments/prospectus/contact composition.

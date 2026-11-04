# Public homepage design review — 4 November 2026

This isolated review explores a single-page public flow with the Academy’s approved tan, bottle green, sage and cream palette. The current homepage, dashboard, login, timetable authority, access rights and publication systems remain unchanged.

The independent page is `portal/circles/homepage-review.html`, scoped to `.flow-review`. It makes no live API requests.

## Review behavior

- Retain the central welcome circle and four programme pathways.
- Put one joined card inside announcements, with six attached, rounded course-name tabs.
- Describe each course in the shared panel, with learning rhythm, delivery format, known day/time and fee facts, enquiry and original flyer links.
- Keep tab controls in place when the panel changes. Support Arrow, Home and End keys with stable keyboard focus.
- Link the welcome pathways and programme overview to the corresponding tab inside announcements.
- Keep general Bootcamp and prospectus news below the course card, with readable expanded details.
- Remove the separate bottom timetable section and its navigation link at the owner’s request.
- Preserve the public learning and contact flow.

The data module contains draft copy from the existing 2027 prospectus and owner-supplied Mothers of the Ummah, Tafseer and Tadabbur and Surah Al-Kahf flyers. Unconfirmed days, times and fees are labelled honestly. Admin must confirm draft facts before publication. The Bootcamp end date is calculated from four weekly Sundays beginning 18 October 2026. These draft fields provide no actual session, Join link, subscription or access authority.

The Studio courses link resolves from `AcademyHosting.studioOrigin`. Each programme has its own explicit `flyerUrl`.

## Cloud review only

The review branch overrides its copy of the registered `paired-check.yml` with a manual, read-only design-review job. The default branch workflow is unchanged. Dispatch this workflow only against `review/public-home-flow-20261104`. Exclude the workflow override from any production integration.

The job installs dependencies on a disposable GitHub runner, checks native portal boundaries, builds the actual Academy Pages assets without deployment and tests the interface against synthetic data using a loopback static server. Checks cover all six course panels, keyboard navigation, same-page links, removal of the bottom timetable, zero/one/five general announcements, escaped editable titles and 320–1920 px layouts. It also verifies a self-contained HTML preview with its CSS, fonts and scripts embedded.

Artifacts contain the standalone preview, screenshots and JSON evidence; the complete public package is separate. There are no production secrets, deployment steps, live account calls or content publication. No Mac files are written.

## References and integration

- [Lilian Cannam Kindergarten](https://www.liliancannamkindergarten.org.au/): joined rounded tabs and a shared descriptive panel.
- [Benchmark Education](https://www.benchmarkeducation.com/): clear headline, supporting copy and visual.
- Existing Academy 2027 prospectus catalogue and owner-supplied flyers: course names and draft facts.

After design approval, connect this presentation to the current Admin announcement builder and published, cached public snapshots. Keep editing and publication explicit. An empty published snapshot is also cacheable. Never fetch per tab/card or derive live sessions, Join availability or access rights from flyer copy.

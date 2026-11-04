# Public homepage design review — 4 November 2026

This isolated review explores a single-page public flow with the Academy's existing tan, bottle green, sage and cream palette. The current homepage, dashboard, login, timetable authority, access rights and publication systems are unchanged.

The review page is `portal/circles/homepage-review.html`. Its presentation is scoped to `.flow-review`. No live API is called.

## Review behavior

- Keep the central welcome circle and four programme pathways.
- Present announcements as readable headlines, summaries, key facts and a supporting visual. Show full details inline and navigate between announcements.
- Present all six programmes from the existing 2027 prospectus.
- Select a programme to see its learning rhythm, day/time panels, delivery format, fees and contact link.
- Use same-page links from announcements and programme cards to the appropriate timetable.
- Preserve the public learning and contact flow.

The data module contains draft copy extracted from the supplied Mothers of the Ummah, Tafseer and Tadabbur and Surah Al-Kahf flyers. Other course days, times and fees are left unconfirmed. MOU and Tafseer facts must be checked by Admin before publication. The Bootcamp end date is calculated from four weekly Sundays beginning18October2026. None of these draft fields supplies an actual session, Join link, subscription or authority.

## Cloud review only

The review branch replaces its copy of the already-registered `paired-check.yml` with a manual read-only design-review job. It does not change the canonical workflow or run the migration importer. Dispatch that workflow only against this exact review branch.

The job installs dependencies on GitHub, checks the native portal boundaries, builds actual Academy Pages assets with Wrangler dry-run, and exercises programme tabs, keyboard navigation, announcement counts, escaped titles and320–1920px layouts using a loopback static server. It uploads the built assets, standalone review HTML, screenshots and JSON evidence. It has no production secrets, deployment step, live account calls or content publication. No Mac files are written.

## References

- [Lilian Cannam Kindergarten](https://www.liliancannamkindergarten.org.au/): programme selector and session timetable grouping.
- [Benchmark Education](https://www.benchmarkeducation.com/): clear headline, supporting copy, visual and single action.
- Existing Academy2027prospectus catalogue and owner-supplied flyers: course names and draft content.

After design approval, integrate the presentation with the current Admin announcement builder and published public programme facts. Keep all real editing, review and publication explicit.

The prototype resolves its Studio courses link from AcademyHosting.studioOrigin and keeps a separate flyerUrl on each programme. Announcement controls retain keyboard focus after redraw; browser checks cover repeated Enter activation and Space on a choice control.

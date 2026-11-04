# Approved 2027 homepage integration

The owner approved deployment of the reviewed homepage on 4 November 2026. The design is preserved from review commit 2bed5ddd35f46a4b9f8d6b943c310c6dd887de12.

## Native presentation

- Keep the native homepage, dashboard, login, green course/memorisation rails, announcement builder and current authority.
- Display the approved left programme/timetable card and independent right 2027 enrolments/prospectus/contact panel only when the checked published snapshot supplies the configured announcement and a valid native public PDF URL.
- Course selection changes only brochure text. It makes no request and creates no session, Join eligibility, enrolment/access rights or Teacher attribution.
- Other public notices retain the existing common display and detail dialog. The right title opens the builder's saved full message.
- Empty or withdrawn publications remain empty. Local documents, private/draft URLs and fixture rows cannot serve as production fallbacks.
- The first-publication legacy presentation is retained until the authorised publication is activated.

## Catalogue facts

The six existing 2027 catalogue entries are enriched with marketing-only days, times, fees and typed Arabic from the owner's selected seven-page prospectus. Existing catalogue IDs, flyer references and general detail fields are retained. The native timetable and access systems do not consume this marketing object.

## Exact binding and content prerequisite

The configured record is 927e3eed-43b9-4fa2-a993-d640f9c69a51. The authorised Admin UI identifies it as “2027 Enrolments are open for current students”, with an attachment named “2027 Prospectus.pdf”. The Live/PUBLISHED label while publicGeneration is0 does not prove public attachment availability.

The owner selected the second supplied PDF: seven pages,787282bytes, SHA256 cd0702e7c5d30eb141076923f713c376cbdca3aab7c89dc178dfa0f2bbc05632. No PDF bytes are in GitHub. Its identity and an authority-supplied published PDF URL remain separate live-release prerequisites.

The native reader's existing announcement query maps only to /api/academy/announcements/pdf?id=...; it has no private-draft contract. The new homepage uses the exact checked V2 public snapshot asset URL instead of guessing or rewriting that route.

Any attachment replacement and first-snapshot publication must be explicit and manual through the authorised Admin flow. First publication can replace notices, so preserve/review the Bootcamp. The code build does not Save, Publish, upload or activate anything. Do not substitute an older PDF, HTML page, local file, private URL or GitHub blob.

Subsequent explicit Admin-published revisions remain authoritative. The initial second-PDF identity check is a release prerequisite, not a permanent browser-side lock overriding later Admin publication.

## Read impact and checks

The existing cached public collection is reused for all tabs. No per-tab/card, account, permission or native timetable call is added. Static asset changes add no database queries; native PDF visibility remains authoritative on click.

Focused unit tests cover public asset selection, withdrawal/empty clearing, replacement, escaped content, stable tabs, existing notices and collection reuse. GitHub-only browser checks load the actual built native styles/modules against intercepted synthetic feeds for 320–1920px, empty/legacy states and detail-dialog behaviour. They have no hosted requests or real PDF bytes.

Existing paired and announcement checks also run. All source preparation is on a focused GitHub branch from the verified Academy baseline, without Mac file changes. Root coordinates the paired version and final deployment after the tested handoff and concrete public binding.

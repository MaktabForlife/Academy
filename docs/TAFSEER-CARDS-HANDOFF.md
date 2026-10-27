# Tafseer cards — local presentation handoff

The Website chat owns the card layout and summaries. The Tafseer chat supplies each access destination and its existing Tafseer identifier. This change is local and has not been published or deployed.

## Deployment handover received

V107.105 was deployed and verified by the Tafseer chat, which handed over commit `56e87389098dcb5da34ddbac87918de289880f34`. It has been merged into `feature/academy-course-website-builder`. The user explicitly authorised attaching the supplied links and completing deployment after this handover. Prepare the combined card/table release as V107.106. Preserve the monthly access controls, retained lesson recording namespace and V107.104 absentee jobs; no migration, reseeding or real website publication is included.

Cards appear on the public Academy website and Learn, Teach and Admin dashboards. Per the user's later instruction, public restricted cards and dashboard cards without a supplied eligible link open the editable **Contact Admin to receive access** popup. Foundations remains first and public, with its real reading destination available only after explicit website publication. No fabricated destination or protected course bypass is assigned.

## Admin card table

Open **Admin → Programs → Tafseer → Public card**. Timetable settings are in the left block; the matching right block contains the Surah website cards table. Admin can use the original Tafseer summaries as a starting point, add rows, edit titles/Arabic/summaries/contact-popup text, upload optional PNG/JPEG/WebP images up to 5 MB, and arrange or hide cards. One **Save table** saves the complete table; additions, field edits and image selection alone make no server writes. Discard restores the saved table. Timetable changes save independently.

The table uses `program_settings.public_card_json.websiteCards`, preserving existing timetable fields. Images use immutable SHA-256 keys under `dev-split-v1/public-website-cards/` in the existing **private** lesson-media bucket, outside the recording expiry prefix. Uploading a file does not publish it. Only image references in the accepted, visible card table can be served from the public image route. Current scoped Admin/session guards, optimistic revisions, exact retries and the existing acceptance process apply to table saves. No schema or coordinator upgrade is required.

New cards get stable references; the Lesson media → Surah websites → Website card dropdown includes the saved table's cards. Admin still enters actual completion dates, associates cards with real surahs and explicitly publishes each website. Paid-month rights and lesson media are separate. Linking `foundations` explicitly marks that published website and its referenced files as public; other direct public website/file requests are denied.

## Stable card identifiers

The user's latest instruction places **Foundations of Tafseer first in every view** and makes that module **open to all**. Its catalogue metadata is `access: "public"` and its card displays “Open to all”. The Tafseer integration must supply its public destination and permit public reading, without requiring login or a Tafseer subscription. This metadata records the requirement; it does not change backend permissions by itself. Other modules retain the access rules supplied by the Tafseer integration.

| ID | Card |
| --- | --- |
| `foundations` | Foundations of Tafseer and Ulumul Qur’an — open to all |
| `yaseen` | Surah Yaseen |
| `saffat` | Surah As-Saffat |
| `ankabut` | Surah Al-Ankabut |
| `luqman` | Surah Luqman |
| `muzammil` | Surah Al-Muzzammil |
| `qasas` | Surah Al-Qasas — selected passages |
| `sajdah` | Surah As-Sajdah — selected reflections |

Titles may be edited without changing these IDs. The complete card copy is exported to `cards-for-tafseer.json` by the preview builder.

## Attach destinations

The shared presentation API is `window.M4L_TAFSEER_CARDS.mount(host, {context, links})`. Context is `public`, `learn`, `teach` or `admin`. Links are keyed by the stable IDs above. Each eligible value can be a URL string or `{href, code, label, visible}`. A supplied scoped link represents access; `canAccess: false` explicitly denies it. `code` is optional and is rendered as `data-tafseer-code`; `visible: false` omits a card in that context.

For the public page, provide `window.M4L_TAFSEER_PUBLIC_LINKS` before the component loads, or remount `tafseer-public-cards` after resolving the destinations. For authenticated dashboards, provide `home.tafseerLinks` in the scoped dashboard data, or `tafseerLinks` in its open options. The dashboard remounts with the current data each time; the component retains no account-specific link cache.

The Tafseer integration owns the real code-to-page mapping, login return destination, visibility decisions and reader/asset permission checks. Only approved public summaries belong on the public website. Neither a supplied URL nor a displayed identifier establishes permission to read protected material.

Internal same-origin paths and HTTPS URLs are supported. Real protected destinations come from `home.tafseerLinks` or the normal authenticated Tafseer-links endpoint. The shared access adapter retains its account/workspace reset and late-response guards and delegates card action rendering to the shared component. Public marketing cards do not reuse protected destinations. Published Foundations uses the dedicated public reader and checks current active association, accepted content and enabled state on every read/download.

## Files and review

- `js/m4l-tafseer-cards.js`: shared summaries, card markup and destination slots.
- `css/m4l-tafseer-cards.css`: responsive card styles.
- `academy/index.html`: public section and shared assets.
- `academy/admin/index.html`: shared dashboard assets.
- `js/m4l-academy-dashboard.js`: card placement in all three dashboard modes.
- `backend/tools/tafseer-cards-preview.mjs`: creates a standalone local HTML review and the JSON handoff.

Generate a local review with `node backend/tools/tafseer-cards-preview.mjs <output-directory>`. This writes files only; it does not start a server or deploy anything. The existing restriction on automated local browser checks remains in effect. Browser visual review is pending.

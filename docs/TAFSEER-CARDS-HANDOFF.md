# Tafseer cards — local presentation handoff

The Website chat owns the card layout and summaries. The Tafseer chat supplies each access destination and its existing Tafseer identifier. This change is local and has not been published or deployed.

## Deployment handover pending

On 27 October 2026 the user said the Tafseer chat is deploying access control and will hand over to this chat to complete deployment. Keep the cards local until that handover arrives. This authorises completing the combined release after the handover; it is not an instruction to interrupt the access-control deployment or deploy the cards ahead of it.

Use the handover's deployed version and commit as the baseline, preserve its access-control changes, attach its confirmed card destinations, run the relevant combined checks, and complete the website/dashboard release through the existing deployment workflow. Confirm the supplied link map, source branch/commit, deployed version and affected targets from the handover before preparing the release. Do not message the other chat unless the user separately authorises it.

The same component appears on the public Academy website and the Learn, Teach and Admin dashboards. An unset destination displays **Coming soon** without a clickable link. The component does not create routes, grant course access, or infer access from a card title.

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

The shared presentation API is `window.M4L_TAFSEER_CARDS.mount(host, {context, links})`. Context is `public`, `learn`, `teach` or `admin`. Links are keyed by the stable IDs above. Each value can be a URL string or `{href, code, label, visible}`. `code` is optional and is rendered as `data-tafseer-code`; `visible: false` omits a card in that context.

For the public page, provide `window.M4L_TAFSEER_PUBLIC_LINKS` before the component loads, or remount `tafseer-public-cards` after resolving the destinations. For authenticated dashboards, provide `home.tafseerLinks` in the scoped dashboard data, or `tafseerLinks` in its open options. The dashboard remounts with the current data each time; the component retains no account-specific link cache.

The Tafseer integration owns the real code-to-page mapping, login return destination, visibility decisions and reader/asset permission checks. Only approved public summaries belong on the public website. Neither a supplied URL nor a displayed identifier establishes permission to read protected material.

Internal same-origin paths and HTTPS URLs are supported. No placeholder production URL is assigned in this change. Existing course websites, sessions and permissions are unchanged.

## Files and review

- `js/m4l-tafseer-cards.js`: shared summaries, card markup and destination slots.
- `css/m4l-tafseer-cards.css`: responsive card styles.
- `academy/index.html`: public section and shared assets.
- `academy/admin/index.html`: shared dashboard assets.
- `js/m4l-academy-dashboard.js`: card placement in all three dashboard modes.
- `backend/tools/tafseer-cards-preview.mjs`: creates a standalone local HTML review and the JSON handoff.

Generate a local review with `node backend/tools/tafseer-cards-preview.mjs <output-directory>`. This writes files only; it does not start a server or deploy anything. The existing restriction on automated local browser checks remains in effect. Browser visual review is pending.

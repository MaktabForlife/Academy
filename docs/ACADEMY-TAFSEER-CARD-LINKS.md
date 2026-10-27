# Tafseer website card handover — V107.105

The website owns card layouts and short summaries. Tafseer owns the manual completion table, monthly subscriptions and destination permissions. Base the card release on V107.105 or a descendant so these access checks remain deployed.

## Admin setup

In Admin → Programs → Tafseer → Lesson media → Surah websites, enter a surah name, its actual completion date and the matching **Website card**. Save the table, build the website and explicitly publish it. The completion date is independent of lessons and PDF uploads. Students with that calendar month checked in the activated Monthly subscriptions register keep access after renewal or enrollment ends.

Stable keys matching the website chat's cards:

| Card key | Card |
| --- | --- |
| `yaseen` | Surah Yaseen |
| `saffat` | Surah As-Saffat |
| `ankabut` | Surah Al-Ankabut |
| `luqman` | Surah Luqman |
| `muzammil` | Surah Al-Muzzammil |
| `foundations` | Foundations of Tafseer |
| `qasas` | Surah Al-Qasas |
| `sajdah` | Surah As-Sajdah |

These are associations, not hard-coded entitlements. No real dates, subscriptions or content are seeded by deployment. No public/shared bypass link exists.

## Card destinations

The existing `/api/academy/entrance` response includes **`tafseerLinks`**. Pass this directly into the website renderer:

```js
M4L_TAFSEER_CARDS.mount(host, {context, links: home.tafseerLinks || {}});
```

Each eligible entry is keyed by the stable card key:

```js
{yaseen: {href: '/academy/course-websites/view/?program=<ProgramID>&surah=<SurahUUID>', label: 'Open lessons', code: '<SurahUUID>'}}
```

The same map is returned as `links` by **POST `/api/academy/tafseer-links`**, with the current Bearer token and `X-Academy-Workspace` header. It also returns an eligible `websites` list. Use the app's existing fetch wrapper. Guests have no links; unauthenticated direct requests return 401. Personal Learn, Teach and Admin surfaces use the real account's paid months; Admin reader previews retain their existing scoped authority. Normal scoped staff access is preserved.

The deployed link-only adapter `/js/m4l-tafseer-access.js` is already included on the home/dashboard hosts. It recognises the website renderer's `[data-tafseer-card] [data-tafseer-link]` markers, attaches eligible destinations, keeps summaries/design intact and clears them on account/workspace changes. `M4L_TAFSEER_ACCESS.setLinks(home.tafseerLinks)` reuses home data. It requests the map only if cards are present and no map has been supplied, once per account/workspace. No polling is needed. The website can pass the map directly to its renderer as above.

Keep the existing disabled “Coming soon” control when a key is absent. Do not put real protected destinations in `M4L_TAFSEER_PUBLIC_LINKS`, browser storage or a static public map. Direct page and asset requests recheck the live completion date, paid month, publication and account permissions.

Lesson recordings and PDFs continue to use their parent lesson's paid month, including later uploads. A surah website entitlement does not grant access to lesson media from other months.

## Release boundaries

V107.105 includes additive Core monthly subscriptions and surah tables, Admin website drafts/assets, the compatible coordinator, API feature flag and website access adapter. Admin must prepare/review/activate the real register and populate/publish real surahs; deployment does not perform these data actions.

The website card deployment must preserve V107.104 weekly absentee jobs and V107.105 subscription/media/website checks, the configured database IDs, feature flag, retained recording namespace and current accepted heads. No further migration or reseeding is needed for card presentation.

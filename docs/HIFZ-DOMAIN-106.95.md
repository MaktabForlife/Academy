# V106.95 — Academy-branded Hifz development address

Academy's two matching frontend configuration files use `https://hifz.maktab4life.org/`. The existing Hifz Program selector and account login-ID link construction are unchanged.

The hostname belongs to the Academy DNS zone and is associated with the Hifz account's existing `hifzhelper-dev` Pages project, released from `dev`. Its CNAME points directly to `hifzhelper-dev.pages.dev`. Hifz V4.2.15.30 explicitly selects the Hifz development API for the new hostname, including when browser storage is blocked.

Academy serves no Hifz proxy. Ordinary journal requests continue to go directly to the separate Hifz Worker/database. Profile delivery remains Academy-owned; PIN formats, PIN confirmation and journal ownership are unchanged. No migration, credential reset or production deployment is required.

Release order: publish the matching Hifz frontend, associate the Pages hostname and configure its DNS, verify HTTPS and the development API, then publish Academy's new links.

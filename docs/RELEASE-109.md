# V109 Academy connection

This feature branch changes only `WEBSITE_PLATFORM_ORIGIN` from the Studio Cloudflare address to `https://maktab4life.org` in both copies of the existing release configuration. Academy runtime, frontend, API origin, all other bindings, roles, tables, schedules and media remain unchanged. No Source Pages rebuild or database migration is needed.

The paired implementation and full approval/cutover/rollback instructions are in [Studio RELEASE-109.md](../../AcademyStudio-launch-109/docs/RELEASE-109.md). Do not activate this configuration on its own: the branded routing/Studio release must be ready first. Preserve Source41/Target17 bindings and43,200/43,200/60. Work is local and not deployed; the separate domain-cutover approval is still required by the agreed roadmap.

Keep live checks small. Use saved V108.8 migration/rights evidence and the paired V109 synthetic local acceptance. Current hosted versions/routes must be checked once after operator authentication renewal before an approved cutover. No hosted SQL or app load is required for preparation.

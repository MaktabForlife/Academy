# V106.90 — Academy development domain

- Repository: https://github.com/MaktabForlife/Academy, branch `development`.
- Website project: `academy-maktab4life`, Git-connected to Academy, output `.academy-pages`.
- Build: `npm --prefix backend ci && node backend/tools/academy-pages-build.mjs`, repository root.
- Domains: `maktab4life.org`, `www.maktab4life.org`; root redirects to `/academy/`.
- API: existing `devrebootworker`, Git-connected to Academy, root `backend`, deployment `npm run deploy:development`.
- Website host selection and API allowed origins include the Academy Pages site and both domain names. Unknown domains cannot select an API.
- Development keeps its existing D1 database, R2 buckets, Durable Object, secrets and scheduled refresh. No database migration or profile copy is required.
- The current profiles remain test data. Future production must use a fresh database and separate Workers/storage; it must not import these test profiles.
- Legacy Reboot remains separate. The prior development Pages URL is retained; new work is pushed to Academy.

Validation: packaged host-routing tests, Academy boundary check, Worker dry run, Git deployment and live domain/API checks.

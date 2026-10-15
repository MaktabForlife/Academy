# Academy Development branch switching V106.63

The existing `devrebootworker` and `maktab-development.pages.dev` can run either `feature/academy-review-fixes-10660` or `development`. Both use the existing `maktab-academy` D1 database. Testing edits remain when the deployed branch changes. The feature is not merged into Development by this setup.

## Worker

Keep the Git build root at `backend` and deploy with `npm run deploy:development` (equivalent to `npx wrangler deploy --env development --keep-vars`). Both branches already contain this command. The feature branch now selects `src/academy-worker-runtime.js` in the Development environment. The older branch selects its own previous entrypoint. The Worker name, D1 ID, three R2 buckets, authentication secrets, rate limiter, Durable Object class and migration identity stay attached to their existing resources. The feature also enables its cache-recovery trigger every 15 minutes.

Before the first feature deployment, add `ACADEMY_OPEN_LIBRARY_STORAGE_KEY` with the exact value `<existing PLATFORM_SPREADSHEET_ID>:open-library-metadata`. Keep the original `PLATFORM_SPREADSHEET_ID` and other older runtime settings until the old branch is retired. The neutral key may be a runtime variable or secret. Adding it as a secret preserves it automatically across both branches' deployments. Never substitute the isolated preview's namespace. `academy-development-settings.mjs` validates the old and new plaintext keys without contacting Google.

Retain `ACADEMY_D1_MODE=ACTIVE`, `ACADEMY_LIBRARY_MODE=PUBLIC_ONLY`, the existing run ID, both authentication secrets and the current allowed website origins. No accounts are reseeded, no secrets are rotated and no schema migration runs as part of switching code.

## Website

Keep the Pages project `maktab-development`, build root blank, and set its output directory to `.academy-pages`. Store the command exported as `developmentPagesBuildCommand` by `backend/tools/academy-pages-build-command.mjs` in the Pages build-command field. Print the complete command from the repository root with:

```sh
node --input-type=module -e "import {developmentPagesBuildCommand} from './backend/tools/academy-pages-build-command.mjs'; console.log(developmentPagesBuildCommand)"
```

On the feature branch, this installs the locked build tools and builds the Academy allowlist with a dedicated Development frontend configuration and bundled Pages Worker. Development and preview hostnames call `devrebootworker`, and unknown/production hostnames have no fallback. The website health endpoint `/api/site/health` identifies the built branch and correctly reports `syntheticOnly: false`.

On the older Development branch, where the new builder does not exist, the same saved command packages its tracked public website and Functions into `.academy-pages`. It excludes backend source, documentation, hidden files and synced references. It does not require changes to the Development branch.

The separately packaged isolated preview continues using `academy-feature-10660`, its synthetic database and its own frontend configuration. Changing the Development build settings does not change that already published preview.

## Switch and verify

1. Select the desired branch in the Worker Git build settings and the Pages production-branch setting. For this development Pages project, “production branch” means its stable website address; it does not merge Git branches.
2. Run a fresh deployment for both after changing the settings. Saving a branch setting is not a completed deployment. Wait for both builds to succeed.
3. Check the website and API versions match, sign in using an existing account, and check the public Library. Keep testing edits deliberate: both branches use the same database.
4. To return to Development, select `development` in both settings and deploy both. Switching code does not restore an earlier database snapshot.
5. After acceptance, merge the reviewed feature into `development` and leave both deployments following `development`.

Older and newer code must remain compatible with shared data. Future breaking schema changes need a separate migration and rollback plan. Never restore an old data backup merely to switch application branches.

## Later production database

The current database stays in place for now. Creating the new production database and copying current data are separate, future work. That migration must also account for R2 files, Durable Object Library metadata, resource references, authentication and the final website/API addresses. No new production database or data copy is created by V106.63.

## Validation

Focused checks cover stable and preview frontend routing, unknown-host rejection, the old-branch Pages fallback, exact storage identities, Library key agreement, and signed-in sessions plus metadata revisions across old/new runtime switching. Both deployment artifacts are built locally; the Development Worker bundle is checked to exclude Google backend clients. Deployment and verification results are recorded separately from these instructions.

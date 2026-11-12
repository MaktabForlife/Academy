// Default export is intentionally inert: no asset paths or native routes.
// A future reviewed package must supply an exact committed static manifest.
import {createLocalIntegrationEntry} from './academy/jwt-local-integration-entry.mjs';
export default createLocalIntegrationEntry();

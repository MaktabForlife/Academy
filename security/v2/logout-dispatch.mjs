import {requireThat, safeInt, uuid} from './codec.mjs';

export function logoutDispatchEnabled(env) {
 return env.UAA_V111_LOGOUT_DISPATCH === '1';
}

// A successful RPC means the operation has a durable wake-up before D1 can
// commit. The browser never receives or supplies the commit deadline.
export async function armLogoutDispatch(runtime, operationId) {
 if (!logoutDispatchEnabled(runtime.env)) return undefined;
 const boundary = runtime.settings.raw.offlineUpdate;
 requireThat(uuid(operationId) && boundary && safeInt(boundary.generation, 1)
  && runtime.env.UAA_LOGOUT_DISPATCH, 'LOGOUT_DISPATCH_UNAVAILABLE', 503);
 const dispatch = runtime.env.UAA_LOGOUT_DISPATCH.getByName(operationId);
 const expiresAt = await dispatch.arm(operationId);
 requireThat(safeInt(expiresAt, 1), 'LOGOUT_DISPATCH_UNAVAILABLE', 503);
 return {expiresAt, generation: boundary.generation, releaseId: boundary.releaseId, namespace: runtime.settings.prefix};
}

export async function watchAcceptedLogout(runtime, receipt, precedingOperation) {
 if (receipt !== precedingOperation) await armLogoutDispatch(runtime, receipt);
}

export async function logoutDispatchProgress(runtime, operationId, expiresAt) {
 // Read on the owning primary. The cutoff transaction uses the same SQL clock
 // as this observation, so a cutoff can't appear after an expired empty read.
 return runtime.store.first(
  "SELECT unixepoch('now')>=? AS expired, o.operation_id, w.state AS local_state, "+
  "(SELECT count(*) FROM jwt_v2_outbox e WHERE json_extract(e.event_json,'$.operationId')=o.operation_id) AS delivery_count, "+
  "(SELECT count(DISTINCT e.target_app) FROM jwt_v2_outbox e WHERE json_extract(e.event_json,'$.operationId')=o.operation_id AND e.target_app IN('studio','hifz') AND e.state='APPLIED') AS confirmed_count, "+
  "(SELECT min(e.next_attempt_at) FROM jwt_v2_outbox e WHERE json_extract(e.event_json,'$.operationId')=o.operation_id AND e.state='PENDING') AS next_delivery "+
  "FROM (SELECT 1) anchor LEFT JOIN jwt_v2_operations o ON o.operation_id=? "+
  "LEFT JOIN jwt_v2_worksets w ON w.work_id=o.operation_id",
  expiresAt, operationId);
}

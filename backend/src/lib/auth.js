import { readGoogleSheetValues } from "./google-sheets.js";
import { json } from "./http.js";
import { accessibleGlobalSubjectIds } from "./global-subject-delivery.js";
import {
  getPlatformSpreadsheetId,
  readPlatformSheet,
  readPlatformSheets,
  resolveActiveCourseRegistration
} from "./platform-sheet.js";
import {
  isActivePlatformValue,
  normalizePlatformIdentifier
} from "./platform-schema.js";
import { getRequestAuthUser } from "./request-context.js";
import { readProgramRoleAccounts } from "../profiles/program-roles.js";
import { programService } from "../programs/service.js";
import { sheetsProgramRepository } from "../programs/sheets-repository.js";

import { createSessionToken, verifySessionToken, hashPin, createSaltedPinHash, verifyPin, isSaltedPinHash, isValidFourDigitPin, createAuthRateLimitKey, normalizeWhatsapp6, CREDENTIAL_SESSION_VERSION, createCredentialVersion, constantTimeEqual } from './auth-primitives.js';
export { createSessionToken, verifySessionToken, hashPin, createSaltedPinHash, verifyPin, isSaltedPinHash, isValidFourDigitPin, createAuthRateLimitKey, normalizeWhatsapp6 } from './auth-primitives.js';

export async function requireAdminOrSenior(request, env) {
  const authUser = await getAuthUser(request, env);

  if (!authUser || authUser.type !== "admin") {
    return {
      ok: false,
      response: json({ success: false, error: "Unauthorized" }, 401)
    };
  }

  if (authUser.role !== "ADMIN" && authUser.role !== "SENIOR") {
    return {
      ok: false,
      response: json({ success: false, error: "Forbidden" }, 403)
    };
  }

  return {
    ok: true,
    user: authUser
  };
}

export async function requireSystemAdmin(request, env) {
  const authUser = await getAuthUser(request, env);

  if (!authUser || authUser.type !== "admin") {
    return {
      ok: false,
      response: json({ success: false, error: "Unauthorized" }, 401)
    };
  }

  if (authUser.role !== "ADMIN") {
    return {
      ok: false,
      response: json({ success: false, error: "Forbidden" }, 403)
    };
  }

  return {
    ok: true,
    user: authUser
  };
}

export async function requireResourceCreator(request, env) {
  const authUser = await getAuthUser(request, env);

  if (!authUser || authUser.type !== "admin") {
    return {
      ok: false,
      response: json({ success: false, error: "Unauthorized" }, 401)
    };
  }

  if (!["ADMIN", "SENIOR", "TEACHER"].includes(authUser.role)) {
    return {
      ok: false,
      response: json({ success: false, error: "Forbidden" }, 403)
    };
  }

  return {
    ok: true,
    user: authUser
  };
}

export async function getAuthUser(request, env, {allowProgram=false}={}) {
  const requestUser = getRequestAuthUser(request);
  if (requestUser) return requestUser;

  const auth = request.headers.get("Authorization");

  if (!auth || !auth.startsWith("Bearer ")) {
    return null;
  }

  const token = auth.replace("Bearer ", "").trim();
  const payload = await verifySessionToken(token, env);

  if (!payload) {
    return null;
  }

  // Central V102 account tokens are always revalidated. The legacy feature flag
  // remains only for the pre-V102 admin/student sessions during staged cutover.
  if (payload.type === "account") {
    return validateCredentialBoundSession(payload, env, {allowProgram});
  }

  if (!requiresCredentialBoundSessions(env)) {
    return payload;
  }

  return validateCredentialBoundSession(payload, env, {allowProgram});
}

/*
 * Legacy V99 and earlier PIN hash. This remains only for transparent migration.
 * New PINs must use createSaltedPinHash().
 */
async function validateCredentialBoundSession(payload, env, {allowProgram=false}={}) {
  if (
    payload.sv !== CREDENTIAL_SESSION_VERSION ||
    !Number.isInteger(payload.authrow) ||
    payload.authrow < 2 ||
    typeof payload.cv !== "string" ||
    !payload.cv
  ) {
    return null;
  }

  if (payload.type === "account") {
    return validateCentralAccountSession(payload, env, {allowProgram});
  }

  let range;
  let expectedId;
  let pinSetupColumn;
  let pinHashColumn;
  let activeColumn;

  if (payload.type === "student") {
    range = `StudentRecords!A${payload.authrow}:K${payload.authrow}`;
    expectedId = String(payload.studentid || "").trim();
    pinSetupColumn = 4;
    pinHashColumn = 5;
    activeColumn = 10;
  } else if (payload.type === "admin") {
    range = `AdminRecords!A${payload.authrow}:J${payload.authrow}`;
    expectedId = String(payload.adminid || "").trim();
    pinSetupColumn = 3;
    pinHashColumn = 4;
    activeColumn = 7;
  } else {
    return null;
  }

  const rows = await readGoogleSheetValues(env, range);
  const row = Array.isArray(rows[0]) ? rows[0] : [];

  if (
    String(row[0] || "").trim() !== expectedId ||
    !normalizeBooleanCell(row[pinSetupColumn]) ||
    !normalizeBooleanCell(row[activeColumn])
  ) {
    return null;
  }

  const currentHash = String(row[pinHashColumn] || "").trim();

  if (!currentHash) {
    return null;
  }

  const currentVersion = await createCredentialVersion(currentHash, env.SESSION_SECRET);

  if (!constantTimeEqual(payload.cv, currentVersion)) {
    return null;
  }

  if (payload.type === "student") {
    const currentClassGroup = String(row[6] ?? "").trim();
    const tokenClassGroup = String(payload.classgroup ?? "").trim();

    return currentClassGroup === tokenClassGroup
      ? { ...payload, classgroup: currentClassGroup }
      : null;
  }

  const currentRole = normalizeAdminRole(row[5]);
  const tokenRole = normalizeAdminRole(payload.role);
  const currentAssignedGroup = String(row[6] ?? "").trim();
  const tokenAssignedGroup = String(payload.assignedgroup ?? "").trim();

  if (
    !currentRole ||
    currentRole !== tokenRole ||
    currentAssignedGroup !== tokenAssignedGroup
  ) {
    return null;
  }

  return {
    ...payload,
    role: currentRole,
    assignedgroup: currentAssignedGroup
  };
}

async function validateCentralAccountSession(payload, env, {allowProgram=false}={}) {
  const platformSpreadsheetId = getPlatformSpreadsheetId(env);
  const accountId = normalizePlatformIdentifier(payload.accountid);
  const uniqueId = String(payload.uniqueid || "").trim();
  const tokenRole = normalizePlatformIdentifier(payload.role);
  const tokenScope = normalizePlatformIdentifier(payload.scope);
  if (!accountId || !uniqueId || !["PLATFORM", "COURSE", "GLOBAL"].includes(tokenScope)) {
    return null;
  }

  const accountRows = await readGoogleSheetValues(
    env,
    `UserAccounts!A${payload.authrow}:N${payload.authrow}`,
    { spreadsheetId: platformSpreadsheetId }
  );
  const accountRow = Array.isArray(accountRows[0]) ? accountRows[0] : [];
  const currentAccountId = normalizePlatformIdentifier(accountRow[0]);
  const currentUniqueId = String(accountRow[2] || "").trim();
  const currentHash = String(accountRow[4] || "").trim();
  const platformRole = normalizePlatformIdentifier(accountRow[13]);

  if (
    currentAccountId !== accountId ||
    currentUniqueId !== uniqueId ||
    !normalizeBooleanCell(accountRow[3]) ||
    !isActivePlatformValue(accountRow[5]) ||
    !currentHash
  ) {
    return null;
  }

  const currentVersion = await createCredentialVersion(currentHash, env.SESSION_SECRET);
  if (!constantTimeEqual(payload.cv, currentVersion)) {
    return null;
  }

  const isGlobalAdmin = platformRole === "GLOBAL_ADMIN";
  if (tokenScope === "PLATFORM") {
    if (!isGlobalAdmin || tokenRole !== "GLOBAL_ADMIN") return null;
    return {
      ...payload,
      accountid: String(accountRow[0] || "").trim(),
      username: String(accountRow[1] || "").trim(),
      role: "GLOBAL_ADMIN",
      scope: "PLATFORM",
      courseid: "",
      courserecordid: "",
      accessid: ""
    };
  }


  if (tokenScope === "GLOBAL") {
    if (tokenRole !== "STUDENT") return null;

    const globalTables = await readPlatformSheets(env, [
      "GlobalSubjectAccessMatrix",
      "GlobalSubjectAccessPolicy",
      "GlobalSubjectList"
    ]);
    const accessRecords = globalTables.GlobalSubjectAccessMatrix;
    const policyRows = globalTables.GlobalSubjectAccessPolicy;
    const globalSubjects = globalTables.GlobalSubjectList;
    const accessibleIds = accessibleGlobalSubjectIds({
      account: {
        AccountID: String(accountRow[0] || "").trim(),
        Active: accountRow[5]
      },
      subjects: globalSubjects,
      policyRows,
      accessRows: accessRecords
    });
    if (!accessibleIds.size) return null;

    return {
      ...payload,
      accountid: String(accountRow[0] || "").trim(),
      username: String(accountRow[1] || "").trim(),
      role: "STUDENT",
      scope: "GLOBAL",
      courseid: "",
      coursename: "Global Subjects",
      courserecordid: "",
      accessid: ""
    };
  }

  const courseId = String(payload.courseid || "").trim();
  if (!courseId) return null;
  let course;
  try{course=await resolveActiveCourseRegistration(env, courseId, {allowProgram});}
  catch(error){if(/Program teaching is not enabled in this release/.test(String(error.message)))return null;throw error;}
  if(course.schemaVersion.includes('-program')&&!['GLOBAL_ADMIN','ADMIN','SENIOR','TEACHER','STUDENT'].includes(tokenRole))return null;

  if (isGlobalAdmin) {
    if (tokenRole !== "GLOBAL_ADMIN") return null;
    return {
      ...payload,
      accountid: String(accountRow[0] || "").trim(),
      username: String(accountRow[1] || "").trim(),
      role: "GLOBAL_ADMIN",
      scope: "COURSE",
      courseid: course.courseId,
      coursename: course.courseName,
      coursespreadsheetid: course.spreadsheetId,
      courserecordid: "",
      accessid: ""
    };
  }

  if(course.schemaVersion.includes('-program')){
    const roles=await readProgramRoleAccounts(env,course.courseId);
    if(!roles.some(row=>normalizePlatformIdentifier(row.AccountID)===accountId&&row.Active&&row.Roles.includes(tokenRole)))return null;
    if(tokenRole==='STUDENT'){
      const {programs}=await programService(sheetsProgramRepository(env)).list();
      const program=programs.find(row=>row.id===course.courseId&&row.mode==='PROGRAM'&&row.status==='DRAFT');
      if(!program)return null;
    }
    if(!payload.accessrow&&!payload.accessid&&!payload.courserecordid){
      return {...payload,accountid:String(accountRow[0]||'').trim(),username:String(accountRow[1]||'').trim(),role:tokenRole,scope:'COURSE',courseid:course.courseId,coursename:course.courseName,coursespreadsheetid:course.spreadsheetId,courserecordid:'',accessid:''};
    }
  }

  if (!Number.isInteger(payload.accessrow) || payload.accessrow < 2) return null;
  const accessRows = await readGoogleSheetValues(
    env,
    `UserCourseAccess!A${payload.accessrow}:N${payload.accessrow}`,
    { spreadsheetId: platformSpreadsheetId }
  );
  const accessRow = Array.isArray(accessRows[0]) ? accessRows[0] : [];
  const currentRole = normalizePlatformIdentifier(accessRow[3]);
  const currentCourseId = normalizePlatformIdentifier(accessRow[2]);
  const courseRecordId = String(accessRow[13] || "").trim();

  if (
    normalizePlatformIdentifier(accessRow[1]) !== accountId ||
    currentCourseId !== normalizePlatformIdentifier(course.courseId) ||
    currentRole !== tokenRole ||
    !isActivePlatformValue(accessRow[4]) ||
    String(accessRow[0] || "").trim() !== String(payload.accessid || "").trim() ||
    courseRecordId !== String(payload.courserecordid || "").trim() ||
    !courseRecordId
  ) {
    return null;
  }

  return {
    ...payload,
    accountid: String(accountRow[0] || "").trim(),
    username: String(accountRow[1] || "").trim(),
    role: currentRole,
    scope: "COURSE",
    courseid: course.courseId,
    coursename: course.courseName,
    coursespreadsheetid: course.spreadsheetId,
    courserecordid: courseRecordId,
    accessid: String(accessRow[0] || "").trim()
  };
}

function normalizeAdminRole(value) {
  const role = String(value || "").trim().toUpperCase();
  return ["ADMIN", "SENIOR", "TEACHER"].includes(role) ? role : "";
}

function requiresCredentialBoundSessions(env) {
  return String(env.M4L_REQUIRE_CREDENTIAL_BOUND_SESSIONS || "")
    .trim()
    .toLowerCase() === "true";
}

function normalizeBooleanCell(value) {
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;

  const normalized = String(value).trim().toLowerCase();
  return normalized === "true" || normalized === "yes" || normalized === "1";
}

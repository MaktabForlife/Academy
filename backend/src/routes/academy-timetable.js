/* M4L V104.5.4 - Academy timetable resolves Course-labelled explicit and derived Global Course publications. */

import { getAuthUser } from "../lib/auth.js";
import { buildAcademyCalendarEvents } from "../lib/academy-calendar.js";
import { canAccountAccessGlobalSubject, dateInTimezone, hasActiveGlobalSubjectSubscription, isValidIanaTimezone } from "../lib/global-subject-delivery.js";
import { resolveCurrentPublishedGlobalTimetable } from "../lib/global-timetable.js";
import { batchReadGoogleSheetValues } from "../lib/google-sheets.js";
import { json } from "../lib/http.js";
import {
  readPlatformSheets
} from "../lib/platform-sheet.js";
import {
  isActivePlatformValue,
  normalizePlatformIdentifier
} from "../lib/platform-schema.js";
import {
  PUBLISHED_TIMETABLE_SESSION_SHEET,
  TIMETABLE_PUBLICATION_SHEET,
  TIMETABLE_STATE_SHEET,
  resolveCurrentPublishedTimetable
} from "../lib/timetable-publication.js";
import { buildTimetableResponse } from "./timetable.js";
import {
  getSystemConfigValue,
  getTimetableLiveSource,
  GLOBAL_ZOOM_LINK_KEY,
  TIMETABLE_SOURCE_PUBLISHED,
} from "../lib/system-config.js";

const FULL_RANGE = "A:ZZ";
const DEFAULT_VIEW_DAYS = 2;
const MAX_VIEW_DAYS = 14;
const COURSE_ROLE_ORDER = Object.freeze({ ADMIN: 1, SENIOR: 2, TEACHER: 3, STUDENT: 4 });
const DAY_INDEX = Object.freeze({ SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 });
const DAY_ALIASES = Object.freeze({
  SUNDAY: "SUN", SUN: "SUN",
  MONDAY: "MON", MON: "MON",
  TUESDAY: "TUE", TUE: "TUE", TUES: "TUE",
  WEDNESDAY: "WED", WED: "WED",
  THURSDAY: "THU", THU: "THU", THUR: "THU", THURS: "THU",
  FRIDAY: "FRI", FRI: "FRI",
  SATURDAY: "SAT", SAT: "SAT"
});

export async function getAcademyTimetableEndpoint(request, env) {
  try {
    const authUser = await getAuthUser(request, env);
    if (!authUser || authUser.type !== "account") {
      return json({ success: false, error: "Unauthorized" }, 401);
    }

    const body = await readJsonBody(request);
    const platform = await loadPlatformAcademyState(env);
    const account = platform.accounts.find(row => (
      normalizePlatformIdentifier(row.AccountID) === normalizePlatformIdentifier(authUser.accountid)
    ));
    if (!account || !isActivePlatformValue(account.Active)) {
      return json({ success: false, error: "Unauthorized" }, 401);
    }

    const timezone = resolvePlatformTimezone(platform.config);
    const now = new Date();
    const clock = academyClockInTimezone(now, timezone);
    const viewStart = validIsoDate(body.startDate) ? String(body.startDate).trim() : clock.date;
    const viewDays = resolveAcademyViewDays(body.days);
    const viewEnd = addDays(viewStart, viewDays - 1);
    const weeks = academyWeeksForRange(viewStart, viewEnd, timezone, now);
    const week = weeks[0];
    const isGlobalAdmin = normalizePlatformIdentifier(account.PlatformRole) === "GLOBAL_ADMIN";
    const memberships = platform.courseAccess.filter(row => (
      normalizePlatformIdentifier(row.AccountID) === normalizePlatformIdentifier(account.AccountID) &&
      isActivePlatformValue(row.Active)
    ));

    const activePrograms = platform.courses.filter(row => isActivePlatformValue(row.Active));
    const programLoads = await Promise.all(activePrograms.map(async course => {
      try {
        const events = await loadProgramEvents(env, course, memberships, {
          account,
          isGlobalAdmin,
          weeks,
          currentDate: clock.date,
          currentMinutes: clock.minutes
        });
        return {
          events,
          warning: null
        };
      } catch (error) {
        return {
          events: [],
          warning: {
            code: "PROGRAM_TIMETABLE_UNAVAILABLE",
            program: String(course.CourseName || course.CourseID || "Program").trim(),
            message: "This Program timetable is temporarily unavailable."
          }
        };
      }
    }));
    const programEvents = programLoads.flatMap(result => result.events);
    const warnings = programLoads.map(result => result.warning).filter(Boolean);

    const globalRange = {
      start: week.start,
      end: weeks[weeks.length - 1].end,
      today: clock.date
    };
    const globalEvents = buildGlobalCourseEvents(platform, account, {
      isGlobalAdmin,
      week: globalRange,
      currentDate: clock.date,
      currentMinutes: clock.minutes
    });
    const sessions = [...programEvents, ...globalEvents]
      .filter(event => String(event.date || "") >= viewStart && String(event.date || "") <= viewEnd)
      .sort(compareAcademyEvents)
      .map((event, index) => ({ ...event, eventKey: `AE${String(index + 1).padStart(4, "0")}` }));
    const calendarEvents = buildAcademyCalendarEvents(platform.academyCalendar, viewStart, viewEnd);

    return json({
      success: true,
      version: "104.5.4",
      timezone,
      weekStart: week.start,
      weekEnd: weeks[weeks.length - 1].end,
      viewStart,
      viewEnd,
      viewDays,
      today: clock.date,
      sessions,
      calendarEvents,
      warnings,
      count: sessions.length
    });
  } catch (error) {
    console.error("Academy timetable failed", error);
    return json({
      success: false,
      error: "The Academy timetable could not be loaded.",
      code: "ACADEMY_TIMETABLE_UNAVAILABLE",
      retryable: true,
      sessions: []
    }, 503);
  }
}

async function loadPlatformAcademyState(env) {
  const tables = await readPlatformSheets(env, [
    "PlatformConfig",
    "UserAccounts",
    "CourseRegistry",
    "UserCourseAccess",
    "GlobalSubjectList",
    "GlobalSubjectAccessPolicy",
    "GlobalSubjectAccessMatrix",
    "GlobalSubjectRuns",
    "GlobalTimetableRunState",
    "GlobalTimetablePublications",
    "GlobalTimetableSessionLifecycle",
    "PublishedGlobalTimetableSessions",
    "AcademyCalendar"
  ]);
  return {
    config: tables.PlatformConfig,
    accounts: tables.UserAccounts,
    courses: tables.CourseRegistry,
    courseAccess: tables.UserCourseAccess,
    subjects: tables.GlobalSubjectList,
    policies: tables.GlobalSubjectAccessPolicy,
    matrix: tables.GlobalSubjectAccessMatrix,
    runs: tables.GlobalSubjectRuns,
    academyCalendar: tables.AcademyCalendar,
    GlobalTimetableRunState: tables.GlobalTimetableRunState,
    GlobalTimetablePublications: tables.GlobalTimetablePublications,
    GlobalTimetableSessionLifecycle: tables.GlobalTimetableSessionLifecycle,
    PublishedGlobalTimetableSessions: tables.PublishedGlobalTimetableSessions
  };
}

async function loadProgramEvents(env, course, memberships, options) {
  const spreadsheetId = String(course.SpreadsheetID || "").trim();
  if (!spreadsheetId) return [];
  const courseId = String(course.CourseID || "").trim();
  const courseName = String(course.CourseName || courseId || "Program").trim();
  const courseMemberships = memberships.filter(row => (
    normalizePlatformIdentifier(row.CourseID) === normalizePlatformIdentifier(courseId)
  ));
  const accessPlan = buildProgramAccessPlan(courseMemberships, options);
  const profileRanges = ["SystemConfig!A:E"];
  if (accessPlan.needsStudent) profileRanges.push("StudentRecords!A:K");
  if (accessPlan.needsStaff) profileRanges.push("AdminRecords!A:ZZ");
  const profileSets = await batchReadGoogleSheetValues(env, profileRanges, { spreadsheetId });
  let profileIndex = 0;
  const systemRows = profileSets[profileIndex++] || [];
  const studentRows = accessPlan.needsStudent ? (profileSets[profileIndex++] || []) : [];
  const accessAdminRows = accessPlan.needsStaff ? (profileSets[profileIndex++] || []) : [];
  const access = resolveProgramAccess(courseMemberships, options, {
    studentRows,
    adminRows: accessAdminRows
  });
  const liveSource = getTimetableLiveSource(systemRows);
  const globalZoomLink = getSystemConfigValue(systemRows, GLOBAL_ZOOM_LINK_KEY);
  let sessions = [];

  if (liveSource === TIMETABLE_SOURCE_PUBLISHED) {
    const [stateRows, publicationRows, snapshotRows] = await batchReadGoogleSheetValues(env, [
      `${TIMETABLE_STATE_SHEET}!${FULL_RANGE}`,
      `${TIMETABLE_PUBLICATION_SHEET}!${FULL_RANGE}`,
      `${PUBLISHED_TIMETABLE_SESSION_SHEET}!${FULL_RANGE}`
    ], { spreadsheetId });
    const current = resolveCurrentPublishedTimetable({ stateRows, publicationRows, publishedSessionRows: snapshotRows }, courseId, {
      requireCurrentHeaders: true,
      requireDisplayValues: true
    });
    if (!current.ok) return [];
    sessions = current.sessions.map(item => ({
      dayofweek: item.dayofweek,
      starttime: item.starttime,
      endtime: item.endtime,
      subjectname: item.subjectname,
      modulename: item.modulename,
      groupno: item.groupno,
      teacherid: item.teacherid,
      teachername: item.teachername,
      zoomlink: item.zoomlink
    }));
  } else {
    const legacyRanges = ["TeacherAssign!A:ZZ"];
    const reuseAccessAdmins = accessPlan.needsStaff;
    if (!reuseAccessAdmins) legacyRanges.push("AdminRecords!A:ZZ");
    legacyRanges.push("SubjectList!A:ZZ", "ModuleList!A:ZZ");
    const legacySets = await batchReadGoogleSheetValues(env, legacyRanges, { spreadsheetId });
    let legacyIndex = 0;
    const teacherRows = legacySets[legacyIndex++] || [];
    const adminRows = reuseAccessAdmins ? accessAdminRows : (legacySets[legacyIndex++] || []);
    const subjectRows = legacySets[legacyIndex++] || [];
    const moduleRows = legacySets[legacyIndex++] || [];
    const transformed = buildTimetableResponse(teacherRows, {
      adminRows,
      subjectRows,
      moduleRows,
      globalZoomLink,
      globalZoomConfigured: Boolean(globalZoomLink),
      groupNo: "ALL",
      teacherId: "ALL",
      allGroupsStudent: true,
      showGroupLabels: true
    });
    if (!transformed.success) return [];
    sessions = transformed.sessions;
  }

  const weeks = Array.isArray(options.weeks) && options.weeks.length ? options.weeks : [];
  return weeks.flatMap(week => sessions.map(session => programSessionToAcademyEvent(session, {
    courseId,
    courseName,
    access,
    week,
    globalZoomLink,
    currentDate: options.currentDate,
    currentMinutes: options.currentMinutes
  })).filter(Boolean));
}

function buildProgramAccessPlan(memberships, options) {
  if (options.isGlobalAdmin) {
    return { needsStudent: false, needsStaff: false };
  }

  const candidates = (Array.isArray(memberships) ? memberships : [])
    .filter(row => isActivePlatformValue(row.Active) && COURSE_ROLE_ORDER[normalizePlatformIdentifier(row.Role)]);
  return {
    needsStudent: candidates.some(row => normalizePlatformIdentifier(row.Role) === "STUDENT"),
    needsStaff: candidates.some(row => ["ADMIN", "SENIOR", "TEACHER"].includes(normalizePlatformIdentifier(row.Role)))
  };
}

function resolveProgramAccess(memberships, options, profiles = {}) {
  if (options.isGlobalAdmin) {
    return { level: "GLOBAL_ADMIN", roles: new Set(["GLOBAL_ADMIN"]), studentGroup: "", teacherIds: new Set() };
  }

  const candidates = (Array.isArray(memberships) ? memberships : [])
    .filter(row => isActivePlatformValue(row.Active) && COURSE_ROLE_ORDER[normalizePlatformIdentifier(row.Role)]);
  if (!candidates.length) {
    return { level: "NONE", roles: new Set(), studentGroup: "", teacherIds: new Set() };
  }

  const needsStudent = candidates.some(row => normalizePlatformIdentifier(row.Role) === "STUDENT");
  const needsStaff = candidates.some(row => ["ADMIN", "SENIOR", "TEACHER"].includes(normalizePlatformIdentifier(row.Role)));
  const studentRows = needsStudent ? (profiles.studentRows || []) : [];
  const adminRows = needsStaff ? (profiles.adminRows || []) : [];

  if (needsStudent) {
    assertAcademyLegacyHeaders(studentRows?.[0], [
      [0, "StudentID"],
      [3, "UniqueID"],
      [6, "ClassGroup"],
      [10, "Active"]
    ], "StudentRecords");
  }
  if (needsStaff) {
    assertAcademyLegacyHeaders(adminRows?.[0], [
      [0, "AdminID"],
      [2, "UniqueID"],
      [5, "Role"],
      [7, "Active"]
    ], "AdminRecords");
  }

  const accountUniqueId = normalizePlatformIdentifier(options.account?.UniqueID);
  const validated = [];
  for (const membership of candidates) {
    const role = normalizePlatformIdentifier(membership.Role);
    const courseRecordId = normalizePlatformIdentifier(membership.CourseRecordID);
    if (!courseRecordId || !accountUniqueId) continue;

    if (role === "STUDENT") {
      const matches = studentRows.slice(1).filter(row => normalizePlatformIdentifier(row?.[0]) === courseRecordId);
      if (matches.length !== 1) continue;
      const row = matches[0];
      if (
        normalizePlatformIdentifier(row?.[3]) !== accountUniqueId ||
        !isActivePlatformValue(row?.[10])
      ) continue;
      validated.push({ role, courseRecordId, studentGroup: String(row?.[6] ?? "").trim() });
      continue;
    }

    if (["ADMIN", "SENIOR", "TEACHER"].includes(role)) {
      const matches = adminRows.slice(1).filter(row => normalizePlatformIdentifier(row?.[0]) === courseRecordId);
      if (matches.length !== 1) continue;
      const row = matches[0];
      if (
        normalizePlatformIdentifier(row?.[2]) !== accountUniqueId ||
        normalizePlatformIdentifier(row?.[5]) !== role ||
        !isActivePlatformValue(row?.[7])
      ) continue;
      validated.push({ role, courseRecordId, studentGroup: "" });
    }
  }

  if (!validated.length) {
    return { level: "NONE", roles: new Set(), studentGroup: "", teacherIds: new Set() };
  }

  const roles = new Set(validated.map(item => item.role));
  const teacherIds = new Set(validated
    .filter(item => ["ADMIN", "SENIOR", "TEACHER"].includes(item.role))
    .map(item => item.courseRecordId));
  const student = validated.find(item => item.role === "STUDENT");
  const studentGroup = String(student?.studentGroup ?? "").trim();
  const level = [...roles].sort((a, b) => COURSE_ROLE_ORDER[a] - COURSE_ROLE_ORDER[b])[0] || "NONE";
  return { level, roles, studentGroup, teacherIds };
}

function assertAcademyLegacyHeaders(headers, required, sheetName) {
  const row = Array.isArray(headers) ? headers : [];
  for (const [index, expected] of required) {
    if (normalizeAcademyHeader(row[index]) !== normalizeAcademyHeader(expected)) {
      throw new Error(`${sheetName} header mismatch`);
    }
  }
}

function normalizeAcademyHeader(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch (error) {
    return {};
  }
}

import {programSessionToAcademyEvent,canAccountAccessGlobalCourse,buildGlobalCourseEvents,resolveAcademyViewDays,academyWeeksForRange,academyClockInTimezone,isAcademySessionCurrent,resolveAcademyWeek,resolvePlatformTimezone,dayOfWeekDate,mondayForDate,addDays,parseDate,formatDate,validIsoDate,normalizeStoredTime,timeToMinutes,compareAcademyEvents,academyEventTimeSortValue} from '../lib/academy-timetable-model.js';
export {programSessionToAcademyEvent,buildGlobalCourseEvents,resolveAcademyViewDays,academyWeeksForRange,academyClockInTimezone,isAcademySessionCurrent,resolveAcademyWeek} from '../lib/academy-timetable-model.js';

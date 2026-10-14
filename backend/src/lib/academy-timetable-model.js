import {isActivePlatformValue,normalizePlatformIdentifier} from './platform-schema.js';
import {canAccountAccessGlobalSubject,dateInTimezone,hasActiveGlobalSubjectSubscription,isValidIanaTimezone} from './global-subject-delivery.js';
import {resolveCurrentPublishedGlobalTimetable} from './global-timetable.js';
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

export function programSessionToAcademyEvent(session, options) {
  const date = dayOfWeekDate(options.week.start, session.dayofweek);
  if (!date) return null;
  const group = String(session.groupno || "ALL").trim() || "ALL";
  const teacherId = normalizePlatformIdentifier(session.teacherid);
  const access = options.access;
  let visibilityLevel = "LABEL";
  let relevant = false;

  if (access.level === "GLOBAL_ADMIN") {
    visibilityLevel = "DETAIL";
  } else if (access.roles.has("ADMIN") || access.roles.has("SENIOR") || access.roles.has("TEACHER")) {
    visibilityLevel = "DETAIL";
    relevant = access.teacherIds.has(teacherId);
  } else if (access.roles.has("STUDENT")) {
    const groupKey = normalizePlatformIdentifier(group);
    const studentGroup = normalizePlatformIdentifier(access.studentGroup);
    const matches = studentGroup === "0" || groupKey === "ALL" || (studentGroup && groupKey === studentGroup);
    if (matches) {
      visibilityLevel = "DETAIL";
      relevant = true;
    }
  }

  const startTime = normalizeStoredTime(session.starttime);
  const endTime = normalizeStoredTime(session.endtime);
  const isCurrent = isAcademySessionCurrent({
    date,
    startTime,
    endTime,
    status: "SCHEDULED"
  }, options.currentDate, options.currentMinutes);
  const canOpenZoom = visibilityLevel === "DETAIL" && relevant && isCurrent;
  const base = {
    kind: "PROGRAM",
    date,
    startTime,
    endTime,
    visibilityLevel,
    relevant,
    isCurrent,
    canOpenZoom,
    status: "SCHEDULED",
    title: visibilityLevel === "DETAIL"
      ? String(session.subjectname || options.courseName).trim()
      : options.courseName
  };
  if (visibilityLevel !== "DETAIL") return base;

  return {
    ...base,
    programName: options.courseName,
    subjectName: String(session.subjectname || "").trim(),
    moduleName: String(session.modulename || "").trim(),
    group: group,
    teacherName: String(session.teachername || "").trim(),
    zoomLink: canOpenZoom ? String(session.zoomlink || options.globalZoomLink || "").trim() : ""
  };
}

export function canAccountAccessGlobalCourse({ account, run, subject, policyRows, accessRows }) {
  const accessModel = normalizePlatformIdentifier(run?.AccessModel);
  if (accessModel === "FREE") return Boolean(account && isActivePlatformValue(account.Active));
  if (accessModel === "PAID") {
    // V103.1.0.5 transition: the unified per-Course role matrix lands in V103.2.
    // Until then, PAID must never inherit a FREE Global Subject policy. Require
    // an explicit existing matrix entitlement for the linked Global Subject.
    if (!account || !subject || !isActivePlatformValue(account.Active) || !isActivePlatformValue(subject.Active)) return false;
    return hasActiveGlobalSubjectSubscription(accessRows, account.AccountID, subject.SubjectID);
  }
  // Pre-migration 102.0.8 rows keep the established Global Subject policy behaviour.
  return canAccountAccessGlobalSubject({ account, subject, policyRows, accessRows });
}

export function buildGlobalCourseEvents(platform, account, options) {
  const subjectMap = new Map(platform.subjects.map(subject => [normalizePlatformIdentifier(subject.SubjectID), subject]));
  const output = [];

  for (const run of platform.runs) {
    const runId = normalizePlatformIdentifier(run?.RunID);
    if (!runId || !isActivePlatformValue(run.Active)) continue;
    const subject = subjectMap.get(normalizePlatformIdentifier(run.SubjectID));
    if (!subject || !isActivePlatformValue(subject.Active)) continue;

    const resolved = resolveCurrentPublishedGlobalTimetable(platform, runId, {
      startDate: options.week.start,
      endDate: options.week.end
    });
    if (!resolved.ok) continue;

    const policyAccess = canAccountAccessGlobalCourse({
      account,
      run,
      subject,
      policyRows: platform.policies,
      accessRows: platform.matrix
    });
    const lifecycleBySession = new Map((resolved.lifecycles || []).map(item => [normalizePlatformIdentifier(item?.sessionid), item]));
    // Course identity is the primary Academy label. Prefer the immutable
    // publication/snapshot display value so a later draft rename cannot rewrite
    // an already-published timetable. Older explicit publications may not have
    // RunName on the publication row, so fall back to the immutable session copy.
    const publishedCourseName = String(
      resolved.publication?.runname ||
      resolved.sessions.find(item => String(item?.runname || "").trim())?.runname ||
      run.RunName ||
      subject.SubjectName ||
      "Global Course"
    ).trim();
    for (const session of resolved.sessions) {
      if (session.sessiondate < options.week.start || session.sessiondate > options.week.end) continue;
      const assignedTeacher = options.allowAssignedTeacher !== false && normalizePlatformIdentifier(session.teacheraccountid) === normalizePlatformIdentifier(account.AccountID);
      const detail = options.isGlobalAdmin || policyAccess || assignedTeacher;
      const lifecycle = lifecycleBySession.get(normalizePlatformIdentifier(session.sourcesessionid));
      const status = normalizePlatformIdentifier(lifecycle?.status || "SCHEDULED") || "SCHEDULED";
      const relevant = assignedTeacher || policyAccess;
      const isCurrent = isAcademySessionCurrent({
        date: session.sessiondate,
        startTime: session.starttime,
        endTime: session.endtime,
        status
      }, options.currentDate, options.currentMinutes);
      const canOpenZoom = detail && relevant && status === "SCHEDULED" && isCurrent;
      const base = {
        kind: "GLOBAL",
        date: session.sessiondate,
        startTime: session.starttime,
        endTime: session.endtime,
        visibilityLevel: detail ? "DETAIL" : "LABEL",
        relevant,
        isCurrent,
        canOpenZoom,
        status,
        title: publishedCourseName
      };
      if (!detail) {
        output.push(base);
        continue;
      }
      output.push({
        ...base,
        subjectName: session.subjectname,
        moduleName: session.modulename,
        teacherName: session.teachername,
        sessionDescription: session.sessiondescription || "",
        zoomLink: canOpenZoom ? session.zoomlink : ""
      });
    }
  }
  return output;
}

export function resolveAcademyViewDays(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_VIEW_DAYS;
  return Math.min(parsed, MAX_VIEW_DAYS);
}

export function academyWeeksForRange(startDate, endDate, timezone, now = new Date()) {
  if (!validIsoDate(startDate) || !validIsoDate(endDate) || endDate < startDate) {
    throw new Error("Academy timetable range is invalid");
  }
  const weeks = [];
  let cursor = resolveAcademyWeek(startDate, timezone, now);
  while (cursor.start <= endDate) {
    weeks.push(cursor);
    const nextStart = addDays(cursor.end, 1);
    if (nextStart > endDate) break;
    cursor = resolveAcademyWeek(nextStart, timezone, now);
  }
  return weeks;
}

export function academyClockInTimezone(now, timezone) {
  if (!isValidIanaTimezone(timezone)) throw new Error("PlatformTimezone is invalid");
  const date = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(date.getTime())) throw new Error("Academy timetable requires a valid current time");
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return Object.freeze({
    date: `${values.year}-${values.month}-${values.day}`,
    minutes: (Number(values.hour) * 60) + Number(values.minute)
  });
}

export function isAcademySessionCurrent(session, currentDate, currentMinutes) {
  if (normalizePlatformIdentifier(session?.status || "SCHEDULED") !== "SCHEDULED") return false;
  if (!currentDate || String(session?.date || "") !== String(currentDate)) return false;
  if (!Number.isFinite(Number(currentMinutes))) return false;
  const start = timeToMinutes(session?.startTime);
  const end = timeToMinutes(session?.endTime);
  if (start === null || end === null || start === end) return false;
  const nowMinutes = Number(currentMinutes);
  if (end > start) return nowMinutes >= start && nowMinutes < end;
  return nowMinutes >= start || nowMinutes < end;
}

export function resolveAcademyWeek(requestedStart, timezone, now = new Date()) {
  if (!isValidIanaTimezone(timezone)) throw new Error("PlatformTimezone is invalid");
  const today = dateInTimezone(now, timezone);
  const start = validIsoDate(requestedStart) ? mondayForDate(String(requestedStart)) : mondayForDate(today);
  return Object.freeze({ start, end: addDays(start, 6), today });
}

export function resolvePlatformTimezone(configRows) {
  const matches = configRows.filter(row => normalizePlatformIdentifier(row.ConfigKey) === "PLATFORMTIMEZONE");
  if (matches.length !== 1) throw new Error("PlatformTimezone must resolve exactly once");
  const timezone = String(matches[0].ConfigValue || "").trim();
  if (!isValidIanaTimezone(timezone)) throw new Error("PlatformTimezone is invalid");
  return timezone;
}

export function dayOfWeekDate(weekStart, value) {
  const alias = DAY_ALIASES[normalizePlatformIdentifier(value)];
  if (!alias) return "";
  const mondayIndex = DAY_INDEX[alias] === 0 ? 6 : DAY_INDEX[alias] - 1;
  return addDays(weekStart, mondayIndex);
}

export function mondayForDate(dateText) {
  const date = parseDate(dateText);
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + offset);
  return formatDate(date);
}

export function addDays(dateText, days) {
  const date = parseDate(dateText);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return formatDate(date);
}

export function parseDate(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function formatDate(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function validIsoDate(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  return formatDate(parseDate(text)) === text;
}

export function normalizeStoredTime(value) {
  const text = String(value || "").trim();
  const match = /^(\d{1,2}):(\d{2})/.exec(text);
  return match ? `${String(Number(match[1])).padStart(2, "0")}:${match[2]}` : text;
}

export function timeToMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value || "").trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  return (hour * 60) + minute;
}

export function compareAcademyEvents(left, right) {
  return String(left.date || "").localeCompare(String(right.date || "")) ||
    academyEventTimeSortValue(left.startTime) - academyEventTimeSortValue(right.startTime) ||
    String(left.startTime || "").localeCompare(String(right.startTime || "")) ||
    String(left.title || "").localeCompare(String(right.title || ""));
}

export function academyEventTimeSortValue(value) {
  const match = /^(\d{1,2})(?::|h)(\d{2})/.exec(String(value || "").trim());
  if (!match) return Number.MAX_SAFE_INTEGER;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    return Number.MAX_SAFE_INTEGER;
  }
  return (hour * 60) + minute;
}

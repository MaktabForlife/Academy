// Legacy Sheets adapter. Academy imports the storage independent domain factory directly.
import { getAuthUser as defaultGetAuthUser } from "../lib/auth.js";
import { batchUpdateGoogleSheetValues as defaultBatchUpdateGoogleSheetValues } from "../lib/google-sheets.js";
import { getPlatformSpreadsheetId as defaultGetPlatformSpreadsheetId, readPlatformSheet as defaultReadPlatformSheet } from "../lib/platform-sheet.js";
import { createGlobalTimetableEndpoints as domainFactory } from '../domain/platform-global-timetable.js';
export function createGlobalTimetableEndpoints(storage={}){return domainFactory({getAuthUser:defaultGetAuthUser,batchUpdateGoogleSheetValues:defaultBatchUpdateGoogleSheetValues,getPlatformSpreadsheetId:defaultGetPlatformSpreadsheetId,readPlatformSheet:defaultReadPlatformSheet,...storage});}

export const { getPlatformGlobalTimetableEndpoint, generatePlatformGlobalTimetableSessionsEndpoint, materializePlatformGlobalTimetableExceptionEndpoint, savePlatformGlobalTimetableSessionEndpoint, savePlatformGlobalTimetableSessionBatchEndpoint, revisePlatformGlobalTimetableEndpoint, reschedulePlatformGlobalTimetableSessionEndpoint, publishPlatformGlobalTimetableEndpoint } = createGlobalTimetableEndpoints();

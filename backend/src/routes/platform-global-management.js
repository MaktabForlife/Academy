// Legacy Sheets adapter. Academy imports the storage independent domain factory directly.
import { getAuthUser as defaultGetAuthUser } from "../lib/auth.js";
import { readAcademyLibraryPolicies, academyResourceDecision } from "../lib/academy-library-policy.js";
import { batchUpdateGoogleSheetValues as defaultBatchUpdateGoogleSheetValues } from "../lib/google-sheets.js";
import {
  GOOGLE_DRIVE_FOLDER_MIME,
  isGoogleDriveNativeMimeType,
  listGoogleDriveFolder
} from "../lib/google-drive.js";
import {
  getPlatformSpreadsheetId as defaultGetPlatformSpreadsheetId,
  readPlatformSheet as defaultReadPlatformSheet
} from "../lib/platform-sheet.js";
import {
  buildGoogleDriveFolderUrl,
  extractGoogleDriveFolderId
} from "../lib/system-config.js";
import {
  buildDriveBreadcrumbs,
  createDriveAccessToken,
  deriveFileFormat,
  extractDriveFileId,
  getDriveAccessTtlSeconds,
  getResourceConfig,
  getSupportedResourceTypes,
  requireItemInsideRoot,
  validateFileForResourceType
} from "./drive-library.js";
import { createGlobalManagementEndpoints as domainFactory } from '../domain/platform-global-management.js';
export function createGlobalManagementEndpoints(storage={}){return domainFactory({getAuthUser:defaultGetAuthUser,batchUpdateGoogleSheetValues:defaultBatchUpdateGoogleSheetValues,getPlatformSpreadsheetId:defaultGetPlatformSpreadsheetId,readPlatformSheet:defaultReadPlatformSheet,readAcademyLibraryPolicies,academyResourceDecision,isGoogleDriveNativeMimeType,listGoogleDriveFolder,buildDriveBreadcrumbs,createDriveAccessToken,deriveFileFormat,getDriveAccessTtlSeconds,getResourceConfig,getSupportedResourceTypes,requireItemInsideRoot,validateFileForResourceType,...storage});}

export const { getPlatformGlobalManagementEndpoint, savePlatformGlobalDriveRootEndpoint, browsePlatformGlobalDriveFolderEndpoint, createPlatformGlobalDriveAccessEndpoint, savePlatformGlobalSubjectEndpoint, savePlatformGlobalSubjectsBatchEndpoint, savePlatformGlobalModuleEndpoint, savePlatformGlobalTaskEndpoint, savePlatformGlobalResourceEndpoint, savePlatformGlobalResourcesBatchEndpoint, savePlatformGlobalSubjectAccessEndpoint } = createGlobalManagementEndpoints();

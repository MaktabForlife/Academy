import { academySubjectRepository } from '../programs/academy-subjects.js';
import { programDisplayName } from '../academy/entrance.js';
import { programService } from '../programs/service.js';
import { sheetsProgramRepository } from '../programs/sheets-repository.js';
import { timetableRepository } from '../programs/timetable-repository.js';
import { managementState } from '../programs/management-model.js';
import { batchReadGoogleSheetValues } from './google-sheets.js';
import { readPlatformSheets } from './platform-sheet.js';
import { isActivePlatformValue as active } from './platform-schema.js';
import { problem } from '../programs/model.js';
import {d1OpenLibraryTaxonomySource} from '../academy/d1/open-library-taxonomy.js';

import {buildOpenLibraryTaxonomy,resolveOpenLibraryTaxonomySelection} from './open-library-taxonomy-model.js';
export {buildOpenLibraryTaxonomy,resolveOpenLibraryTaxonomySelection} from './open-library-taxonomy-model.js';
const clean=value=>String(value??'').trim();

export async function loadOpenLibraryTaxonomy(env, { includeLegacy = false } = {}) {
  if(env.ACADEMY_D1_MODE && env.ACADEMY_D1_MODE!=='OFF')return {...buildOpenLibraryTaxonomy(await d1OpenLibraryTaxonomySource(env)),warnings:[]};
  const [shared, platform, listed] = await Promise.all([
    academySubjectRepository(env).load(),
    readPlatformSheets(env, ['CourseRegistry', 'GlobalSubjectList', 'GlobalModuleList']),
    programService(sheetsProgramRepository(env)).list()
  ]);
  const legacy = platform.CourseRegistry.filter(row => includeLegacy && active(row.Active) &&
    !String(row.SchemaVersion || '').includes('-program') && clean(row.SpreadsheetID));
  const rebootResults = await Promise.allSettled(legacy.map(async row => {
    const [subjectRows, moduleRows] = await batchReadGoogleSheetValues(env,
      ["'SubjectList'!A:ZZ", "'ModuleList'!A:ZZ"], { spreadsheetId: clean(row.SpreadsheetID) });
    return { id: row.CourseID, name: row.CourseName, subjectRows, moduleRows };
  }));
  const programCandidates = listed.programs.filter(row => row.mode === 'PROGRAM' && row.status === 'DRAFT');
  const programResults = await Promise.allSettled(programCandidates.map(async program => {
      const data = await timetableRepository(env, program).load();
      const snapshot = managementState(data, program).snapshot;
      return { id: program.id, name: programDisplayName(program), subjects: snapshot.ProgramSubjects,
        modules: snapshot.ProgramModules };
    }));
  const reboot = rebootResults.filter(result => result.status === 'fulfilled').map(result => result.value);
  const programs = programResults.filter(result => result.status === 'fulfilled').map(result => result.value);
  const warnings = [
    ...rebootResults.map((result, index) => result.status === 'rejected' ?
      `${legacy[index].CourseName} subjects are temporarily unavailable.` : ''),
    ...programResults.map((result, index) => result.status === 'rejected' ?
      `${programCandidates[index].name} modules are temporarily unavailable.` : '')
  ].filter(Boolean);
  return { ...buildOpenLibraryTaxonomy({ academy: shared.subjects,
    globalSubjects: platform.GlobalSubjectList, globalModules: platform.GlobalModuleList,
    reboot, programs }), warnings };
}

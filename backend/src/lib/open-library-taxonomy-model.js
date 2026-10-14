import {isActivePlatformValue as active} from './platform-schema.js';
import {problem} from '../programs/model.js';

const clean = value => String(value ?? '').trim();
const sort = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true });

function rows(values) {
  const headers = (values[0] || []).map(value => clean(value).toLowerCase().replace(/[^a-z0-9]/g, ''));
  return values.slice(1).map(row => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
}

export function buildOpenLibraryTaxonomy({ academy = [], globalSubjects = [], globalModules = [], reboot = [], programs = [] }) {
  const subjects = new Map();
  const modules = new Map();
  const addSubject = (id, name, source) => {
    if (!id || !name || subjects.has(id)) return;
    subjects.set(id, { id, name, source });
  };
  const addModule = (id, subjectId, name, source) => {
    if (!id || !subjects.has(subjectId) || !name || modules.has(id)) return;
    modules.set(id, { id, subjectId, name, source });
  };
  for (const row of academy) if (active(row.Active)) addSubject(`ACADEMY:${clean(row.SubjectID)}`, clean(row.SubjectName), 'Academy');
  for (const row of globalSubjects) if (active(row.Active)) addSubject(`GLOBAL:${clean(row.SubjectID)}`, clean(row.SubjectName), 'Course');
  for (const row of globalModules) if (active(row.Active)) {
    addModule(`GLOBAL:${clean(row.ModuleID)}`, `GLOBAL:${clean(row.SubjectID)}`, clean(row.ModuleName), 'Course');
  }
  for (const course of reboot) {
    const prefix = `REBOOT:${clean(course.id)}:`;
    for (const row of rows(course.subjectRows)) if (active(row.active)) {
      addSubject(`${prefix}${clean(row.subjectid)}`, clean(row.subjectname), clean(course.name));
    }
    for (const row of rows(course.moduleRows)) if (active(row.active)) {
      addModule(`${prefix}${clean(row.moduleid)}`, `${prefix}${clean(row.subjectid)}`, clean(row.modulename), clean(course.name));
    }
  }
  for (const program of programs) {
    const links = new Map(program.subjects.filter(row => active(row.Active))
      .map(row => [clean(row.ProgramSubjectID), clean(row.SubjectID)]));
    for (const row of program.modules) if (active(row.Active)) {
      const subjectId = links.get(clean(row.ProgramSubjectID));
      const sharedId = subjects.has(`ACADEMY:${subjectId}`) ? `ACADEMY:${subjectId}` : `GLOBAL:${subjectId}`;
      addModule(`PROGRAM:${clean(program.id)}:${clean(row.ProgramModuleID)}`, sharedId, clean(row.Name), clean(program.name));
    }
  }
  const learningAreas = [];
  for (const row of globalSubjects) if (active(row.Active)) {
    const subjectId = `GLOBAL:${clean(row.SubjectID)}`;
    if (subjects.has(subjectId)) learningAreas.push({ id: subjectId, name: clean(row.SubjectName),
      source: 'Course' });
  }
  for (const course of reboot) {
    learningAreas.push({ id: `REBOOT:${clean(course.id)}`, name: clean(course.name), source: 'Program' });
  }
  for (const program of programs) {
    learningAreas.push({ id: `PROGRAM:${clean(program.id)}`, name: clean(program.name), source: 'Program' });
  }
  return { subjects: [...subjects.values()].sort(sort), modules: [...modules.values()].sort(sort), learningAreas: learningAreas.sort(sort) };
}

export function resolveOpenLibraryTaxonomySelection(input, taxonomy) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw problem('Choose an Archive.org book from the current Open Library catalogue.');
  const learningAreaRefs = input.learningAreaRefs ?? [];
  if (!Array.isArray(learningAreaRefs) || learningAreaRefs.length > 100 ||
      learningAreaRefs.some(ref => typeof ref !== 'string' || !ref || ref.length > 300) ||
      new Set(learningAreaRefs).size !== learningAreaRefs.length) {
    throw problem('Choose up to 100 different Programs and courses.');
  }
  const subjectRef = clean(input.subjectRef);
  const moduleRef = clean(input.moduleRef);
  const learningAreas = learningAreaRefs.map(ref => {
    const area = taxonomy.learningAreas.find(item => item.id === ref);
    if (!area) throw problem('Choose only active Programs and Courses.');
    return area.name;
  });
  if (!subjectRef && !moduleRef) {
    if (clean(input.subject) || clean(input.module)) throw problem('Choose a subject and module from the Academy lists.');
    return { learningAreaRefs, learningAreas, subjectRef: '', moduleRef: '', subject: '', module: '' };
  }
  const subject = taxonomy.subjects.find(item => item.id === subjectRef);
  if (!subject) throw problem('Choose an active subject from the Academy list.');
  const module = moduleRef ? taxonomy.modules.find(item => item.id === moduleRef && item.subjectId === subjectRef) : null;
  if (moduleRef && !module) throw problem('Choose a module belonging to the selected subject.');
  return { learningAreaRefs, learningAreas, subjectRef, moduleRef, subject: subject.name, module: module?.name || '' };
}

import {isActivePlatformValue as active} from '../lib/platform-schema.js';
import {clean,problem} from './model.js';
import {payloadHash} from './timetable-model.js';

export const subjectRevision = row => payloadHash({SubjectID:row.SubjectID,SubjectName:row.SubjectName,Active:active(row.Active)});
export const subjectKey = name => clean(name).normalize('NFKC').replace(/\s+/gu,' ').toLowerCase();
export function subjectName(value) {
  if(typeof value!=='string'||!subjectKey(value)||value.trim().length>160)throw problem('Enter a subject name (up to 160 characters).');
  return value.trim().normalize('NFC').replace(/\s+/gu,' ');
}

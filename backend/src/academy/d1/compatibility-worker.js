// Offline compatibility coverage for the retired private Library. Never deploy with Academy.
import {createAcademyWorker} from './worker.js';
import * as library from './library.js';
import {openLibraryMetadataEndpoint} from '../../routes/open-library-metadata.js';
import {d1CourseCalendar} from './course-calendar.js';
import * as drive from '../../routes/drive-library.js';
import * as googleDrive from '../../lib/google-drive.js';
import {readAcademyLibraryPolicies,academyResourceDecision} from '../../lib/academy-library-policy.js';
const media={...drive,...googleDrive,readAcademyLibraryPolicies,academyResourceDecision};
export default createAcademyWorker(library,{openLibraryMetadataEndpoint,d1CourseCalendar:(repository,auth,env)=>d1CourseCalendar(repository,auth,env,media)});

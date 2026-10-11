import {readFileSync,readdirSync} from 'node:fs';
import {buildOperationalImport} from '../../tools/academy-migration/operational.mjs';
import {buildCourseCalendarImport,importCourseCalendarPlan} from '../../tools/academy-migration/course-calendar.mjs';
import {attendanceIntegrationFixture} from './academy-attendance-fixture.mjs';
export async function memorisationFixture(){
  const f=await attendanceIntegrationFixture();
  const dir=new URL('../../migrations/academy/',import.meta.url);
  for(const file of readdirSync(dir).filter(n=>/^00(0[6-9]|1[0-4])_/.test(n)).sort()){
    f.db.exec(readFileSync(new URL(file,dir),'utf8'));
    if(file.startsWith('0006_'))importCourseCalendarPlan(f.db,buildCourseCalendarImport(f.snapshot,await buildOperationalImport(f.snapshot,f.policy)));
  }
  return f;
}

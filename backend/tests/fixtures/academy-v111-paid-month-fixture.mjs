import {readFileSync} from 'node:fs';
import {world} from './academy-v111-native-fixture.mjs';
import {MOU_MEDIA_PROGRAM} from '../../src/academy/d1/lesson-media.js';
export async function createPaidMonthFixture(){
 const f=await world({prepareSource(source){const db=source.db;if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='program_monthly_media_policies'").get())db.exec(readFileSync(new URL('../../migrations/academy/0041_program_monthly_subscriptions.sql',import.meta.url),'utf8'));const now=new Date().toISOString();db.prepare("INSERT INTO program_monthly_media_policies(activity_key,enabled,revision,updated_at,updated_by_account_id) VALUES(?,1,1,?,'sep-global')").run(MOU_MEDIA_PROGRAM,now);db.prepare("INSERT INTO program_monthly_subscriptions(activity_key,account_id,lesson_month,active,class_ids_json,revision,updated_at,updated_by_account_id) VALUES(?,'sep-student-a','2026-10',1,'[\"mou-class\"]',1,?,'sep-global')").run(MOU_MEDIA_PROGRAM,now);},prepareEnvironment({env,app}){if(app==='academy')env.ACADEMY_MONTHLY_SUBSCRIPTIONS='1';}});
 f.loginId='separation-studentA';f.envs.academy.ACADEMY_ACCEPTED_SETUP='1';f.paidActivityKey=MOU_MEDIA_PROGRAM;f.paidMonth='2026-10';return f;
}

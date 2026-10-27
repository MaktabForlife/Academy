import {readFileSync} from 'node:fs';
import {videoFixture,mp4} from './academy-session-video-fixture.mjs';
import {MOU_MEDIA_PROGRAM as scope} from '../../src/academy/d1/lesson-media.js';
export {scope,mp4};
export async function monthlyFixture(){
 const f=await videoFixture();
 f.db.exec(readFileSync(new URL('../../migrations/academy/0040_program_monthly_subscriptions.sql',import.meta.url),'utf8'));
 f.db.prepare('UPDATE activities SET name=? WHERE activity_key=?').run('Tafseer',scope);
 f.env.ACADEMY_MONTHLY_SUBSCRIPTIONS='1';
 f.monthly=(action,input,token)=>f.call('/api/admin/platform/program-monthly-subscriptions/'+action,{activityKey:scope,...input},token);
 f.monthlyOwn=(action,input,token)=>f.call('/api/academy/monthly-media/'+action,{...input},token);
 return f;
}

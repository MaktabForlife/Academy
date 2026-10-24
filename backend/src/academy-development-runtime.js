import academy from './academy-runtime.js';
import {recoveryBucket} from './academy/d1/recovery-storage.js';
export {ProgramTimetableCoordinator} from './academy/d1/library-storage.js';
const storage=env=>({...env,...Object.fromEntries(['LESSON_MEDIA_BUCKET','ASSESSMENT_BUCKET','MEDIA_BUCKET'].map(name=>[name,recoveryBucket(env[name],env.ACADEMY_OBJECT_NAMESPACE)]))});
export default {
 fetch:(request,env,ctx)=>academy.fetch(request,storage(env),ctx),
 scheduled:(event,env,ctx)=>academy.scheduled(event,storage(env),ctx)
};

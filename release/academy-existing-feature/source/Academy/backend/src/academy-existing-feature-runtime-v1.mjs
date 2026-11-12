// Academy-only native fetch; exact owning recoveryBucket projection, no Studio service/child import.
import academy from './academy-runtime.js';
import {recoveryBucket} from './academy/d1/recovery-storage.js';
const storage=env=>({...env,...Object.fromEntries(['LESSON_MEDIA_BUCKET','ASSESSMENT_BUCKET','MEDIA_BUCKET'].map(name=>[name,recoveryBucket(env[name],env.ACADEMY_OBJECT_NAMESPACE)]))});
export default {fetch:(request,env,ctx)=>academy.fetch(request,storage(env),ctx)};

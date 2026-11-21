import {equal,requireThat,safeInt,uuid} from './codec.mjs';

export const SHARED_PAIR_MODE='v111.01-shared';

export function academyCookiePairControl(family){
 const projection=JSON.parse(family.projection_json);
 if(projection.academyPairMode!==SHARED_PAIR_MODE)return null;
 return {
  mode:SHARED_PAIR_MODE,
  fingerprint:family.fingerprint,
  generation:family.fingerprint_generation,
  pendingOperation:projection.academyPairPending??null
 };
}

export function validateAcademyCookiePairControl(pair){
 requireThat(pair?.mode===SHARED_PAIR_MODE
  &&typeof pair.fingerprint==='string'&&/^[0-9a-f]{64}$/.test(pair.fingerprint)
  &&safeInt(pair.generation,1)
  &&(pair.pendingOperation===null||uuid(pair.pendingOperation)),
 'INVALID_ACADEMY_PAIR_CONTROL',503);
 return pair;
}

export function requireAcademyCookiePair(control,fingerprint){
 const pair=validateAcademyCookiePairControl(control.academyPair);
 requireThat(pair.pendingOperation===null,'ACADEMY_PAIR_PENDING',503);
 requireThat(typeof fingerprint==='string'&&equal(pair.fingerprint,fingerprint),'ACADEMY_COOKIE_PAIR_REQUIRED',401);
 return pair;
}

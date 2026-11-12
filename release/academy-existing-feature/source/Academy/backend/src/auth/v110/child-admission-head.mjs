// Fixed native admission predicates. Same-generation readmission is allowed
// only after explicit own-family logout, never to bypass idle/current authority.
// The signed admission and native mapping/floor guards remain mandatory.
export const childHeadAdmissionFence=`NOT EXISTS(
 SELECT 1 FROM jwt_v110_child_heads b WHERE b.browser_id=j.browser_id AND
 (b.browser_generation>j.browser_generation OR (b.browser_generation=j.browser_generation AND NOT EXISTS(
  SELECT 1 FROM jwt_v110_families old WHERE old.family_id=b.family_id AND old.revoked=1
  AND b.parent_id=j.parent_id AND b.native_owner_id=j.native_owner_id
  AND old.parent_session_id=j.parent_id AND old.account_id=j.native_owner_id
  AND old.browser_id=j.browser_id AND old.browser_generation=j.browser_generation
  AND old.credential_epoch=j.native_epoch AND old.original_signed_in_at_s=j.original_signed_at_s
  AND old.original_expires_at_s=j.original_expires_at_s
  AND EXISTS(SELECT 1 FROM jwt_v110_security_audit a WHERE a.family_id=old.family_id AND a.event_type='child-logout')
 ))))`;
export const childHeadReplacement=`browser_generation<excluded.browser_generation OR (
 browser_generation=excluded.browser_generation AND parent_id=excluded.parent_id AND native_owner_id=excluded.native_owner_id
 AND EXISTS(SELECT 1 FROM jwt_v110_families old JOIN jwt_v110_families fresh ON fresh.family_id=excluded.family_id
  WHERE old.family_id=jwt_v110_child_heads.family_id AND old.revoked=1
  AND old.account_id=fresh.account_id AND old.parent_session_id=fresh.parent_session_id
  AND old.browser_id=fresh.browser_id AND old.browser_generation=fresh.browser_generation
  AND old.credential_epoch=fresh.credential_epoch AND old.original_signed_in_at_s=fresh.original_signed_in_at_s
  AND old.original_expires_at_s=fresh.original_expires_at_s
  AND EXISTS(SELECT 1 FROM jwt_v110_security_audit a WHERE a.family_id=old.family_id AND a.event_type='child-logout')
 ))`;

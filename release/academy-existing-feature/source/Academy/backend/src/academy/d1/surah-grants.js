// Additional website access is separate from payment history and recording rights.
export const surahGrantsEnabled=repository=>repository.features?.surahGrants===true;
export const surahRightsSQL=account=>`SELECT g.activity_key,g.surah_id,g.revision FROM program_surah_grants g
 JOIN program_surahs s ON s.surah_id=g.surah_id AND s.activity_key=g.activity_key
 JOIN activities x ON x.activity_key=g.activity_key
 WHERE g.account_id=${account} AND g.active=1 AND s.active=1 AND x.active=1 AND x.lifecycle='ACTIVE'
 ORDER BY g.activity_key,g.surah_id`;

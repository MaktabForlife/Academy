-- Verified owner-supplied recordings, 6–8 October 2026. Run after 0017.
-- Fail atomically if the original timetable or teaching class has changed.
INSERT INTO academy_write_guards(guard_id,accepted) VALUES('mou-media-demo-seed',
 (SELECT count(*)=1 FROM timetable_publications WHERE activity_key='PROGRAM:PRG-656bcece-4310-49c7-87d7-ee06756f66c1')
 AND EXISTS(SELECT 1 FROM timetable_publications WHERE publication_id='PUB-b154e930-7891-4dd7-bad2-7d8b0ec7b305' AND version_no=1 AND effective_from='2026-10-08'
 AND json_extract(snapshot_json,'$.effectiveFrom')='2026-10-08' AND json_array_length(snapshot_json,'$.rules')=7)
 AND EXISTS(SELECT 1 FROM classes WHERE activity_key='PROGRAM:PRG-656bcece-4310-49c7-87d7-ee06756f66c1' AND class_id='CLS-39751608-d213-4c66-a4d5-dccfbbeb1c57' AND active=1)
 AND EXISTS(SELECT 1 FROM accounts WHERE account_id='1b6c1dc0-04c9-4136-adec-95d5cb92041b' AND active=1));

INSERT OR IGNORE INTO program_historical_extensions VALUES('HISTORY-MOU-20261006-07','PROGRAM:PRG-656bcece-4310-49c7-87d7-ee06756f66c1','PUB-b154e930-7891-4dd7-bad2-7d8b0ec7b305','2026-10-06','2026-10-07','Owner confirmed the new term began 6 October; project the unchanged weekly schedule over the two missing dates.',strftime('%Y-%m-%dT%H:%M:%fZ','now'));

WITH dates(lesson_id,lesson_date,title,weekday) AS (VALUES
 ('MOU-20261006','2026-10-06','Tarteel & Tadabbur',2),
 ('MOU-20261007','2026-10-07','Duas & Akhlaaq',3),
 ('MOU-20261008','2026-10-08','Tazkiyah & Tarikh',4))
INSERT OR IGNORE INTO lesson_media_lessons(lesson_id,activity_key,class_id,lesson_date,title,start_time,end_time,teacher_id,teacher_name,state,source_publication_id,source_lessons_json,updated_at)
SELECT d.lesson_id,p.activity_key,'CLS-39751608-d213-4c66-a4d5-dccfbbeb1c57',d.lesson_date,d.title,'09:30','10:30','1b6c1dc0-04c9-4136-adec-95d5cb92041b','Ml Shakirah','PUBLISHED',p.publication_id,
 (SELECT json_group_array(json_object('ruleId',json_extract(r.value,'$.id'),'subject',json_extract(r.value,'$.subjectName'),'module',json_extract(r.value,'$.moduleName'),'startTime',json_extract(r.value,'$.startTime'),'endTime',json_extract(r.value,'$.endTime'))) FROM json_each(p.snapshot_json,'$.rules') r WHERE EXISTS(SELECT 1 FROM json_each(r.value,'$.weekdays') w WHERE w.value=d.weekday)),
 strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM dates d JOIN timetable_publications p ON p.activity_key='PROGRAM:PRG-656bcece-4310-49c7-87d7-ee06756f66c1' AND p.publication_id='PUB-b154e930-7891-4dd7-bad2-7d8b0ec7b305';

INSERT OR IGNORE INTO lesson_media_assets(asset_id,activity_key,kind,youtube_id,created_at) VALUES
 ('MOU-VIDEO-20261006','PROGRAM:PRG-656bcece-4310-49c7-87d7-ee06756f66c1','YOUTUBE','9IuTDcSs6vQ',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('MOU-VIDEO-20261007','PROGRAM:PRG-656bcece-4310-49c7-87d7-ee06756f66c1','YOUTUBE','ujm0T_jZd0U',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('MOU-VIDEO-20261008','PROGRAM:PRG-656bcece-4310-49c7-87d7-ee06756f66c1','YOUTUBE','CZPSPSG85NQ',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
INSERT OR IGNORE INTO lesson_media_links VALUES('MOU-20261006','MOU-VIDEO-20261006'),('MOU-20261007','MOU-VIDEO-20261007'),('MOU-20261008','MOU-VIDEO-20261008');
INSERT OR IGNORE INTO audit_events(event_id,occurred_at,actor_account_id,authority,scope_key,action,record_kind,record_id,changed_fields_json)
VALUES('MOU-MEDIA-DEMO-SEED-10630',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL,'SYSTEM','PROGRAM:PRG-656bcece-4310-49c7-87d7-ee06756f66c1','OWNER_APPROVED_MEDIA_DEMO','LESSON_MEDIA','MOU-20261006-08','{"recordingDates":["2026-10-06","2026-10-07","2026-10-08"],"historicalExtension":["2026-10-06","2026-10-07"],"sourcePublicationUnchanged":true}');
DELETE FROM academy_write_guards WHERE guard_id='mou-media-demo-seed';

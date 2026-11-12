import {assessmentRolesSQL} from './assessment-store.js';
export const NOTE_RETENTION_DEFAULT_MONTHS=3;
export const NOTE_RETENTION_DEFAULT_WARNING_DAYS=7;
export const retentionNoticePrefix='note-expiry:';
export const isRetentionNotice=id=>typeof id==='string'&&id.startsWith(retentionNoticePrefix);

// Calendar months, clamped at month end (31 January + 3 months = 30 April).
export function noteExpiry(createdAt,months){
 const date=new Date(createdAt),day=date.getUTCDate();
 if(!Number.isFinite(date.getTime())||!Number.isInteger(months)||months<1||months>120)throw Error('Invalid note retention policy.');
 date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+months);
 const last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
 date.setUTCDate(Math.min(day,last));return date.toISOString();
}

// A class warning is one shared row. Per-account rows are sparse read/archive
// receipts, created only when a learner interacts with the notice.
export function retentionInboxSQL(base,actor,split=false){
 const account="'"+String(actor).replaceAll("'","''")+"'";
 const roleSource=split?'SELECT account_id,activity_key,role FROM main.effective_activity_roles':assessmentRolesSQL;
 const learning=`(EXISTS(SELECT 1 FROM (${roleSource}) access WHERE access.account_id=a.account_id AND access.activity_key=i.activity_key AND access.role='STUDENT') OR EXISTS(SELECT 1 FROM main.effective_course_subscriptions access WHERE access.account_id=a.account_id AND access.activity_key=i.activity_key) OR EXISTS(SELECT 1 FROM main.course_settings access WHERE access.activity_key=i.activity_key AND access.legacy_access_model='FREE' AND access.policy_review_state='CONFIRMED'))`;
 const audience=`EXISTS(SELECT 1 FROM main.accounts a JOIN main.activities area ON area.activity_key=i.activity_key WHERE area.active=1 AND area.lifecycle='ACTIVE' AND a.account_id=${account} COLLATE NOCASE AND a.active=1 AND (EXISTS(SELECT 1 FROM main.class_memberships m WHERE m.activity_key=i.activity_key AND m.account_id=a.account_id AND m.class_id IN(SELECT value FROM json_each(i.class_ids_json)) AND m.active=1 AND (m.start_date IS NULL OR m.start_date<=date('now')) AND (m.end_date IS NULL OR m.end_date>=date('now')) AND EXISTS(SELECT 1 FROM (${roleSource}) role WHERE role.account_id=a.account_id AND role.activity_key=m.activity_key AND role.role='STUDENT')) OR EXISTS(SELECT 1 FROM main.attendance_delivery_members m WHERE m.activity_key=i.activity_key AND m.account_id=a.account_id AND m.run_id IN(SELECT value FROM json_each(i.class_ids_json)) AND m.state='VALID' AND ${learning} AND m.join_date<=date('now') AND (m.leave_date IS NULL OR m.leave_date>=date('now')))))`;
 return base+` UNION ALL SELECT 'note-expiry:'||i.item_id notice_id,NULL draft_id,NULL actor_id,'Academy' sender_name,'LEARN' workspace,'PDF notes will be deleted — download your copy' subject,
 'PDF notes for your class: '||i.label||char(10)||'Original lesson date: '||i.lesson_date||char(10)||'Scheduled deletion: '||i.delete_after||char(10)||'Please open the Academy timetable and download these PDF notes from the lesson attachments before this date to keep access. Downloaded copies remain on your device. Access still follows your current class permissions.' body,
 '[]' audience_json,'null' link_json,0 requires_ack,1 recipient_count,'SENT' state,i.warned_at created_at,i.warned_at issued_at,i.warned_at scheduled_for,NULL withdrawn_at,'' withdrawal_reason,NULL previous_notice_id,
 ${account} account_id,r.first_opened_at,coalesce(r.unread,1) unread,NULL acknowledged_at,r.archived_at FROM note_retention_items i LEFT JOIN note_retention_recipients r ON r.item_id=i.item_id AND r.account_id=${account} COLLATE NOCASE WHERE i.state='WARNED' AND i.warned_at IS NOT NULL AND i.activity_key IN(SELECT activity_key FROM main.class_memberships WHERE account_id=${account} COLLATE NOCASE AND active=1 UNION SELECT activity_key FROM main.attendance_delivery_members WHERE account_id=${account} COLLATE NOCASE AND state='VALID') AND ${audience}`;
}

export const retentionHiddenSQL=(kind,id)=>`NOT EXISTS(SELECT 1 FROM main.note_retention_items expiry WHERE expiry.kind='${kind}' AND expiry.ref_id=${id} AND expiry.state IN('PURGING','DELETED'))`;

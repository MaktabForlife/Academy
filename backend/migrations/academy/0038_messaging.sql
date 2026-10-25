-- Operational browser messaging. Retained notices and account-specific receipts.
CREATE TABLE messaging_drafts (
 draft_id TEXT PRIMARY KEY,
 actor_id TEXT NOT NULL COLLATE NOCASE REFERENCES accounts(account_id),
 workspace TEXT NOT NULL,
 subject TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '',
 targets_json TEXT NOT NULL CHECK(json_valid(targets_json)),
 link_json TEXT NOT NULL DEFAULT 'null' CHECK(json_valid(link_json)),
 requires_ack INTEGER NOT NULL DEFAULT 0 CHECK(requires_ack IN(0,1)),
 schedule_local TEXT, schedule_at TEXT, timezone TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1,
 state TEXT NOT NULL DEFAULT 'DRAFT' CHECK(state IN('DRAFT','SCHEDULED','SENT','CANCELLED','NEEDS_REVIEW')),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 notice_id TEXT, previous_notice_id TEXT, last_error TEXT NOT NULL DEFAULT '',
 next_attempt_at TEXT, attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX messaging_drafts_owner ON messaging_drafts(actor_id,state,updated_at,draft_id);
CREATE INDEX messaging_drafts_due ON messaging_drafts(state,schedule_at,next_attempt_at);
CREATE TABLE messaging_reviews (
 review_id TEXT PRIMARY KEY, draft_id TEXT NOT NULL REFERENCES messaging_drafts(draft_id),
 actor_id TEXT NOT NULL COLLATE NOCASE REFERENCES accounts(account_id),
 draft_revision INTEGER NOT NULL, digest TEXT NOT NULL, recipient_digest TEXT NOT NULL,
 source_head TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX messaging_reviews_draft ON messaging_reviews(draft_id,created_at);
CREATE TABLE messaging_notices (
 notice_id TEXT PRIMARY KEY,
 draft_id TEXT NOT NULL UNIQUE REFERENCES messaging_drafts(draft_id),
 actor_id TEXT NOT NULL COLLATE NOCASE REFERENCES accounts(account_id),
 sender_name TEXT NOT NULL, workspace TEXT NOT NULL,
 subject TEXT NOT NULL, body TEXT NOT NULL,
 targets_json TEXT NOT NULL CHECK(json_valid(targets_json)),
 audience_json TEXT NOT NULL CHECK(json_valid(audience_json)),
 link_json TEXT NOT NULL CHECK(json_valid(link_json)),
 requires_ack INTEGER NOT NULL CHECK(requires_ack IN(0,1)),
 recipient_count INTEGER NOT NULL,
 recipients_json TEXT NOT NULL CHECK(json_valid(recipients_json)),
 created_at TEXT NOT NULL, issued_at TEXT,
 state TEXT NOT NULL CHECK(state IN('ISSUING','SENT','WITHDRAWN')),
 withdrawn_at TEXT, withdrawn_by TEXT, withdrawal_reason TEXT NOT NULL DEFAULT '',
 previous_notice_id TEXT REFERENCES messaging_notices(notice_id),
 source_head TEXT NOT NULL, scheduled_for TEXT
);
CREATE INDEX messaging_notices_sender ON messaging_notices(actor_id,created_at,notice_id);
CREATE TABLE messaging_recipients (
 notice_id TEXT NOT NULL REFERENCES messaging_notices(notice_id),
 account_id TEXT NOT NULL COLLATE NOCASE REFERENCES accounts(account_id),
 display_name TEXT NOT NULL, delivered_at TEXT NOT NULL,
 first_opened_at TEXT, unread INTEGER NOT NULL DEFAULT 1 CHECK(unread IN(0,1)),
 acknowledged_at TEXT, archived_at TEXT,
 PRIMARY KEY(notice_id,account_id)
);
CREATE INDEX messaging_recipients_inbox ON messaging_recipients(account_id,archived_at,delivered_at,notice_id);
CREATE TABLE messaging_jobs (
 notice_id TEXT PRIMARY KEY REFERENCES messaging_notices(notice_id),
 position INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at TEXT NOT NULL, last_error TEXT NOT NULL DEFAULT '',
 state TEXT NOT NULL DEFAULT 'PENDING' CHECK(state IN('PENDING','DONE'))
);
CREATE INDEX messaging_jobs_due ON messaging_jobs(state,next_attempt_at);
CREATE TABLE messaging_events (
 event_id TEXT PRIMARY KEY, notice_id TEXT REFERENCES messaging_notices(notice_id),
 draft_id TEXT REFERENCES messaging_drafts(draft_id),
 actor_id TEXT NOT NULL COLLATE NOCASE REFERENCES accounts(account_id),
 action TEXT NOT NULL, details_json TEXT NOT NULL CHECK(json_valid(details_json)), occurred_at TEXT NOT NULL
);
CREATE INDEX messaging_events_notice ON messaging_events(notice_id,occurred_at,event_id);
CREATE TRIGGER messaging_notice_immutable BEFORE UPDATE OF draft_id,actor_id,sender_name,workspace,subject,body,targets_json,audience_json,link_json,requires_ack,recipient_count,recipients_json,created_at,previous_notice_id,source_head,scheduled_for ON messaging_notices
 BEGIN SELECT RAISE(ABORT,'messaging_notice_immutable'); END;
CREATE TRIGGER messaging_notice_retained BEFORE DELETE ON messaging_notices BEGIN SELECT RAISE(ABORT,'messaging_notice_retained'); END;
CREATE TRIGGER messaging_recipient_identity BEFORE UPDATE OF notice_id,account_id,display_name,delivered_at ON messaging_recipients BEGIN SELECT RAISE(ABORT,'messaging_recipient_identity'); END;
CREATE TRIGGER messaging_receipt_retained BEFORE DELETE ON messaging_recipients BEGIN SELECT RAISE(ABORT,'messaging_receipt_retained'); END;
CREATE TRIGGER messaging_open_retained BEFORE UPDATE OF first_opened_at ON messaging_recipients WHEN OLD.first_opened_at IS NOT NULL AND NEW.first_opened_at IS NOT OLD.first_opened_at BEGIN SELECT RAISE(ABORT,'messaging_open_retained'); END;
CREATE TRIGGER messaging_ack_retained BEFORE UPDATE OF acknowledged_at ON messaging_recipients WHEN OLD.acknowledged_at IS NOT NULL AND NEW.acknowledged_at IS NOT OLD.acknowledged_at BEGIN SELECT RAISE(ABORT,'messaging_ack_retained'); END;
CREATE TRIGGER messaging_event_update BEFORE UPDATE ON messaging_events BEGIN SELECT RAISE(ABORT,'messaging_event_retained'); END;
CREATE TRIGGER messaging_event_delete BEFORE DELETE ON messaging_events BEGIN SELECT RAISE(ABORT,'messaging_event_retained'); END;
CREATE TABLE messaging_operations (
 actor_id TEXT NOT NULL COLLATE NOCASE REFERENCES accounts(account_id), operation_id TEXT NOT NULL,
 request_hash TEXT NOT NULL, result_json TEXT NOT NULL CHECK(json_valid(result_json)), created_at TEXT NOT NULL,
 PRIMARY KEY(actor_id,operation_id)
);

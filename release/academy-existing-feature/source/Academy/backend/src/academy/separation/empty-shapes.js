// Retained read adapters only; no physical legacy tables or source connection.
export const emptyShapes={
 "academy_admissions": [
  "account_id",
  "status",
  "review_state",
  "admitted_at",
  "admitted_by_account_id",
  "revision"
 ],
 "academy_import_schema": [
  "migration_name",
  "migration_sha256"
 ],
 "activity_source_bindings": [
  "activity_key",
  "provider",
  "source_ref",
  "schema_version"
 ],
 "source_record_map": [
  "run_id",
  "source_store_key",
  "source_table",
  "source_id",
  "target_table",
  "target_key",
  "source_record_sha256",
  "source_row_number"
 ],
 "legacy_identity_links": [
  "link_id",
  "account_id",
  "activity_key",
  "kind",
  "profile_type",
  "local_record_id"
 ],
 "library_access_policies": [
  "resource_key",
  "state",
  "entitlement_source",
  "subscription_scope"
 ],
 "library_exclusions": [
  "resource_key"
 ],
 "program_library_destinations": [
  "activity_key",
  "folder_id"
 ],
 "program_library_roots": [
  "activity_key",
  "folder_id",
  "name"
 ],
 "program_legacy_teachers": [
  "activity_key",
  "account_id",
  "run_id"
 ],
 "attendance_registers": [
  "activity_key",
  "register_id",
  "sequence",
  "attendance_date",
  "publication_id",
  "lesson_anchor",
  "lesson_json",
  "learner_count",
  "submitted_at",
  "submitted_by_account_id",
  "source_actor_id",
  "operation_id"
 ],
 "attendance_marks": [
  "activity_key",
  "register_id",
  "account_id",
  "display_name",
  "status"
 ],
 "lesson_media_comments": [
  "comment_id",
  "lesson_id",
  "account_id",
  "parent_id",
  "body",
  "state",
  "staff",
  "pinned",
  "revision",
  "created_at",
  "updated_at"
 ],
 "migration_runs": [
  "run_id",
  "environment",
  "source_snapshot_sha256",
  "code_commit",
  "state",
  "started_at",
  "finished_at"
 ],
 "migration_checks": [
  "run_id",
  "dataset_key",
  "scope_key",
  "check_name",
  "status",
  "expected_count",
  "actual_count",
  "findings_count",
  "checked_at"
 ],
 "learning_imports": [
  "singleton",
  "base_run_id",
  "source_sha256",
  "imported_at",
  "summary_json"
 ],
 "course_workflow_imports": [
  "singleton",
  "base_run_id",
  "source_sha256",
  "imported_at",
  "summary_json"
 ],
 "activity_policy_imports": [
  "activity_key",
  "source_access_model",
  "source_review_state",
  "source_stage",
  "source_description",
  "run_id"
 ],
 "legacy_access_evidence": [
  "evidence_id",
  "run_id",
  "account_id",
  "activity_key",
  "source_role",
  "source_effective",
  "source_review_state",
  "source_locator"
 ],
 "role_import_reviews": [
  "review_id",
  "account_id",
  "activity_key",
  "source_locator",
  "source_value",
  "proposed_role",
  "status",
  "note",
  "reviewed_by_account_id",
  "reviewed_at"
 ],
 "role_mapping_decisions": [
  "source_role",
  "target_role",
  "decision_source",
  "approved_at"
 ],
 "data_ownership": [
  "dataset_key",
  "scope_key",
  "authoritative_store",
  "phase",
  "verified_run_id",
  "switched_at",
  "revision"
 ],
 "d1_migrations": [
  "id",
  "name",
  "applied_at"
 ],
 "timetable_drafts": [
  "activity_key",
  "scope_key",
  "source_revision",
  "source_sequence",
  "draft_json",
  "source_draft_sha256",
  "modified_at"
 ],
 "course_draft_sessions": [
  "activity_key",
  "run_id",
  "session_id",
  "module_id",
  "teacher_account_id",
  "session_date",
  "start_time",
  "end_time",
  "session_kind",
  "zoom_link",
  "schedule_rule_key",
  "occurrence_date",
  "description"
 ],
 "course_draft_lifecycle": [
  "activity_key",
  "run_id",
  "session_id",
  "lifecycle_id",
  "status",
  "previous_session_id",
  "replacement_session_id"
 ],
 "course_management_drafts": [
  "activity_key",
  "run_id",
  "details_json",
  "stage",
  "completed_at",
  "repeated_from_activity_key",
  "validation_sha256",
  "revision",
  "updated_at",
  "updated_by_account_id",
  "schedule_sha256",
  "accepted_sha256"
 ],
 "program_timetable_records": [
  "timetable_id",
  "activity_key",
  "draft_json",
  "status",
  "source_id",
  "publication_id",
  "validation_hash",
  "updated_at"
 ],
 "teacher_availability_changes": [
  "change_id",
  "account_id",
  "previous_json",
  "ranges_json",
  "changed_at"
 ],
 "teacher_availability_notices": [
  "account_id",
  "change_id"
 ]
};

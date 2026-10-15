// Pure source-snapshot formats retained for offline import verification and recovery.
export const ACADEMY_SUBJECT_HEADERS = {
  AcademySubjectList:['SubjectID','SubjectName','Active','CreatedDate','CreatedByAccountID'],
  AcademySubjectOperations:['OperationID','PayloadHash','ResultJSON','DateStamp','AccountID','SourceSpreadsheetID','SourceSubjectsJSON']
};
export const ACADEMY_LIBRARY_HEADERS = Object.freeze([
  'ResourceKey', 'Status', 'AccessState', 'EntitlementSource', 'SubscriptionScope'
]);

# V106.38 — Imtihaan and assessment status

An **Imtihaan** is the group of assessment papers, such as Final 2026. It owns the Programs/Courses and class selection. Each assessment under it owns a separate name, subject, descriptor, date, duration, total mark, PDF paper, submissions and results. Editing the Imtihaan name does not rename an assessment paper or change its schedule or attachments.

The admin screen now opens with the **Imtihaan Register**. Add Imtihaan creates a Registered group. Open it to add assessments; each new assessment name starts blank so the paper is named intentionally. An admin validates the schedule and selects **Set Scheduled**. The Register status is then read-only and follows the underlying workflow:

| Imtihaan status | Evidence used |
| --- | --- |
| Registered | No confirmed schedule or active papers |
| Scheduled | Admin confirmed a valid schedule |
| In progress | At least one paper was published |
| Being assessed | The final scheduled exam date reached 03:00 Johannesburg time |
| Processing results | The final exam day arrived and every received latest answer has approved moderation |
| Complete | Every received latest answer has a released mark and no authorised replacement is outstanding |

The assessment timetable has separate paper and results status columns for staff. Paper status moves through Waiting for submission, Drafted, Approved, Published and Released; a moderator return is shown as Returned. Published means admin has authorised release, while Released requires the exam date's 03:00 Johannesburg boundary. Results show Waiting, Uploaded, Assessed, Moderated and Marks released based on actual submissions and decisions. Students do not see aggregate class results status.

Status labels do not publish a schedule or paper and do not release marks, feedback or scripts. Those actions retain their separate permission and moderation checks. Existing Assessment Register status values remain in storage for compatibility; the new Imtihaan display status is derived from live workflow data. No D1 migration or R2 object change is required.

The supplied `assessmnt status.xlsx` informed the three-track distinction. Its proposed manual Results steps, including Ready for Assessment and Processing results, still need a precise transition and validation rule; this release does not introduce a manual override that could conflict with saved marks. The automatic group stage treats “complete answers” as all **received latest** answers having approved moderation, so a learner who never submitted does not permanently block processing.

Validation: assessment D1 tests cover status transitions, prior data preservation and independent paper names. The local Chrome walkthrough covers desktop and 320–768 px layouts, add/edit/delete, moderation, submissions, result release and mobile help. No production assessment records are rewritten in this release.

# V106.89 — Contact Admin to join; Enroll now for registered users

The homepage button is **Contact Admin to Join Academy**. It opens WhatsApp directly, in a new tab/app, with this editable message:

> Assalaamu alaikum.
>
> I would like to enroll in the Academy.
>
> Please contact me.

Visitors enter their name in the WhatsApp conversation. The website does not collect a visitor name or phone number or submit an anonymous inbox application. Admin confirms the sender's WhatsApp number from the message received. Opening a link is not treated as sending or verification. The existing public Admin phone number and email are also shown under the contact fallback for people unable to use WhatsApp.

Signed-in users open **Enroll now** from Learn, select Programs/Courses and indicate payment. They can submit on the website or prepare a WhatsApp request. Neither option asks for a name or number. Website submissions derive identity and saved contact details on the server from the authenticated account. A missing profile phone number does not block submission. The editable WhatsApp request contains the learner's name, login ID, selections/year/cost and payment indication. Separate POP messaging remains manual.

Confirmed website sends retain the OK/Cancel popup and duplicate-safe retry. Visitors cannot bypass the interface by posting directly to the submission endpoint: authentication is required. Existing inbox records and their historical contact snapshots remain manageable; manual registration, enrolment and prepared welcome messages remain separate.

Migration 0027 relaxes the stored contact-number length constraint to allow a genuinely missing contact. It copies both request tables before replacing them and recreates their indexes and foreign keys. Existing rows, IDs, selections and retry hashes are preserved. A protected Development database export is taken before applying the upgrade. No new database, Worker or Git branch is created. The briefly used phone-selector library is removed because contact-entry fields are no longer part of this flow.

Verification: all 71 backend test files passed, including nine enrolment tests covering authentication, server-derived identity, missing profile contacts, cross-account retry rejection and migration preservation. Packaged Chrome passed 21 flows covering the WhatsApp link, contact fallback at 320/390/1440 pixels, no contact fields, signed-in submission/retry, inline catalogue saves and manual prepared messages. No live test enrolments or WhatsApp messages were created.

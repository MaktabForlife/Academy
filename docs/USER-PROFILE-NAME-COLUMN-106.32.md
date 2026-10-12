# V106.32 — Freeze only the user name column

The user profile sheet keeps only User name fixed during horizontal scrolling. Login ID and WhatsApp scroll with the other editable columns on desktop and mobile. Column widths, the sticky header row and all editing/save behaviour are retained. The profile stylesheet uses the new release cache version.

Validation: actual browser checks passed at 390px, 320px and 1440px. The name stays fixed, Login ID and WhatsApp scroll with the sheet, and synthetic mobile edits to both fields save successfully. All 22 existing profile, permission and routing checks passed, and the development Worker dry-run passed. No database migration or data changes are required.

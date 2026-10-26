# Planning image sharing - V107.77

The user requested one image per shared plan while retaining the existing PDF download. The user explicitly authorised deploying the verified change to the existing Academy website and matching Development API. No migration, live data correction, binding or private coordinator change is required.

- Download A4 PDF retains the paginated PDF, including Arabic text and Admin notes.
- Share plan image renders the complete current plan as one continuous PNG. It contains one header, every subject/class section, reflection and Admin notes. It does not create an image per PDF page or capture only the visible editor.
- Prepare the PNG before a fresh Share image tap. Native sharing receives exactly one image File, without a text, title or URL payload. This matches the installed ChatShare extension's support for one image per invocation. No messages are sent during verification.
- If native file sharing is unavailable, download the same one PNG with clear attachment guidance. A rejected share offers retry or Download image. Cancelling does not trigger another action; resetting the planner closes prepared sharing.
- Bound image memory and dimensions, scale moderately for longer plans, and retry at smaller dimensions if the browser cannot encode the image. Reject plans that cannot fit readably in one image, with guidance to use the complete PDF. Never crop or omit plan content.

Verification uses synthetic local accounts: real PNG decoding and signature, exactly one image attachment with a fresh gesture, cancellation/errors/fallback, complete ten-subject rendering with Arabic and final notes, oversized-plan handling, PDF regression, responsive widths and mobile touch emulation. iPhone-sized Chromium emulation is not a Safari/device or recipient-app delivery test. ChatShare's installed activation rules and the developer's App Store listing support images; actual delivery to WhatsApp still depends on those apps.

Local verification passed 36 browser checks, nine planning persistence/permission tests, and image encoder retry/failure checks. Generated weekly and 18-page course PDFs were inspected, along with the single weekly image and ten-subject image. Live verification is limited to release/readiness metadata and the changed static assets.

Release checks cover all 122 regression files: 116 passed in the full run; the remaining six passed on targeted rerun after aligning current cache references and allowing the disposable Workers runtime tests to open local ports. The release-integrity check also passed again. Both Pages and API dry-run builds passed; deployed static files are compared with the exact built artifact.

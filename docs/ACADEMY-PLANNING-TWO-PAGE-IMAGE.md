# Full-size plan image - local follow-up to V107.77

The user confirmed that plans will be less than two PDF pages and requested identical PDF/image text size. Keep the PNG at the PDF renderer's 1190-pixel width and use the same fonts without scaling. Extend the image vertically to the complete content height, up to two A4 page heights (3368 pixels). Remove the image shrinking and lower-resolution retry behavior.

Share still supplies exactly one PNG file, and Download still produces the original paginated A4 PDF. Encoding failure offers PDF guidance. Content outside the two-page image allowance is never cropped or shrunk. No backend, database or permission changes are required.

Verification compares an actual two-page PDF with its one-image export: same width and fonts, identity drawing scale, Arabic text, all subject/class details, reflection and final Admin note. Existing sharing, cancellation, download fallback, mobile touch and PDF checks remain in the browser acceptance run. This follow-up is local and has not been deployed.

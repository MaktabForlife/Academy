# V106.57 — Academy home welcome styling

The Academy welcome panel uses the same purple gradient and logo watermark as the self-paced learning section. A shared background variable keeps the gradient consistent. The heading reads `ummabbadacademy.com`; the mission text is centred, and the greeting, heading and mission use light text for contrast.

Development-only release based on V106.56. The website and matching Development Worker identify V106.57. No database migration, record correction or permission changes are required.

## Verification

- Existing Academy entrance UI, router and release-marker checks pass.
- Development Worker deployment dry run passes.
- Desktop 1440px and mobile 390px browser previews confirm matching gradient backgrounds, centred mission text and a heading that fits without horizontal overflow.

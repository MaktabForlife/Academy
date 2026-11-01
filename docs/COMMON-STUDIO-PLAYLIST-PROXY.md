# Common Studio playlist proxy

The existing signed Studio access proxy now accepts the existing MOU playlist aliases for native Courses as well as monthly Tafseer/MOU. Monthly grids and historical Surah-table commands remain Tafseer-only. The additional explicit `mou-playlist-order` command is a sensitive write, not an ordinary cached read.

Actor/session/epoch/role, scope ownership, current Source confirmation, delivery acknowledgements and proof freshness are unchanged. No browser actor, role, timezone or monthly Course claim becomes authority. Playlist entitlement, wrapper identity, explicit publication and revision/retry checks remain in Studio.

Paired dependency: Studio common playlist runtime based on2ac4243 plus additive0013_recording_playlists.sql; separate root Source UI84dea011 and StudioMedia client are composed by the release owner. No Source schema or JS change in this patch. Activate only as part of the approved matching Academy/Studio release; preserve original data/media and use a playlist-aware recovery pair after new data exists.

Validation: actual local signed Source/Target tests cover Course and Tafseer playlist creation, open dates, exact retries, stale edits, read-only historical rows, command forwarding, Course monthly-grid denial and forged/learner scope denial. Broader Target media/rights/read-verification tests are recorded in parent outputs/academy-common-playlists-20261101. No hosted action or push was performed by this feature.

# Programme-clock and source-motion repairs — 15 October 2026

The ending preview was covered by a black opening-fade overlay. Finish Rack
read an inactive prepared source decoder parked at zero, although the canonical
main-video opacity was0.17. Studio now supplies the mapped programme time and
whole programme duration to the existing Finish hook. Native paused captures
show the dim source footage again. Other editors retain the normal attached
video clock. The saved edit and completed movie are unchanged by the preview
repair; the canonical hash stays
`e4217013e5887d711f34ace4e9affb5d961cbec8176a2c2a7b2fc6b6e5afb11e`.

Source opacity/crop curves were evaluated independently at every pixel and
colour plane. The same8-bit geq filter now caches time-only values at the first
pixel of each row, including independently threaded slices, and omits identity
crop gates. No alternate compositor, reduced delivery size or changed motion
decision is used. Threaded byte comparisons and the actual1080p source-motion
plan preserve decoded RGB exactly. Half-second windows at0s and16s improve
from10.378/11.615s to3.163/3.449s (3.28/3.37 times faster).

The same20-second normal Studio export now completes in244.079s, passes native
download and full independent decode, and plays to the end beside its editable
timeline. Movie: [final.mp4](proof/workflow/final.mp4). Full UI recording:
[edited-in-studio.mp4](proof/workflow/edited-in-studio.mp4). All480 decoded picture
frames exactly match the prior film (1,327,104,000 RGB bytes; SHA-256
`b49e29b520f56b97b4a8434f3a3b7b49bee3221882b48f8b6aa68843aa393d76`).
The container SHA differs; decoded audio also differs and is explicitly
unqualified. The earlier receipt lacks an exact start time, so no native
end-to-end speed ratio is claimed.

Two hook cases, three full-editor regressions and146 actual worker cases plus
eight subtests pass. The strict App build passes. No new paid GPU/model jobs.
The remaining strict source-feature comparison is not reclassified as passing.
After the black cover is repaired, fixed-region native/export colour RMSE is
still about5–10 code values; browser CSS grade and FFmpeg YUV finishing remain
different. Diagnostic phase correlation finds small translation but does not
qualify a whole raster or replace the retained2px feature acceptance rule.
Broader colour/glyph/matte, continuous picture, retiming and sound remain open.

`before-r2` captures the old App. The run named`clock-before` loaded the newly
built App and is after-fix evidence, not a before capture. Initial capture
failure from switching to Live Edit before finished-output recovery settled is
retained; the helper now waits for the real recovered output first. Float/16-bit
opacity prototypes were rejected; only the byte-preserving row cache shipped.
All originals, movies, project backups, failed captures and private auth remain
preserved. Owned local QA is stopped at final closeout; other tracks are kept.

The current professional-editor delivery is the
[property-timeline multi-key workflow](../studio-keyframe-selection-20261015/README.md).

# Create a cinematic logo reveal

Development documentation • product 1.2.0 • knowledge 1.0.71 • 2026-11-25

Overall feature ratings and working subfeatures are separate. PARTIAL or BROKEN does not mean every control fails; entries identify verified workflows, release state and the remaining limitation. FUNCTIONAL does not mean professional or production ready. Current account permissions, source ownership and execution availability remain authoritative.

ID: `task.cinematic_logo` • **PARTIAL** • SUPPORTED_WITH_LIMITATIONS

Use owned branding and supported authored scene movement; no public-quality logo result is yet qualified.

## Before you start

- system.account — FUNCTIONAL

## Steps

1. Import the owned logo and select a supported draft/preset.
   Feature: `creative.logo_brand`.

2. For authored vector pieces, add vector artwork in Graphics and shape its points/tangents. This does not automatically trace a supplied PNG or wordmark. Animate the resulting layer in Motion.
   Feature: `studio.vector_artwork`. Controls: [studio.vector.add](../control-reference/index.md#studio-vector-add), [studio.vector.point](../control-reference/index.md#studio-vector-point), [studio.vector.tangent](../control-reference/index.md#studio-vector-tangent), [studio.vector.split](../control-reference/index.md#studio-vector-split), [studio.vector.point_kind](../control-reference/index.md#studio-vector-point_kind), [studio.vector.fill](../control-reference/index.md#studio-vector-fill), [studio.vector.stroke](../control-reference/index.md#studio-vector-stroke), [studio.vector.closed](../control-reference/index.md#studio-vector-closed).

3. Author ordinary layers or a bounded 3D scene; review unsupported final fields.
   Feature: `studio.three_d`. Controls: [studio.three_d.material](../control-reference/index.md#studio-three_d-material), [studio.three_d.focallength](../control-reference/index.md#studio-three_d-focallength).

4. Place deliberate sound cues and review the actual final movie.
   Feature: `studio.sfx`.

## Feature readiness

- studio.export — **PARTIAL**: Downloads the exact completed movie. The released 45-second GPU export is verified, including a faster byte-identical retest. Strict size enforcement, Opus, Display P3 and SDR-mapped HDR10/PCM32 also have retained native local proof; those extensions have not reached the released build. PARTIAL applies to the wider delivery and compatibility scope.
- creative.logo_brand — **PARTIAL**: Draft template slots accept owned branding and a reviewed reveal. Rejected earlier logo films remain rejected and are not approved public examples.
- studio.three_d — **PARTIAL**: Builds bounded mesh compositions and continuously flowing ribbon surfaces. Individual objects retain colours, surfaces, roughness, transforms and pose keys; browser and final lighting/materials remain approximate.
- studio.sfx — **PARTIAL**: Places sound cues in editable projects. The deployed 45-second frame collection verifies 12 sound cues plus its original score through native save/reopen, GPU rendering, exact download and finished playback with sound. Broader audio/template combinations retain their separate limits.
- studio.vector_artwork — **PARTIAL**: Author editable cubic artwork with single or compound contours, even-odd counters, fill/gradient and stroke; animate it with normal layer keys.

## Result and limitations

An owned editable result with current revision and reviewed output; inspect the actual moving picture and sound.

- Follow the linked feature readiness; these steps do not promote the workflow to professional or production readiness.

Troubleshooting references: system.unsupported_media, studio.revision.

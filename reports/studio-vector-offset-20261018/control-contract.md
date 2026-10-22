# Stroke offset control contract

| Property | Contract |
|---|---|
| Native field | `overlays[].strokeOffset`; ordinary motion keys use `property: strokeOffset`. |
| Range / default | −1000…1000 percent of sampled contour distance; default zero. |
| Time | Existing programme edit clock, mapped from output speed before worker evaluation. |
| User editing | Motion inspector and ordinary timeline rows, value/velocity graph, timing/clipboard/history/locks. Enter or blur commits a numeric draft; Escape, seeking and locking cancel it. |
| Canonical update | `editMotionPropertyAtPlayhead` uses the existing field setter or motion-key upsert. Undo restores the prior scalar/key; no second animation store. |
| Save / recovery | Existing version-three layer parameter fields and linked programme motion keys; normal native Backup / Restore. |
| Preview | `buildMotionAutomationStyle` → `studioVectorSvg` → `offsetStudioVectorPoints`. |
| Export | Compiler `base_transform.stroke_offset` / ordinary motion keys → `layer_pose` → `offset_vector_points` inside the existing image compositor. |
| Closed contour | Move the start/end interval modulo one lap, continuously joining its tail/head at the original seam. Full outline stays full. |
| Open contour | Move and clip the interval at the actual endpoints; no connecting chord or looping jump. |
| Empty / fill | Equal/crossed start/end remain empty. Fill and authored geometry remain unchanged. |
| Compatibility | Missing field is zero; nonvector targets reject static values and offset keys, including clipboard retargeting. |

Unit guards cover signed/repeated laps, closed seams, open endpoints, empty/full ranges, unchanged fill, canonical/clipboard/compiler projection, partial numeric drafts, lock/seek/Escape cancellation and actual encoded reverse/2x-speed playback. Native proof checks three independently authored paths, fifteen keys, real signed typing and history, exact cold reopen, same-graph export and recovery. See the completion checkpoint for the final scope and measured qualification; this field does not add contour morphing, tracing or broad predictive picture/sound qualification.

# Viral Clip Studio time contract (foundation v1)

`frontend/src/components/studioTime.js` is the domain clock for new Studio document and command code. Its range shape is `{ space, startTick, endTick }`, with **90,000 integer ticks per second** and half-open `[startTick, endTick)` intervals. Empty ranges mark points; clip occurrences and speed segments require positive duration. The spaces are `source`, `programme`, `clip_local`, and `output`. Legacy seconds enter through `secondsToTicks` and leave through `ticksToSeconds` at adapters. New domain records should not use an unqualified `start` or `end`.

| Space        | Meaning                                                          |
| ------------ | ---------------------------------------------------------------- |
| `source`     | Position in one immutable media asset.                           |
| `programme`  | Position in the edited sequence, before global speed processing. |
| `clip_local` | Offset from the start of one clip occurrence.                    |
| `output`     | Position after the piecewise speed map, used for rendered cues.  |

A **clip occurrence** has its own ID, source asset ID, source range, programme range, and direction. Reusing one source creates distinct occurrence IDs. Forward and reverse occurrences currently require equal source and programme durations. Freeze occurrences hold an explicit source tick. Split, trim, and reorder preserve occurrence identity and source mapping. Mapping one source caption can return several programme/output ranges when the source appears more than once; reverse and freeze are explicit cases. Reverse is represented in the domain even though the current editor does not offer a reverse render operation.

`createOutputTimeMap` requires speed segments to partition the entire programme interval in order. Each segment has a rational rate (`rateNumerator`/`rateDenominator`, or an adapter decimal rounded to one millionth) and maps a programme range to an output range. Gaps and overlaps fail. Frame and sample conversions use rational arithmetic with `floor`, `ceil`, or nearest rounding at the media boundary. Frame rates are numerator/denominator pairs, so 30,000/1,001 frames per second maps to exactly 3,003 ticks per frame. Sample boundaries use the same explicit rounding modes.

The existing export speed sampler now allocates its 240 segment budget across the complete pre-speed programme before emitting ranges. Key times are mandatory boundaries. If there are more distinct key intervals than the limit can represent, the sampler fails explicitly. It never sends an incomplete speed plan for the worker to fill at 1×. Existing render payload fields remain seconds-based until their adapters migrate to this domain clock.

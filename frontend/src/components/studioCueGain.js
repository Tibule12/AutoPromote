import { interpolateAutomationValue, sortAutomationKeyframes } from './studioAutomation';
import { ticksToSeconds, mapStudioContinuousSeconds } from './studioTime';
import { musicBufferPosition } from './studioMusicBufferClock';

// Authored knots remain integer90kHz ticks. Integrate their rational rates as
// the final worker does; rounded output knots are for display/frame indexing.
// Reusing their cumulative rounding moves noise by a fractional audio sample.
const toOutputTime = (map, seconds) => mapStudioContinuousSeconds(map, seconds, 'programme');
const toProgrammeTime = (map, seconds) => mapStudioContinuousSeconds(map, seconds, 'output');

// Ready sources can schedule a nearby onset before the next decoded frame.
// Use the same output map for the delay, offset and subsequent rate changes.
export function studioCueStartPlan({ contextTime, programmeTime, cueStart, duration,
  outputTimeMap, lookahead = .08 }) {
  if (![contextTime, programmeTime, cueStart, duration].every(Number.isFinite) ||
      duration <= 0 || !outputTimeMap?.length) return null;
  const toOutput = time => toOutputTime(outputTimeMap, time);
  const delay = toOutput(cueStart) - toOutput(programmeTime);
  const offset = Math.max(0, programmeTime - cueStart);
  if (delay > lookahead || offset >= duration) return null;
  return { when: contextTime + Math.max(0, delay), offset,
    programmeStart: cueStart + offset };
}

// Parameter scheduling can cross an audio quantum even with prepared PCM.
// A start in the past begins immediately; advance its source offset by that
// elapsed output time so it still shares the song's sample phase.
export function advanceStudioCueStartPlan(plan, contextTime, outputTimeMap, duration) {
  if (!plan || !Number.isFinite(contextTime) || !outputTimeMap?.length) return null;
  if (contextTime <= plan.when) return plan;
  const cueStart = plan.programmeStart - plan.offset;
  const outputStart = toOutputTime(outputTimeMap, plan.programmeStart);
  const outputTime = outputStart + contextTime-plan.when;
  if (outputTime >= ticksToSeconds(outputTimeMap.at(-1).outputRange.endTick)) return null;
  const programmeStart = toProgrammeTime(outputTimeMap, outputTime);
  const offset = programmeStart - cueStart;
  return offset >= duration ? null : { when: contextTime, offset, programmeStart };
}

export function scheduleStudioCueRate({ param, contextTime, programmeStart, programmeEnd, outputTimeMap }) {
  if (!param?.setValueAtTime || !param?.cancelScheduledValues || !outputTimeMap?.length) return false;
  const startTick = programmeStart * 90000, endTick = programmeEnd * 90000;
  const outputStart = toOutputTime(outputTimeMap, programmeStart);
  param.cancelScheduledValues(contextTime);
  for (const segment of outputTimeMap) {
    if (segment.programmeRange.endTick <= startTick || segment.programmeRange.startTick >= endTick) continue;
    const at = Math.max(startTick, segment.programmeRange.startTick);
    param.setValueAtTime(segment.rateNumerator / segment.rateDenominator,
      contextTime + toOutputTime(outputTimeMap, at / 90000) - outputStart);
  }
  return true;
}

// The picture remains the readiness/seek authority. Within its existing 80ms
// output-clock drift allowance, cues use the running song for sample phase.
export function studioCueProgrammeTime({ sourceProgrammeTime, musicState, contextTime,
  trimStart = 0, outputTimeMap, musicClockActive }) {
  if (!musicClockActive || !musicState || !outputTimeMap?.length) return sourceProgrammeTime;
  const output = musicBufferPosition(musicState, contextTime) - trimStart;
  if (!Number.isFinite(output) || output < 0 || output > ticksToSeconds(outputTimeMap.at(-1).outputRange.endTick)) return sourceProgrammeTime;
  const programme = toProgrammeTime(outputTimeMap, output);
  const sourceOutput = toOutputTime(outputTimeMap, sourceProgrammeTime);
  return Math.abs(output - sourceOutput) <= .08 ? programme : sourceProgrammeTime;
}

// Cue fades already live in its PCM. Schedule only the editable bus envelope
// on the audio thread, so a sharp curve does not wait for a decoded picture.
// Pause/seek/track changes still dispose the ordinary cue node in Studio.
export function scheduleStudioCueGain({ param, contextTime, programmeStart, programmeEnd,
  outputTimeMap, keyframes, baseGain }) {
  const keys = sortAutomationKeyframes(keyframes).filter(key => key.property === 'volume');
  if (!keys.length || !param?.cancelScheduledValues || !param?.setValueAtTime ||
      !param?.linearRampToValueAtTime || !outputTimeMap?.length) return false;
  const end = Math.min(programmeEnd, ticksToSeconds(outputTimeMap.at(-1).programmeRange.endTick));
  const start = Math.max(0, programmeStart);
  if (!(end > start) || !Number.isFinite(contextTime) || !Number.isFinite(baseGain)) return false;
  const toOutput = programme => toOutputTime(outputTimeMap, programme);
  const outputStart = toOutput(start), outputEnd = toOutput(end);
  if (!(outputEnd > outputStart) || outputEnd - outputStart > 120) return false;
  const gainAt = programme => baseGain * Math.max(0, Math.min(200,
    interpolateAutomationValue({ keyframes: keys, property: 'volume', time: programme, fallback: 100 }))) / 100;
  const boundaries = [...new Set([start, ...keys.map(key => Number(key.time)).filter(time => time > start && time < end), end])].sort((a,b) => a-b);
  param.cancelScheduledValues(contextTime);
  param.setValueAtTime(gainAt(start), contextTime);
  for (let index=1; index<boundaries.length; index++) {
    const left = boundaries[index-1], right = boundaries[index];
    const outputLeft = toOutput(left), outputRight = toOutput(right);
    const incoming = keys.find(key => Number(key.time) > left);
    if (incoming?.easing === 'hold' && right <= Number(incoming.time)) {
      // A Hold remains flat until the exact key, including when a cue starts
      // inside the held interval. Never turn the final jump into a ramp.
      param.setValueAtTime(gainAt(right), contextTime + outputRight - outputStart);
      continue;
    }
    const steps = Math.min(8192, Math.max(1, Math.ceil((outputRight-outputLeft)*128)));
    for (let step=1; step<=steps; step++) {
      const output = outputLeft + (outputRight-outputLeft)*step/steps;
      const programme = step === steps ? right : toProgrammeTime(outputTimeMap, output);
      param.linearRampToValueAtTime(gainAt(programme), contextTime + output - outputStart);
    }
  }
  return true;
}

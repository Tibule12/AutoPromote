import { advanceStudioCueStartPlan, scheduleStudioCueGain, scheduleStudioCueRate, studioCueProgrammeTime, studioCueStartPlan } from '../studioCueGain';
import { buildStudioOutputTimeMap } from '../studioProjectDocument';

const key = (time, value, easing='linear', curve) => ({time,value,property:'volume',easing,curve});
const map = rate => buildStudioOutputTimeMap({durationTick:900000,fallbackSpeed:rate});
const setup = options => {
  const param = { cancelScheduledValues:jest.fn(),setValueAtTime:jest.fn(),linearRampToValueAtTime:jest.fn() };
  const result = scheduleStudioCueGain({param,contextTime:20,programmeStart:0,programmeEnd:2,
    outputTimeMap:map(1),keyframes:[key(0,100),key(2,0)],baseGain:.5,...options});
  return {param,result};
};

test('a ready cue schedules its full onset ahead of a late video callback',()=>{
  expect(studioCueStartPlan({contextTime:20,programmeTime:.6,cueStart:.65,duration:.35,outputTimeMap:map(1)}))
    .toEqual({when:20.05,offset:0,programmeStart:.65});
  expect(studioCueStartPlan({contextTime:20,programmeTime:.67,cueStart:.65,duration:.35,outputTimeMap:map(1)}))
    .toEqual({when:20,offset:expect.closeTo(.02),programmeStart:.67});
});

test('lookahead uses retimed output seconds and rejects distant/finished/invalid cues',()=>{
  const options={contextTime:20,programmeTime:0,cueStart:.12,duration:.35,outputTimeMap:map(2)};
  expect(studioCueStartPlan(options)).toEqual({when:20.06,offset:0,programmeStart:.12});
  expect(studioCueStartPlan({...options,cueStart:.17})).toBeNull();
  expect(studioCueStartPlan({...options,programmeTime:.5})).toBeNull();
  expect(studioCueStartPlan({...options,contextTime:NaN})).toBeNull();
});
test('a start that crosses an audio quantum resumes at the correct sample phase through a ramp boundary',()=>{
  const outputTimeMap=buildStudioOutputTimeMap({durationTick:900000,fallbackSpeed:1,
    programmeSpeedKeys:[{atProgrammeTick:0,rate:1,easing:'hold'},
      {atProgrammeTick:90000,rate:2,easing:'hold'}]});
  const plan={when:20,offset:.04,programmeStart:.99};
  const corrected=advanceStudioCueStartPlan(plan,20.02,outputTimeMap,.3);
  expect(corrected.when).toBe(20.02);
  expect(corrected.programmeStart).toBeCloseTo(1.02);
  expect(corrected.offset).toBeCloseTo(.07);
  expect(advanceStudioCueStartPlan(plan,19.99,outputTimeMap,.3)).toBe(plan);
  expect(advanceStudioCueStartPlan(plan,20.2,outputTimeMap,.3)).toBeNull();
});
test('late scheduling cannot start beyond the project clock or with an invalid context',()=>{
  expect(advanceStudioCueStartPlan({when:20,offset:0,programmeStart:9.99},20.02,map(1),1)).toBeNull();
  expect(advanceStudioCueStartPlan({when:20,offset:0,programmeStart:0},NaN,map(1),1)).toBeNull();
});

test('cue rates change at exact mapped boundaries without waiting for picture callbacks',()=>{
  const outputTimeMap=buildStudioOutputTimeMap({durationTick:900000,fallbackSpeed:1,
    programmeSpeedKeys:[{atProgrammeTick:0,rate:1,easing:'hold'},
      {atProgrammeTick:90000,rate:2,easing:'hold'}]});
  const param={cancelScheduledValues:jest.fn(),setValueAtTime:jest.fn()};
  expect(scheduleStudioCueRate({param,contextTime:20,programmeStart:.5,programmeEnd:2,outputTimeMap})).toBe(true);
  expect(param.setValueAtTime.mock.calls).toEqual([[1,20],[2,20.5]]);
});

test('cues use the song sample clock inside the existing source-clock allowance, including retiming',()=>{
  expect(studioCueProgrammeTime({sourceProgrammeTime:1.04,musicState:{offset:.5,startedAt:20},
    contextTime:20,outputTimeMap:map(2),musicClockActive:true})).toBe(1);
});
test('a cue after a ramp retains the renderer sub-tick audio phase instead of its rounded display clock', () => {
  const outputTimeMap = buildStudioOutputTimeMap({ durationTick: 20*90000,
    programmeSpeedKeys: [{ atProgrammeTick: 7*90000, rate: 1, easing: 'linear' },
      { atProgrammeTick: 8*90000, rate: 2, easing: 'linear' },
      { atProgrammeTick: 9*90000, rate: 1, easing: 'linear' }] });
  // Independently retained final worker integral: programme17 maps to
  // output16.3853211080864, not the rounded UI knot16.3853333333333.
  const programmeTime = studioCueProgrammeTime({ sourceProgrammeTime: 16.3646788919136,
    musicState: { offset: 15.75, startedAt: 100 }, contextTime: 100,
    outputTimeMap, musicClockActive: true });
  const plan = studioCueStartPlan({ contextTime: 100, programmeTime, cueStart: 17,
    duration: .7, outputTimeMap, lookahead: 1 });
  expect(plan.when).toBeCloseTo(100.6353211080864, 10);
});
test.each([1,2])('a %sx cue keeps the exact 48kHz song phase between authored edit ticks', rate=>{
  const offset = 30213/48000;
  const programmeTime = studioCueProgrammeTime({sourceProgrammeTime:offset*rate,
    musicState:{offset,startedAt:20},contextTime:20,outputTimeMap:map(rate),musicClockActive:true});
  expect(programmeTime).toBeCloseTo(offset*rate,12);
  const plan = studioCueStartPlan({contextTime:20,programmeTime,cueStart:.65*rate,
    duration:.35,outputTimeMap:map(rate)});
  // The noise cue begins on exactly the same sample as the running song,
  // rather than shifting it by 0.375 edit ticks through integer rounding.
  expect(plan.when).toBeCloseTo((20*48000+31200-30213)/48000,12);
  expect(plan.offset).toBe(0);
});
test('late cue preparation retains fractional phase across a rate boundary',()=>{
  const outputTimeMap=buildStudioOutputTimeMap({durationTick:900000,fallbackSpeed:1,
    programmeSpeedKeys:[{atProgrammeTick:0,rate:1,easing:'hold'},
      {atProgrammeTick:90000,rate:2,easing:'hold'}]});
  const plan={when:20,offset:0,programmeStart:1};
  const corrected=advanceStudioCueStartPlan(plan,20+5/48000,outputTimeMap,.3);
  expect(corrected.offset).toBeCloseTo(10/48000,12);
});
test('fast and slow picture use the same 80ms output allowance as music resynchronization',()=>{
  // At 2x, 120ms programme drift is only 60ms of finished playback. The song
  // is still valid and its sample phase must also drive the overlapping cue.
  expect(studioCueProgrammeTime({sourceProgrammeTime:1.12,musicState:{offset:.5,startedAt:20},
    contextTime:20,outputTimeMap:map(2),musicClockActive:true})).toBe(1);
  // At 0.5x, 60ms programme drift is 120ms output drift: retain the source
  // rather than silently using an out-of-sync song for a new cue.
  expect(studioCueProgrammeTime({sourceProgrammeTime:1.06,musicState:{offset:2,startedAt:20},
    contextTime:20,outputTimeMap:map(.5),musicClockActive:true})).toBe(1.06);
});

test('audition, a loop/discontinuity or missing clock retains the authoritative picture time',()=>{
  const options={sourceProgrammeTime:2,musicState:{offset:.5,startedAt:20},contextTime:20,outputTimeMap:map(2),musicClockActive:true};
  expect(studioCueProgrammeTime(options)).toBe(2);
  expect(studioCueProgrammeTime({...options,sourceProgrammeTime:1.04,musicClockActive:false})).toBe(1.04);
  expect(studioCueProgrammeTime({...options,musicState:null})).toBe(2);
});

test('schedules gain on the audio clock without waiting for video frame callbacks',()=>{
  const {param,result}=setup();
  expect(result).toBe(true);
  expect(param.cancelScheduledValues).toHaveBeenCalledWith(20);
  expect(param.setValueAtTime).toHaveBeenCalledWith(.5,20);
  expect(param.linearRampToValueAtTime).toHaveBeenLastCalledWith(0,22);
  expect(param.linearRampToValueAtTime.mock.calls.find(([,time])=>time===21)[0]).toBeCloseTo(.25);
});

test('maps programme keys to the same retimed output clock as the cue/music',()=>{
  const {param}=setup({outputTimeMap:map(2)});
  expect(param.linearRampToValueAtTime).toHaveBeenLastCalledWith(0,21);
  expect(param.linearRampToValueAtTime.mock.calls.find(([,time])=>time===20.5)[0]).toBeCloseTo(.25);
});

test('a late cue resumes its actual envelope rather than restarting at its first key',()=>{
  const {param}=setup({programmeStart:1});
  expect(param.setValueAtTime).toHaveBeenCalledWith(.25,20);
  expect(param.linearRampToValueAtTime).toHaveBeenLastCalledWith(0,21);
});

test('Hold remains flat until the exact middle key, then later ramping continues',()=>{
  const {param}=setup({keyframes:[key(0,100),key(1,20,'hold'),key(2,100)]});
  expect(param.setValueAtTime.mock.calls).toEqual([[.5,20],[.1,21]]);
  expect(param.linearRampToValueAtTime.mock.calls.every(([,time])=>time>21)).toBe(true);
  expect(param.linearRampToValueAtTime).toHaveBeenLastCalledWith(.5,22);
});

test('horizontal curve handles change the early scheduled gain, without changing the endpoint',()=>{
  const early = curve => setup({keyframes:[key(0,100),key(2,0,'bezier',curve)]}).param.linearRampToValueAtTime.mock.calls;
  const left=early([.1,0,.2,1]),right=early([.8,0,.9,1]);
  expect(left.find(([,time])=>time===20.5)[0]).toBeLessThan(right.find(([,time])=>time===20.5)[0]);
  expect(left.at(-1)).toEqual([0,22]);expect(right.at(-1)).toEqual([0,22]);
});

test('clips to the project end and preserves the existing path when scheduling is unavailable',()=>{
  const {param}=setup({programmeStart:9,programmeEnd:12,keyframes:[key(9,100),key(10,20)]});
  expect(param.linearRampToValueAtTime).toHaveBeenLastCalledWith(.1,21);
  expect(setup({keyframes:[]}).result).toBe(false);
  expect(setup({programmeStart:2,programmeEnd:1}).result).toBe(false);
  expect(setup({param:{setValueAtTime:jest.fn()}}).result).toBe(false);
});

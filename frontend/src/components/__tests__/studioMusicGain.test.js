import { createStudioMusicGain, studioMusicVolumePoints } from '../studioMusicGain';

const map=[{ programmeRange:{startTick:0,endTick:18000},outputRange:{startTick:0,endTick:18000},rateNumerator:1,rateDenominator:1 },
  {programmeRange:{startTick:18000,endTick:126000},outputRange:{startTick:18000,endTick:72000},rateNumerator:2,rateDenominator:1}];
const fixture=()=>{
  const nodes=[];
  const context={currentTime:10,createGain:()=>{const node={gain:{value:1,cancelScheduledValues:jest.fn(),
    setValueAtTime:jest.fn(),linearRampToValueAtTime:jest.fn()},connect:jest.fn()};nodes.push(node);return node;}};
  return {context,nodes,graph:createStudioMusicGain(context)};
};
test('music curves retain held jumps and insert retimed output boundaries',()=>{
  const points=studioMusicVolumePoints([{time:0,value:20},{time:.137,value:160,easing:'hold'},
    {time:1.4,value:40,easing:'linear'}],map);
  expect(points.find(p=>p.time===.137)).toEqual({time:.137,value:1.6,easing:'hold'});
  expect(points.some(p=>Math.abs(p.time-.2)<1e-10)).toBe(true);
  expect(points.at(-1).time).toBeCloseTo(.8,10);expect(points.at(-1).value).toBe(.4);
});
test('overlapping attack and release continue on the audio thread with independent bus automation',()=>{
  const {context,graph}=fixture(),state={startedAt:10.01,offset:.157,playbackRate:1};
  const keys=[{time:0,value:20},{time:1.4,value:180,easing:'linear'}];
  const options={state,timeMap:map,duration:.8,fadeIn:.6,fadeOut:.6,keyframes:keys,baseGain:.25};
  expect(graph.sync(options)).toBe(true);
  expect(graph.input.gain.value).toBe(.25);
  expect(graph.attack.gain.setValueAtTime).toHaveBeenCalledWith(.157/.6,10.01);
  expect(graph.attack.gain.setValueAtTime).toHaveBeenCalledWith(.157/.6,10);
  expect(graph.attack.gain.linearRampToValueAtTime).toHaveBeenCalledWith(1,10.01+.6-.157);
  expect(graph.release.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0,10.01+.8-.157);
  expect(graph.automation.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(1.8,10.01+.8-.157);
  const scheduled=graph.attack.gain.setValueAtTime.mock.calls.length;
  context.currentTime+=.1;graph.sync({...options,baseGain:0});
  expect(graph.input.gain.value).toBe(0);expect(graph.attack.gain.setValueAtTime).toHaveBeenCalledTimes(scheduled);
  graph.sync({...options,timeMap:JSON.parse(JSON.stringify(map)),keyframes:JSON.parse(JSON.stringify(keys))});
  expect(graph.attack.gain.setValueAtTime).toHaveBeenCalledTimes(scheduled);
});
test('pause cancellation and a new song anchor replace old automation without changing source tempo',()=>{
  const {context,graph}=fixture();const options={state:{startedAt:10.01,offset:0,playbackRate:1},timeMap:map,
    duration:.8,fadeIn:.2,fadeOut:.2,keyframes:[],baseGain:.1};
  graph.sync(options);graph.stop();context.currentTime=10.5;
  graph.sync({...options,state:{startedAt:10.51,offset:.3,playbackRate:1}});
  expect(graph.attack.gain.cancelScheduledValues).toHaveBeenCalledTimes(3);
  expect(graph.attack.gain.setValueAtTime).toHaveBeenLastCalledWith(1,10.51);
  expect(graph.release.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0,10.51+.8-.3);
});
test('unsupported parameter scheduling and long unqualified clocks retain the existing fallback',()=>{
  const fallback=createStudioMusicGain({createGain:()=>({gain:{value:1},connect:jest.fn()})});
  expect(fallback.sync({})).toBe(false);
  const {graph}=fixture();expect(graph.sync({state:{},timeMap:map,duration:7201})).toBe(false);
});
test('future reanchors hold the outgoing gain until its scheduled source handoff',()=>{
 const {context,graph}=fixture();graph.attack.gain.cancelAndHoldAtTime=jest.fn();
 const options={state:{startedAt:10.01,offset:0,playbackRate:1},timeMap:map,duration:.8,fadeIn:.6,fadeOut:.6,keyframes:[],baseGain:.25};
 graph.sync(options);context.currentTime=10.3;graph.sync({...options,state:{startedAt:10.31,offset:.2,playbackRate:1}});
 expect(graph.attack.gain.cancelAndHoldAtTime).toHaveBeenLastCalledWith(10.31);
 expect(graph.attack.gain.cancelScheduledValues).toHaveBeenCalledTimes(1);
});

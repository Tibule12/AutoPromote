import { interpolateAutomationValue } from './studioAutomation';
import { mapStudioContinuousSeconds } from './studioTime';
import { musicBufferPosition } from './studioMusicBufferClock';

const clamp = (value, low, high, fallback = 0) => Number.isFinite(Number(value))
  ? Math.max(low, Math.min(high, Number(value))) : fallback;

// Match studio_audio.normalize_volume_keyframes: the renderer's authored
// volume curve is flattened before its programme knots move to output time.
export function studioMusicVolumePoints(keys, map) {
  const duration = map.at(-1).programmeRange.endTick / 90000;
  const unique = new Map();
  for (const key of keys || []) if ((key.property || 'volume') === 'volume') {
    const time = clamp(key.time, 0, duration);
    unique.set(time, { ...key, property: 'volume', time, value: clamp(key.value, 0, 200, 100), easing: key.easing || 'linear' });
  }
  const ordered = [...unique.values()].sort((a,b) => a.time-b.time);
  if (!ordered.length) return [];
  const sampled = [ordered[0]];
  for (let i=1;i<ordered.length;i++) {
    const left=ordered[i-1], right=ordered[i];
    if (right.easing === 'hold') { sampled.push(right); continue; }
    const steps=right.easing === 'bezier' ? 64 : 8;
    for (let n=1;n<=steps;n++) {
      const time=left.time+(right.time-left.time)*n/steps;
      sampled.push({ time, value: n === steps ? right.value : interpolateAutomationValue({
        keyframes:[left,right], property:'volume', time, fallback:100 }), easing:'linear' });
    }
  }
  const at = time => {
    if (time <= sampled[0].time) return sampled[0].value;
    for (let i=1;i<sampled.length;i++) {
      const left=sampled[i-1],right=sampled[i];
      if (time === right.time) return right.value;
      if (time < right.time) return right.easing === 'hold' ? left.value
        : left.value+(right.value-left.value)*(time-left.time)/(right.time-left.time);
    }
    return sampled.at(-1).value;
  };
  const times=new Set(sampled.map(p=>p.time));
  for (const segment of map) for (const tick of [segment.programmeRange.startTick,segment.programmeRange.endTick]) {
    const time=tick/90000;
    if (time>sampled[0].time && time<sampled.at(-1).time) times.add(time);
  }
  return [...times].sort((a,b)=>a-b).map(time=>({
    time: mapStudioContinuousSeconds(map,time,'programme'), value:at(time)/100,
    easing:sampled.find(p=>p.time>=time)?.easing || 'linear',
  }));
}

export function createStudioMusicGain(context) {
  const input=context.createGain(), output=context.createGain();
  const supported=['cancelScheduledValues','setValueAtTime','linearRampToValueAtTime']
    .every(method=>typeof input.gain[method] === 'function');
  if (!supported) { input.connect(output); return { input,output,scheduled:false,sync:()=>false,stop:()=>{} }; }
  const attack=context.createGain(),release=context.createGain(),automation=context.createGain();
  input.connect(attack);attack.connect(release);release.connect(automation);automation.connect(output);
  let prior;
  const stop = () => { prior=null; for (const node of [attack,release,automation]) {
    const held=node.gain.value;node.gain.cancelScheduledValues(0);node.gain.setValueAtTime(held,context.currentTime);
  } };
  const sync = ({ state, timeMap, duration, fadeIn, fadeOut, keyframes, baseGain }) => {
    if (!state || Number(state.playbackRate || 1)!==1 || !timeMap?.length || timeMap.length>4096 || !(duration>0 && duration<=7200) || (keyframes || []).length>64) return false;
    if (input.gain.value !== baseGain) input.gain.value=baseGain;
    const limit=Math.min(5,duration), incoming=clamp(fadeIn,0,limit), outgoing=clamp(fadeOut,0,limit);
    const sameClock=prior?.state===state && prior.duration===duration &&
      prior.fadeIn===incoming && prior.fadeOut===outgoing;
    const sameProjection=prior?.map===timeMap && prior.keys===keyframes;
    if(sameClock && sameProjection) return true;
    const points=sameProjection ? prior.points : studioMusicVolumePoints(keyframes,timeMap);
    const curveKey=sameProjection ? prior.curveKey : JSON.stringify(points);
    // Project metadata/React hydration can replace equal arrays while playing.
    // Cancelling an unchanged ramp on every such commit produces audible
    // quantum-sized gain dips. Only a changed audio decision needs new events.
    if(sameClock && prior.curveKey===curveKey) {
      prior={...prior,map:timeMap,keys:keyframes,points};return true;
    }
    const when=Math.max(context.currentTime,state.startedAt), offset=musicBufferPosition(state,when);
    const schedule=(param,initial)=>{
      // A replacement source starts just ahead of the current quantum. Keep
      // the outgoing ramp until that handoff instead of flattening its tail.
      if(!prior) {
        param.cancelScheduledValues(0);
        // Source starts and parameter events can round a future timestamp to
        // opposite sides of one sample. A fresh graph must already hold the
        // intended gain before that first audible sample, rather than 1.
        param.setValueAtTime(initial,context.currentTime);
      } else if(param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(when);
      else param.cancelScheduledValues(0);
      param.setValueAtTime(initial,when);
    };
    schedule(attack.gain,incoming>0?clamp(offset/incoming,0,1):1);
    if(incoming>0 && offset<incoming) attack.gain.linearRampToValueAtTime(1,when+incoming-offset);
    const releaseStart=Math.max(0,duration-outgoing);
    schedule(release.gain,outgoing>0?clamp(1-(offset-releaseStart)/outgoing,0,1):1);
    if(outgoing>0 && offset<duration) {
      if(offset<releaseStart) release.gain.setValueAtTime(1,when+releaseStart-offset);
      release.gain.linearRampToValueAtTime(0,when+duration-offset);
    }
    let initial=points[0]?.value ?? 1;
    for(let i=0;i<points.length;i++) {
      const right=points[i],left=points[i-1];
      if(offset>=right.time) initial=right.value;
      else if(left) { initial=right.easing==='hold'?left.value:
        left.value+(right.value-left.value)*(offset-left.time)/(right.time-left.time); break; }
      else break;
    }
    schedule(automation.gain,initial);
    for(const point of points) if(point.time>offset) {
      if(point.easing==='hold') {
        // Adding two floating timestamps can move a jump one sample late.
        // Resolve the first output sample at/after the key, then add the
        // already sample-bound song anchor as integer frames.
        const rate=Number(context.sampleRate || 48000);
        const floor=Math.floor(point.time*rate);
        const frame=floor/rate<point.time?floor+1:floor;
        const at=(Math.round(state.startedAt*rate)+frame-Math.round(state.offset*rate))/rate;
        automation.gain.setValueAtTime(point.value,at);
      } else automation.gain.linearRampToValueAtTime(point.value,when+point.time-offset);
    }
    prior={state,map:timeMap,duration,fadeIn:incoming,fadeOut:outgoing,keys:keyframes,points,curveKey};return true;
  };
  return { input,output,attack,release,automation,scheduled:true,sync,stop };
}

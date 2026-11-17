import {studioNodeImageSource} from '../studioNodeImageSource';
import {getSafeMediaSource} from '../../utils/security';
import {buildSmartFlowRigState} from '../studioNodeFlow';

test.each(['corner_pin_holo_rig','chroma_key_composite_rig'])('native %s supplies a visible image through the media boundary',rig=>{
  const layer=buildSmartFlowRigState(rig).overlays.find(l=>l.type==='image');
  const source=studioNodeImageSource(layer.src);
  expect(getSafeMediaSource(source)).toBe(source);
  expect(atob(source.split(',')[1])).toBe(decodeURIComponent(layer.src.split(',').slice(1).join(',')));
});
test('ordinary sources and the existing media restrictions stay intact',()=>{
  expect(studioNodeImageSource('https://example.test/source.png')).toBe('https://example.test/source.png');
  expect(getSafeMediaSource(studioNodeImageSource('javascript:alert(1)'))).toBeUndefined();
  expect(studioNodeImageSource('data:image/svg+xml;utf8,%zz')).toBeUndefined();
});

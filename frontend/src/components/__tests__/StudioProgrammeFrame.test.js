import React from 'react';
import { act, render, screen } from '@testing-library/react';
import StudioProgrammeFrame from '../StudioProgrammeFrame';
import * as videoMattes from '../studioVideoMatte';
import StudioPerspectiveSurface from '../StudioPerspectiveSurface';
import StudioGroupPreview from '../StudioGroupPreview';
import { buildMotionAutomationStyle } from '../studioAutomation';
import { PERSPECTIVE_LEFT, perspectiveCssMatrix } from '../studioPerspective';
import { watchStudioProgrammeFrames } from '../studioSourcePreview';

function decoder() {
  const video = document.createElement('video'), callbacks = new Map(); let id = 0;
  for (const [name, value] of Object.entries({ paused: false, ended: false, seeking: false, readyState: 4, currentTime: 0 }))
    Object.defineProperty(video, name, { value, writable: true, configurable: true });
  video.requestVideoFrameCallback = jest.fn(callback => { callbacks.set(++id, callback); return id; });
  video.cancelVideoFrameCallback = jest.fn(key => callbacks.delete(key));
  video.frame = (time, currentTime = time) => {
    video.currentTime = currentTime;
    const [key, callback] = callbacks.entries().next().value;
    callbacks.delete(key); callback(0, { mediaTime: time });
  };
  return video;
}

test('titles and projected media evaluate on the same presented picture between editor timeupdate events', () => {
  const video = decoder(), clockRef = { current: video }, picture = jest.fn();
  const stopPicture = watchStudioProgrammeFrames(video, picture);
  const value = { version: 1, corners: PERSPECTIVE_LEFT };
  const keys = [{ property: 'x', time: 0, value: 10 }, { property: 'x', time: 4, value: 90, easing: 'linear' },
    { property: 'perspectiveProgress', time: 0, value: 0 }, { property: 'perspectiveProgress', time: 4, value: 100, easing: 'linear' }];
  const layer = { id: 'title', type: 'image', perspective: value, startTime: 1, duration: 3 };
  const groups = [{ id: 'group', kind: 'graphic_group', layerIds: ['title'] }];
  const groupKeys = [{ targetId: 'group', property: 'x', time: 0, value: 0 },
    { targetId: 'group', property: 'x', time: 4, value: 20, easing: 'linear' }];
  let compositionRenders = 0;
  const children = time => {
    compositionRenders++;
    const pose = buildMotionAutomationStyle(keys, time, { perspective: value });
    return <StudioGroupPreview compounds={groups} order={['title']} keyframes={groupKeys} time={time}>
      <div data-studio-layer-id="title" data-testid="title" data-time={time} style={{ left: `${pose.x}%` }}>
        <StudioPerspectiveSurface value={value} progress={pose.perspectiveProgress}>picture</StudioPerspectiveSurface>
      </div></StudioGroupPreview>;
  };
  const props = { clockRef, mapTime: t => t + 1, time: 0, layers: [layer], groups, keyframes: [...keys.map(key => ({ ...key, targetId: 'title' })), ...groupKeys] };
  const view = render(<StudioProgrammeFrame {...props}>{children}</StudioProgrammeFrame>);
  const initialRenders = compositionRenders;
  expect(video.requestVideoFrameCallback).toHaveBeenCalledTimes(1);
  act(() => {
    video.frame(1, 1.2);
    // Must commit before the presented-frame callback returns, even while
    // React is batching an editor event. The previous deferred update lagged.
    expect(screen.getByTestId('title').dataset.programmeTime).toBe('2');
  });
  expect(picture).toHaveBeenLastCalledWith(1);
  expect(compositionRenders).toBe(initialRenders);
  expect(screen.getByTestId('title').dataset.programmeTime).toBe('2');
  expect(screen.getByTestId('title').style.left).toBe('50%');
  expect(JSON.parse(screen.getByTestId('title').parentElement.dataset.studioGroupPose).x).toBe(10);
  expect(screen.getByTestId('studio-perspective-surface').style.transform).toBe(perspectiveCssMatrix(value, 50, 1, 1));
  view.rerender(<StudioProgrammeFrame {...props} time={.5}>{children}</StudioProgrammeFrame>);
  expect(screen.getByTestId('title').dataset.programmeTime).toBe('2');
  view.unmount(); stopPicture();
  expect(video.cancelVideoFrameCallback).toHaveBeenCalledTimes(1);
});

test('normal pause, seek, play and ref promotion stop the former shot and rebind the next decoder', () => {
  const first = decoder(), second = decoder(), clockRef = { current: first };
  const children = () => <div data-testid="time" data-studio-layer-id="layer" />;
  const props = { clockRef, mapTime: time => time, time: 0, layers: [{ id: 'layer', type: 'text', startTime: 0, duration: 20 }] };
  const view = render(<StudioProgrammeFrame {...props}>{children}</StudioProgrammeFrame>);
  act(() => { first.paused = true; first.currentTime = 2; first.dispatchEvent(new Event('pause')); });
  expect(screen.getByTestId('time').dataset.programmeTime).toBe('2');
  act(() => { first.currentTime = 3; first.dispatchEvent(new Event('seeked')); });
  expect(screen.getByTestId('time').dataset.programmeTime).toBe('3');
  act(() => { first.paused = false; first.dispatchEvent(new Event('play')); first.frame(3.1); });
  expect(screen.getByTestId('time').dataset.programmeTime).toBe('3.1');
  clockRef.current = second;
  view.rerender(<StudioProgrammeFrame {...props} mapTime={time => time + 4}>{children}</StudioProgrammeFrame>);
  act(() => second.frame(.5));
  expect(screen.getByTestId('time').dataset.programmeTime).toBe('4.5');
  act(() => { first.currentTime = 9; first.dispatchEvent(new Event('seeked')); });
  expect(screen.getByTestId('time').dataset.programmeTime).toBe('4.5');
  view.rerender(<StudioProgrammeFrame {...props} enabled={false}>{children}</StudioProgrammeFrame>);
  expect(screen.getByTestId('time').dataset.programmeTime).toBe('4.5');
  view.unmount(); expect(second.cancelVideoFrameCallback).toHaveBeenCalledTimes(1);
});

test('the decoded programme frame paints animated polygon vertices without a React timeupdate', () => {
  const video=decoder(), clockRef={current:video};
  const layer={id:'foreground',type:'video',startTime:0,duration:4,
    mask:{enabled:true,shape:'polygon',path:'polygon(10% 10%, 90% 10%, 50% 90%)'}};
  const keys=[{targetId:layer.id,property:'maskPoint0X',time:0,value:10,easing:'linear'},
    {targetId:layer.id,property:'maskPoint0X',time:4,value:90,easing:'linear'}];
  let renders=0;
  render(<StudioProgrammeFrame clockRef={clockRef} mapTime={t=>t} time={0}
    layers={[layer]} keyframes={keys} getClipPath={resolved=>resolved.mask.path}>
    {()=>{renders++;return <div data-studio-layer-id={layer.id} data-testid="foreground" />;}}
  </StudioProgrammeFrame>);
  const initial=renders;
  act(()=>video.frame(2,2.2));
  expect(screen.getByTestId('foreground').style.clipPath).toBe('polygon(50% 10%, 90% 10%, 50% 90%)');
  expect(renders).toBe(initial);
});

test('a settled secondary decoder repaints matching video pieces while the programme is paused',()=>{
 const main=decoder();main.paused=true;main.currentTime=4.5;
 const hash='a'.repeat(64),source={type:'video',sourceStoragePath:'owned/summit',contentHash:hash,sourceStartTime:0,startTime:24,duration:4,sourceDuration:12};
 const layers=[{...source,id:'owner'},{...source,id:'piece',perspective:{version:1,corners:[[0,0],[100,0],[100,100],[0,100]],sourceRect:[25,0,50,100]}}],drawImage=jest.fn();
 const context=jest.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({drawImage});
 const pause=jest.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});
 const load=jest.spyOn(HTMLMediaElement.prototype,'load').mockImplementation(()=>{});
 const view=render(<StudioProgrammeFrame clockRef={{current:main}} mapTime={t=>t+20} time={24.5} layers={layers}>
  {()=>layers.map(l=><div key={l.id} data-studio-layer-id={l.id}><video data-testid={l.id} data-studio-overlay-decoder="true" /><canvas data-studio-shared-video="true" /></div>)}
 </StudioProgrammeFrame>);
 const owner=screen.getByTestId('owner'),piece=screen.getByTestId('piece');
 let presented;
 owner.requestVideoFrameCallback=jest.fn(callback=>{presented=callback;return 7;});
 owner.cancelVideoFrameCallback=jest.fn();
 for(const [name,value]of Object.entries({readyState:4,seeking:false,paused:true,currentTime:.5,videoWidth:1280,videoHeight:720}))Object.defineProperty(owner,name,{value,configurable:true});
 act(()=>owner.dispatchEvent(new Event('seeked')));
 expect(piece.dataset.sharedProgrammeFrame).toBe('true');expect(piece.dataset.sharedFrameOwner).toBe('owner');
 expect(drawImage).toHaveBeenCalledWith(owner,320,0,320,720,0,0,320,720);
 expect(piece.parentElement.querySelector('canvas').width).toBe(320);
 expect(piece.parentElement.querySelector('canvas').style.width).toBe('25%');
 const copies=drawImage.mock.calls.length;
 // The source can present new paused pixels after seeked, at the same time.
 act(()=>presented(0,{mediaTime:.5}));
 expect(drawImage.mock.calls.length).toBeGreaterThan(copies);
 view.unmount();context.mockRestore();pause.mockRestore();load.mockRestore();
});


test('a first paused seek waits for every independent video, including sources without shared identity',()=>{
 const main=decoder();main.paused=true;main.currentTime=2;
 const layer={id:'independent',type:'video',startTime:0,duration:4};
 const pause=jest.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});
 const load=jest.spyOn(HTMLMediaElement.prototype,'load').mockImplementation(()=>{});
 const view=render(<div data-testid="stage"><StudioProgrammeFrame clockRef={{current:main}} mapTime={t=>t} time={2} layers={[layer]}>
  {()=> <div data-studio-layer-id={layer.id}><video data-testid="independent" data-studio-overlay-decoder="true" /></div>}
 </StudioProgrammeFrame></div>);
 expect(screen.getByTestId('stage').dataset.layerPendingCount).toBe('1');
 expect(screen.getByTestId('studio-layer-loading').hidden).toBe(false);
 const media=screen.getByTestId('independent');
 for(const [field,value]of Object.entries({readyState:4,seeking:false,paused:true,currentTime:2}))Object.defineProperty(media,field,{value,configurable:true});
 act(()=>media.dispatchEvent(new Event('loadeddata')));
 expect(screen.getByTestId('stage').dataset.layerPendingCount).toBe('0');
 expect(screen.getByTestId('studio-layer-loading').hidden).toBe(true);
 view.unmount();pause.mockRestore();load.mockRestore();
});

test('a shared video matte consumes its validated canvas instead of its unused clone decoder',()=>{
 const main=decoder();main.paused=true;main.currentTime=2;
 const source={type:'video',sourceStoragePath:'owned/matte',contentHash:'a'.repeat(64),sourceStartTime:0,startTime:0,duration:4,sourceDuration:4};
 const layers=[{...source,id:'owner'},{...source,id:'clone'},{id:'fill',type:'image',startTime:0,duration:4,trackMatte:{mode:'luma',sourceLayerId:'clone'}}];
 const ctx=jest.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({drawImage:jest.fn()});
 const pause=jest.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{}),load=jest.spyOn(HTMLMediaElement.prototype,'load').mockImplementation(()=>{});
 const matte=jest.spyOn(videoMattes,'studioVideoMatteUri').mockImplementation(({picture})=>picture?{}:null),alpha=jest.spyOn(videoMattes,'studioVideoMatteAlpha').mockReturnValue('url("data:image/png;base64,shared")');
 const view=render(<div><StudioProgrammeFrame clockRef={{current:main}} mapTime={t=>t} time={2} layers={layers}>{()=> <>
  {layers.slice(0,2).map(l=><div key={l.id} data-studio-layer-id={l.id}><video data-testid={l.id} data-studio-overlay-decoder="true"/><canvas data-studio-shared-video="true"/></div>)}
  <div data-studio-matte-wrap="fill"><div data-studio-layer-id="fill"/></div>
 </>}</StudioProgrammeFrame></div>);
 const owner=screen.getByTestId('owner'),clone=screen.getByTestId('clone');
 for(const [key,value]of Object.entries({readyState:4,seeking:false,paused:true,currentTime:2,videoWidth:1280,videoHeight:720}))Object.defineProperty(owner,key,{value,configurable:true});
 act(()=>owner.dispatchEvent(new Event('loadeddata')));
 const shared=clone.parentElement.querySelector('canvas');expect(shared.dataset.sourceTime).toBe('2');
 expect(matte).toHaveBeenLastCalledWith(expect.objectContaining({video:clone,picture:shared,layer:expect.objectContaining({id:'clone'}),time:2}));
 expect(view.container.querySelector('[data-studio-matte-wrap="fill"]').style.maskImage).toContain('base64,shared');
 view.unmount();matte.mockRestore();alpha.mockRestore();ctx.mockRestore();pause.mockRestore();load.mockRestore();
});

test('a decoded ordinary image supplies its actual alpha matte instead of an opaque rectangle',()=>{
 const main=decoder();main.paused=true;main.currentTime=2;
 const layers=[{id:'circle',type:'image',src:'blob:circle',startTime:0,duration:4,x:70,y:50,width:100,height:100,scale:.6,opacity:1},{id:'window',type:'video',startTime:0,duration:4,trackMatte:{mode:'alpha',sourceLayerId:'circle'}}];
 const matte=jest.spyOn(videoMattes,'studioVideoMatteUri').mockImplementation(({picture})=>picture?{}:null),alpha=jest.spyOn(videoMattes,'studioVideoMatteAlpha').mockReturnValue('url("data:image/png;base64,circular-alpha")');
 const view=render(<div data-testid="image-stage"><StudioProgrammeFrame clockRef={{current:main}} mapTime={t=>t} time={2} layers={layers}>{()=> <><div data-studio-layer-id="circle" data-studio-matte-source-only="true"><img data-testid="circle-pixels" src="blob:circle" alt="Matte source"/></div><div data-studio-matte-wrap="window"><div data-studio-layer-id="window"/></div></>}</StudioProgrammeFrame></div>);
 const picture=screen.getByTestId('circle-pixels');expect(screen.getByTestId('image-stage').dataset.layerPendingCount).toBe('1');
 for(const [key,value]of Object.entries({complete:true,naturalWidth:1280,naturalHeight:720}))Object.defineProperty(picture,key,{value,configurable:true});
 act(()=>picture.dispatchEvent(new Event('load')));
 expect(matte).toHaveBeenLastCalledWith(expect.objectContaining({picture,time:2,layer:expect.objectContaining({id:'circle'})}));expect(view.container.querySelector('[data-studio-matte-wrap="window"]').style.maskImage).toContain('circular-alpha');expect(screen.getByTestId('image-stage').dataset.layerPendingCount).toBe('0');expect(picture.parentElement.style.visibility).toBe('hidden');
 view.unmount();matte.mockRestore();alpha.mockRestore();
});

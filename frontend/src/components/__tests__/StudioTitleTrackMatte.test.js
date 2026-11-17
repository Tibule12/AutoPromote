import React from 'react';
import {render} from '@testing-library/react';
import StudioTitleTrackMatte from '../StudioTitleTrackMatte';

jest.mock('../studioNodeTitleMask',()=>{
  const actual=jest.requireActual('../studioNodeTitleMask');
  return {...actual,studioTitleTrackMatteUri:()=>`url("data:image/svg+xml,${encodeURIComponent('<svg viewBox="0 0 405 720"><g transform="translate(0 0)"><path d="M0 0H20V20Z"/></g></svg>')}")`};
});

test('transport updates retain the mask DOM and update its existing pose',()=>{
  const layer={type:'text',text:'NODE',startTime:0,duration:4};
  const props={layer,pose:{x:50,y:50,scale:1,rotation:0,opacity:1},time:0,aspect:9/16,
    quality:'playback',fillId:'fill',mode:'alpha'};
  const view=render(<StudioTitleTrackMatte {...props}><span>Fill</span></StudioTitleTrackMatte>);
  const before=view.container.querySelector('[data-studio-title-matte-pose]');
  expect(before).toBeTruthy();
  view.rerender(<StudioTitleTrackMatte {...props} layer={{...layer}} time={1}
    pose={{...props.pose,x:60,scale:1.2}}><span>Fill</span></StudioTitleTrackMatte>);
  const after=view.container.querySelector('[data-studio-title-matte-pose]');
  expect(after).toBe(before);
  expect(after.getAttribute('transform')).toContain('translate(243 360)');
  expect(after.getAttribute('transform')).toContain('scale(1.2)');
});

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import StudioFrameStylesPanel from '../StudioFrameStylesPanel';
import { adaptStudioSnapshotToDocument } from '../studioProjectDocument';
const fixture=()=>{const s={orderedClips:[{id:'clip',url:'http://localhost/a',start:0,end:12}],timeline:[{id:'clip',startRequest:0,endRequest:12}],overlays:[],motionKeyframes:[],projectMedia:[{id:'a',name:'Footage',duration:12,status:'ready',url:'http://localhost/a',storagePath:'owned/a',contentHash:'a'.repeat(64)}]};s.studioDocument=adaptStudioSnapshotToDocument({projectId:'frame-ui',snapshot:s});return s;};
test('gallery selection, optional-source fallback and explicit tempo produce ordinary scene and sound actions',async()=>{
 const state=fixture(),onApply=jest.fn().mockResolvedValue(undefined);render(<StudioFrameStylesPanel getSnapshot={()=>state} projectMedia={state.projectMedia} time={0} getSize={()=>({width:1280,height:720})} onApply={onApply}/>);
 fireEvent.click(screen.getByRole('button',{name:'Browse 12 frame styles'}));expect(screen.getByRole('dialog')).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Choose Nocturne frame'}));
 fireEvent.change(screen.getByLabelText('Main footage'),{target:{value:'a'}});fireEvent.change(screen.getByLabelText('Frame beat source'),{target:{value:'tempo'}});fireEvent.change(screen.getByLabelText('Tempo (BPM)'),{target:{value:'160'}});fireEvent.change(screen.getByLabelText('Frame motion'),{target:{value:'beat'}});fireEvent.change(screen.getByLabelText('Frame sound effect'),{target:{value:'prism_sweep'}});
 fireEvent.click(screen.getByRole('button',{name:'Add editable frame'}));await waitFor(()=>expect(onApply).toHaveBeenCalledTimes(1));const plan=onApply.mock.calls[0][0];expect(plan.name).toBe('Nocturne frame · v1');expect(plan.actions.some(a=>a.type==='sound_cue'&&a.tone==='prism_sweep')).toBe(true);expect(plan.graphics.layers.length).toBeGreaterThan(1);
});
test('Escape closes the gallery and returns focus to its opener',()=>{
 const state=fixture();render(<StudioFrameStylesPanel getSnapshot={()=>state} projectMedia={state.projectMedia} time={0} getSize={()=>({width:1280,height:720})} onApply={jest.fn()}/>);const button=screen.getByRole('button',{name:'Browse 12 frame styles'});fireEvent.click(button);fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'});expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(button).toHaveFocus();
});

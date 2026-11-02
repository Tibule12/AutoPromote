import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { CompositeInspector } from "../StudioAdvancedInspectors";
import { adaptStudioSnapshotToDocument, projectStudioEditableStateToSnapshot } from '../studioProjectDocument';
import { compileStudioCompositionForRender, compileStudioOverlaysForRender, compileStudioFinishForRender } from '../studioRenderCompiler';
import { STUDIO_EXPORT_BLEND_MODES } from '../studioBlendModes';

const make = mode => { const snapshot = {
  orderedClips:[{id:'source',start:0,end:2,url:'https://example.test/owned.mp4'}],selectedClipId:'source',
  timeline:[{id:'main',sourceClipId:'source',startRequest:0,endRequest:2,url:'https://example.test/owned.mp4'}],
  overlays:[{id:'title',type:'text',text:'MOVE',color:'#baff38',blendMode:mode,startTime:0,duration:2}],
}; return { document: adaptStudioSnapshotToDocument({projectId:'blend-project',snapshot}), snapshot }; };

test.each(STUDIO_EXPORT_BLEND_MODES)('canonical %s survives editing projection and both export contracts',mode=>{
  const {document,snapshot}=make(mode);
  expect(projectStudioEditableStateToSnapshot(document,snapshot).overlays[0].blendMode).toBe(mode);
  expect(compileStudioOverlaysForRender(document,snapshot)[0].blendMode).toBe(mode);
  expect(compileStudioCompositionForRender(document).layers.find(layer=>layer.id==='title').blend_mode).toBe(mode);
});

test.each(['unknown','hue'])('unsupported %s is rejected before an export request can be built',mode=>{
  const {document,snapshot}=make(mode);
  expect(()=>compileStudioCompositionForRender(document)).toThrow(/not available for export/);
  expect(()=>compileStudioOverlaysForRender(document,snapshot)).toThrow(/not available for export/);
  expect(projectStudioEditableStateToSnapshot(document,snapshot).overlays[0].blendMode).toBe(mode);
});


test('existing Composite controls expose qualified modes and mark unsupported modes unavailable',()=>{
  const layer={id:'title',type:'text',text:'MOVE',blendMode:'normal'};
  const update=jest.fn(),noop=()=>{};
  render(<CompositeInspector activeOverlay={layer} overlays={[layer]} adjustmentLayers={[]}
    onUpdateAdjustmentLayer={noop} onDeleteAdjustmentLayer={noop} onSelectOverlay={noop}
    onUpdateOverlay={update} onAddAdjustmentLayer={noop} onCreateCompound={noop} />);
  expect(screen.getByRole('option',{name:'Difference',exact:true})).toBeEnabled();
  for (const name of ['Overlay','Soft light','Hard light','Color dodge','Luminosity'])
    expect(screen.getByRole('option',{name,exact:true})).toBeEnabled();
  fireEvent.change(screen.getByLabelText('Blend mode'),{target:{value:'difference'}});
  expect(update).toHaveBeenCalledWith('blendMode','difference');
});


test.each(['multiply','screen','difference'])('saved main-video %s cannot silently export as Normal', mode=>{
  const {snapshot}=make('normal');
  snapshot.mainTransform={id:'main-video',type:'video',blendMode:mode};
  const document=adaptStudioSnapshotToDocument({projectId:'main-blend',snapshot});
  expect(()=>compileStudioFinishForRender(document)).toThrow(/Main video blending is not available/);
  expect(()=>compileStudioCompositionForRender(document)).toThrow(/Main video blending is not available/);
  expect(projectStudioEditableStateToSnapshot(document,snapshot).mainTransform.blendMode).toBe(mode);
});

test('main-video inspector retains Normal as a repair path and disables unsupported base blending',()=>{
  const layer={id:'main-video',type:'video',blendMode:'difference'},noop=()=>{};
  render(<CompositeInspector activeOverlay={layer} overlays={[layer]} adjustmentLayers={[]}
    onUpdateAdjustmentLayer={noop} onDeleteAdjustmentLayer={noop} onSelectOverlay={noop}
    onUpdateOverlay={noop} onAddAdjustmentLayer={noop} onCreateCompound={noop} />);
  expect(screen.getByRole('option',{name:'Normal',exact:true})).toBeEnabled();
  expect(screen.getByRole('option',{name:/Difference.*unavailable for export/})).toBeDisabled();
});

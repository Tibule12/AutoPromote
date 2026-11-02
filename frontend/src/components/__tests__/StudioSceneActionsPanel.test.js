import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import StudioSceneActionsPanel from '../StudioSceneActionsPanel';
import { buildStudioEvidenceScenePlan } from '../studioSceneActions';

jest.mock('../studioSceneActions', () => ({ buildStudioEvidenceScenePlan: jest.fn() }));

test('playhead renders do not reconcile the project; building uses the latest snapshot and time', () => {
  const getSnapshot=jest.fn(),onApply=jest.fn(),media=[{id:'clip',name:'Moving source',status:'ready',storagePath:'owned/source',url:'http://localhost/source.mp4'}];
  const view=render(<StudioSceneActionsPanel getSnapshot={getSnapshot} projectMedia={media} time={1} onApply={onApply} />);
  fireEvent.change(screen.getByLabelText('Scene evidence source'),{target:{value:'clip'}});
  const current=jest.fn(()=>({revision:7}));
  view.rerender(<StudioSceneActionsPanel getSnapshot={current} projectMedia={media} time={12} onApply={onApply} />);
  expect(getSnapshot).not.toHaveBeenCalled();expect(current).not.toHaveBeenCalled();
  buildStudioEvidenceScenePlan.mockReturnValue({name:'Reviewed scene',actions:[]});
  fireEvent.click(screen.getByRole('button',{name:'Build evidence scene plan'}));
  expect(current).toHaveBeenCalledTimes(1);
  expect(buildStudioEvidenceScenePlan).toHaveBeenLastCalledWith({revision:7},'clip',12);
});

test('apply still uses the reviewed plan and displays validation errors without changing it',async()=>{
 const plan={name:'Reviewed scene',actions:[]},getSnapshot=jest.fn(()=>({revision:3}));
 buildStudioEvidenceScenePlan.mockReturnValue(plan);
 const onApply=jest.fn().mockRejectedValue(new Error('Plane edge collapses between its keys.'));
 render(<StudioSceneActionsPanel getSnapshot={getSnapshot} projectMedia={[{id:'clip',status:'ready',storagePath:'owned/source',url:'http://localhost/source.mp4'}]} time={2} onApply={onApply} />);
 fireEvent.change(screen.getByLabelText('Scene evidence source'),{target:{value:'clip'}});
 fireEvent.click(screen.getByRole('button',{name:'Build evidence scene plan'}));
 fireEvent.click(screen.getByRole('button',{name:'Apply reviewed scene actions'}));
 await waitFor(()=>expect(screen.getByRole('status').textContent).toMatch(/edge collapses/));
 expect(onApply).toHaveBeenCalledWith(plan);expect(getSnapshot).toHaveBeenCalledTimes(1);
 expect(screen.getByRole('button',{name:'Apply reviewed scene actions'}).disabled).toBe(false);
});

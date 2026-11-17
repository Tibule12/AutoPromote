import React from 'react';
import { render,screen,fireEvent } from '@testing-library/react';
import { CompositeInspector } from '../StudioAdvancedInspectors';
import { compileStudioNodeEffects } from '../studioNodeEffects';

jest.mock('../ProductHelpButton',()=>()=>null);
const show=(layer,update=jest.fn())=>render(<CompositeInspector activeOverlay={layer}
  overlays={[layer]} adjustmentLayers={[]} onUpdateOverlay={update} onSelectOverlay={jest.fn()} />);

test('text layers explain why keying is unavailable',()=>{
 show({id:'title',type:'text',text:'A title'});
 expect(screen.getByRole('checkbox',{name:/Key a color/i})).toBeDisabled();
 expect(screen.getByText('Select an image or video layer to key its background.')).toBeInTheDocument();
});

test('Composite percentages write the same canonical key parameters used by Node Flow',()=>{
 const layer={id:'plate',type:'image',chromaKey:{enabled:true,color:'#00ff00',tolerance:40,spill:0}};
 const update=jest.fn();show(layer,update);
 expect(screen.getByRole('slider',{name:/Tolerance/i})).toHaveValue('40');
 expect(screen.getByRole('slider',{name:/Spill removal/i})).toHaveValue('0');
 fireEvent.change(screen.getByRole('slider',{name:/Tolerance/i}),{target:{value:'42'}});
 const [field,key]=update.mock.calls.at(-1);
 expect(field).toBe('chromaKey');
 expect(compileStudioNodeEffects({...layer,chromaKey:key}).key.similarity).toBe(.42);
 fireEvent.change(screen.getByRole('slider',{name:/Spill removal/i}),{target:{value:'55'}});
 expect(compileStudioNodeEffects({...layer,chromaKey:update.mock.calls.at(-1)[1]}).key.spill).toBe(.55);
});

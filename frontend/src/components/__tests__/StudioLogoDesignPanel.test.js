import React from 'react';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import StudioLogoDesignPanel from '../StudioLogoDesignPanel';
import {buildStudioLogoDesign,LOGO_DESIGN_DEFAULT} from '../studioLogoDesign';
test('signed spacing drafts commit on blur and Escape retains the accepted spacing',async()=>{
 const build=jest.fn();render(<StudioLogoDesignPanel duration={8} aspect={16/9} onBuild={build}/>);
 const input=screen.getByLabelText('Logo letter spacing');fireEvent.change(input,{target:{value:''}});expect(input.value).toBe('');
 fireEvent.change(input,{target:{value:'-1.5'}});expect(input.value).toBe('-1.5');fireEvent.blur(input);
 fireEvent.change(input,{target:{value:'4'}});fireEvent.keyDown(input,{key:'Escape'});expect(input.value).toBe('-1.5');
 fireEvent.click(screen.getByRole('button',{name:'Add logo to timeline'}));await waitFor(()=>expect(build).toHaveBeenCalledTimes(1));
 expect(build.mock.calls[0][0]).toEqual(buildStudioLogoDesign({...LOGO_DESIGN_DEFAULT,tracking:-1.5},{width:1280,height:720,duration:8}));
});
test('locking discards an uncommitted spacing draft and prevents native authoring',()=>{
 const build=jest.fn(),ui=render(<StudioLogoDesignPanel duration={8} aspect={16/9} onBuild={build} locked={false}/>);
 const input=screen.getByLabelText('Logo letter spacing');fireEvent.change(input,{target:{value:'-1.5'}});
 ui.rerender(<StudioLogoDesignPanel duration={8} aspect={16/9} onBuild={build} locked/>);expect(input.value).toBe('1');expect(screen.getByRole('button',{name:'Add logo to timeline'}).closest('fieldset').disabled).toBe(true);expect(build).not.toHaveBeenCalled();
});

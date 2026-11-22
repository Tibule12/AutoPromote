import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import StudioGradeValueControl from '../StudioGradeValueControl';
const props = { label: 'Warmth', ariaLabel: 'Adjustment temperature', value: 0, min: -1, max: 1, step: .02 };
test('exact signed drafts commit once and preserve the slider label', () => {
 const change = jest.fn(), view = render(<StudioGradeValueControl {...props} onChange={change} />);
 const input = screen.getByRole('spinbutton', {name: 'Adjustment temperature value'});
 fireEvent.change(input, {target: {value: '-0.365'}});expect(change).not.toHaveBeenCalled();
 fireEvent.keyDown(input, {key: 'Enter'});expect(change).toHaveBeenCalledWith(-.365);
 view.rerender(<StudioGradeValueControl {...props} value={-.365} onChange={change} />);
 fireEvent.blur(input);expect(change).toHaveBeenCalledTimes(1);
 expect(screen.getByRole('slider', {name: 'Adjustment temperature'})).toBeInTheDocument();
});
test('empty and out-of-range drafts cannot change a grade; Escape restores it', () => {
 const change = jest.fn();render(<StudioGradeValueControl {...props} onChange={change} />);
 const input = screen.getByRole('spinbutton', {name: 'Adjustment temperature value'});
 for(const value of ['', '2']){fireEvent.change(input,{target:{value}});fireEvent.blur(input);expect(screen.getByRole('alert')).toHaveTextContent('Enter a value from -1 to 1');}
 expect(change).not.toHaveBeenCalled();fireEvent.keyDown(input,{key:'Escape'});
 expect(input).toHaveValue(0);expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
test('Undo or a saved value replaces an unfinished draft', () => {
 const change=jest.fn(),view=render(<StudioGradeValueControl {...props} onChange={change} />);
 const input=screen.getByRole('spinbutton',{name:'Adjustment temperature value'});
 fireEvent.change(input,{target:{value:'.7'}});view.rerender(<StudioGradeValueControl {...props} value={-.2} onChange={change}/>);
 expect(input).toHaveValue(-.2);expect(change).not.toHaveBeenCalled();
});

import React from 'react';
import {render,screen} from '@testing-library/react';
import TechnicalLearningPath from '../TechnicalLearningPath';
jest.mock('../educationCatalog',()=>({EDUCATION_PREVIEW:false,educationRoute:()=>'/#/education'}));
test('ordinary public builds do not expose private technical movies, downloads or onboarding',()=>{
 const {container}=render(<TechnicalLearningPath/>);
 expect(screen.getByText(/New lesson media is not published/)).toBeInTheDocument();
 expect(container.querySelector('video')).toBeNull();expect(container.querySelector('textarea')).toBeNull();expect(container.querySelector('a[download]')).toBeNull();
});

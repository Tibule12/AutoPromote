import React from 'react';
import { render,screen,waitFor } from '@testing-library/react';
import CatLearningPath from '../CatLearningPath';
import cat from '../catCatalog.json';
import { visibleEducationLessons } from '../educationCatalog';
jest.mock('../educationCatalog',()=>({EDUCATION_PREVIEW:false,educationRoute:p=>'/#/education/'+p,visibleEducationLessons:()=>[]}));
beforeEach(()=>{global.fetch=jest.fn().mockResolvedValue({ok:true,text:async()=>'<h1>Page</h1>'});});
afterEach(()=>{delete global.fetch;});
test('the public presentation exposes six working CAT lessons without claiming learner or curriculum approval',async()=>{const {container}=render(<CatLearningPath route="cat"/>);expect(container.querySelectorAll('video')).toHaveLength(12);expect(screen.getByRole('link',{name:'Download everything ↓'})).toHaveAttribute('href',cat.presentationRelease.packUrl);expect(screen.getByText(/no formal curriculum approval claimed/i)).toBeInTheDocument();expect(cat.presentationRelease.curriculumApproval).toBe(false);expect(cat.presentationRelease.learnerEnrolment).toBe(false);expect(visibleEducationLessons()).toHaveLength(0);await waitFor(()=>expect(global.fetch).toHaveBeenCalledTimes(6));});

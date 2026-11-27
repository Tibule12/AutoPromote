import React from 'react';
import {render,screen,fireEvent} from '@testing-library/react';
import TechnicalLearningPath,{completeTechnicalReviewEvidence} from '../TechnicalLearningPath';
import catalog from '../technicalCatalog.json';
import {clearSessionPreservingRenderAttempts} from '../../utils/viralRenderRecovery';
jest.mock('../educationCatalog',()=>({EDUCATION_PREVIEW:true,educationRoute:p=>'/#/education/'+(p||'')}));
jest.mock('../technicalCatalog.json',()=>{const c=jest.requireActual('../technicalCatalog.json');return {...c,lessons:c.lessons.map(l=>({...l,evidence:{...l.evidence,nativeExport:true,actualNativeDownload:true,completeMovingPreview:true,completeFinishedPlayback:true,exactColdRecovery:true,tutorial:true,bundle:true,technicalAccuracyChecked:true}}))};});
beforeEach(()=>localStorage.clear());
test('four technical subjects use one review pathway, two real movie slots each and no captions',()=>{
 const {container}=render(<TechnicalLearningPath/>);
 expect(catalog.lessons).toHaveLength(4);expect(container.querySelectorAll('video')).toHaveLength(8);expect(container.querySelector('track')).toBeNull();
 expect(screen.getAllByText('Technical exercise, creative exercise and reasoning')).toHaveLength(4);
 expect(screen.getAllByText('Teacher criteria, curriculum and technical review')).toHaveLength(4);
 expect(screen.getByRole('link',{name:'Download complete offline package ↓'})).toHaveAttribute('href','/education/technical-v1/teacher-review-pack.zip');
 expect(container.querySelector('a[href="#technical-films"]')).toBeNull();
});
test.each(catalog.lessons.map(l=>l.id))('%s has a dedicated subject route and keeps pending review explicit',id=>{
 const l=catalog.lessons.find(l=>l.id===id);render(<TechnicalLearningPath route={'technical/'+id}/>);
 expect(screen.getByRole('heading',{name:l.title})).toBeInTheDocument();
 expect(screen.getByRole('link',{name:'Completed editable graphics ↓'})).toHaveAttribute('href',`/education/technical-v1/${id}/lesson.graphics.json`);
 expect(screen.getByText(/External educator review, independent learner recreation and actual school hardware trials remain pending/)).toBeInTheDocument();
});
test('a missing preview, native download or accuracy gate prevents complete-review status',()=>{
 const l=catalog.lessons[0];expect(completeTechnicalReviewEvidence(l)).toBe(true);
 for(const flag of ['nativeExport','actualNativeDownload','completeMovingPreview','completeFinishedPlayback','exactColdRecovery','tutorial','bundle','technicalAccuracyChecked'])expect(completeTechnicalReviewEvidence({...l,evidence:{...l.evidence,[flag]:false}})).toBe(false);
});
test('guest startup preserves only the declared device feedback, without retaining credentials',()=>{
 const first=render(<TechnicalLearningPath/>),label='Technical review notes: Mechanical Technology';
 fireEvent.change(screen.getByLabelText(label),{target:{value:'Ask students to predict the driven direction before playing.'}});first.unmount();
 localStorage.setItem('token','private');localStorage.setItem('autopromote.education.unknown','private');clearSessionPreservingRenderAttempts();
 render(<TechnicalLearningPath/>);expect(screen.getByLabelText(label)).toHaveValue('Ask students to predict the driven direction before playing.');expect(localStorage.getItem('token')).toBeNull();expect(localStorage.getItem('autopromote.education.unknown')).toBeNull();expect(screen.getByText('Writing notes does not approve a lesson.')).toBeInTheDocument();
});
test('a reviewer can clear technical notes on a shared device without clearing CAT feedback',()=>{
 localStorage.setItem('autopromote.education.cat.review.v1','{"html-structure":"Keep this CAT feedback"}');render(<TechnicalLearningPath/>);fireEvent.change(screen.getByLabelText('Technical review notes: Civil Technology'),{target:{value:'Review the joint labels.'}});fireEvent.click(screen.getByRole('button',{name:'Clear technical review notes'}));expect(screen.getByLabelText('Technical review notes: Civil Technology')).toHaveValue('');expect(localStorage.getItem('autopromote.education.technical.review.v1')).toBeNull();expect(localStorage.getItem('autopromote.education.cat.review.v1')).toContain('Keep this CAT feedback');
});

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CatLearningPath from '../CatLearningPath';
import catalog from '../catCatalog.json';
jest.mock('../educationCatalog', () => ({ EDUCATION_PREVIEW: true, educationRoute: path => '/#/education/' + path }));
beforeEach(() => { localStorage.clear(); global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => '<h1>Working example</h1>' }); });
afterEach(() => { delete global.fetch; });
test('the CAT review hub contains all films, walkthroughs and complete materials',async()=>{
 const {container}=render(<CatLearningPath route="cat" />);
 expect(screen.getAllByRole('link',{name:'Open dedicated lesson page ↗'})).toHaveLength(catalog.lessons.length);
 expect(container.querySelectorAll('video')).toHaveLength(catalog.lessons.length * 2);
 expect(screen.getByRole('link',{name:'IT learning library ↗'})).toHaveAttribute('href','/#/education/library');
 expect(screen.getByRole('link',{name:'Download everything ↓'})).toHaveAttribute('href','/education/cat-html-v1/teacher-review-pack.zip');
 await waitFor(()=>expect(global.fetch).toHaveBeenCalledTimes(catalog.lessons.length));
 expect(container.querySelector('video track')).toBeNull();
});
test('review notes persist locally across remounts without marking approval',async()=>{
 const first=render(<CatLearningPath route="cat" />);
 fireEvent.change(screen.getByLabelText('Review notes for lesson 2'),{target:{value:'Give the broken-image example a longer pause.'}});
 expect(JSON.parse(localStorage.getItem('autopromote.education.cat.review.v1'))['html-images-links']).toBe('Give the broken-image example a longer pause.');
 first.unmount();render(<CatLearningPath route="cat" />);
 expect(screen.getByLabelText('Review notes for lesson 2')).toHaveValue('Give the broken-image example a longer pause.');
 expect(screen.getByText('Writing notes does not mark a lesson approved.')).toBeInTheDocument();
 await waitFor(()=>expect(global.fetch).toHaveBeenCalled());
});
test.each(catalog.lessons.map(lesson => lesson.id))('%s separates concept and creative exercises and shows reproducible parameters',id=>{
 const {container}=render(<CatLearningPath route={'cat/'+id}/>);
 expect(screen.getByRole('heading',{name:'HTML exercise',exact:true})).toBeInTheDocument();
 expect(screen.getByRole('heading',{name:'Creative editing exercise',exact:true})).toBeInTheDocument();
 expect(screen.getByRole('heading',{name:'Teacher assessment',exact:true})).toBeInTheDocument();
 expect(screen.getByRole('link',{name:'Working HTML file ↓'})).toHaveAttribute('href',expect.stringContaining('/'+id+'/index.html'));
 expect(screen.getByRole('link',{name:'Student worksheet PDF ↓'})).toHaveAttribute('href',expect.stringContaining('student-worksheet.pdf'));
 expect(screen.getByText('Exact editable graphics settings')).toBeInTheDocument();
 expect(container.querySelector('video track')).toBeNull();
});

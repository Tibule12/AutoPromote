import React, { useEffect, useState } from 'react';
import { EDUCATION_PREVIEW, educationRoute } from './educationCatalog';
const BASE = '/education/cat-html-v1/';
const NOTES_KEY = 'autopromote.education.cat.review.v1';
const file = (lesson, name) => `${BASE}${lesson.id}/${name}`;
const variants = lesson => lesson.variants || (lesson.number === 2 ? ['index.html', 'broken.html', 'about.html'] : lesson.number === 3 ? ['index.html', 'ordered.html'] : ['index.html']);
const scrollTo = id => document.getElementById(id)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });

function WorkingPage({ lesson }) {
  const [selected, setSelected] = useState('index.html');
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setSource(''); setError('');
    fetch(file(lesson, selected), { signal: controller.signal }).then(response => {
      if (!response.ok) throw Error('The source file could not be loaded.');
      return response.text();
    }).then(setSource).catch(problem => { if (problem.name !== 'AbortError') setError(problem.message); });
    return () => controller.abort();
  }, [lesson, selected]);
  return <div className="cat-working-page">
    <div className="cat-file-bar"><label>Example file<select aria-label={`HTML example for lesson ${lesson.number}`} value={selected} onChange={event => setSelected(event.target.value)}>{variants(lesson).map(name => <option key={name}>{name}</option>)}</select></label><a href={file(lesson, selected)} download>Download this HTML file ↓</a><a href={file(lesson, selected)} target="_blank" rel="noreferrer">Open in a browser ↗</a></div>
    <div className="cat-code-browser"><div><h4>Actual HTML source</h4>{error ? <p role="alert">{error}</p> : <pre tabIndex={0} aria-label={`HTML source for lesson ${lesson.number}`}>{source || 'Loading the HTML file…'}</pre>}</div><div><h4>Live browser output</h4><iframe key={selected} title={`Working webpage for lesson ${lesson.number}`} src={file(lesson, selected)} sandbox="" loading="lazy" /></div></div>
    <p className="edu-small">This browser runs the supplied HTML file. The Studio film shows how editable graphics explain the relationship between that code and its output.</p>
  </div>;
}

function ReviewNotes({ catalog }) {
  const [notes, setNotes] = useState(() => {
    try { const value = JSON.parse(localStorage.getItem(NOTES_KEY) || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(catalog.lessons.map(lesson => [lesson.id, typeof value[lesson.id] === 'string' ? value[lesson.id].slice(0, 8000) : ''])) : {}; } catch (_) { return {}; }
  });
  const [status, setStatus] = useState('');
  const update = (id, text) => {
    const next = { ...notes, [id]: text.slice(0, 8000) }; setNotes(next);
    try { localStorage.setItem(NOTES_KEY, JSON.stringify(next)); setStatus('Notes saved on this device.'); } catch (_) { setStatus('Browser storage is unavailable. Download your notes before leaving.'); }
  };
  const download = () => {
    const data = { format: 'autopromote-cat-review-notes', version: 1, savedAt: new Date().toISOString(), purpose: 'Private review notes; no approval or assessment result is inferred.', lessons: catalog.lessons.map(lesson => ({ id: lesson.id, title: lesson.title, notes: notes[lesson.id] || '' })) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'AutoPromote-CAT-review-notes.json'; document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus('Review notes downloaded.');
  };
  return <section className="cat-review-notes" id="cat-feedback"><p className="edu-kicker">RECORD YOUR FEEDBACK</p><h2>Keep useful feedback with the lesson.</h2><p>Consider technical accuracy, clarity, pacing, grade suitability and whether a student could recreate the edit. Notes stay on this device. Download them when you finish; nothing is submitted automatically.</p>{catalog.lessons.map(lesson => <label key={lesson.id}>{lesson.number}. {lesson.title}<textarea aria-label={`Review notes for lesson ${lesson.number}`} rows={4} maxLength={8000} value={notes[lesson.id] || ''} onChange={event => update(lesson.id, event.target.value)} placeholder="For example: at 00:14, allow more time to compare the tag with the output…" /></label>)}<button className="edu-button" type="button" onClick={download}>Download review notes ↓</button><p className="edu-small" role="status">{status || 'Writing notes does not mark a lesson approved.'}</p></section>;
}

export default function CatReviewHub({ catalog, Guide, Movie }) {
  const packUrl = EDUCATION_PREVIEW ? BASE + 'teacher-review-pack.zip' : catalog.presentationRelease?.packUrl;
  return <div className="cat-review-hub">
    <section className="edu-section cat-review-hero"><div><p className="edu-kicker">CAT · HTML & WEB DESIGN · TEACHER REVIEW</p><h1>From the code<br />to the screen.</h1><p className="edu-lead">{catalog.lessons.length} visual HTML lessons. Watch the finished explanation, follow its real Studio walkthrough, and try the working webpage.</p><div className="edu-actions"><button className="edu-button" type="button" onClick={() => scrollTo('cat-lessons')}>Start with the films ↓</button><a className="edu-button edu-button-outline" href={packUrl} download>Download everything ↓</a></div><p className="edu-small">Prepared for professional feedback. Supplementary to the amended South African CAT CAPS; no formal curriculum approval claimed.</p></div><div className="cat-review-overview"><p className="edu-kicker">READY TO REVIEW</p><dl><div><dt>{catalog.lessons.length} × 28 sec</dt><dd>finished films, with sound</dd></div><div><dt>{catalog.lessons.length} walkthroughs</dt><dd>real clicks, scrolling and exact settings</dd></div><div><dt>Working HTML</dt><dd>source files, images and linked pages</dd></div><div><dt>Practical materials</dt><dd>student worksheets and teacher guides</dd></div></dl><p>No captions. Full 16:9 result frames. The existing IT pathway is preserved.</p></div></section>
    <nav className="cat-review-nav" aria-label="Review this package"><button type="button" onClick={() => scrollTo('cat-lessons')}>Films & walkthroughs</button><button type="button" onClick={() => scrollTo('cat-materials')}>Download materials</button><button type="button" onClick={() => scrollTo('cat-feedback')}>Review notes</button><a href={educationRoute('library')}>IT learning library ↗</a></nav>
    <section className="edu-section cat-review-intro" id="cat-lessons"><p className="edu-kicker">BEGIN WITH THE FINISHED RESULTS</p><h2>{catalog.lessons.length * 28} seconds to explore the ideas.</h2><p>Each short film pairs real HTML and browser output with native Studio callouts and animated outlines. Open the walkthrough and exercises when you want to inspect or recreate it.</p><div className="cat-review-jumps">{catalog.lessons.map(lesson => <button type="button" key={lesson.id} onClick={() => scrollTo('review-' + lesson.id)}><span>0{lesson.number}</span><strong>{lesson.title}</strong><small>{lesson.grade}</small></button>)}</div></section>
    {catalog.lessons.map(lesson => <section className="edu-section cat-review-lesson" id={'review-' + lesson.id} key={lesson.id} aria-labelledby={'heading-' + lesson.id}>
      <header><p className="edu-kicker">LESSON 0{lesson.number} · {lesson.grade}</p><h2 id={'heading-' + lesson.id}>{lesson.title}</h2><p>{lesson.concept}</p></header>
      <div className="cat-result-layout"><Movie src={file(lesson, 'result.mp4')} title={`Lesson ${lesson.number} — finished explanation exported by AutoPromote`} /><aside><h3>What to look for</h3><ul>{lesson.objectives.map(text => <li key={text}>{text}</li>)}</ul><a href={file(lesson, 'result.mp4')} download>Download the finished film ↓</a><p className="edu-small">28 seconds · 1280 × 720 · 24 fps · sound · no captions</p></aside></div>
      <div className="cat-review-accordions">
        <details className="cat-review-detail"><summary>Follow the Studio walkthrough and exact settings</summary><Guide lesson={lesson} /><p><a href={file(lesson, 'tutorial.mp4')} download>Download the complete walkthrough ↓</a> · <a href={file(lesson, 'TUTORIAL-TRANSCRIPT.txt')} download>Plain transcript with times ↓</a></p></details>
        <details className="cat-review-detail"><summary>Try the working webpage beside its HTML</summary><WorkingPage lesson={lesson} /></details>
        <details className="cat-review-detail"><summary>Student exercises and understanding checks</summary><h3>HTML exercise</h3><p>{lesson.htmlExercise}</p><h3>Creative editing exercise</h3><p>{lesson.creativeExercise}</p><p><a href={file(lesson, 'student-worksheet.pdf')} download>Student worksheet PDF ↓</a> · <a href={file(lesson, 'STUDENT-EXERCISES.txt')} download>Plain text exercises ↓</a></p><h3>Explain it without the animation</h3>{lesson.questions.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</details>
        <details className="cat-review-detail"><summary>Teacher assessment and curriculum reference</summary><p>Suggested review rubric: HTML understanding and testing 12 points; creative explanation and reproduction 8 points. Adapt it to the classroom.</p><ul>{lesson.criteria.map(text => <li key={text}>{text}</li>)}</ul><p><a href={file(lesson, 'teacher-guide.pdf')} download>Teacher guide PDF ↓</a> · <a href={file(lesson, 'TEACHER-ASSESSMENT.txt')} download>Plain text criteria and answers ↓</a></p><p><a href={catalog.reference.url} target="_blank" rel="noreferrer">Official DBE CAT CAPS amendment</a>, PDF pages {lesson.pages.join(', ')}. The teacher should confirm the current teaching plan and assessment tag sheet. Legacy presentational attributes are identified in the materials; modern websites normally use CSS for styling.</p></details>
      </div>
      <div className="cat-lesson-actions"><a className="edu-button edu-button-outline" href={file(lesson, 'practice-kit.zip')} download>Download lesson {lesson.number} kit ↓</a><a href={educationRoute('cat/' + lesson.id)}>Open dedicated lesson page ↗</a></div>
    </section>)}
    <section className="edu-section" id="cat-materials"><p className="edu-kicker">ALL THE MATERIALS</p><h2>Ready to present. Ready to practise.</h2><div className="cat-material-grid"><a className="edu-path" href={packUrl} download><h3>Complete review pack ↓</h3><p>All {catalog.lessons.length * 2} videos, working HTML and dependencies, printable worksheets, exact settings and teacher materials. Includes an offline presentation page.</p></a><a className="edu-path" href={BASE + 'TEACHER-REVIEW.txt'} download><h3>Teacher review brief ↓</h3><p>Scope, curriculum reference, review questions and criteria for professional feedback.</p></a><a className="edu-path" href={BASE + 'PERMISSIONS.txt'} download><h3>Asset permissions ↓</h3><p>Original examples, source provenance, classroom adaptation permissions and synthetic voice disclosure.</p></a></div><p className="edu-small">The walkthroughs use a disclosed editable graphics starter, inspect its native layers and keys, and create a practice label manually. Studio edits the explanation; the browser runs the HTML. Teacher feedback and independent student recreation are pending.</p></section>
    <section className="edu-section"><ReviewNotes catalog={catalog} /></section>
  </div>;
}

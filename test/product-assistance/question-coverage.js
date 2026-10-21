'use strict';
// Independent user wording plus complete public feature/control/guide coverage.
// Expected IDs assert relevance; HTTP success alone does not qualify an answer.
const groups = [
  ['conversation', [], ['Hi', 'hello 👋', 'hey there', 'Good morning', 'Thanks', 'Thank you, that helped', 'What can you help me with?', 'Help me get started', 'I am new here', 'What is AutoPromote?']],
  ['editing', ['studio.cut'], ['How can I split my video?', 'I want to cut a clip into two parts', 'Where is the split button?']],
  ['editing', ['studio.trim'], ['How do I trim the end?', 'Remove the first few seconds of my clip', 'Can I shorten this video?']],
  ['editing', ['studio.undo_redo'], ['Can I undo a mistake?', 'How do I redo my last edit?', 'I deleted a layer by accident']],
  ['editing', ['studio.persistence'], ['How do I save my project?', 'Can I reopen an old edit?', 'Will my project still be here tomorrow?']],
  ['motion', ['studio.keyframes'], ['How do I add key frames?', 'How can I make a picture move across the screen?', 'Where are the motion controls?', 'How do I animate position and rotation?']],
  ['motion', ['studio.easing'], ['How do I make movement ease in and out?', 'Can I change animation acceleration?', 'What is a bezier curve?']],
  ['sound', ['studio.music'], ['Can I add my own music?', 'Where do I put the background music?', 'How do I change the song?']],
  ['sound', ['studio.ducking'], ['Make the music quieter when someone speaks', 'Can music duck automatically around dialogue?', 'How do I hear speech over the music?']],
  ['sound', ['studio.voiceover'], ['Can I record a voice over?', 'How do I add narration?', 'I want to use my own recorded voice']],
  ['sound', ['studio.audio_restoration'], ['How can I repair noisy speech?', 'Can I clean up the sound?', 'The voice has background noise']],
  ['sound', ['studio.sfx'], ['How do I add sound effects?', 'Where do I place a whoosh?', 'Can I move sound cues?']],
  ['captions', ['studio.captions'], ['How do I add subtitles?', 'My captions repeat words', 'Can I correct the transcript?', 'Why are my automatic captions wrong?', 'captions not working']],
  ['composite', ['studio.compositing', 'studio.creator.background_replacement'], ['Can I change my video background?', 'How do I replace the background of a podcast?', 'I want to keep the people and replace the room', 'Can I keep the microphone and sofa?', 'Why is there a halo around the person?']],
  ['composite', ['studio.compositing.text_behind_subject'], ['Put my title behind the person', 'Can words go behind someone?', 'How do I place text behind a subject?']],
  ['composite', ['studio.creator.object_cleanup'], ['Can I remove an unwanted object?', 'How do I erase a thing in the background?']],
  ['graphics', ['studio.logo_design'], ['How do I design a logo?', 'Where is Logo Workshop?', 'Can I export a transparent logo PNG?', 'How do I save a logo SVG?']],
  ['graphics', ['studio.logo_motion', 'creative.logo_brand'], ['How do I animate my logo?', 'Can I create a brand reveal?']],
  ['graphics', ['studio.text_choreography'], ['Animate each letter separately', 'How do I stagger words?', 'Can I animate editable text?']],
  ['graphics', ['studio.vector_artwork'], ['Can I edit vector points?', 'How do I draw a vector path?']],
  ['multicam', ['cam_combiner.switching'], ['How do I use Cam Combiner?', 'How do I switch between podcast cameras?', 'Can I automatically cut to the person speaking?']],
  ['multicam', ['cam_combiner.channel_mapping'], ['The speakers are reversed', 'It cuts to the wrong speaker', 'How do I map clean audio channels?']],
  ['director', ['director.proposals'], ['What does AI Director do?', 'Can I edit what Director made?', 'How is Cam Combiner different from Director?']],
  ['generation', ['generation.idea_to_video'], ['How do I turn an idea into a video?', 'What is idea to video?']],
  ['generation', ['generation.image_to_video'], ['Can I animate a photo?', 'How do I turn an image into a moving scene?']],
  ['templates', ['studio.templates', 'creative.shared_templates'], ['How do I use a template?', 'Can I change a template to my own style?', 'Where can I find creative templates?']],
  ['publishing', ['publishing.connections'], ['How do I connect YouTube?', 'Can I connect my Instagram account?', 'Which platforms can I connect?']],
  ['publishing', ['publishing.schedule'], ['How do I schedule a post?', 'Can every platform have a different caption and time?', 'Where can I see the publishing queue?']],
  ['publishing', ['publishing.analytics'], ['Where can I see my analytics?', 'Can I see how my posts performed?', 'Why are there no views shown?']],
  ['export', ['studio.export', 'studio.render'], ['How do I download my final video?', 'Where is my finished export?', 'Can I export the movie?']],
  ['account', ['system.account'], ['I cannot log in', 'How do I reset my password?', 'Why do I not have permission?', 'How do I delete my account?']],
  ['costs', ['system.costs'], ['How much does this cost?', 'Will generating a video use credits?', 'Why is my credit balance zero?', 'How do I upgrade my plan?']],
  ['processing', ['system.cancellation'], ['Can I cancel a processing job?', 'How do I stop a generation?']],
  ['processing', ['system.retries', 'system.processing_states'], ['My job has been processing for a long time', 'Should I retry a failed render?', 'It says queued but nothing happens']],
  ['typos', ['studio.captions'], ['How do i add captons?', 'subtitels are wrong', 'captions??? 😤']],
  ['typos', ['publishing.schedule'], ['how to shedule a post', 'schedul my video']],
  ['typos', ['studio.keyframes'], ['How do I add keyframs?', 'keyframes\nplease', 'HOW DO I ADD KEYFRAMES?!']],
  ['unknown', [], ['How do I teleport to Mars?', 'What is the weather tomorrow?', 'Write me a legal contract', 'Can you guarantee a million views?', 'What is the live price of Bitcoin?', 'asdfghjkl', 'こんにちは', 'Ndingalutshintsha njani udonga olungasemva?', '¿Cómo cambio el fondo?', '...']],
  ['sensitive-text', [], ['My email is qa@example.invalid and I cannot sign in', 'My clip is at https://example.invalid/video.mp4 — how do I import it?', 'The error mentions /home/person/video.mp4; what should I check?', 'My password: pretend-secret. How do I change it?', 'api_key=pretend-secret how do I connect my account?']],
];

function questionCoverage(book, { catalogue = true } = {}) {
  const cases = groups.flatMap(([category, anyFeature, questions]) => questions.flatMap(question => ['EXPLAIN', 'GUIDE', 'DIAGNOSE'].map(mode => ({ category, input: { question, mode, context: {} }, anyFeature }))));
  if (catalogue) {
    for (const f of book.features.filter(f => f.visibility === 'PUBLIC')) {
      for (const mode of ['EXPLAIN', 'GUIDE', 'DIAGNOSE']) {
        cases.push({ category: 'feature-name', input: { question: `Tell me about ${f.name}`, mode }, anyFeature: [f.feature_id] });
        cases.push({ category: 'contextual-follow-up', input: { question: 'What do I do next?', mode, context: { selected_feature_id: f.feature_id } }, anyFeature: [f.feature_id] });
      }
      for (const alias of f.aliases || []) cases.push({ category: 'feature-alias', input: { question: alias }, anyFeature: [f.feature_id] });
    }
    for (const c of book.controls.filter(c => c.visibility === 'PUBLIC')) {
      const feature = book.features.find(f => f.feature_id === c.feature_ids[0]);
      cases.push({ category: 'control', input: { question: `What does ${c.label} do?`, context: { selected_feature_id: feature.feature_id } }, anyFeature: c.feature_ids, control: c.control_id });
    }
    for (const t of book.tasks.filter(t => t.visibility === 'PUBLIC')) for (const mode of ['EXPLAIN', 'GUIDE', 'DIAGNOSE']) {
      cases.push({ category: 'guide-title', input: { question: t.title, mode }, anyFeature: t.feature_ids, task: t.task_id });
    }
  }
  return cases.map((row, i) => ({ id: `question-${String(i + 1).padStart(4, '0')}`, ...row, primary: !['feature-name', 'feature-alias', 'control', 'guide-title', 'contextual-follow-up'].includes(row.category) && !/different|versus/i.test(row.input.question), noFeature: row.category === 'unknown' && !row.input.question.includes('guarantee') }));
}
module.exports = { questionCoverage };

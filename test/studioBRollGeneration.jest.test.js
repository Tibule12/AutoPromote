jest.mock('../src/firebaseAdmin',()=>({db:{collection:jest.fn()}}));
const {normalizeBRollRequest,validateBRollPlan}=require('../src/services/studioBRollGenerationService');
const request={requestId:'request-one',projectId:'project-one',sourceStoragePath:'studio/sources/owner/source.mp4',
  duration:120,maxShots:2,captions:[{id:'cue-1',start:20,end:24,text:'We prepare fresh bread in the kitchen.',reviewRequired:false},
    {id:'cue-2',start:40,end:44,text:'The mountain trail starts at sunrise.',reviewRequired:false}]};
const shot={captionId:'cue-1',subjectQuote:'bread',evidenceQuote:request.captions[0].text,title:'Bread preparation',
  prompt:'Close-up of bread dough being folded gently on a kitchen counter in natural window light.',start:20.2,duration:3};
test('different content genres can use concrete reviewed transcript evidence',()=>{
  const normalized=normalizeBRollRequest(request);
  expect(validateBRollPlan({reason:'Show the explained action.',shots:[shot]},normalized).shots[0].id).toBe('shot-1');
  expect(validateBRollPlan({reason:'Keep the original picture.',shots:[]},normalized).shots).toEqual([]);
});
test('unreviewed captions cannot start paid generation',()=>{
  expect(()=>normalizeBRollRequest({...request,captions:[{...request.captions[0],reviewRequired:true}]})).toThrow('BROLL_TRANSCRIPT_REVIEW_REQUIRED');
});
test.each([
  {evidenceQuote:'Invented quotation'}, {captionId:'other-cue'}, {start:19}, {start:24},
  {start:22,duration:99}, {prompt:''},
])('rejects an ungrounded or out of range generated beat: %j',change=>{
  expect(()=>validateBRollPlan({reason:'test',shots:[{...shot,...change}]},request)).toThrow('BROLL_PLAN_NOT_GROUNDED');
});
test('rejects duplicate beats and preserves the speaker revelation',()=>{
  expect(()=>validateBRollPlan({reason:'test',shots:[shot,shot]},request)).toThrow('BROLL_PLAN_NOT_GROUNDED');
  const changed={...request,captions:[{...request.captions[0],text:'I decided to change everything.'}]};
  expect(()=>validateBRollPlan({reason:'test',shots:[{...shot,evidenceQuote:changed.captions[0].text}]},changed)).toThrow('BROLL_PLAN_NOT_GROUNDED');
});
test('abstract life statements cannot justify invented rooms or possessions',()=>{
  const changed={...request,captions:[{...request.captions[0],text:'I grew up well.'}]};
  expect(()=>validateBRollPlan({reason:'test',shots:[{...shot,subjectQuote:'grew up well',evidenceQuote:changed.captions[0].text}]},changed)).toThrow('BROLL_PLAN_NOT_GROUNDED');
});
test('visual subject must occur in the exact supporting cue',()=>{
  expect(()=>validateBRollPlan({reason:'test',shots:[{...shot,subjectQuote:'bookshelf'}]},request)).toThrow('BROLL_PLAN_NOT_GROUNDED');
});
test('existing generated beats are excluded before another paid plan',()=>{
  const changed=normalizeBRollRequest({...request,excludedCaptionIds:['cue-1']});
  expect(()=>validateBRollPlan({reason:'test',shots:[shot]},changed)).toThrow('BROLL_PLAN_NOT_GROUNDED');
});
test('rechecking another owner’s artifact cannot reach GPU dispatch',async()=>{
  const {db}=require('../src/firebaseAdmin'),{recheckBRollShot}=require('../src/services/studioBRollGenerationService');
  db.collection.mockReturnValue({doc:()=>({get:async()=>({exists:true,data:()=>({ownerUid:'other-owner'})})})});
  await expect(recheckBRollShot({ownerUid:'owner',jobId:'a'.repeat(40),shotId:'shot-1',contentHash:'b'.repeat(64)}))
    .rejects.toMatchObject({code:'BROLL_JOB_MISSING',statusCode:404});
});
test('rechecking requires the rejected artifact’s original exact hash',async()=>{
  const {db}=require('../src/firebaseAdmin'),{recheckBRollShot}=require('../src/services/studioBRollGenerationService');
  db.collection.mockReturnValue({doc:()=>({get:async()=>({exists:true,data:()=>({ownerUid:'owner',record:JSON.stringify({
    status:'partial',shots:[{id:'shot-1',status:'rejected',review:{artifactSha256:'b'.repeat(64)}}]})})})})});
  await expect(recheckBRollShot({ownerUid:'owner',jobId:'a'.repeat(40),shotId:'shot-1',contentHash:'c'.repeat(64)}))
    .rejects.toMatchObject({code:'BROLL_RECHECK_NOT_READY',statusCode:409});
});

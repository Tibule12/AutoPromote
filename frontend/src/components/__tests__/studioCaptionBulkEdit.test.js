import {applyCaptionBulkEdit} from '../studioCaptionBulkEdit';
const cues=[{id:'one',text:'Reviewed script',speaker:'host',language:'und',textReviewRequired:true,textReviewed:false},
  {id:'two',text:'Unknown speaker',speaker:'unknown',language:'en',textReviewRequired:false}];
test('changing language does not approve unreviewed wording or unidentified speakers',()=>{
  const result=applyCaptionBulkEdit(cues,'language','en');
  expect(result[0]).toMatchObject({language:'en',languages:['en'],textReviewed:false,reviewRequired:true});
  expect(result[1].reviewRequired).toBe(true);expect(cues[0].language).toBe('und');
});
test('explicit wording approval preserves identity blockers and reaction removal preserves timing/text',()=>{
  const approved=applyCaptionBulkEdit(applyCaptionBulkEdit(cues,'language','en'),'approve_wording');
  expect(approved[0].reviewRequired).toBe(false);expect(approved[1].reviewRequired).toBe(true);
  expect(applyCaptionBulkEdit(cues,'clear_reactions')[0]).toMatchObject({id:'one',text:'Reviewed script',captionIcon:'none'});
});

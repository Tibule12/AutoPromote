// One content update delivery, selected legacy handlers. Keep the legacy
// implementation as the authority for promotion, page/link and reward rules.
const crypto=require('node:crypto');
const newlyRequested=(before,after)=>(!before&&!!after)||(before===undefined&&after!==undefined);
function selectedContentHandlers(before={},after={}) {
 const selected=[];
 if(before.status!=='approved'&&after.status==='approved')selected.push('createPromotionOnApproval');
 if(newlyRequested(before.landingPageRequestedAt,after.landingPageRequestedAt)&&!after.landingPageUrl)selected.push('handleLandingPageIntent');
 if(newlyRequested(before.smartLinkRequestedAt,after.smartLinkRequestedAt)&&!after.smartLink&&after.landingPageUrl)selected.push('handleSmartLinkIntent');
 if((after.user_id||after.userId)&&Number(after.views||0)-Number(before.views||0)>=100)selected.push('autoRewardCreators');
 return selected;
}
function createContentUpdateRouter(handlers) {
 return async(change,context)=>{
  const names=selectedContentHandlers(change.before.data()||{},change.after.data()||{});
  const results=await Promise.allSettled(names.map(name=>handlers[name](change,context)));
  const failure=results.find(r=>r.status==='rejected');
  if(failure)throw failure.reason;
  return null;
 };
}
async function createApprovalSchedule({db,contentId,eventId,data}) {
 if(typeof eventId!=='string'||!eventId)throw Error('Approval event identity required');
 const id='approval_'+crypto.createHash('sha256').update(contentId+'\0'+eventId).digest('hex');
 try{await db.collection('promotion_schedules').doc(id).create({...data,sourceEventId:eventId});return {id,created:true};}
 catch(error){if(error.code===6||error.code==='already-exists')return {id,created:false};throw error;}
}
module.exports={selectedContentHandlers,createContentUpdateRouter,createApprovalSchedule};

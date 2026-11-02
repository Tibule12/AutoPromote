const test=require('node:test'),assert=require('node:assert/strict');
const {projectMarketingPost,collectMarketingPostEvidence}=require('../src/services/marketingPostEvidence');
test('absent snapshot/counters and legacy zeroes cannot become observed failure',()=>{
 const empty=projectMarketingPost({metrics:{views:0}});assert.equal(empty.metrics.views,null);assert.equal(empty.availability.views,'NO_METRIC_SNAPSHOT');
 const measured=projectMarketingPost({analytics_snapshots:[{timestamp:'2026-10-14T00:00:00Z'}],metrics:{view_count:85,shares:0}});
 assert.equal(measured.metrics.views,85);assert.equal(measured.metrics.shares,null);assert.equal(measured.availability.shares,'LEGACY_ZERO_UNVERIFIED');assert.equal(measured.metrics.reach,null);
 const explicit=projectMarketingPost({analytics_snapshots:[{timestamp:'2026-10-14T00:00:00Z'}],metrics:{share_count:0},metrics_availability:{share_count:'observed'}});assert.equal(explicit.metrics.shares,0);
 assert.equal(projectMarketingPost({simulated:true}),null);
});
test('authorization rejects foreign content before any platform-post query',async()=>{
 let queried=false;const db={collection:name=>{if(name==='platform_posts'){queried=true;throw new Error('Foreign query');}return {doc:()=>({get:async()=>({exists:true,data:()=>({user_id:'someone-else'})})})};}};
 await assert.rejects(collectMarketingPostEvidence({db,uid:'owner',contentIds:['foreign']}),{status:404});assert.equal(queried,false);
 await assert.rejects(collectMarketingPostEvidence({db,uid:'owner',contentIds:['../escape']}),{status:400});
});
test('owned observations exclude simulated/foreign records and preserve provider identity',async()=>{
 const rows=[{id:'a',data:()=>({user_id:'owner',contentId:'mine',platform:'youtube',externalId:'real-post',success:true})},{id:'b',data:()=>({user_id:'foreign'})},{id:'c',data:()=>({user_id:'owner',simulated:true})}];
 const query={where:()=>query,limit:()=>query,get:async()=>({docs:rows})};
 const db={collection:name=>name==='content'?{doc:()=>({get:async()=>({exists:true,data:()=>({user_id:'owner'})})})}:query};
 const result=await collectMarketingPostEvidence({db,uid:'owner',contentIds:['mine']});assert.equal(result.results[0].posts.length,1);assert.equal(result.results[0].posts[0].providerPostId,'real-post');assert.equal(result.freshProviderFetch,false);
});

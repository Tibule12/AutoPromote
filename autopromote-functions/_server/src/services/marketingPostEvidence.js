'use strict';
// Read-only packaging feedback. Missing counters are not observed zeroes;
// legacy provider adapters also coerce absent fields to zero, so retain that
// ambiguity until an adapter supplies explicit field-availability evidence.
const METRICS={
 impressions:['impressions','post_impressions','impression_count'],reach:['reach'],
 views:['view_count','views'],shownInFeed:['shown_in_feed','shownInFeed'],
 viewedPercentage:['viewed_percentage','viewedPercentage'],swipedPercentage:['swiped_percentage','swipedPercentage'],
 firstSecondsRetention:['first_seconds_retention','firstSecondsRetention'],
 averageWatchSeconds:['average_watch_duration','averageViewDuration','average_watch_seconds'],
 averagePercentageViewed:['average_percentage_viewed','averageViewPercentage'],completion:['completion_rate'],
 likes:['like_count','likes'],comments:['comment_count','comments','num_comments'],shares:['share_count','shares','reshare_count'],
 saves:['saved','saves','save_count'],profileVisits:['profile_visits'],clicks:['clicks','click_count'],
 subscribers:['subscribers_gained'],follows:['follows','followers_gained'],signups:['signups'],conversions:['conversions'],
 redditScore:['score'],redditUpvoteRatio:['upvote_ratio']
};
const owner=record=>record?.user_id||record?.userId||record?.uid||record?.ownerId||record?.creatorId;
const iso=value=>{const date=value?.toDate?.()||value;const ms=date instanceof Date?date.getTime():Date.parse(date);return Number.isFinite(ms)?new Date(ms).toISOString():null;};
function projectMarketingPost(post,observation){
 if(post.simulated===true||post.rawOutcome?.simulated===true)return null;
 const usableObservation=observation?.status==='READ_COMPLETED'?observation:undefined;
 const snapshots=(post.analytics_snapshots||[]).filter(s=>iso(s.timestamp)).sort((a,b)=>Date.parse(iso(b.timestamp))-Date.parse(iso(a.timestamp)));
 const observedAt=usableObservation?.observedAt||(snapshots[0]?iso(snapshots[0].timestamp):null);
 const raw=usableObservation?.metrics||(post.metrics&&typeof post.metrics==='object'?post.metrics:{});
 const metrics={},availability={};
 for(const [name,aliases] of Object.entries(METRICS)){
  const field=aliases.find(key=>raw[key]!==null&&raw[key]!==undefined&&raw[key]!==''&&typeof raw[key]!=='boolean'&&Number.isFinite(Number(raw[key])));
  const value=field===undefined?null:Number(raw[field]);
  const verifiedZero=value===0&&(usableObservation?.availability||post.metrics_availability)?.[field]==='observed';
  metrics[name]=observedAt&&value!==null&&(value!==0||verifiedZero)?value:null;
  availability[name]=!observedAt?'NO_METRIC_SNAPSHOT':value===null?'NOT_RETURNED':value===0&&!verifiedZero?'LEGACY_ZERO_UNVERIFIED':'REPORTED';
 }
 return {recordId:post.id,contentId:post.contentId,platform:String(post.platform||'').toLowerCase(),
  status:post.status||post.publish_status||(post.success===true?'success':post.success===false?'failed':'unknown'),
  providerPostId:typeof post.externalId==='string'?post.externalId:null,publishedAt:iso(post.publishedAt||post.published_at||post.publish_timestamp),
  source:usableObservation?.source||'stored_platform_posts',providerRead:observation?.status||'NOT_REQUESTED',observedAt,metrics,availability,
  searchTerms:null,searchTermsAvailability:'NO_SEARCH_TERM_ADAPTER',
  note:'Counters are not comparable across platform surfaces. Legacy unverified zeroes and absent fields remain unavailable; no ranking or performance diagnosis is inferred.'};
}
async function readConnectedPost(post,uid){
 const metrics={},availability={},pick=(object,mapping,verified=false)=>{for(const [to,from] of Object.entries(mapping))if(object?.[from]!==undefined&&object[from]!==null){metrics[to]=object[from];if(verified)availability[to]='observed';}};
 if(!post.externalId)return {status:'NO_CONFIRMED_PROVIDER_POST_ID',metrics:{},observedAt:null};
 try{
  if(post.platform==='youtube'){
   const data=await require('./youtubeService').fetchVideoStats({uid,videoId:post.externalId});
   pick(data.statistics,{view_count:'viewCount',like_count:'likeCount',comment_count:'commentCount'},true);
  }else if(post.platform==='reddit'){
   const data=await require('./redditService').getPostInfo({uid,postId:post.externalId});
   pick(data,{score:'score',upvote_ratio:'upvoteRatio',comment_count:'numComments'},true);
  }else if(post.platform==='tiktok'){
   const rows=await require('./tiktokService').getVideoMetrics(uid,[post.externalId]);const data=rows.find(r=>r.id===post.externalId);
   if(!data)return {status:'PROVIDER_READ_UNAVAILABLE',metrics:{},observedAt:null};
   pick(data,{view_count:'view_count',like_count:'like_count',comment_count:'comment_count',share_count:'share_count'},true);
  }else if(post.platform==='linkedin'){
   const data=await require('./linkedinService').getPostStats({uid,shareId:post.externalId});
   pick(data,{like_count:'likes',comment_count:'comments'});
  }else if(post.platform==='facebook'){
   const data=await require('./facebookService').getPostStats({uid,postId:post.externalId,pageId:post.rawOutcome?.pageId||post.pageId});
   // That legacy adapter sometimes labels video views as impressions. Omit
   // that ambiguous field and keep only counters whose meaning is preserved.
   pick(data,{like_count:'likes',comment_count:'comments',share_count:'shares'});
  }else return {status:'NO_ACCOUNT_SCOPED_ANALYTICS_ADAPTER',metrics:{},observedAt:null};
  return {status:'READ_COMPLETED',source:'fresh_connected_provider_service',observedAt:new Date().toISOString(),metrics,availability};
 }catch(_error){return {status:'PROVIDER_READ_UNAVAILABLE',metrics:{},observedAt:null};}
}
async function collectMarketingPostEvidence({db,uid,contentIds,refresh=false}){
 if(!uid)throw Object.assign(new Error('Authentication required'),{status:401});
 if(!Array.isArray(contentIds)||contentIds.length<1||contentIds.length>12||contentIds.some(id=>typeof id!=='string'||!/^[-A-Za-z0-9_]{1,128}$/.test(id)))throw Object.assign(new Error('Provide one to twelve content IDs'),{status:400});
 const ids=[...new Set(contentIds)];
 // Authorization precedes every post query; no guessed foreign identifier can
 // disclose media, provider IDs, account measurements or even existence.
 const contents=await Promise.all(ids.map(id=>db.collection('content').doc(id).get()));
 if(contents.some(doc=>!doc.exists||owner(doc.data())!==uid))throw Object.assign(new Error('Content unavailable'),{status:404});
 const results=await Promise.all(ids.map(async contentId=>{
  const snapshot=await db.collection('platform_posts').where('contentId','==',contentId).limit(100).get();
  const posts=snapshot.docs.map(doc=>({id:doc.id,...doc.data()})).filter(post=>owner(post)===uid&&post.simulated!==true&&post.rawOutcome?.simulated!==true);
  return {contentId,hasMore:snapshot.docs.length===100,posts:await Promise.all(posts.map(async post=>projectMarketingPost(post,refresh?await readConnectedPost(post,uid):undefined)))};
 }));
 return {capturedAt:new Date().toISOString(),source:'owned_application_post_records',freshProviderFetch:refresh,results};
}
module.exports={collectMarketingPostEvidence,projectMarketingPost,METRICS};

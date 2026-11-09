#!/usr/bin/env node
// Runtime reachability checks in the normal, genuinely signed-in Studio.
// Never calls an external generation provider or enables the private Factory.
const fs=require('fs');const path=require('path');const q=require('./run');
(async()=>{const{browser,page}=await q.connect();try{
 const tools=await page.getByRole('navigation',{name:'Creative tools'}).locator('button').allInnerTexts();
 await q.inspect(page,'generation-entry-reachability');
 const evidence={at:new Date().toISOString(),realAuth:true,noMocks:true,normalStudioTools:tools,
   generationEntryPresent:tools.some(t=>/generate (image|video)|raw content|content factory/i.test(t)),
   codeBoundaries:['frontend/src/UserDashboardTabs/IdeaVideoPanel.js: external /api/ai-video/script and /generate stock-footage path',
     'src/routes/adminContentFactoryRoutes.js: founder-only, CONTENT_FACTORY_ENABLED must be true',
     'src/services/contentFactoryProviders.js: cached NVIDIA generation is a separate private provider'],
   qaFactoryEnabled:false};
 if(evidence.generationEntryPresent)throw Error('Generation entry found: execute its real flow before classifying');
 fs.writeFileSync(path.join(q.report,'generation-reachability.json'),JSON.stringify(evidence,null,2));
 for(const id of ['generated_image','generated_video','generated_raw'])q.record(id,{testedEndToEnd:false,gpuUsed:false,status:'BLOCKED',
   failureFound:'No normal Studio entry to the cached NVIDIA generation provider',fixApplied:'None; no new feature or external provider added',
   retestResult:'Normal authenticated Studio reachability check confirms the missing path',
   remainingIssue:'Private Factory remains disabled/founder-only. Idea-to-Video is a separate external/stock pipeline, unqualified in this NVIDIA sprint.',
   userFacingSeverity:'High'}, {at:evidence.at,realAuth:true,noMocks:true,evidence:path.relative(q.root,path.join(q.report,'generation-reachability.json'))});
 console.log('Three generation capabilities blocked at actual Studio entry; no generation job started.');
}finally{await browser.close()}})().catch(e=>{console.error(e.message);process.exitCode=1});

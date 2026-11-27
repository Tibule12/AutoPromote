const {test}=require("node:test");
const assert=require("node:assert/strict");
const {calculateOperating,progressiveMauCost}=require("../../src/services/processingTokens/operatingEconomics");
const input=require("../../config/free-first-operating-economics.example.json");
test("all 30 populations/conversion scenarios reconcile the five operating cost classes",()=>{
 const result=calculateOperating(input);assert.equal(result.scenarios.length,30);assert.equal(result.financiallyValidated,false);
 for(const row of result.scenarios)for(const kind of ["average","maximum"]){const r=row[kind];
  assert.equal(Object.values(r.groupsMicros).reduce((s,c)=>s+c,0),r.totalInfrastructureMicros);
  assert.equal(r.componentLedger.reduce((s,l)=>s+l.costMicros,0),r.totalInfrastructureMicros);
  assert.equal(r.netMicros,r.revenueMicros-r.paymentFeesMicros-r.totalInfrastructureMicros);
  assert.equal(r.freeRegisteredUsers+r.payingUsers,row.users);assert.equal(r.stressIsEnforcedBound,false);
 }
});
test("inactive registrations retain metadata expense without receiving fictitious processing expense",()=>{
 const r=calculateOperating({...input,activeFreeFraction:0}).scenarios[0].average;
 assert.equal(r.activeFreeUsers,0);assert.equal(r.groupsMicros.processingOperationsTotal,0);
 assert.ok(r.groupsMicros.perRegisteredUserTotal>0);assert.ok(r.requiredSubsidyMicros>0);
});
test("Identity Platform shared MAU thresholds apply once and are not per-plan allowances",()=>{
 const tiers=input.identityPlatformTier1Sensitivity;
 assert.equal(progressiveMauCost(50000,tiers),0);assert.equal(progressiveMauCost(100000,tiers),275000000);
 assert.equal(progressiveMauCost(100001,tiers),275004600);assert.throws(()=>progressiveMauCost(-1,tiers));
});
test("job costs cannot be added again as hosting/storage/DB overhead and duplicate ownership is refused",()=>{
 const first=input.components[0];
 assert.throws(()=>calculateOperating({...input,components:[...input.components,first]}),/Duplicate/);
 assert.throws(()=>calculateOperating({...input,components:[...input.components,{...first,key:"media.egress.again",costDomain:"operation"}]}),/already belong/);
 assert.throws(()=>calculateOperating({...input,components:input.components.map(c=>c.scope==="processingFree"?{...c,includedInProcessingTokens:false}:c)}),/once/);
});
test("price, advertising, investment, invalid activity assumptions and missing input costs are rejected",()=>{
 for(const change of [{currency:"ZAR"},{priceMicros:5990000},{advertisingRevenueMicros:1},{investmentMicros:1},{activeFreeFraction:1.1}])
  assert.throws(()=>calculateOperating({...input,...change}));
 assert.throws(()=>calculateOperating({...input,components:[{...input.components[0],rateMicros:undefined}]}));
});
test("rolling limits do not hide an additional renewal liability at a 31-day boundary",()=>{
 const r=calculateOperating(input).scenarios.find(r=>r.users===1000000&&r.conversion===0);
 assert.equal(r.calendar31DayStress.extraProcessingMicros,100000000000);
 assert.equal(r.calendar31DayStress.totalInfrastructureMicros,r.maximum.totalInfrastructureMicros+100000000000);
});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {capacity,model}=require('../../scripts/free-first-workflow-economics.cjs');
test('capacity includes reservation headroom instead of overstating the number of exports',()=>{
  assert.equal(capacity(100,[{reservedTokens:30,chargedTokens:24}]),3);
  assert.equal(capacity(500,[{reservedTokens:30,chargedTokens:24}],2000),20);
  assert.equal(capacity(2000,[{reservedTokens:30,chargedTokens:24}],2000),83);
});
test('complete analysis and export both need admission capacity and rolling cost headroom',()=>{
  assert.equal(capacity(100,[{reservedTokens:70,chargedTokens:37},{reservedTokens:30,chargedTokens:8}],500),1);
  assert.equal(capacity(100,[{reservedTokens:30,chargedTokens:24}],30),1);
  assert.throws(()=>capacity(100,[{reservedTokens:10,chargedTokens:11}]));
});
test('missing or failed real outputs never become zero-cost or qualified capacity claims',()=>{
  for(const resources of [null,{status:'failed'}]) {
    const r=model({name:'unfinished',resources,outputBytes:0,profile:'cam60'});
    assert.equal(r.recommendedTokens,null);assert.equal(r.freeCapacityPerSixDays,null);
  }
});
test('an observed GPU job shape never becomes a claimed price for an unobserved GPU service',()=>{
  const result=model({name:'native',resources:{status:'completed',wallSecondsIncludingImport:190},outputBytes:26000000,profile:'nativeStudio60'});
  assert.equal(result.currentEstimatedUsd,null);
  assert.equal(result.estimatedCostReductionPercent,null);
  assert.ok(result.currentCpuServiceReferenceEstimatedUsd>0);
  assert.ok(result.gpuJobSensitivityEstimatedUsd>0);
  assert.equal(result.actualCloudExpenditureUsd,0);
});

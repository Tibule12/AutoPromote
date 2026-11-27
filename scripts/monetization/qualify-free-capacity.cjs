// Capacity uses the existing calculator and retained evidence. No API or work.
const fs=require('node:fs');
const {capacity}=require('../free-first-workflow-economics.cjs');
function build() {
 const source=JSON.parse(fs.readFileSync('reports/free-first-optimization-20261126/workflow-economics.json'));
 const rows=source.workflows.map(w=>({workflow:w.name,
  referenceRecommendedTokens:w.recommendedTokens,referenceReservationTokens:w.proposedReservationTokens,
  conditionalFreeOperationsPerSixDays:capacity(100,[{reservedTokens:w.proposedReservationTokens,chargedTokens:w.recommendedTokens}],500),
  qualifiedProductionOperationsPerSixDays:null,qualification:'Retained local output/resource evidence; all-in tariff and production adapter not qualified.',
  outputBytes:w.outputBytes,measuredLocal:w.measuredLocal,
  actualNewCloudExpenditureUsd:0,attributedInvoiceUsd:null}));
 return {priceUsd:4.99,freeWindowTokens:100,freeWindowDays:6,freeRolling30DayTokens:500,plusUsageWindowTokens:500,plusUsageWindowHours:24,plusRolling30DayTokens:2000,
  numericalLimitsFinal:false,rows,
  measuredLocalNativeAccounting:{scope:'Same retained normally signed-in 60s edit/export, local CPU-reference accounting only; excludes unqualified all-in cloud delivery.',reservedTokens:30,consumedTokens:24,completedIdenticalOperationsPerFreshSixDayWindow:capacity(100,[{reservedTokens:30,chargedTokens:24}],500),windowTokensLeftAfterThree:28},
  publisherAndScheduler:{qualifiedProductionOperationsPerSixDays:null,reason:'Six actual provider deliveries and production durable scheduler/publisher accounting are not qualified. No paid/provider publication started.'},
  backgroundAndThreeD:{qualifiedProductionOperationsPerSixDays:null,reason:'Full first-use workflows, billed resource/network envelopes and actual production adapters remain unqualified.'},
  warning:'A conditional reference count is not a production entitlement or validated maximum. Reservations, rolling ceilings, unfinished jobs, failures, source duration and workflow combination change admission. Do not launch Free with every useful workflow refused.'};
}
if(require.main===module){const result=build();fs.writeFileSync('reports/free-first-release-20261127/allowance-qualification.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({workflows:result.rows.length,measuredLocalNativeOperations:result.measuredLocalNativeAccounting.completedIdenticalOperationsPerFreshSixDayWindow,productionCapacityFinal:false}));}
module.exports={build};

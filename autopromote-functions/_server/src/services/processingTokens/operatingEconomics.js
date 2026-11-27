// Complete environment sensitivity model. This is not a production price or a
// substitute for invoices. Operation tokens already include their own compute,
// media storage/transfer, job DB activity, retries and provider expenditure.
const { USERS, CONVERSION } = require("./economics");
const SCOPES = new Set(["fixed", "registered", "activeFree", "paying", "processingFree", "processingPlus"]);
function finite(value, name) {
  if (!Number.isFinite(value) || value < 0) throw Error(`Invalid ${name}`);
  return value;
}
function progressiveMauCost(count, tiers) {
  finite(count,"MAU count");
  let prior=0, cost=0;
  for (const tier of tiers) {
    const end=tier.upTo??Infinity;
    if (end<=prior) throw Error("Invalid MAU tier order");
    cost+=Math.max(0,Math.min(count,end)-prior)*finite(tier.microsPerUser,"MAU rate");
    prior=end;
  }
  if (prior!==Infinity) throw Error("Missing final MAU tier");
  return Math.ceil(cost);
}
function calculateOperating(input) {
  if(input.currency!=="USD" || input.priceMicros!==4990000 || input.advertisingRevenueMicros!==0 || input.investmentMicros!==0)
    throw Error("USD $4.99 and zero advertising/investment baseline required");
  finite(input.activeFreeFraction,"active fraction");
  if(input.activeFreeFraction>1)throw Error("Invalid active fraction");
  const keys=new Set();
  for(const line of input.components) {
    if(!line.key || keys.has(line.key))throw Error("Duplicate cost ownership key");
    keys.add(line.key);
    if(!SCOPES.has(line.scope))throw Error("Invalid cost scope");
    if(line.includedInProcessingTokens!==["processingFree","processingPlus"].includes(line.scope))
      throw Error("Token expenses must be counted once in the processing scope");
    if((line.costDomain==="operation")!==line.includedInProcessingTokens)
      throw Error("Operation compute/media/DB/provider costs already belong to tokens");
    finite(line.rateMicros,"rate");
    for(const kind of ["average","maximum"])finite(line.quantities[kind],"quantity");
    if(line.quantities.average>line.quantities.maximum)throw Error("Average exceeds stress quantity");
  }
  const fee=Math.ceil(input.priceMicros*finite(input.feeBasisPoints,"fee")/10000)+finite(input.feeFixedMicros,"fixed fee");
  if(input.feeBasisPoints>10000)throw Error("Invalid fee");
  function scenario(registered,paid,kind) {
    const free=registered-paid,activeFree=kind==="maximum"?free:Math.round(free*input.activeFreeFraction);
    const counts={fixed:1,registered,activeFree,paying:paid,processingFree:activeFree,processingPlus:paid};
    const ledger=input.components.map(line=>({...line,quantity:counts[line.scope]*line.quantities[kind],
      costMicros:Math.ceil(counts[line.scope]*line.quantities[kind]*line.rateMicros)}));
    // Shared tier thresholds apply once across paying and Free MAUs.
    const auth=progressiveMauCost(activeFree+paid,input.identityPlatformTier1Sensitivity);
    ledger.push({key:"auth.mau",scope:"activeFreeAndPaying",costMicros:auth,
      basis:"Identity Platform sensitivity; upgrade/config and MAUs not verified",includedInProcessingTokens:false});
    const byScope=scope=>ledger.filter(l=>l.scope===scope).reduce((s,l)=>s+l.costMicros,0);
    const authFree=activeFree+paid?Math.floor(auth*activeFree/(activeFree+paid)):0;
    const groups={fixedMonthly:byScope("fixed"),perRegisteredUserTotal:byScope("registered"),
      activeFreeOverheadTotal:byScope("activeFree")+authFree,payingOverheadTotal:byScope("paying")+auth-authFree,
      processingOperationsTotal:byScope("processingFree")+byScope("processingPlus")};
    const infrastructure=Object.values(groups).reduce((s,v)=>s+v,0);
    const revenue=paid*input.priceMicros,paymentFees=paid*fee,net=revenue-paymentFees-infrastructure;
    return {kind,registeredUsers:registered,freeRegisteredUsers:free,activeFreeUsers:activeFree,payingUsers:paid,
      groupsMicros:groups,componentLedger:ledger,totalInfrastructureMicros:infrastructure,revenueMicros:revenue,
      paymentFeesMicros:paymentFees,netMicros:net,requiredSubsidyMicros:Math.max(0,-net),
      activeFreeAllInVariableMicros:activeFree?Math.ceil((groups.activeFreeOverheadTotal+byScope("processingFree"))/activeFree):0,
      plusAllInVariableMicros:paid?Math.ceil((groups.payingOverheadTotal+byScope("processingPlus"))/paid):null,
      contributionPerSubscriberMicros:paid?input.priceMicros-fee-Math.ceil((groups.payingOverheadTotal+byScope("processingPlus"))/paid)-Math.ceil(groups.perRegisteredUserTotal/registered):null,
      stressIsEnforcedBound:false};
  }
  const rows=[];
  for(const users of USERS) {
    const breakEven={};
    for(const kind of ["average","maximum"]) {
      let low=0,high=users;
      if(scenario(users,high,kind).netMicros<0)breakEven[kind]=null;
      else {while(low<high){const mid=Math.floor((low+high)/2);if(scenario(users,mid,kind).netMicros>=0)high=mid;else low=mid+1;}breakEven[kind]=low/users;}
    }
    for(const conversion of CONVERSION) {
      const paid=Math.round(users*conversion),average=scenario(users,paid,"average"),maximum=scenario(users,paid,"maximum");
      const extra=(users-paid)*100000+paid*500000;
      rows.push({users,conversion,average,maximum,breakEvenConversion:breakEven,
        calendar31DayStress:{extraProcessingMicros:extra,totalInfrastructureMicros:maximum.totalInfrastructureMicros+extra,
          requiredSubsidyMicros:Math.max(0,maximum.totalInfrastructureMicros+extra+maximum.paymentFeesMicros-maximum.revenueMicros),
          basis:"Additional Free 100/Plus 500 renewal tokens at calendar boundary; other overhead remains modeled, not bounded."}});
    }
  }
  return {currency:"USD",periodDays:30,priceMicros:input.priceMicros,perSubscriberFeeMicros:fee,financiallyValidated:false,
    operatingModelCompleteSchema:true,invoiceAttributionComplete:false,inputs:input,scenarios:rows,
    limitations:["A complete service inventory is not a complete bill. Unknown costs have explicit assumptions/contingency; no financial approval follows.",
      "Processing includes job compute/media storage/media transfer/job database/provider calls exactly once; other rows cover account/control-plane overhead only.",
      "Maximum is a stress scenario. Nonprocessing network, storage, API traffic, failed attempts and registrations have no verified finite total bound.",
      "Shared Render/GCP workloads need service/account allocation; no invoice is prorated across users or operations.",
      "No automatic hosting scale-up is modeled. Large populations require load tests and a separate capacity plan.",
      "Taxes, FX, chargebacks, refunds, legal/support/payroll and unavailable merchant contracts remain unverified; price and allowances remain provisional."]};
}
module.exports={calculateOperating,progressiveMauCost};

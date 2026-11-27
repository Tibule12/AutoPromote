// Offline payload validation only. Deliberately contains no HTTP client.
const fs=require('node:fs'),assert=require('node:assert/strict');
function validate(plan) {
 assert.equal(plan.status,'CREATED','Plan must not be activated');
 assert.equal(plan.billing_cycles.length,1);
 const cycle=plan.billing_cycles[0];
 assert.equal(cycle.tenure_type,'REGULAR');assert.equal(cycle.sequence,1);assert.equal(cycle.total_cycles,0);
 assert.deepEqual(cycle.frequency,{interval_unit:'MONTH',interval_count:1});
 assert.deepEqual(cycle.pricing_scheme.fixed_price,{value:'4.99',currency_code:'USD'});
 assert.equal(plan.payment_preferences.auto_bill_outstanding,false);
 assert.deepEqual(plan.payment_preferences.setup_fee,{value:'0.00',currency_code:'USD'});
 assert.equal(plan.payment_preferences.setup_fee_failure_action,'CANCEL');
 assert(!plan.taxes,'Merchant tax treatment needs separate confirmation before configuration');
 return {validatedOffline:true,status:'CREATED',priceUsd:4.99,billingPeriod:'MONTH',trial:false,setupFeeUsd:0,
  productIdResolved:/^PROD-[A-Z0-9]+$/.test(plan.product_id),providerPlanCreated:false,providerPlanActivated:false,
  blockers:['Approved merchant product ID and actual country/fees/tax handling','Authorized PayPal sandbox return/webhook/refund/renewal testing','Production worker and complete Free-workflow qualification before purchase enablement']};
}
if(require.main===module){const report=validate(JSON.parse(fs.readFileSync('config/free-first-release/paypal-plus-plan.draft.json')));fs.writeFileSync('reports/free-first-release-20261127/paypal-draft-validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
module.exports={validate};

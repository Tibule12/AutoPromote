const fs=require("node:fs");
const {calculateOperating}=require("../src/services/processingTokens/operatingEconomics");
const input=JSON.parse(fs.readFileSync(process.argv[2]||"config/free-first-operating-economics.example.json"));
const result=calculateOperating(input),root="reports/free-first-optimization-20261126";
fs.writeFileSync(root+"/operating-economics.json",JSON.stringify(result,null,2)+"\n");
const columns=["users","conversion","case","activeFreeUsers","fixedUsd","registeredOverheadUsd","activeFreeOverheadUsd","payingOverheadUsd","processingUsd","paymentFeesUsd","totalInfrastructureUsd","revenueUsd","netUsd","subsidyUsd","breakEvenConversion"];
const csv=[columns.join(",")];
for(const row of result.scenarios)for(const kind of ["average","maximum"]){const r=row[kind],g=r.groupsMicros;
 csv.push([row.users,row.conversion,kind,r.activeFreeUsers,g.fixedMonthly/1e6,g.perRegisteredUserTotal/1e6,g.activeFreeOverheadTotal/1e6,
  g.payingOverheadTotal/1e6,g.processingOperationsTotal/1e6,r.paymentFeesMicros/1e6,r.totalInfrastructureMicros/1e6,r.revenueMicros/1e6,r.netMicros/1e6,r.requiredSubsidyMicros/1e6,row.breakEvenConversion[kind]].join(","));}
fs.writeFileSync(root+"/operating-economics.csv",csv.join("\n")+"\n");
console.log(JSON.stringify({scenarios:result.scenarios.length,components:input.components.length,financiallyValidated:result.financiallyValidated,
 selected:result.scenarios.filter(r=>r.conversion===.05||r.conversion===0).map(r=>({users:r.users,conversion:r.conversion,averageNetUsd:r.average.netMicros/1e6,stressNetUsd:r.maximum.netMicros/1e6,breakEven:r.breakEvenConversion}))},null,2));

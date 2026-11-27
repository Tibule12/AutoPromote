const fs = require("node:fs");
const { calculate } = require("../src/services/processingTokens/economics");
const input = JSON.parse(
  fs.readFileSync(process.argv[2] || "config/free-first-economics.example.json")
);
const model = calculate(input);
fs.mkdirSync("reports/free-first-20261126", { recursive: true });
fs.writeFileSync(
  "reports/free-first-20261126/financial-scenarios.json",
  JSON.stringify(model, null, 2) + "\n"
);
const lines = [
  "users,conversion,free_users,plus_users,revenue_usd,fees_usd,average_infrastructure_usd,maximum_infrastructure_usd,average_subsidy_usd,maximum_subsidy_usd,average_break_even,maximum_break_even,calendar31_maximum_infrastructure_usd,calendar31_required_subsidy_usd",
];
for (const r of model.scenarios)
  lines.push(
    [
      r.users,
      r.conversion,
      r.freeUsers,
      r.paidUsers,
      r.revenueMicros / 1e6,
      r.paymentFeesMicros / 1e6,
      r.average.totalInfrastructureMicros / 1e6,
      r.maximum.totalInfrastructureMicros / 1e6,
      r.average.requiredSubsidyMicros / 1e6,
      r.maximum.requiredSubsidyMicros / 1e6,
      r.average.breakEvenConversion,
      r.maximum.breakEvenConversion,
    r.calendar31DayStress.totalInfrastructureMicros / 1e6,
    r.calendar31DayStress.requiredSubsidyMicros / 1e6,
    ].join(",")
  );
fs.writeFileSync("reports/free-first-20261126/financial-scenarios.csv", lines.join("\n") + "\n");
console.log(`Wrote ${model.scenarios.length} USD scenarios. Basis: ${model.basis}`);

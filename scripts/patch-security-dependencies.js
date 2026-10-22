"use strict";
// One implementation ships with Cloud Functions, whose deployed package has no
// parent repository. Monorepo installs use that same implementation here.
const {
  patchSecurityDependencies,
} = require("../autopromote-functions/security-dependency-guards");
if (require.main === module) patchSecurityDependencies();
module.exports = { patchSecurityDependencies };

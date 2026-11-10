// Static inventory only: reads source files, never initialises Firebase or a provider.
const fs = require("fs");
const { execFileSync } = require("child_process");
const { parse } = require("@babel/parser");
const discovered = execFileSync(
  "rg",
  [
    "--files",
    "src",
    "frontend/src",
    "autopromote-functions",
    "scripts",
    "-g",
    "*.{js,cjs}",
    "-g",
    "!**/__tests__/**",
    "-g",
    "!**/*.test.js",
    "-g",
    "!**/node_modules/**",
    "-g",
    "!**/_server/**",
  ],
  { encoding: "utf8" }
)
  .trim()
  .split("\n");
const files = [
  ...new Set([
    ...discovered,
    ...fs
      .readdirSync(".")
      .filter(file => /\.(js|cjs)$/.test(file) && !/^(test[-_]|.*\.test\.)/.test(file)),
  ]),
].sort();
const inventory = {
  scope:
    "Repository source; static references are not proof that every path is deployed or reachable.",
  filesScanned: files.length,
  parseErrors: [],
  collections: [],
  dynamicCollections: [],
  authorityReferences: [],
  financialWriteCandidates: [],
  identityOperations: [],
};
const financialKey =
  /credit|balance|subscription|tier|testerAccess|earnings|revenue|payout|payment|role|isAdmin|claimedBonuses|uploadBlocked/i;
const property = n =>
  n?.type === "Identifier" ? n.name : n?.type === "StringLiteral" ? n.value : null;
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  let ast;
  try {
    ast = parse(source, { sourceType: "unambiguous", plugins: ["jsx"] });
  } catch (error) {
    inventory.parseErrors.push({ file, line: error.loc?.line, reason: error.reasonCode });
    continue;
  }
  function walk(node, callback) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(n => walk(n, callback));
      return;
    }
    if (node.type) callback(node);
    for (const [key, child] of Object.entries(node)) {
      if (!["loc", "start", "end", "extra", "comments", "tokens"].includes(key))
        walk(child, callback);
    }
  }
  const seenAuthLines = new Set();
  walk(ast, node => {
    if (node.type === "CallExpression" && node.callee?.type === "MemberExpression") {
      const method = property(node.callee.property);
      const location = { file, line: node.loc.start.line };
      if (method === "collection") {
        const arg = node.arguments[0];
        if (arg?.type === "StringLiteral")
          inventory.collections.push({ ...location, collection: arg.value });
        else
          inventory.dynamicCollections.push({
            ...location,
            expression: source.slice(arg?.start, arg?.end).slice(0, 160),
          });
      }
      if (
        [
          "verifyIdToken",
          "createCustomToken",
          "setCustomUserClaims",
          "revokeRefreshTokens",
        ].includes(method)
      ) {
        inventory.identityOperations.push({ ...location, operation: method });
      }
      if (["set", "update", "create", "add"].includes(method)) {
        const keys = new Set();
        for (const arg of node.arguments)
          walk(arg, child => {
            if (child.type === "ObjectProperty" && financialKey.test(property(child.key) || ""))
              keys.add(property(child.key));
          });
        const target = source
          .slice(node.callee.object.start, node.callee.object.end)
          .replace(/\s+/g, " ")
          .slice(0, 180);
        const reference = node.arguments[0]?.type === "Identifier" ? node.arguments[0].name : null;
        if (
          keys.size ||
          /credit|balance|payment|billing|subscription|user|reward|earn|payout|transaction/i.test(
            target + (reference || "")
          )
        ) {
          inventory.financialWriteCandidates.push({
            ...location,
            method,
            target,
            reference,
            fields: [...keys].sort(),
          });
        }
      }
    }
    if (node.type === "MemberExpression" || node.type === "OptionalMemberExpression") {
      const field = property(node.property);
      const target = source.slice(node.object.start, node.object.end);
      if (
        ["role", "isAdmin", "admin", "fromCollection", "claims", "customClaims"].includes(field) &&
        /user|claim|token|auth/i.test(target) &&
        !seenAuthLines.has(node.loc.start.line)
      ) {
        seenAuthLines.add(node.loc.start.line);
        inventory.authorityReferences.push({
          file,
          line: node.loc.start.line,
          field,
          target: target.slice(0, 120),
        });
      }
    }
  });
}
process.stdout.write(JSON.stringify(inventory, null, 2) + "\n");

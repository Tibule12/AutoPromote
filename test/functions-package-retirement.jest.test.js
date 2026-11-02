const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
test("Functions packaging drops obsolete generated routes without touching canonical or user files", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "autopromote-functions-retirement-"));
  try {
    const functions = path.join(scratch, "autopromote-functions");
    fs.mkdirSync(path.join(functions, "_server/src/routes"), { recursive: true });
    fs.mkdirSync(path.join(scratch, "src/routes"), { recursive: true });
    fs.writeFileSync(
      path.join(scratch, "package.json"),
      JSON.stringify({ name: "package-test", version: "1" })
    );
    fs.copyFileSync(
      path.resolve("autopromote-functions/copy-server.js"),
      path.join(functions, "copy-server.js")
    );
    fs.writeFileSync(path.join(scratch, "src/routes/active.js"), "module.exports = 'active';");
    fs.writeFileSync(path.join(functions, "_server/src/routes/aiVideoRoutes.js"), "obsolete");
    fs.writeFileSync(path.join(functions, "user-data-preserved.txt"), "keep");
    execFileSync(process.execPath, [path.join(functions, "copy-server.js")], { stdio: "pipe" });
    expect(fs.existsSync(path.join(functions, "_server/src/routes/aiVideoRoutes.js"))).toBe(false);
    expect(fs.readFileSync(path.join(functions, "_server/src/routes/active.js"), "utf8")).toContain(
      "active"
    );
    expect(fs.readFileSync(path.join(scratch, "src/routes/active.js"), "utf8")).toContain("active");
    expect(fs.readFileSync(path.join(functions, "user-data-preserved.txt"), "utf8")).toBe("keep");
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

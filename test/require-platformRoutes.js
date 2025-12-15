process.env.FIREBASE_ADMIN_BYPASS = "1";
try {
  require("../src/routes/platformRoutes");
  console.log("ok");
} catch (e) {
  console.error("ERROR:", e && e.message ? e.message : e);
  process.exit(1);
}

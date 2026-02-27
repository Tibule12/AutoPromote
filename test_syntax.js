
try {
  console.log("Loading promotionTaskRoutes...");
  require("./src/routes/promotionTaskRoutes");
  console.log("Loading twitterAuthRoutes...");
  require("./src/routes/twitterAuthRoutes");
  console.log("Loading platformRoutes...");
  require("./src/routes/platformRoutes");
  console.log("All routes loaded successfully!");
} catch (e) {
  console.error(e);
}

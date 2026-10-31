// No database, credit or provider calls: stale clients cannot create retired work.
module.exports = function retiredFeatureResponse(_req, res) {
  return res.status(410).json({
    error: "FEATURE_RETIRED",
    message: "This standalone feature has been retired. Open Studio or Queue to continue.",
    studio: "/?tab=viral_clip_studio",
    queue: "/?tab=schedules",
  });
};

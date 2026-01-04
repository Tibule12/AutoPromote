// Cloud Function (HTTP) sample to trigger provider feed import
// Deploy with: gcloud functions deploy fetchProviderFeeds --runtime=nodejs20 --trigger-http --allow-unauthenticated=false --region=YOUR_REGION

const { run } = require('../../../src/workers/fetchProviderFeedsWorker');

exports.fetchProviderFeeds = async (req, res) => {
  try {
    const options = {}; // optionally read from req.query or env
    const result = await run({ options });
    res.status(200).json({ success: true, result });
  } catch (err) {
    console.error('fetchProviderFeeds function error', err && err.message);
    res.status(500).json({ success: false, error: err && err.message });
  }
};

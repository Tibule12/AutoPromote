// Local review of the real App/router. No production credentials or API endpoints.
process.env.BROWSER = "none";
process.env.HOST = "127.0.0.1";
process.env.PORT = process.env.LANDING_PREVIEW_PORT || "3095";
process.env.REACT_APP_API_URL = "http://127.0.0.1:8000";
process.env.REACT_APP_SITE_URL = `http://127.0.0.1:${process.env.PORT}`;
process.env.REACT_APP_E2E_AUTH_BYPASS = "false";
process.env.REACT_APP_ENABLE_SENTRY = "0";
process.env.REACT_APP_SENTRY_DSN = "";
process.env.REACT_APP_ENABLE_FRONTEND_LOGGING = "0";
Object.assign(process.env, {
  REACT_APP_FIREBASE_API_KEY: "local-preview-only",
  REACT_APP_FIREBASE_AUTH_DOMAIN: "local-preview.invalid",
  REACT_APP_FIREBASE_PROJECT_ID: "local-preview",
  REACT_APP_FIREBASE_STORAGE_BUCKET: "local-preview.invalid",
  REACT_APP_FIREBASE_MESSAGING_SENDER_ID: "000000000000",
  REACT_APP_FIREBASE_APP_ID: "1:000000000000:web:local-preview",
  REACT_APP_FIREBASE_MEASUREMENT_ID: "",
});
require("./start-react");

// Browser-only acceptance harness: mounts the production editor and auth provider.
// This entry is built by run-studio-analysis-browser-preview.js, never by CRA.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { signInWithCustomToken } from "firebase/auth";
import { auth } from "../../../frontend/src/firebaseClient";
import { AuthProvider } from "../../../frontend/src/contexts/AuthContext";
import ViralClipStudio from "../../../frontend/src/components/ViralClipStudio";
import "../../../frontend/src/App.css";

const boot = window.__STUDIO_STAGING_BOOTSTRAP;
if (
  boot?.projectId !== "autopromote-staging-2026" ||
  !["127.0.0.1", "localhost"].includes(window.location.hostname)
) {
  throw new Error("This acceptance entry only runs against isolated staging on localhost.");
}

function Preview() {
  const [signedIn, setSignedIn] = useState(false);
  const [error, setError] = useState("");
  window.__STUDIO_STAGING_SIGN_IN = async token => {
    try {
      const credential = await signInWithCustomToken(auth, token);
      if (credential.user.uid !== boot.ownerUid) throw new Error("Wrong staging source owner.");
      setSignedIn(true);
      return { uid: credential.user.uid, projectId: auth.app.options.projectId };
    } catch (failure) {
      setError(failure.code || failure.message);
      throw failure;
    }
  };
  window.__STUDIO_STAGING_ID_TOKEN = () => auth.currentUser.getIdToken();
  return (
    <>
      <header style={{ padding: "8px 20px", background: "#12131c", color: "#ddd" }}>
        Studio browser acceptance · isolated staging ·{" "}
        {signedIn ? "Firebase signed in" : "Awaiting sign-in"}
      </header>
      {error ? <p role="alert">{error}</p> : null}
      {signedIn ? (
        <AuthProvider>
          <ViralClipStudio
            videoUrl={boot.sourceUrl}
            sourceStoragePath={boot.storagePath}
            sourceName="Ten-minute podcast · staging acceptance"
            clips={[
              {
                id: "staging-range-600",
                url: boot.sourceUrl,
                name: "Ten-minute podcast",
                start: 0,
                end: 600,
                duration: 600,
                sourceDuration: 601.002086,
                sourceStoragePath: boot.storagePath,
              },
            ]}
            onSave={payload => {
              window.__STUDIO_STAGING_SAVED_PAYLOAD = payload;
            }}
            onCancel={() => {}}
          />
        </AuthProvider>
      ) : (
        <p style={{ padding: 20 }}>Sign in with the staging acceptance runner.</p>
      )}
    </>
  );
}

createRoot(document.getElementById("root")).render(<Preview />);

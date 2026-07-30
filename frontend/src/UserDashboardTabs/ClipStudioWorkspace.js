import React, { useState } from "react";
import FindViralClipsPanel from "./FindViralClipsPanel";
import ViralClipStudioPanel from "./ViralClipStudioPanel";
import "./ClipStudioWorkspace.css";

function ClipStudioWorkspace({ initialFile = null, onOpenPublisher, onUpgrade }) {
  const [editorRequest, setEditorRequest] = useState(null);

  return (
    <section className="clip-studio-workspace">
      {editorRequest ? (
        <ViralClipStudioPanel
          initialFile={editorRequest.file}
          initialClip={editorRequest.clip}
          autoOpen={Boolean(editorRequest.clip)}
          onBack={() => setEditorRequest(null)}
          onUpgrade={onUpgrade}
          onOpenPublisher={onOpenPublisher}
        />
      ) : (
        <FindViralClipsPanel
          initialFile={initialFile}
          onUpgrade={onUpgrade}
          onOpenStudio={(file, clip) => setEditorRequest({ file, clip })}
        />
      )}
    </section>
  );
}

export default ClipStudioWorkspace;

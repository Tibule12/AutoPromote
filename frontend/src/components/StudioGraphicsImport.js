import React, { useRef, useState } from 'react';

export default function StudioGraphicsImport({ onImport, locked }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const input = useRef(null);
  return <details className="advanced-tool-section kinetic-type-panel" data-testid="studio-graphics-import">
    <summary>Import animated graphics</summary>
    <p>Add a graphics composition as editable titles, artwork, groups and motion keys. It keeps the current footage and sound.</p>
    <button type="button" disabled={busy || locked} onClick={() => input.current?.click()}>
      {busy ? 'Importing graphics…' : 'Import graphics composition…'}
    </button>
    <input ref={input} aria-label="Graphics composition file" type="file" accept=".json,application/json" hidden disabled={busy || locked}
      onChange={async event => {
        const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
        setBusy(true); setMessage('');
        try {
          if (file.size > 4 * 1024 * 1024) throw Error('Choose a graphics file smaller than 4MiB.');
          const result = await onImport(JSON.parse(await file.text())); setMessage(`${result} imported. Undo removes the imported composition.`);
        } catch (error) { setMessage(error.message); }
        finally { setBusy(false); }
      }} />
    {message ? <p role="status">{message}</p> : null}
    {locked ? <p>Unlock the Graphics track before importing.</p> : null}
  </details>;
}

import React, { useState } from 'react';
import { API_BASE_URL } from './config';
import { auth } from './firebaseClient';

export default function AfterDarkCreate({ onCreated }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const cur = auth.currentUser;
      if (!cur) throw new Error('Not signed in');
      const token = await cur.getIdToken(true);
      const res = await fetch(`${API_BASE_URL}/afterdark/show`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, isAdult: true }),
      });
      if (!res.ok) throw new Error('Failed to create');
      const j = await res.json();
      onCreated && onCreated(j.show);
      setTitle('');
      setDescription('');
    } catch (e) {
      console.warn('Create AfterDark failed', e && e.message);
      alert('Failed to create show: ' + (e && e.message));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="afterdark-create">
      <h3>Create AfterDark Show</h3>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" />
      <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Description" />
      <button onClick={submit} disabled={saving || !title}>Create</button>
    </div>
  );
}

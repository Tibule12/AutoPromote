import React from 'react';

function ContentList({ content }) {
  if (!content || content.length === 0) {
    return <div>No content uploaded yet.</div>;
  }
  return (
    <div style={{ marginTop: 24 }}>
      <h3>Your Content</h3>
      <ul>
        {content.map(item => (
          <li key={item.id || item.title} style={{ marginBottom: 12 }}>
            <strong>{item.title}</strong> ({item.type})<br />
            {item.description && <span>{item.description}<br /></span>}
            {item.url && (
              <a href={item.url} target="_blank" rel="noopener noreferrer">
                View {item.type}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default ContentList;
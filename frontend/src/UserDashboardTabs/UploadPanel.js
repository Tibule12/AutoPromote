import React from 'react';
import ContentUploadForm from '../ContentUploadForm';

const UploadPanel = ({ onUpload, contentList, platformMetadata, platformOptions, setPlatformOption, selectedPlatforms, setSelectedPlatforms, spotifySelectedTracks, setSpotifySelectedTracks }) => {
  return (
    <section className="upload-panel">
      <h3>Upload Content</h3>
      <ContentUploadForm
        onUpload={onUpload}
        platformMetadata={platformMetadata}
        platformOptions={platformOptions}
        setPlatformOption={setPlatformOption}
        selectedPlatforms={selectedPlatforms}
        setSelectedPlatforms={setSelectedPlatforms}
        spotifySelectedTracks={spotifySelectedTracks}
        setSpotifySelectedTracks={setSpotifySelectedTracks}
      />
      <div className="upload-history" style={{marginTop:'.75rem'}}>
        <h4>Upload History</h4>
        <ul>
          {(contentList || []).map((item, idx) => {
            const titleText = typeof item?.title === 'string' ? item.title : (item?.title ? JSON.stringify(item.title) : 'Untitled');
            const statusText = typeof item?.status === 'string' ? item.status : (item?.status ? JSON.stringify(item.status) : 'unknown');
            const statusClass = typeof item?.status === 'string' ? item.status.toLowerCase().replace(/[^a-z0-9-]/g, '') : 'unknown';
            return (
              <li key={idx} style={{marginBottom:'.25rem'}}>
                {titleText} - <span className={`status status-${statusClass}`}>{statusText}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
};

export default UploadPanel;

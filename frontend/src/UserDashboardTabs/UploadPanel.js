import React, { useState } from 'react';
import ContentUploadForm from '../ContentUploadForm';

function UploadPanel({ onUpload, contentList, platformMetadata, platformOptions, setPlatformOption, selectedPlatforms, setSelectedPlatforms, spotifySelectedTracks, setSpotifySelectedTracks }) {
  const [selectedMedia, setSelectedMedia] = useState(null);

  const handleMediaClick = (item) => {
    if (item.type === 'video' || item.type === 'audio') {
      setSelectedMedia(item);
    }
  };

  const closeModal = () => {
    setSelectedMedia(null);
  };

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
      <div className="upload-history" style={{marginTop:'1.5rem'}}>
        <h4>Upload History</h4>
        {(!contentList || contentList.length === 0) ? (
          <div style={{padding:'2rem', textAlign:'center', color:'#9aa4b2', background:'rgba(255,255,255,0.02)', borderRadius:8}}>
            <p>📤 No uploads yet</p>
            <p style={{fontSize:'.875rem'}}>Upload your first content to get started!</p>
          </div>
        ) : (
          <div className="content-grid" style={{display:'grid', gap:'.75rem', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))'}}>
            {contentList.map((item, idx) => {
              const titleText = typeof item?.title === 'string' ? item.title : (item?.title ? JSON.stringify(item.title) : 'Untitled');
              const statusText = typeof item?.status === 'string' ? item.status : (item?.status ? JSON.stringify(item.status) : 'unknown');
              const statusClass = typeof item?.status === 'string' ? item.status.toLowerCase().replace(/[^a-z0-9-]/g, '') : 'unknown';
              const statusColors = {
                published: '#10b981',
                scheduled: '#f59e0b',
                pending: '#6366f1',
                failed: '#ef4444',
                draft: '#6b7280'
              };
              const statusColor = statusColors[statusClass] || '#6b7280';
              
              return (
                <div key={idx} className="content-card" style={{
                  background:'rgba(255,255,255,0.03)',
                  border:'1px solid rgba(255,255,255,0.1)',
                  borderRadius:8,
                  padding:'1rem',
                  transition:'all 0.2s',
                  cursor:'pointer'
                }}
                onClick={() => handleMediaClick(item)}
                >
                  {item.url && item.type === 'image' && (
                    <img 
                      src={item.url} 
                      alt={titleText}
                      style={{
                        width:'100%',
                        height:150,
                        objectFit:'cover',
                        borderRadius:6,
                        marginBottom:'.75rem'
                      }}
                    />
                  )}
                  {item.url && item.type === 'video' && (
                    <div style={{position:'relative'}}>
                      <video 
                        src={item.url}
                        style={{
                          width:'100%',
                          height:150,
                          objectFit:'cover',
                          borderRadius:6,
                          marginBottom:'.75rem',
                          background:'#000'
                        }}
                      />
                      <div style={{
                        position:'absolute',
                        top:'50%',
                        left:'50%',
                        transform:'translate(-50%, -50%)',
                        background:'rgba(0,0,0,0.7)',
                        borderRadius:'50%',
                        width:50,
                        height:50,
                        display:'flex',
                        alignItems:'center',
                        justifyContent:'center',
                        fontSize:'1.5rem',
                        color:'white'
                      }}>
                        ▶
                      </div>
                    </div>
                  )}
                  {item.url && item.type === 'audio' && (
                    <div style={{
                      width:'100%',
                      height:150,
                      background:'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      borderRadius:6,
                      marginBottom:'.75rem',
                      display:'flex',
                      alignItems:'center',
                      justifyContent:'center',
                      position:'relative'
                    }}>
                      <div style={{fontSize:'3rem'}}>🎵</div>
                      <div style={{
                        position:'absolute',
                        top:'50%',
                        left:'50%',
                        transform:'translate(-50%, -50%)',
                        background:'rgba(0,0,0,0.7)',
                        borderRadius:'50%',
                        width:50,
                        height:50,
                        display:'flex',
                        alignItems:'center',
                        justifyContent:'center',
                        fontSize:'1.5rem',
                        color:'white'
                      }}>
                        ▶
                      </div>
                    </div>
                  )}
                  <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'.5rem'}}>
                    <h5 style={{margin:0, fontSize:'.95rem', fontWeight:600, color:'#eef2ff'}}>{titleText}</h5>
                    <span style={{
                      padding:'.25rem .5rem',
                      borderRadius:4,
                      fontSize:'.75rem',
                      fontWeight:600,
                      background:`${statusColor}22`,
                      color:statusColor,
                      border:`1px solid ${statusColor}44`
                    }}>
                      {statusText}
                    </span>
                  </div>
                  {item.description && (
                    <p style={{fontSize:'.875rem', color:'#9aa4b2', margin:'.25rem 0'}}>{item.description}</p>
                  )}
                  <div style={{display:'flex', gap:'.5rem', marginTop:'.75rem', fontSize:'.75rem', color:'#6b7280'}}>
                    <span>📊 {item.views || 0} views</span>
                    <span>👆 {item.clicks || 0} clicks</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Media Player Modal */}
      {selectedMedia && (
        <div 
          style={{
            position:'fixed',
            top:0,
            left:0,
            right:0,
            bottom:0,
            background:'rgba(0,0,0,0.9)',
            zIndex:9999,
            display:'flex',
            alignItems:'center',
            justifyContent:'center',
            padding:'2rem'
          }}
          onClick={closeModal}
        >
          <div 
            style={{
              maxWidth:'90vw',
              maxHeight:'90vh',
              background:'#1a1a2e',
              borderRadius:12,
              padding:'1.5rem',
              position:'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={closeModal}
              style={{
                position:'absolute',
                top:10,
                right:10,
                background:'rgba(255,255,255,0.1)',
                border:'none',
                borderRadius:'50%',
                width:36,
                height:36,
                fontSize:'1.25rem',
                cursor:'pointer',
                color:'white',
                display:'flex',
                alignItems:'center',
                justifyContent:'center'
              }}
            >
              ×
            </button>

            <h3 style={{marginTop:0, marginBottom:'1rem', color:'#eef2ff'}}>
              {selectedMedia.title || 'Untitled'}
            </h3>

            {selectedMedia.type === 'video' && (
              <video 
                src={selectedMedia.url}
                controls
                autoPlay
                style={{
                  width:'100%',
                  maxHeight:'70vh',
                  borderRadius:8
                }}
              />
            )}

            {selectedMedia.type === 'audio' && (
              <div style={{padding:'2rem', textAlign:'center'}}>
                <div style={{fontSize:'3rem', marginBottom:'1rem'}}>🎵</div>
                <audio 
                  src={selectedMedia.url}
                  controls
                  autoPlay
                  style={{
                    width:'100%',
                    marginTop:'1rem'
                  }}
                />
              </div>
            )}

            {selectedMedia.description && (
              <p style={{marginTop:'1rem', color:'#9aa4b2', fontSize:'.875rem'}}>
                {selectedMedia.description}
              </p>
            )}

            <div style={{
              display:'flex',
              gap:'1rem',
              marginTop:'1rem',
              fontSize:'.875rem',
              color:'#6b7280'
            }}>
              <span>📊 {selectedMedia.views || 0} views</span>
              <span>👆 {selectedMedia.clicks || 0} clicks</span>
              {selectedMedia.platforms && (
                <span>📱 {Array.isArray(selectedMedia.platforms) ? selectedMedia.platforms.join(', ') : selectedMedia.platforms}</span>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default UploadPanel;

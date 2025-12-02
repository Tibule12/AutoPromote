import React, { useState } from 'react';
import './EmojiPicker.css';

const EMOJI_CATEGORIES = {
  'Smileys': ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','☺️','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐'],
  'Gestures': ['👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦿','🦵','🦶'],
  'Hearts': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','♥️','💌','💋','💏','💑'],
  'Symbols': ['✨','⭐','🌟','💫','✅','❌','⚠️','🔥','💯','💢','💥','💦','💨','🕳️','💬','👁️‍🗨️','🗨️','🗯️','💭','🚀','🎉','🎊','🎈','🎁','🏆','🥇','🥈','🥉','⚡','🌈','☀️','🌙','⭐','💎','👑','🔱'],
  'Objects': ['📱','💻','⌨️','🖥️','🖨️','🖱️','🎮','🕹️','🎧','🎙️','🎚️','🎛️','📷','📸','📹','🎥','📽️','🎬','📺','📻','🎵','🎶','🎼','🎹','🎤','🎪','🎨','🖼️','📢','📣','📯','🔔','🔕','🎺','📯']
};

function EmojiPicker({ onSelect, onClose }) {
  const [activeCategory, setActiveCategory] = useState('Smileys');
  const [searchQuery, setSearchQuery] = useState('');

  const handleEmojiClick = (emoji) => {
    onSelect(emoji);
  };

  const filteredEmojis = searchQuery 
    ? Object.values(EMOJI_CATEGORIES).flat().filter(e => e.includes(searchQuery))
    : EMOJI_CATEGORIES[activeCategory];

  return (
    <div className="emoji-picker-overlay" onClick={onClose}>
      <div className="emoji-picker" onClick={(e) => e.stopPropagation()}>
        <div className="emoji-picker-header">
          <input 
            type="text" 
            placeholder="Search emojis..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="emoji-search"
          />
          <button onClick={onClose} className="emoji-close">✕</button>
        </div>
        
        {!searchQuery && (
          <div className="emoji-categories">
            {Object.keys(EMOJI_CATEGORIES).map(cat => (
              <button
                key={cat}
                className={`emoji-category ${activeCategory === cat ? 'active' : ''}`}
                onClick={() => setActiveCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
        
        <div className="emoji-grid">
          {filteredEmojis.map((emoji, idx) => (
            <button
              key={idx}
              className="emoji-item"
              onClick={() => handleEmojiClick(emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default EmojiPicker;

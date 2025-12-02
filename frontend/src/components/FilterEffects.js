import React, { useState, useEffect, useRef } from 'react';
import './FilterEffects.css';

const FILTERS = [
  { name: 'None', class: 'filter-none', css: '' },
  { name: 'Vintage', class: 'filter-vintage', css: 'sepia(0.5) contrast(1.2) brightness(0.9)' },
  { name: 'B&W', class: 'filter-bw', css: 'grayscale(1) contrast(1.1)' },
  { name: 'Vibrant', class: 'filter-vibrant', css: 'saturate(1.8) contrast(1.1)' },
  { name: 'Neon', class: 'filter-neon', css: 'saturate(2) contrast(1.3) hue-rotate(15deg)' },
  { name: 'Cool', class: 'filter-cool', css: 'saturate(0.8) hue-rotate(180deg) brightness(1.1)' },
  { name: 'Warm', class: 'filter-warm', css: 'saturate(1.3) sepia(0.3) brightness(1.05)' },
  { name: 'Fade', class: 'filter-fade', css: 'contrast(0.85) brightness(1.2) saturate(0.8)' },
  { name: 'Sharp', class: 'filter-sharp', css: 'contrast(1.4) saturate(1.2)' },
  { name: 'Dream', class: 'filter-dream', css: 'blur(0.5px) brightness(1.15) saturate(1.3)' },
];

function FilterEffects({ imageUrl, onApplyFilter }) {
  const [selectedFilter, setSelectedFilter] = useState('None');
  const canvasRef = useRef(null);

  const handleFilterSelect = (filter) => {
    setSelectedFilter(filter.name);
    onApplyFilter(filter);
  };

  return (
    <div className="filter-effects">
      <div className="filter-header">
        <h4>Filters & Effects</h4>
      </div>
      <div className="filter-grid">
        {FILTERS.map((filter) => (
          <button
            key={filter.name}
            className={`filter-option ${selectedFilter === filter.name ? 'active' : ''}`}
            onClick={() => handleFilterSelect(filter)}
          >
            <div 
              className="filter-preview"
              style={{
                backgroundImage: `url(${imageUrl})`,
                filter: filter.css
              }}
            />
            <span className="filter-name">{filter.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default FilterEffects;

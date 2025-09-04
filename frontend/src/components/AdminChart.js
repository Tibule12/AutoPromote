import React from 'react';
import '../AdminDashboard.css';

const AdminChart = ({ type, data, title, colors }) => {
  const renderBarChart = () => (
    <div className="bar-chart">
      {data.map((item, index) => (
        <div key={index} className="bar-item">
          <div 
            className="bar" 
            style={{ 
              height: `${(item.value / Math.max(...data.map(d => d.value))) * 180}px`,
              backgroundColor: colors?.[index % (colors?.length || 1)] || '#1976d2'
            }} 
          />
          <div className="bar-label">{item.label}</div>
        </div>
      ))}
    </div>
  );

  const renderPieChart = () => (
    <div>
      {Object.entries(data).map(([key, value], index) => (
        <div key={index} className="progress-container">
          <div className="progress-header">
            <span className="progress-label">
              <span style={{ 
                display: 'inline-block', 
                width: '12px', 
                height: '12px', 
                backgroundColor: colors[index % colors.length],
                borderRadius: '2px',
                marginRight: '8px'
              }}></span>
              {key}
            </span>
            <span className="progress-value">{value}%</span>
          </div>
          <div className="progress-bar-bg">
            <div 
              className="progress-bar"
              style={{ 
                width: `${value}%`, 
                backgroundColor: colors[index % colors.length]
              }} 
            />
          </div>
        </div>
      ))}
    </div>
  );

  const renderLineChart = () => (
    <div className="bar-chart">
      {data.map((item, index) => (
        <div key={index} className="bar-item">
          <div 
            className="bar" 
            style={{ 
              height: `${(item.value / Math.max(...data.map(d => d.value))) * 180}px`,
              backgroundColor: colors?.[0] || '#1976d2',
              width: '6px'
            }} 
          />
          <div className="bar-label">{item.label}</div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="dashboard-panel">
      <h3 className="panel-title">{title}</h3>
      {type === 'bar' && renderBarChart()}
      {type === 'pie' && renderPieChart()}
      {type === 'line' && renderLineChart()}
    </div>
  );
};

export default AdminChart;

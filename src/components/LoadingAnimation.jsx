import React from 'react';
import './LoadingAnimation.css';

const LoadingAnimation = ({ message = 'Loading DayClap...' }) => {
  return (
    <div className="loading-animation-container">
      <div className="loading-calendar">
        <div className="loading-calendar-header">Loading Calendar...</div>
        <div className="loading-calendar-grid">
          {Array.from({ length: 25 }, (_, i) => (
            <div key={i} className="loading-date">
              {i + 1}
            </div>
          ))}
        </div>
      </div>
      <p>{message}</p>
    </div>
  );
};

export default LoadingAnimation;

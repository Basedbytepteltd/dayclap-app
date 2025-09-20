import React from 'react';
import { BellRing, X } from 'lucide-react';
import './PushNotificationPrompt.css';

const PushNotificationPrompt = ({ onEnable, onSkip, onClose }) => {
  return (
    <div className="push-prompt-backdrop" onClick={onClose}>
      <div className="push-prompt-content" onClick={e => e.stopPropagation()}>
        <div className="push-prompt-header">
          <BellRing size={24} className="prompt-icon" />
          <h3>Stay Updated with DayClap!</h3>
          <button className="prompt-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="push-prompt-body">
          <p>
            Enable push notifications to receive real-time alerts for your upcoming events, tasks, and team invitations.
            Never miss an important update!
          </p>
          <div className="push-prompt-actions">
            <button className="btn btn-primary" onClick={onEnable}>
              <BellRing size={16} /> Enable Notifications
            </button>
            <button className="btn btn-outline" onClick={onSkip}>
              No Thanks
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PushNotificationPrompt;

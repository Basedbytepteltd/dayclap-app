import React from 'react';
import { CalendarDays, Plus, X } from 'lucide-react';
import './DateActionsModal.css';

const DateActionsModal = ({ showModal, onClose, selectedDate, onViewEvents, onAddEvent }) => {
  if (!showModal) return null;

  const pretty =
    selectedDate instanceof Date && !isNaN(selectedDate.getTime())
      ? selectedDate.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric'
        })
      : '';

  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget) onClose?.();
  };

  return (
    <div className="modal-backdrop" onClick={handleBackdrop}>
      <div className="modal-content date-actions-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Select an action</h3>
          <button className="modal-close" onClick={onClose}><X /></button>
        </div>
        <div className="modal-body">
          <p className="modal-description">
            {pretty ? `For ${pretty}` : 'Choose what you want to do'}
          </p>
          <div className="action-buttons">
            <button className="btn btn-outline btn-full" onClick={onViewEvents}>
              <CalendarDays size={16} /> View events & tasks
            </button>
            <button className="btn btn-primary btn-full" onClick={onAddEvent}>
              <Plus size={16} /> Add new event
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DateActionsModal;

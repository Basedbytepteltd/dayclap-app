import React from 'react';
import { CalendarDays, Clock, MapPin, CheckSquare, Square, X } from 'lucide-react';
import './DayItemsModal.css';

const DayItemsModal = ({
  showModal,
  onClose,
  selectedDate,
  items = [],
  onOpenEvent,
  onToggleTask,
  onOpenInCalendar,
}) => {
  if (!showModal) return null;

  const pretty =
    selectedDate instanceof Date && !isNaN(selectedDate.getTime())
      ? selectedDate.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })
      : '';

  const events = (items || []).filter((i) => i && i.type === 'event');
  const tasks = (items || []).filter((i) => i && i.type === 'task');

  const getDateParts = (ev) => {
    const d =
      ev?.dateObj instanceof Date
        ? ev.dateObj
        : ev?.date
        ? new Date(ev.date)
        : null;
    if (!d || isNaN(d.getTime())) return { day: '-', month: '' };
    return {
      day: d.getDate(),
      month: d.toLocaleString('en-US', { month: 'short' }),
    };
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content day-items-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Items for {pretty || 'selected date'}</h3>
          <div className="header-actions">
            <button className="btn btn-outline btn-small" onClick={onOpenInCalendar} title="Open this day in Calendar">
              <CalendarDays size={16} /> Open in Calendar
            </button>
            <button className="modal-close" onClick={onClose} title="Close">
              <X />
            </button>
          </div>
        </div>

        <div className="modal-body">
          {events.length === 0 && tasks.length === 0 ? (
            <div className="no-items">
              <CalendarDays className="no-items-icon" />
              <p>No events or tasks for this date.</p>
            </div>
          ) : (
            <>
              {events.length > 0 && (
                <div className="items-section">
                  <h4 className="section-title">Events ({events.length})</h4>
                  <div className="events-list">
                    {events.map((ev) => {
                      const { day, month } = getDateParts(ev);
                      return (
                        <div key={ev.id} className="event-card">
                          <div className="event-date">
                            <span className="event-day">{day}</span>
                            <span className="event-month">{month}</span>
                          </div>
                          <div className="event-details">
                            <h4
                              className="event-title"
                              onClick={() => onOpenEvent?.(ev)}
                              style={{ cursor: 'pointer' }}
                              title="Open details"
                            >
                              {ev.title}
                            </h4>
                            <p className="event-time-desc">
                              {ev.time ? (<><Clock size={14} /> {ev.time}</>) : 'All Day'}
                            </p>
                            {ev.location && (
                              <p className="event-location">
                                <MapPin size={14} /> {ev.location}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {tasks.length > 0 && (
                <div className="items-section">
                  <h4 className="section-title">Tasks ({tasks.length})</h4>
                  <div className="tasks-list">
                    {tasks.map((task) => (
                      <div key={task.id} className={`task-card ${task.completed ? 'completed' : ''}`}>
                        <div className="task-checkbox">
                          <button
                            className="checkbox-btn"
                            onClick={() => onToggleTask?.(task.id)}
                            title={task.completed ? 'Mark as incomplete' : 'Mark as complete'}
                          >
                            {task.completed ? <CheckSquare size={20} /> : <Square size={20} />}
                          </button>
                        </div>
                        <div className="task-content">
                          <div className="task-header">
                            <h4 className="task-title">{task.title}</h4>
                          </div>
                          {task.description && <p className="task-description">{task.description}</p>}
                          <div className="task-footer">
                            {task.dueDateObj && (
                              <span className={`due-date`}>
                                Due: {task.dueDateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={onOpenInCalendar}>
            <CalendarDays size={16} /> Open in Calendar
          </button>
        </div>
      </div>
    </div>
  );
};

export default DayItemsModal;

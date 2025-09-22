import React from 'react';
import {
  X,
  CalendarDays,
  Clock,
  MapPin,
  AlignLeft,
  CheckSquare,
  Square,
  DollarSign,
  User,
  Flag
} from 'lucide-react';

const EventDetailsModal = ({ event, user, onClose, onGoToDate, onToggleTask }) => {
  if (!event) return null;

  const dateObj =
    event.dateObj instanceof Date
      ? event.dateObj
      : event.date
      ? new Date(event.date)
      : null;

  const prettyDate =
    dateObj && !isNaN(dateObj.getTime())
      ? dateObj.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        })
      : '';

  const tasks = Array.isArray(event.event_tasks)
    ? event.event_tasks
    : Array.isArray(event.eventTasks)
    ? event.eventTasks
    : [];

  const isTaskOverdue = (task) => {
    if (!task || task.completed || !task.dueDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const td = new Date(task.dueDate);
    td.setHours(0, 0, 0, 0);
    return td < today;
  };

  const formatCurrency = (amount, currencyCode = 'USD') => {
    const n = Number(amount);
    if (isNaN(n)) return '';
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currencyCode,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(n);
    } catch {
      return `${n.toFixed(2)} ${currencyCode}`;
    }
  };

  const canToggleFor = (t) => {
    if (!user) return false;
    if (event?.user_id && user?.id && event.user_id === user.id) return true;
    const assigned = (t?.assignedTo || '').toLowerCase();
    const email = (user?.email || '').toLowerCase();
    return assigned && email && assigned === email;
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{event.title || 'Event Details'}</h3>
          <button className="modal-close" onClick={onClose}><X /></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">When</label>
            <div className="input-wrapper">
              <CalendarDays className="input-icon" />
              <input
                type="text"
                className="form-input"
                value={`${prettyDate}${event.time ? ` \u2022 ${event.time}` : ''}`}
                disabled
              />
            </div>
          </div>

          {event.location && (
            <div className="form-group">
              <label className="form-label">Location</label>
              <div className="input-wrapper">
                <MapPin className="input-icon" />
                <input type="text" className="form-input" value={event.location} disabled />
              </div>
            </div>
          )}

          {event.description && (
            <div className="form-group">
              <label className="form-label">Description</label>
              <div className="input-wrapper">
                <AlignLeft className="input-icon" />
                <textarea className="form-textarea" value={event.description} disabled />
              </div>
            </div>
          )}

          {tasks.length > 0 && (
            <div className="form-group">
              <label className="form-label">Tasks ({tasks.length})</label>
              <div className="tasks-list">
                {tasks.map((t, idx) => {
                  const overdue = isTaskOverdue(t);
                  const canToggle = canToggleFor(t);
                  return (
                    <div
                      key={t.id || idx}
                      className={`task-card ${t.completed ? 'completed' : ''} ${overdue ? 'overdue' : ''}`}
                    >
                      <div className="task-checkbox">
                        <button
                          className="checkbox-btn"
                          type="button"
                          onClick={() => {
                            if (canToggle && onToggleTask) {
                              onToggleTask({ id: t.id, index: idx });
                            }
                          }}
                          disabled={!canToggle}
                          title={canToggle ? 'Mark done/undone' : 'Only the assignee or event owner can update'}
                        >
                          {t.completed ? <CheckSquare size={20} /> : <Square size={20} />}
                        </button>
                      </div>
                      <div className="task-content">
                        <div className="task-header">
                          <h4 className="task-title">{t.title || 'Untitled task'}</h4>
                          <div className="task-meta">
                            {t.priority && (
                              <span className={`priority-badge ${t.priority}`}>
                                {t.priority}
                              </span>
                            )}
                          </div>
                        </div>
                        {t.description && <p className="task-description">{t.description}</p>}
                        <div className="task-footer">
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            {t.assignedTo && (
                              <span className="task-expenses" title="Assigned To">
                                <User size={14} /> {t.assignedTo}
                              </span>
                            )}
                            {t.dueDate && (
                              <span className={`due-date ${overdue ? 'overdue' : ''}`}>
                                Due: {new Date(t.dueDate).toLocaleDateString()}
                              </span>
                            )}
                            {typeof t.expenses === 'number' && t.expenses > 0 && (
                              <span className="task-expenses" title="Expenses">
                                <DollarSign size={14} /> {formatCurrency(t.expenses)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          {onGoToDate && (
            <button type="button" className="btn btn-outline" onClick={onGoToDate}>
              <Clock size={16} /> Open in Calendar
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

export default EventDetailsModal;

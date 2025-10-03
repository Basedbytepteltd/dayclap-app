import React, { useState, memo } from 'react';
import {
  X,
  CalendarDays,
  Clock,
  MapPin,
  AlignLeft,
  CheckSquare,
  Square,
  User,
  Flag,
  Edit,
  Trash2
} from 'lucide-react';
import { getCurrencySymbol, formatCurrency } from '../utils/currencyHelpers';
import {
  toUserTimezone,
  formatPrettyDateInUserTimezone,
  formatTimeInUserTimezone,
  formatToYYYYMMDDInUserTimezone,
} from '../utils/datetimeHelpers';

// Helper: parse 'YYYY-MM-DD' as a local date (avoid UTC shift) - ONLY FOR TASK DUE DATES
function parseLocalDateFromYYYYMMDD(yyyy_mm_dd) {
  if (!yyyy_mm_dd || typeof yyyy_mm_dd !== 'string') return null;
  const parts = yyyy_mm_dd.split('-').map(Number);
  const [y, m, d] = parts;
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

const EventDetailsModal = ({ event, user, teamMembers = [], onClose, onGoToDate, onToggleTask, onEdit, onDeleteEvent, onQuickAddTask }) => {
  if (!event) return null;

  const userTimezone = user?.timezone || 'UTC';

  const dateObj = event.event_datetime ? toUserTimezone(event.event_datetime, userTimezone) : null;

  const prettyDate = formatPrettyDateInUserTimezone(dateObj, userTimezone);
  const eventTime = formatTimeInUserTimezone(dateObj, userTimezone);

  const tasks = Array.isArray(event.event_tasks)
    ? event.event_tasks
    : Array.isArray(event.eventTasks)
    ? event.eventTasks
    : [];

  const isTaskOverdue = (task) => {
    if (!task || task.completed || !task.dueDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const td = parseLocalDateFromYYYYMMDD(task.dueDate);
    if (!td) return false;
    td.setHours(0, 0, 0, 0);
    return td < today;
  };

  const canToggleFor = (t) => {
    if (!user) return false;
    if (event?.user_id && user?.id && event.user_id === user.id) return true;
    const assigned = (t?.assignedTo || '').toLowerCase();
    const email = (user?.email || '').toLowerCase();
    return assigned && email && assigned === email;
  };

  // Quick Add Task local form state
  const [qTask, setQTask] = useState({
    title: '',
    description: '',
    dueDate: dateObj ? formatToYYYYMMDDInUserTimezone(dateObj, userTimezone) : '',
    assignedTo: user?.email || '',
    priority: 'medium',
    expenses: 0,
    completed: false,
  });
  const [qLoading, setQLoading] = useState(false);
  const [qMessage, setQMessage] = useState('');
  const [qType, setQType] = useState(''); // success | error

  const canQuickAdd = (() => {
    try {
      if (!user) return false;
      if (event?.user_id && user?.id && event.user_id === user.id) return true;
      const companies = Array.isArray(user?.companies) ? user.companies : [];
      const entry = companies.find(c => String(c.id) === String(event.company_id));
      const role = (entry?.role || '').toLowerCase();
      return role === 'owner' || role === 'admin';
    } catch {
      return false;
    }
  })();

  const onChangeQuick = (e) => {
    const { name, value, type, checked } = e.target;
    setQTask(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    if (qMessage) {
      setQMessage('');
      setQType('');
    }
  };

  const handleQuickAdd = async () => {
    if (!qTask.title.trim()) {
      setQMessage('Task title is required.');
      setQType('error');
      return;
    }
    setQLoading(true);
    setQMessage('');
    setQType('');
    try {
      const res = await onQuickAddTask?.({
        title: qTask.title.trim(),
        description: qTask.description || '',
        dueDate: qTask.dueDate || '',
        assignedTo: qTask.assignedTo || user?.email || '',
        priority: qTask.priority || 'medium',
        expenses: Number(qTask.expenses) || 0,
        completed: !!qTask.completed,
      });
      if (res && res.ok) {
        setQMessage('Task added.');
        setQType('success');
        setQTask({
          title: '',
          description: '',
          dueDate: dateObj ? formatToYYYYMMDDInUserTimezone(dateObj, userTimezone) : '',
          assignedTo: user?.email || '',
          priority: 'medium',
          expenses: 0,
          completed: false,
        });
      } else {
        setQMessage(res?.message || 'Failed to add task.');
        setQType('error');
      }
    } catch (err) {
      setQMessage(err?.message || 'Unexpected error.');
      setQType('error');
    } finally {
      setQLoading(false);
    }
  };

  const handleDeleteClick = () => {
    if (window.confirm(`Are you sure you want to delete the event \"${event.title}\"? This action cannot be undone.`)) {
      onDeleteEvent?.(event.id);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{event.title || 'Event Details'}</h3>
          <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
            {onEdit && (
              <button className="btn btn-outline btn-small" onClick={onEdit} title="Edit Event">
                <Edit size={16} /> Edit
              </button>
            )}
            {onDeleteEvent && (
              <button className="btn btn-danger btn-small" onClick={handleDeleteClick} title="Delete Event">
                <Trash2 size={16} /> Delete
              </button>
            )}
            <button className="modal-close" onClick={onClose} title="Close">
              <X />
            </button>
          </div>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">When</label>
            <div className="input-wrapper">
              <CalendarDays className="input-icon" />
              <input
                type="text"
                className="form-input"
                value={`${prettyDate}${eventTime ? ` \u2022 ${eventTime}` : ''}`}
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

          {/* Quick Add Task */}\
          {canQuickAdd && (
            <div className="form-group" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '1rem' }}>
              <label className="form-label">Quick Add Task</label>

              {qMessage && (
                <div className={`info-message ${qType}`} style={{ marginBottom: '0.75rem' }}>
                  {qMessage}
                </div>
              )}

              <div className="form-group">
                <div className="input-wrapper">
                  <AlignLeft className="input-icon" />
                  <input
                    type="text"
                    name="title"
                    value={qTask.title}
                    onChange={onChangeQuick}
                    className="form-input"
                    placeholder="Task title (required)"
                  />
                </div>
              </div>

              <div className="form-group">
                <div className="input-wrapper">
                  <AlignLeft className="input-icon" />
                  <textarea
                    name="description"
                    value={qTask.description}
                    onChange={onChangeQuick}
                    className="form-textarea"
                    rows="3"
                    placeholder="Description (optional)"
                  />
                </div>
              </div>

              <div className="form-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="input-wrapper">
                  <CalendarDays className="input-icon" />
                  <input
                    type="date"
                    name="dueDate"
                    value={qTask.dueDate}
                    onChange={onChangeQuick}
                    className="form-input"
                  />
                </div>
                <div className="input-wrapper">
                  <User className="input-icon" />
                  <select
                    name="assignedTo"
                    value={qTask.assignedTo}
                    onChange={onChangeQuick}
                    className="form-select"
                  >
                    <option value={user?.email || ''}>{user?.email ? `Me (${user?.name || user.email})` : 'Me'}</option>
                    {teamMembers.map(m => (
                      <option key={m.id} value={m.email}>{m.name || m.email}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="input-wrapper">
                  <Flag className="input-icon" />
                  <select
                    name="priority"
                    value={qTask.priority}
                    onChange={onChangeQuick}
                    className="form-select"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div className="input-wrapper">
                  {/* Dynamic currency symbol */}\
                  <span className="input-icon" style={{ left: '1rem', top: 'calc(50% - 2px)', transform: 'translateY(-50%)' }}>
                    {getCurrencySymbol(user?.currency || 'USD')}
                  </span>
                  <input
                    type="number"
                    name="expenses"
                    value={qTask.expenses}
                    onChange={onChangeQuick}
                    className="form-input"
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    style={{ paddingLeft: '3.5rem' }} /* Adjusted padding for dynamic symbol */
                  />
                </div>
              </div>

              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  name="completed"
                  id="quickCompleted"
                  checked={qTask.completed}
                  onChange={onChangeQuick}
                  style={{ width: 'auto', margin: 0 }}
                />
                <label htmlFor="quickCompleted" className="form-label" style={{ marginBottom: 0, cursor: 'pointer' }}>Mark as Completed</label>
              </div>

              <div style={{ textAlign: 'right' }}>
                <button className="btn btn-primary btn-small" onClick={handleQuickAdd} disabled={qLoading}>
                  {qLoading ? 'Adding...' : 'Add Task'}
                </button>
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
                  const dd = t.dueDate ? parseLocalDateFromYYYYMMDD(t.dueDate) : null;
                  return (
                    <div
                      key={t.id || idx}
                      className={`task-card ${t.completed ? 'completed' : ''} ${overdue ? 'overdue' : ''}`}
                    >
                      <div className="task-checkbox">
                        <button
                          className="checkbox-btn"
                          disabled={!canToggle}
                          onClick={() => canToggle && onToggleTask?.({ id: t.id, index: idx })}
                          title={
                            canToggle
                              ? (t.completed ? 'Mark as incomplete' : 'Mark as complete')
                              : 'You cannot toggle this task'
                          }
                        >
                          {t.completed ? <CheckSquare size={20} /> : <Square size={20} />}
                        </button>
                      </div>
                      <div className="task-content">
                        <div className="task-header">
                          <h4 className="task-title">{t.title || 'Untitled task'}</h4>
                        </div>
                        {t.description && <p className="task-description">{t.description}</p>}
                        <div className="task-footer" style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                          {t.assignedTo && (
                            <span className="category-badge">
                              Assigned to: {t.assignedTo === user?.email ? 'Me' : t.assignedTo}
                            </span>
                          )}
                          {t.priority && <span className={`priority-badge ${t.priority}`}>{t.priority}</span>}
                          {dd && (
                            <span className={`due-date ${overdue ? 'overdue' : ''}`}>
                              Due: {dd.toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric'
                              })}
                            </span>
                          )}
                          {typeof t.expenses === 'number' && t.expenses > 0 && (
                            <span className="task-expenses">
                              {getCurrencySymbol(user?.currency || 'USD')} {formatCurrency(t.expenses, user?.currency || 'USD')}
                            </span>
                          )}
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
          <button className="btn btn-outline" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={onGoToDate}>
            <CalendarDays size={16} /> Go to date
          </button>
        </div>
      </div>
    </div>
  );
};

export default memo(EventDetailsModal);

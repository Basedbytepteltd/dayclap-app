import React, { useState, memo } from 'react';
import { X, Calendar, Clock, MapPin, AlignLeft, ListTodo, User, Plus, Edit, Trash2, CheckSquare, Square, Flag, Save } from 'lucide-react';
import './EventModal.css';
import { notifyTaskAssigned } from '../utils/taskNotify';
import { getCurrencySymbol, formatCurrency } from '../utils/currencyHelpers';
import {
  formatToYYYYMMDDInUserTimezone,
  formatToHHMMInUserTimezone,
} from '../utils/datetimeHelpers';

// Helper: parse 'YYYY-MM-DD' as a local date (avoid UTC shift)
function parseLocalDateFromYYYYMMDD(yyyy_mm_dd) {
  if (!yyyy_mm_dd || typeof yyyy_mm_dd !== 'string') return null;
  const parts = yyyy_mm_dd.split('-').map(Number);
  const [y, m, d] = parts;
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

const EventModal = ({
  showModal,
  onClose,
  eventForm,
  setEventForm,
  editingEvent,
  onSaveEvent,
  currentEventTaskForm,
  setCurrentEventTaskForm,
  handleAddEventTask,
  handleEditEventTask,
  handleDeleteEventTask,
  handleToggleEventTaskCompletion,
  teamMembers,
  user,
}) => {
  if (!showModal) {
    return null;
  }

  const userTimezone = user?.timezone || 'UTC';
  const [taskMessage, setTaskMessage] = useState('');
  const [taskMessageType, setTaskMessageType] = useState('');

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'time') {
      const [hours, minutes] = value.split(':').map(Number);
      const currentEventDate = eventForm.eventDateTime;
      const newEventDateTime = (currentEventDate && !isNaN(currentEventDate.getTime()))
        ? new Date(currentEventDate.getTime())
        : new Date(); // Fallback to now if date is invalid

      if (!isNaN(hours) && !isNaN(minutes)) {
        newEventDateTime.setHours(hours, minutes, 0, 0); // Also reset seconds/ms
        setEventForm(prev => ({ ...prev, eventDateTime: newEventDateTime }));
      }
    } else {
      setEventForm(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleDateChange = (e) => {
    const newDateString = e.target.value; // YYYY-MM-DD
    if (!newDateString) return; // Ignore empty input

    const [year, month, day] = newDateString.split('-').map(Number);
    const currentEventDate = eventForm.eventDateTime;
    const newEventDateTime = (currentEventDate && !isNaN(currentEventDate.getTime()))
      ? new Date(currentEventDate.getTime())
      : new Date(); // Fallback

    if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
      newEventDateTime.setFullYear(year, month - 1, day); // month is 0-indexed
      setEventForm(prev => ({ ...prev, eventDateTime: newEventDateTime }));
    }
  };

  const handleEventTaskInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setCurrentEventTaskForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    setTaskMessage('');
    setTaskMessageType('');
  };

  const isTaskOverdue = (task) => {
    if (task.completed || !task.dueDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const taskDueDate = parseLocalDateFromYYYYMMDD(task.dueDate);
    return taskDueDate && taskDueDate < today;
  };

  const handleSaveEventTask = async () => {
    if (!currentEventTaskForm.title.trim()) {
      setTaskMessage('Task title cannot be empty.');
      setTaskMessageType('error');
      return;
    }
    handleAddEventTask();
    setTaskMessage('Task saved successfully!');
    setTaskMessageType('success');
    setTimeout(() => { setTaskMessage(''); setTaskMessageType(''); }, 3000);

    try {
      const assignee = (currentEventTaskForm.assignedTo || '').trim();
      if (assignee) {
        const companyName = (user?.companies?.find(c => c.id === (user.currentCompanyId || user.current_company_id))?.name) || '';
        await notifyTaskAssigned({
          assigned_to_email: assignee,
          assigned_to_name: teamMembers?.find(m => m.email === assignee)?.name || '',
          assigned_by_email: user?.email || '',
          assigned_by_name: user?.name || user?.email || 'Someone',
          event_title: eventForm.title || 'Event',
          event_date: getFormattedDateValue(eventForm.eventDateTime, userTimezone),
          event_time: getFormattedTimeValue(eventForm.eventDateTime, userTimezone),
          company_name: companyName,
          task_title: currentEventTaskForm.title || '',
          task_description: currentEventTaskForm.description || '',
          due_date: currentEventTaskForm.dueDate || '',
        });
      }
    } catch (error) {
      console.error("Error sending task assigned notification:", error);
    }
  };

  const handleCancelEditTask = () => {
    setCurrentEventTaskForm({
      id: null, title: '', description: '',
      dueDate: getFormattedDateValue(eventForm.eventDateTime, userTimezone),
      assignedTo: user?.email || '', priority: 'medium', expenses: 0, completed: false,
    });
    setTaskMessage('');
    setTaskMessageType('');
  };

  const getFormattedDateValue = (dateObj, timezone) => (dateObj instanceof Date && !isNaN(dateObj.getTime())) ? formatToYYYYMMDDInUserTimezone(dateObj, timezone) : '';
  const getFormattedTimeValue = (dateObj, timezone) => (dateObj instanceof Date && !isNaN(dateObj.getTime())) ? formatToHHMMInUserTimezone(dateObj, timezone) : '';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content event-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{editingEvent ? 'Edit Event' : 'Add New Event'}</h3>
          <button className="modal-close" onClick={onClose} title="Close"><X /></button>
        </div>
        <form onSubmit={onSaveEvent}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">Event Title</label>
              <div className="input-wrapper">
                <Calendar className="input-icon" />
                <input type="text" name="title" value={eventForm.title} onChange={handleInputChange} className="form-input" placeholder="e.g., Team Meeting" required />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Date</label>
                <div className="input-wrapper">
                  <Calendar className="input-icon" />
                  <input type="date" name="date" value={getFormattedDateValue(eventForm.eventDateTime, userTimezone)} onChange={handleDateChange} className="form-input" required />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Time <span className="optional-text">(Optional)</span></label>
                <div className="input-wrapper">
                  <Clock className="input-icon" />
                  <input type="time" name="time" value={getFormattedTimeValue(eventForm.eventDateTime, userTimezone)} onChange={handleInputChange} className="form-input" />
                </div>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Location <span className="optional-text">(Optional)</span></label>
              <div className="input-wrapper">
                <MapPin className="input-icon" />
                <input type="text" name="location" value={eventForm.location} onChange={handleInputChange} className="form-input" placeholder="e.g., Conference Room A" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Description <span className="optional-text">(Optional)</span></label>
              <div className="input-wrapper">
                <AlignLeft className="input-icon" />
                <textarea name="description" value={eventForm.description} onChange={handleInputChange} className="form-textarea" rows="5" placeholder="Add a brief description of the event..."></textarea>
              </div>
            </div>
            <div className="event-tasks-section">
              <h4 className="event-tasks-title">Event Tasks</h4>
              <p className="task-section-description">Break down your event into manageable tasks.</p>
              <div className="event-task-form">
                <div className="form-group">
                  <label className="form-label">Task Title</label>
                  <div className="input-wrapper">
                    <ListTodo className="input-icon" />
                    <input type="text" name="title" value={currentEventTaskForm.title} onChange={handleEventTaskInputChange} className="form-input" placeholder="e.g., Send out invitations" />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Description <span className="optional-text">(Optional)</span></label>
                  <div className="input-wrapper">
                    <AlignLeft className="input-icon" />
                    <textarea name="description" value={currentEventTaskForm.description} onChange={handleEventTaskInputChange} className="form-textarea" rows="4" placeholder="Detailed description for the task..."></textarea>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Due Date</label>
                    <div className="input-wrapper">
                      <Calendar className="input-icon" />
                      <input type="date" name="dueDate" value={currentEventTaskForm.dueDate} onChange={handleEventTaskInputChange} className="form-input" />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Assigned To</label>
                    <div className="input-wrapper">
                      <User className="input-icon" />
                      <select name="assignedTo" value={currentEventTaskForm.assignedTo} onChange={handleEventTaskInputChange} className="form-select">
                        <option value={user.email}>Me ({user.name || user.email})</option>
                        {teamMembers.map(member => <option key={member.id} value={member.email}>{member.name || member.email}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Priority</label>
                    <div className="input-wrapper">
                      <Flag className="input-icon" />
                      <select name="priority" value={currentEventTaskForm.priority} onChange={handleEventTaskInputChange} className="form-select">
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Expenses <span className="optional-text">(Optional)</span></label>
                    <div className="input-wrapper">
                      <span className="input-icon" style={{ left: '1rem', top: 'calc(50% - 2px)', transform: 'translateY(-50%)' }}>{getCurrencySymbol(user?.currency || 'USD')}</span>
                      <input type="number" name="expenses" value={currentEventTaskForm.expenses} onChange={handleEventTaskInputChange} className="form-input" placeholder="0.00" step="0.01" min="0" style={{ paddingLeft: '3.5rem' }} />
                    </div>
                  </div>
                </div>
                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input type="checkbox" name="completed" id="currentEventTaskCompleted" checked={currentEventTaskForm.completed} onChange={handleEventTaskInputChange} style={{ width: 'auto', margin: 0 }} />
                  <label htmlFor="currentEventTaskCompleted" className="form-label" style={{ marginBottom: 0, cursor: 'pointer' }}>Mark as Completed</label>
                </div>
                {taskMessage && <div className={`info-message ${taskMessageType}`} style={{ marginTop: '0.75rem', marginBottom: '0.75rem' }}>{taskMessage}</div>}
                <div className="event-tasks-footer">
                  {currentEventTaskForm.id ? (
                    <>
                      <button type="button" className="btn btn-outline btn-small" onClick={handleCancelEditTask}>Cancel</button>
                      <button type="button" className="btn btn-primary btn-small" onClick={handleSaveEventTask}><Save size={16} /> Save Task</button>
                    </>
                  ) : (
                    <button type="button" className="btn btn-primary btn-small" onClick={handleSaveEventTask}><Plus size={16} /> Add Task</button>
                  )}
                </div>
              </div>
              {eventForm.eventTasks.length > 0 && (
                <div className="event-task-list">
                  {eventForm.eventTasks.map(task => {
                    const dd = task.dueDate ? parseLocalDateFromYYYYMMDD(task.dueDate) : null;
                    return (
                      <div key={task.id} className={`event-task-item ${task.completed ? 'completed' : ''} ${isTaskOverdue(task) ? 'overdue' : ''}`}>
                        <div className="task-checkbox"><button type="button" className="checkbox-btn" onClick={() => handleToggleEventTaskCompletion(task.id)}>{task.completed ? <CheckSquare size={20} /> : <Square size={20} />}</button></div>
                        <div className="task-details">
                          <h5 className="task-title">{task.title}</h5>
                          {task.description && <p className="task-description">{task.description}</p>}
                          <div className="task-meta">
                            {task.assignedTo && <span>Assigned to: <span className="assigned-to">{task.assignedTo === user.email ? 'Me' : task.assignedTo}</span></span>}
                            {dd && <span className={`due-date ${isTaskOverdue(task) ? 'overdue' : ''}`}>Due: {dd.toLocaleDateString()}</span>}
                            {task.priority && <span className={`priority-badge ${task.priority}`}>{task.priority}</span>}
                            {task.expenses > 0 && <span className="task-expenses">{getCurrencySymbol(user?.currency || 'USD')} {formatCurrency(task.expenses, user?.currency || 'USD')}</span>}
                          </div>
                        </div>
                        <div className="task-actions">
                          <button type="button" className="btn-icon-small edit" onClick={() => handleEditEventTask(task)} title="Edit Task"><Edit size={16} /></button>
                          <button type="button" className="btn-icon-small delete" onClick={() => handleDeleteEventTask(task.id)} title="Delete Task"><Trash2 size={16} /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary"><Save size={16} /> {editingEvent ? 'Save Changes' : 'Create Event'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default memo(EventModal);

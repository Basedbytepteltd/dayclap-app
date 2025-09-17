import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, MapPin, AlignLeft, ListTodo, User, DollarSign, Plus, Edit, Trash2, CheckSquare, Square, Flag, Save } from 'lucide-react';
import './EventModal.css'; // Create a new CSS file for this modal if needed, or extend Dashboard.css

// Helper function to format a Date object to YYYY-MM-DD in local time
const formatDateToYYYYMMDD = (dateInput) => {
  if (!dateInput) return '';
  let date;
  if (typeof dateInput === 'string') {
    date = new Date(dateInput);
  } else if (dateInput instanceof Date) {
    date = dateInput;
  } else {
    return '';
  }
  if (isNaN(date.getTime())) {
    return '';
  }
  const adjustedDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
  return adjustedDate.toISOString().split('T')[0];
};

// Helper function to format currency
const formatCurrency = (amount, currencyCode = 'USD') => {
  if (amount === null || amount === undefined || isNaN(Number(amount))) {
    return '';
  }
  const numericAmount = Number(amount);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numericAmount);
};

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
  if (!showModal) return null;

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setEventForm(prev => ({ ...prev, [name]: value }));
  };

  const handleDateChange = (e) => {
    setEventForm(prev => ({ ...prev, date: new Date(e.target.value) }));
  };

  const handleEventTaskInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setCurrentEventTaskForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const isTaskOverdue = (task) => {
    if (task.completed || !task.dueDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const taskDueDate = new Date(task.dueDate);
    taskDueDate.setHours(0, 0, 0, 0);
    return taskDueDate < today;
  };

  const handleSaveEventTask = () => {
    handleAddEventTask();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content event-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{editingEvent ? 'Edit Event' : 'Add New Event'}</h3>
          <button className="modal-close" onClick={onClose}><X /></button>
        </div>
        <form onSubmit={onSaveEvent}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">Event Title</label>
              <div className="input-wrapper">
                <Calendar className="input-icon" />
                <input
                  type="text"
                  name="title"
                  value={eventForm.title}
                  onChange={handleInputChange}
                  className="form-input"
                  placeholder="e.g., Team Meeting"
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Date</label>
                <div className="input-wrapper">
                  <Calendar className="input-icon" />
                  <input
                    type="date"
                    name="date"
                    value={formatDateToYYYYMMDD(eventForm.date)}
                    onChange={handleDateChange}
                    className="form-input"
                    required
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Time <span className="optional-text">(Optional)</span></label>
                <div className="input-wrapper">
                  <Clock className="input-icon" />
                  <input
                    type="time"
                    name="time"
                    value={eventForm.time}
                    onChange={handleInputChange}
                    className="form-input"
                  />
                </div>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Location <span className="optional-text">(Optional)</span></label>
              <div className="input-wrapper">
                <MapPin className="input-icon" />
                <input
                  type="text"
                  name="location"
                  value={eventForm.location}
                  onChange={handleInputChange}
                  className="form-input"
                  placeholder="e.g., Conference Room A"
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Description <span className="optional-text">(Optional)</span></label>
              <div className="input-wrapper">
                <AlignLeft className="input-icon" />
                <textarea
                  name="description"
                  value={eventForm.description}
                  onChange={handleInputChange}
                  className="form-textarea"
                  rows="5"
                  placeholder="Add a brief description of the event..."
                ></textarea>
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
                    <input
                      type="text"
                      name="title"
                      value={currentEventTaskForm.title}
                      onChange={handleEventTaskInputChange}
                      className="form-input"
                      placeholder="e.g., Send out invitations"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Description <span className="optional-text">(Optional)</span></label>
                  <div className="input-wrapper">
                    <AlignLeft className="input-icon" />
                    <textarea
                      name="description"
                      value={currentEventTaskForm.description}
                      onChange={handleEventTaskInputChange}
                      className="form-textarea"
                      rows="4"
                      placeholder="Detailed description for the task..."
                    ></textarea>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Due Date</label>
                    <div className="input-wrapper">
                      <Calendar className="input-icon" />
                      <input
                        type="date"
                        name="dueDate"
                        value={currentEventTaskForm.dueDate}
                        onChange={handleEventTaskInputChange}
                        className="form-input"
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Assigned To</label>
                    <div className="input-wrapper">
                      <User className="input-icon" />
                      <select
                        name="assignedTo"
                        value={currentEventTaskForm.assignedTo}
                        onChange={handleEventTaskInputChange}
                        className="form-select"
                      >
                        <option value={user.email}>Me ({user.name || user.email})</option>
                        {teamMembers.map(member => (
                          <option key={member.id} value={member.email}>{member.name || member.email}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Priority</label>
                    <div className="input-wrapper">
                      <Flag className="input-icon" />
                      <select
                        name="priority"
                        value={currentEventTaskForm.priority}
                        onChange={handleEventTaskInputChange}
                        className="form-select"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Expenses <span className="optional-text">(Optional)</span></label>
                    <div className="input-wrapper">
                      <DollarSign className="input-icon" />
                      <input
                        type="number"
                        name="expenses"
                        value={currentEventTaskForm.expenses}
                        onChange={handleEventTaskInputChange}
                        className="form-input"
                        placeholder="0.00"
                        step="0.01"
                        min="0"
                      />
                    </div>
                  </div>
                </div>
                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    name="completed"
                    id="currentEventTaskCompleted"
                    checked={currentEventTaskForm.completed}
                    onChange={handleEventTaskInputChange}
                    style={{ width: 'auto', margin: 0 }}
                  />
                  <label htmlFor="currentEventTaskCompleted" className="form-label" style={{ marginBottom: 0, cursor: 'pointer' }}>Mark as Completed</label>
                </div>
                <div className="event-tasks-footer">
                  <button type="button" className="btn btn-primary btn-small" onClick={handleSaveEventTask}>
                    {currentEventTaskForm.id ? <Save size={16} /> : <Plus size={16} />}
                    {currentEventTaskForm.id ? 'Save Task' : 'Add Task'}
                  </button>
                </div>
              </div>

              {eventForm.eventTasks.length > 0 && (
                <div className="event-task-list">
                  {eventForm.eventTasks.map(task => (
                    <div key={task.id} className={`event-task-item ${task.completed ? 'completed' : ''} ${isTaskOverdue(task) ? 'overdue' : ''}`}>
                      <div className="task-checkbox">
                        <button type="button" className="checkbox-btn" onClick={() => handleToggleEventTaskCompletion(task.id)}>
                          {task.completed ? <CheckSquare size={20} /> : <Square size={20} />}
                        </button>
                      </div>
                      <div className="task-details">
                        <h5 className="task-title">{task.title}</h5>
                        {task.description && <p className="task-description">{task.description}</p>}
                        <div className="task-meta">
                          {task.assignedTo && <span>Assigned to: <span className="assigned-to">{task.assignedTo === user.email ? 'Me' : task.assignedTo}</span></span>}
                          {task.dueDate && <span className={`due-date ${isTaskOverdue(task) ? 'overdue' : ''}`}>Due: {new Date(task.dueDate).toLocaleDateString()}</span>}
                          {task.priority && <span className={`priority-badge ${task.priority}`}>{task.priority}</span>}
                          {task.expenses > 0 && <span className="task-expenses"><DollarSign size={14} /> {formatCurrency(task.expenses, user.currency)}</span>}
                        </div>
                      </div>
                      <div className="task-actions">
                        <button type="button" className="btn-icon-small edit" onClick={() => handleEditEventTask(task)} title="Edit Task"><Edit size={16} /></button>
                        <button type="button" className="btn-icon-small delete" onClick={() => handleDeleteEventTask(task.id)} title="Delete Task"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  ))}
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

export default EventModal;

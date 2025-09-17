import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Building2, 
  Calendar,
  Search, 
  Trash2, 
  Eye, 
  LogOut,
  UserPlus,
  Mail,
  Activity,
  Clock,
  CalendarDays,
  CheckSquare,
  Settings,
  Key,
  Send,
  FileText,
  Plus,
  Save,
  Edit,
  X
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import './SuperAdminDashboard.css';

const SuperAdminDashboard = ({ user, onLogout }) => {
  const [users, setUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [activeTab, setActiveTab] = useState('users');
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalCompanies: 0,
    totalEvents: 0,
    totalTasks: 0,
    activeToday: 0
  });

  const [emailSettingsForm, setEmailSettingsForm] = useState({
    id: null,
    maileroo_sending_key: '',
    mail_default_sender: 'no-reply@team.dayclap.com'
  });
  const [emailSettingsMessage, setEmailSettingsMessage] = useState('');
  const [emailSettingsLoading, setEmailSettingsLoading] = useState(false);

  const [testEmailRecipient, setTestEmailRecipient] = useState('');
  const [testEmailMessage, setTestEmailMessage] = useState('');
  const [testEmailLoading, setTestEmailLoading] = useState(false);

  // NEW: State for Email Templates
  const [emailTemplates, setEmailTemplates] = useState([]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null); // null for new, object for edit
  const [templateForm, setTemplateForm] = useState({
    name: '',
    subject: '',
    html_content: ''
  });
  const [templateMessage, setTemplateMessage] = useState('');
  const [templateMessageType, setTemplateMessageType] = useState(''); // 'success' or 'error'
  const [templateLoading, setTemplateLoading] = useState(false);


  useEffect(() => {
    loadUsersData();
  }, []);

  useEffect(() => {
    if (activeTab === 'email-settings') {
      fetchEmailSettings();
    } else if (activeTab === 'email-templates') {
      fetchEmailTemplates();
    }
  }, [activeTab]);

  const fetchEmailSettings = async () => {
    setEmailSettingsLoading(true);
    setEmailSettingsMessage('');
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      const response = await fetch(`${backendUrl}/api/admin/email-settings`, {
        headers: {
          'X-User-Email': user.email,
          'Content-Type': 'application/json'
        }
      });
      const data = await response.json();

      if (response.ok) {
        setEmailSettingsForm({
          id: data.id,
          maileroo_sending_key: data.maileroo_sending_key || '',
          mail_default_sender: data.mail_default_sender || ''
        });
      } else {
        setEmailSettingsMessage(`Error: ${data.message || 'Failed to fetch email settings'}`);
      }
    } catch (error) {
      console.error('Error fetching email settings:', error);
      setEmailSettingsMessage('An unexpected error occurred while fetching email settings.');
    } finally {
      setEmailSettingsLoading(false);
    }
  };

  const handleEmailSettingsSubmit = async (e) => {
    e.preventDefault();
    setEmailSettingsLoading(true);
    setEmailSettingsMessage('');

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      const url = `${backendUrl}/api/admin/email-settings`;

      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'X-User-Email': user.email,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(emailSettingsForm)
      });
      const data = await response.json();

      if (response.ok) {
        setEmailSettingsMessage('Email settings updated successfully!');
        if (data.settings) {
          setEmailSettingsForm({
            id: data.settings.id,
            maileroo_sending_key: data.settings.maileroo_sending_key || '',
            mail_default_sender: data.settings.mail_default_sender || ''
          });
        }
      } else {
        setEmailSettingsMessage(`Error: ${data.message || 'Failed to update email settings'}`);
      }
    } catch (error) {
      console.error('Error updating email settings:', error);
      setEmailSettingsMessage('An unexpected error occurred while updating email settings.');
    } finally {
      setEmailSettingsLoading(false);
    }
  };

  const handleSendTestEmail = async (e) => {
    e.preventDefault();
    setTestEmailLoading(true);
    setTestEmailMessage('');

    if (!testEmailRecipient.trim()) {
      setTestEmailMessage('Error: Recipient email is required.');
      setTestEmailLoading(false);
      return;
    }

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      const response = await fetch(`${backendUrl}/api/admin/send-test-email`, {
        method: 'POST',
        headers: {
          'X-User-Email': user.email,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ recipient_email: testEmailRecipient })
      });
      const data = await response.json();

      if (response.ok) {
        setTestEmailMessage(`Success: ${data.message}`);
      } else {
        setTestEmailMessage(`Error: ${data.message || 'Failed to send test email'}`);
      }
    } catch (error) {
      console.error('Error sending test email:', error);
      setTestEmailMessage('An unexpected error occurred while sending the test email.');
    } finally {
      setTestEmailLoading(false);
    }
  };

  // NEW: Email Template Management Functions
  const fetchEmailTemplates = async () => {
    setTemplateLoading(true);
    setTemplateMessage('');
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      const response = await fetch(`${backendUrl}/api/admin/email-templates`, {
        headers: {
          'X-User-Email': user.email,
          'Content-Type': 'application/json'
        }
      });
      const data = await response.json();

      if (response.ok) {
        setEmailTemplates(data);
      } else {
        setTemplateMessage(`Error: ${data.message || 'Failed to fetch email templates'}`);
        setTemplateMessageType('error');
      }
    } catch (error) {
      console.error('Error fetching email templates:', error);
      setTemplateMessage('An unexpected error occurred while fetching email templates.');
      setTemplateMessageType('error');
    } finally {
      setTemplateLoading(false);
    }
  };

  const handleAddTemplate = () => {
    setEditingTemplate(null);
    setTemplateForm({ name: '', subject: '', html_content: '' });
    setTemplateMessage('');
    setTemplateMessageType('');
    setShowTemplateModal(true);
  };

  const handleEditTemplate = (template) => {
    setEditingTemplate(template);
    setTemplateForm({ name: template.name, subject: template.subject, html_content: template.html_content });
    setTemplateMessage('');
    setTemplateMessageType('');
    setShowTemplateModal(true);
  };

  const handleSaveTemplate = async (e) => {
    e.preventDefault();
    setTemplateLoading(true);
    setTemplateMessage('');
    setTemplateMessageType('');

    if (!templateForm.name.trim() || !templateForm.subject.trim() || !templateForm.html_content.trim()) {
      setTemplateMessage('All fields are required.');
      setTemplateMessageType('error');
      setTemplateLoading(false);
      return;
    }

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      let response;
      let url;

      if (editingTemplate) {
        url = `${backendUrl}/api/admin/email-templates/${editingTemplate.id}`;
        response = await fetch(url, {
          method: 'PUT',
          headers: {
            'X-User-Email': user.email,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(templateForm)
        });
      } else {
        url = `${backendUrl}/api/admin/email-templates`;
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'X-User-Email': user.email,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(templateForm)
        });
      }

      const data = await response.json();

      if (response.ok) {
        setTemplateMessage(data.message || 'Template saved successfully!');
        setTemplateMessageType('success');
        fetchEmailTemplates(); // Refresh the list
        setShowTemplateModal(false);
      } else {
        setTemplateMessage(`Error: ${data.message || 'Failed to save template'}`);
        setTemplateMessageType('error');
      }
    } catch (error) {
      console.error('Error saving template:', error);
      setTemplateMessage('An unexpected error occurred while saving the template.');
      setTemplateMessageType('error');
    } finally {
      setTemplateLoading(false);
    }
  };

  const handleDeleteTemplate = async (templateId) => {
    if (!window.confirm('Are you sure you want to delete this email template? This action cannot be undone.')) {
      return;
    }
    setTemplateLoading(true);
    setTemplateMessage('');
    setTemplateMessageType('');

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      const response = await fetch(`${backendUrl}/api/admin/email-templates/${templateId}`, {
        method: 'DELETE',
        headers: {
          'X-User-Email': user.email,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok || response.status === 204) {
        setTemplateMessage('Template deleted successfully!');
        setTemplateMessageType('success');
        fetchEmailTemplates(); // Refresh the list
      } else {
        const data = await response.json();
        setTemplateMessage(`Error: ${data.message || 'Failed to delete template'}`);
        setTemplateMessageType('error');
      }
    } catch (error) {
      console.error('Error deleting template:', error);
      setTemplateMessage('An unexpected error occurred while deleting the template.');
      setTemplateMessageType('error');
    } finally {
      setTemplateLoading(false);
    }
  };

  const loadUsersData = async () => {
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, name, email, created_at, last_activity_at, companies');

    if (profilesError) {
      console.error("SuperAdminDashboard: Error fetching profiles:", profilesError.message);
      return;
    }

    // Auth-level metrics (last_sign_in_at) require service role; not available in the browser.
    const authUsers = { users: [] };

    const { data: allEvents, error: eventsError } = await supabase.from('events').select('id, user_id');
    const { data: allTasks, error: tasksError } = await supabase.from('tasks').select('id, user_id, completed');

    if (eventsError) console.error("SuperAdminDashboard: Error fetching events:", eventsError.message);
    if (tasksError) console.error("SuperAdminDashboard: Error fetching tasks:", tasksError.message);

    const eventsByUser = (allEvents || []).reduce((acc, event) => {
      acc[event.user_id] = (acc[event.user_id] || 0) + 1;
      return acc;
    }, {});

    const tasksByUser = (allTasks || []).reduce((acc, task) => {
      acc[task.user_id] = {
        total: (acc[task.user_id]?.total || 0) + 1,
        pending: (acc[task.user_id]?.pending || 0) + (task.completed ? 0 : 1)
      };
      return acc;
    }, {});

    const today = new Date();
    const twentyFourHoursAgo = new Date(today.getTime() - (24 * 60 * 60 * 1000));
    let activeTodayCount = 0;
    const allCompanyIds = new Set();

    const combinedUsers = profiles.map(profile => {
      const authUser = (authUsers?.users || []).find(au => au.id === profile.id);
      
      if (profile.last_activity_at && new Date(profile.last_activity_at) > twentyFourHoursAgo) {
        activeTodayCount++;
      }

      profile.companies?.forEach(company => allCompanyIds.add(company.id));

      return {
        ...profile,
        last_sign_in_at: authUser?.last_sign_in_at || null,
        event_count: eventsByUser[profile.id] || 0,
        task_total_count: tasksByUser[profile.id]?.total || 0,
        task_pending_count: tasksByUser[profile.id]?.pending || 0,
      };
    });

    const regularUsers = combinedUsers.filter(u => u.email !== 'admin@example.com');
    setUsers(regularUsers);
    
    setStats({
      totalUsers: regularUsers.length,
      totalCompanies: allCompanyIds.size,
      totalEvents: allEvents?.length || 0,
      totalTasks: allTasks?.length || 0,
      activeToday: activeTodayCount
    });
  };

  const filteredUsers = users.filter(user => 
    user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.companies?.some(c => c.name?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleViewUser = (userData) => {
    setSelectedUser(userData);
    setShowUserModal(true);
  };

  const handleDeleteUser = async (userId) => {
    alert('Deleting users requires a secure server-side operation and cannot be performed from the browser. Please add a backend admin endpoint to handle this.');
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const UserModal = () => {
    if (!selectedUser) return null;

    return (
      <div className="modal-backdrop" onClick={() => setShowUserModal(false)}>
        <div className="modal-content user-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2>User Details</h2>
            <button onClick={() => setShowUserModal(false)}>&times;</button>
          </div>
          
          <div className="user-details">
            <div className="user-info-section">
              <h3>Personal Information</h3>
              <div className="info-grid">
                <div className="info-item">
                  <label>Name:</label>
                  <span>{selectedUser.name}</span>
                </div>
                <div className="info-item">
                  <label>Email:</label>
                  <span>{selectedUser.email}</span>
                </div>
                <div className="info-item">
                  <label>Joined:</label>
                  <span>{formatDate(selectedUser.created_at)}</span>
                </div>
              </div>
            </div>

            <div className="user-info-section">
              <h3>Activity & Usage</h3>
              <div className="info-grid">
                <div className="info-item">
                  <label>Last Sign In:</label>
                  <span>{formatDate(selectedUser.last_sign_in_at)}</span>
                </div>
                <div className="info-item">
                  <label>Last Activity:</label>
                  <span>{formatDate(selectedUser.last_activity_at)}</span>
                </div>
                <div className="info-item">
                  <label>Total Events:</label>
                  <span>{selectedUser.event_count}</span>
                </div>
                <div className="info-item">
                  <label>Total Tasks:</label>
                  <span>{selectedUser.task_total_count}</span>
                </div>
                <div className="info-item">
                  <label>Pending Tasks:</label>
                  <span>{selectedUser.task_pending_count}</span>
                </div>
              </div>
            </div>

            <div className="user-info-section">
              <h3>Companies</h3>
              <div className="companies-list">
                {selectedUser.companies && selectedUser.companies.length > 0 ? (
                  selectedUser.companies.map(company => (
                    <div key={company.id} className="company-item">
                      <Building2 size={16} />
                      <div>
                        <strong>{company.name}</strong>
                        <small>Role: {company.role} | Joined: {new Date(company.createdAt).toLocaleDateString()}</small>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="no-data">No companies associated.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const TemplateModal = () => {
    if (!showTemplateModal) return null;

    return (
      <div className="modal-backdrop" onClick={() => setShowTemplateModal(false)}>
        <div className="modal-content template-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2>{editingTemplate ? 'Edit Email Template' : 'Create New Email Template'}</h2>
            <button className="modal-close" onClick={() => setShowTemplateModal(false)}><X /></button>
          </div>
          <form onSubmit={handleSaveTemplate}>
            <div className="modal-body">
              {templateMessage && (
                <div className={`info-message ${templateMessageType}`} style={{ marginBottom: '1rem' }}>
                  {templateMessage}
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Template Name (Unique Identifier)</label>
                <div className="input-wrapper">
                  <FileText className="input-icon" />
                  <input
                    type="text"
                    name="name"
                    value={templateForm.name}
                    onChange={(e) => setTemplateForm(prev => ({ ...prev, name: e.target.value }))}
                    className="form-input"
                    placeholder="e.g., welcome_email"
                    required
                    disabled={editingTemplate !== null} // Name cannot be changed for existing templates
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Subject</label>
                <div className="input-wrapper">
                  <Mail className="input-icon" />
                  <input
                    type="text"
                    name="subject"
                    value={templateForm.subject}
                    onChange={(e) => setTemplateForm(prev => ({ ...prev, subject: e.target.value }))}
                    className="form-input"
                    placeholder="e.g., Welcome to DayClap!"
                    required
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">HTML Content</label>
                <div className="input-wrapper">
                  <FileText className="input-icon" style={{ top: '1rem', transform: 'none' }} />
                  <textarea
                    name="html_content"
                    value={templateForm.html_content}
                    onChange={(e) => setTemplateForm(prev => ({ ...prev, html_content: e.target.value }))}
                    className="form-textarea"
                    rows="15"
                    placeholder="Enter full HTML content for the email template..."
                    required
                  ></textarea>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setShowTemplateModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={templateLoading}>
                {templateLoading ? 'Saving...' : <><Save size={16} /> {editingTemplate ? 'Save Changes' : 'Create Template'}</>}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  return (
    <div className="super-admin-dashboard">
      <header className="admin-header">
        <div className="header-content">
          <div className="header-left">
            <div className="logo">
              <Calendar className="logo-icon" />
              <span className="logo-text">DayClap</span>
            </div>
            <div className="header-title-group">
              <h1>Super Admin</h1>
              <p>Welcome back, {user.name}</p>
            </div>
          </div>
          <div className="header-right">
            <button className="btn btn-outline" onClick={onLogout}>
              <LogOut size={16} />
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="admin-main">
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon"><Users /></div>
            <div className="stat-content"><h3>{stats.totalUsers}</h3><p>Total Users</p></div>
          </div>
          <div className="stat-card">
            <div className="stat-icon"><Building2 /></div>
            <div className="stat-content"><h3>{stats.totalCompanies}</h3><p>Total Companies</p></div>
          </div>
          <div className="stat-card">
            <div className="stat-icon"><CalendarDays /></div>
            <div className="stat-content"><h3>{stats.totalEvents}</h3><p>Total Events</p></div>
          </div>
          <div className="stat-card">
            <div className="stat-icon"><CheckSquare /></div>
            <div className="stat-content"><h3>{stats.totalTasks}</h3><p>Total Tasks</p></div>
          </div>
          <div className="stat-card">
            <div className="stat-icon"><Activity /></div>
            <div className="stat-content"><h3>{stats.activeToday}</h3><p>Active Today</p></div>
          </div>
        </div>

        <nav className="admin-nav">
          <button 
            className={`admin-nav-tab ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            <Users /> User Management
          </button>
          <button 
            className={`admin-nav-tab ${activeTab === 'email-settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('email-settings')}
          >
            <Mail /> Email Settings
          </button>
          <button 
            className={`admin-nav-tab ${activeTab === 'email-templates' ? 'active' : ''}`}
            onClick={() => setActiveTab('email-templates')}
          >
            <FileText /> Email Templates
          </button>
          <button 
            className={`admin-nav-tab ${activeTab === 'test-sending' ? 'active' : ''}`}
            onClick={() => setActiveTab('test-sending')}
          >
            <Send /> Test Sending
          </button>
        </nav>

        <div className="admin-tab-content">
          {activeTab === 'users' && (
            <div className="users-section">
              <div className="section-header">
                <h2>User Management</h2>
                <div className="search-bar">
                  <Search size={20} />
                  <input
                    type="text"
                    placeholder="Search users..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>

              <div className="users-table">
                <table>
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Email</th>
                      <th>Companies</th>
                      <th>Events</th>
                      <th>Tasks (P/T)</th>
                      <th>Last Sign In</th>
                      <th>Last Activity</th>
                      <th>Joined</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map(userData => (
                      <tr key={userData.id}>
                        <td>
                          <div className="user-cell">
                            <div className="user-avatar">{(userData.name || userData.email || '?').charAt(0).toUpperCase()}</div>
                            <span>{userData.name || userData.email}</span>
                          </div>
                        </td>
                        <td>{userData.email}</td>
                        <td>
                          <div className="companies-cell">
                            {userData.companies && userData.companies.length > 0 ? (
                              userData.companies.map(c => c.name).join(', ')
                            ) : (
                              <span className="no-data">N/A</span>
                            )}
                          </div>
                        </td>
                        <td><span>{userData.event_count}</span></td>
                        <td><span>{userData.task_pending_count}/{userData.task_total_count}</span></td>
                        <td>{formatDate(userData.last_sign_in_at)}</td>
                        <td>{formatDate(userData.last_activity_at)}</td>
                        <td>{formatDate(userData.created_at)}</td>
                        <td>
                          <div className="actions">
                            <button className="action-btn view" onClick={() => handleViewUser(userData)} title="View Details"><Eye size={16} /></button>
                            <button className="action-btn delete" onClick={() => handleDeleteUser(userData.id)} title="Delete User"><Trash2 size={16} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                
                {filteredUsers.length === 0 && (
                  <div className="no-users">
                    <UserPlus size={48} />
                    <h3>No users found</h3>
                    <p>{searchTerm ? `No users match "${searchTerm}"` : "No users have signed up yet"}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'email-settings' && (
            <div className="email-settings-section">
              <div className="section-header">
                <h2>Maileroo Email Configuration</h2>
              </div>
              <form className="settings-form" onSubmit={handleEmailSettingsSubmit}>
                <div className="form-group">
                  <label className="form-label">Maileroo Sending Key</label>
                  <div className="input-wrapper">
                    <Key className="input-icon" />
                    <input
                      type="password"
                      name="maileroo_sending_key"
                      value={emailSettingsForm.maileroo_sending_key}
                      onChange={(e) => setEmailSettingsForm(prev => ({ ...prev, maileroo_sending_key: e.target.value }))}
                      className="form-input"
                      placeholder="Enter your Maileroo Sending Key"
                      required
                      disabled={emailSettingsLoading}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Default Sender Email</label>
                  <div className="input-wrapper">
                    <Mail className="input-icon" />
                    <input
                      type="email"
                      name="mail_default_sender"
                      value={emailSettingsForm.mail_default_sender}
                      onChange={(e) => setEmailSettingsForm(prev => ({ ...prev, mail_default_sender: e.target.value }))}
                      className="form-input"
                      placeholder="e.g., DayClap Notifications <noreply@dayclap.com>"
                      required
                      disabled={emailSettingsLoading}
                    />
                  </div>
                </div>
                {emailSettingsMessage && (
                  <div className={`info-message ${emailSettingsMessage.includes('Error') ? 'error' : 'success'}`}>
                    {emailSettingsMessage}
                  </div>
                )}
                <div style={{ textAlign: 'right' }}>
                  <button type="submit" className="btn btn-primary" disabled={emailSettingsLoading}>
                    {emailSettingsLoading ? 'Saving...' : 'Save Settings'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {activeTab === 'email-templates' && (
            <div className="email-templates-section">
              <div className="section-header">
                <h2>Email Templates</h2>
                <button className="btn btn-primary btn-small" onClick={handleAddTemplate} disabled={templateLoading}>
                  <Plus size={16} /> Add New Template
                </button>
              </div>
              {templateMessage && (
                <div className={`info-message ${templateMessageType}`} style={{ marginBottom: '1rem' }}>
                  {templateMessage}
                </div>
              )}
              {templateLoading ? (
                <p className="loading-message">Loading templates...</p>
              ) : emailTemplates.length > 0 ? (
                <div className="templates-list">
                  {emailTemplates.map(template => (
                    <div key={template.id} className="template-item">
                      <div className="template-info">
                        <FileText size={20} />
                        <div>
                          <p className="template-name">{template.name}</p>
                          <p className="template-subject">Subject: {template.subject}</p>
                          <p className="template-updated">Last Updated: {new Date(template.updated_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="template-actions">
                        <button className="action-btn view" onClick={() => handleEditTemplate(template)} title="Edit Template"><Edit size={16} /></button>
                        <button className="action-btn delete" onClick={() => handleDeleteTemplate(template.id)} title="Delete Template"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="no-templates">
                  <FileText size={48} />
                  <h3>No email templates found</h3>
                  <p>Create your first email template to manage here.</p>
                  <button className="btn btn-primary" onClick={handleAddTemplate}><Plus size={16} /> Add New Template</button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'test-sending' && (
            <div className="email-settings-section">
              <div className="section-header">
                <h2>Test Email Sending</h2>
              </div>
              <form className="settings-form" onSubmit={handleSendTestEmail}>
                <div className="form-group">
                  <label className="form-label">Recipient Email</label>
                  <div className="input-wrapper">
                    <Mail className="input-icon" />
                    <input
                      type="email"
                      name="test_recipient_email"
                      value={testEmailRecipient}
                      onChange={(e) => setTestEmailRecipient(e.target.value)}
                      className="form-input"
                      placeholder="Enter recipient email for test"
                      required
                      disabled={testEmailLoading}
                    />
                  </div>
                </div>
                {testEmailMessage && (
                  <div className={`info-message ${testEmailMessage.includes('Error') ? 'error' : 'success'}`}>
                    {testEmailMessage}
                  </div>
                )}
                <div style={{ textAlign: 'right' }}>
                  <button type="submit" className="btn btn-primary" disabled={testEmailLoading}>
                    {testEmailLoading ? 'Sending...' : 'Send Test Email'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </main>

      {showUserModal && <UserModal />}
      {showTemplateModal && <TemplateModal />}
    </div>
  );
};

export default SuperAdminDashboard;

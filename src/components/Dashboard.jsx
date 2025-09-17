import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Calendar, LogOut, User, Settings, Plus, ChevronLeft, ChevronRight, BarChart3, CalendarDays, Mail, Check, X, Clock, CheckSquare, Square, Flag, Star, Building2, Edit, Trash2, ChevronDown, Save, Eye, EyeOff, Bell, Moon, Sun, Shield, Key, Globe, Palette, Users, UserPlus, Crown, UserCheck, Search, LayoutDashboard, MapPin, Lock, DollarSign } from 'lucide-react'
import { supabase } from '../supabaseClient';
import './Dashboard.css'
import EventModal from './EventModal';

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

const parseTime = (timeStr) => {
  if (!timeStr) return { hours: 0, minutes: 0 };
  const isPM = timeStr.toUpperCase().includes('PM');
  const parts = timeStr.replace(/[APM ]/gi, '').split(':');
  let hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1] || 0, 10);

  if (isNaN(hours) || isNaN(minutes)) return { hours: 0, minutes: 0 };

  if (isPM && hours < 12) {
    hours += 12;
  }
  if (!isPM && hours === 12) {
    hours = 0;
  }
  return { hours, minutes };
};

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

const allCurrencyOptions = [
  { value: 'USD', label: 'USD - United States Dollar' },
  { value: 'EUR', label: 'EUR - Euro' },
  { value: 'GBP', label: 'GBP - British Pound' },
  { value: 'CAD', label: 'CAD - Canadian Dollar' },
  { value: 'AUD', label: 'AUD - Australian Dollar' },
  { value: 'JPY', label: 'JPY - Japanese Yen' },
  { value: 'CHF', label: 'CHF - Swiss Franc' },
  { value: 'CNY', label: 'CNY - Chinese Yuan' },
  { value: 'INR', label: 'INR - Indian Rupee' },
  { value: 'BRL', label: 'BRL - Brazilian Real' },
  { value: 'RUB', label: 'RUB - Russian Ruble' },
  { value: 'SGD', label: 'SGD - Singapore Dollar' },
  { value: 'HKD', label: 'HKD - Hong Kong Dollar' },
  { value: 'NZD', label: 'NZD - New Zealand Dollar' },
  { value: 'SEK', label: 'SEK - Swedish Krona' },
  { value: 'NOK', label: 'NOK - Norwegian Krone' },
  { value: 'DKK', label: 'DKK - Danish Krone' },
  { value: 'KRW', label: 'KRW - South Korean Won' },
  { value: 'MXN', label: 'MXN - Mexican Peso' },
  { value: 'ZAR', label: 'ZAR - South African Rand' },
  { value: 'AED', label: 'AED - UAE Dirham' },
  { value: 'SAR', label: 'SAR - Saudi Riyal' },
  { value: 'TRY', label: 'TRY - Turkish Lira' },
  { value: 'THB', label: 'THB - Thai Baht' },
  { value: 'IDR', label: 'IDR - Indonesian Rupiah' },
  { value: 'MYR', label: 'MYR - Malaysian Ringgit' },
  { value: 'PHP', label: 'PHP - Philippine Peso' },
  { value: 'PLN', label: 'PLN - Polish Zloty' },
  { value: 'HUF', label: 'HUF - Hungarian Forint' },
  { value: 'CZK', label: 'CZK - Czech Koruna' },
  { value: 'ILS', label: 'ILS - Israeli New Shekel' },
  { value: 'CLP', label: 'CLP - Chilean Peso' },
  { value: 'COP', label: 'COP - Colombian Peso' },
  { value: 'EGP', label: 'EGP - Egyptian Pound' },
  { value: 'PKR', label: 'PKR - Pakistani Rupee' },
  { value: 'BDT', label: 'BDT - Bangladeshi Taka' },
  { value: 'VND', label: 'VND - Vietnamese Dong' },
  { value: 'NGN', label: 'NGN - Nigerian Naira' },
  { value: 'KES', label: 'KES - Kenyan Shilling' },
  { value: 'GHS', label: 'GHS - Ghanaian Cedi' },
  { value: 'LKR', label: 'LKR - Sri Lankan Rupee' },
];

const topFavoriteCurrencyCodes = ['SGD', 'LKR', 'USD'];

const Dashboard = ({ user, onLogout, onUserUpdate }) => {
  const [events, setEvents] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);

  const updateLastActivity = async () => {
    if (user?.id) {
      const { error } = await supabase
        .from('profiles')
        .update({ last_activity_at: new Date().toISOString() })
        .eq('id', user.id);
      if (error) {
        // console.error("Dashboard: Error updating last_activity_at:", error.message);
      }
    }
  };

  useEffect(() => {
    if (user && user.id) {
      const { name, theme, language, timezone, notifications, privacy, currency } = user;
      supabase
        .from('profiles')
        .update({ name, theme, language, timezone, notifications, privacy, currency, last_activity_at: new Date().toISOString() })
        .eq('id', user.id)
        .then(({ error }) => {
          if (error) {
            // console.error("Dashboard: Error updating user profile in Supabase:", error.message);
          }
        });
    }
  }, [user]);

  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [activeTab, setActiveTab] = useState('overview')
  const [settingsActiveTab, setSettingsActiveTab] = useState('profile')
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false)
  const [showNotificationsDropdown, setShowNotificationsDropdown] = useState(false)
  const [showCompanyModal, setShowCompanyModal] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [showEventModal, setShowEventModal] = useState(false)
  const [editingCompany, setEditingCompany] = useState(null)
  const [companyForm, setCompanyForm] = useState({ name: '' })
  const [inviteForm, setInviteForm] = useState({
    email: '',
    role: 'user',
    companyId: null
  })
  const [profileForm, setProfileForm] = useState({
    name: user.name || '',
    email: user.email || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [settingsForm, setSettingsForm] = useState({
    theme: user.theme || 'light',
    language: user.language || 'en',
    timezone: user.timezone || 'UTC',
    currency: user.currency || 'USD',
    notifications: user.notifications || {
      email_daily: true,
      email_weekly: false,
      email_monthly: false,
      email_3day_countdown: false,
      push: true,
      reminders: true,
      invitations: true
    },
    privacy: user.privacy || {
      profileVisibility: 'team',
      calendarSharing: 'private'
    }
  })
  const [eventForm, setEventForm] = useState({
    title: '',
    date: new Date(),
    time: '',
    description: '',
    location: '',
    eventTasks: []
  })
  const [currentEventTaskForm, setCurrentEventTaskForm] = useState({
    id: null,
    title: '',
    description: '',
    assignedTo: '',
    completed: false,
    dueDate: '',
    expenses: ''
  });
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isDateModalOpen, setIsDateModalOpen] = useState(false);
  const [selectedDateForModal, setSelectedDateForModal] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [eventFilter, setEventFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [taskDueDateFilter, setTaskDueDateFilter] = useState('all');
  const [taskStatusFilter, setTaskStatusFilter] = useState('all');
  const [currentVisualTheme, setCurrentVisualTheme] = useState('light');
  const [editingEvent, setEditingEvent] = useState(null);

  const [showCurrencyDropdown, setShowCurrencyDropdown] = useState(false);
  const [currencySearchTerm, setCurrencySearchTerm] = useState('');
  const currencyDropdownRef = useRef(null);

  const [overviewStats, setOverviewStats] = useState({
    totalEvents: 0,
    completedTasks: 0,
    pendingTasks: 0,
    overdueTasks: 0,
    taskCompletionPercentage: 0,
    pendingTasksPercentage: 0,
    totalExpenses: 0,
  });

  // State for invitation message feedback
  const [inviteMessage, setInviteMessage] = useState('');
  const [inviteMessageType, setInviteMessageType] = useState(''); // 'success' or 'error'

  // NEW: State for invitations sub-tab
  const [invitationsActiveTab, setInvitationsActiveTab] = useState('received'); // 'received' or 'sent'

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (currencyDropdownRef.current && !currencyDropdownRef.current.contains(event.target)) {
        setShowCurrencyDropdown(false);
        setCurrencySearchTerm('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const determineVisualTheme = () => {
      if (settingsForm.theme === 'dark') {
        setCurrentVisualTheme('dark');
      } else if (settingsForm.theme === 'light') {
        setCurrentVisualTheme('light');
      } else {
        setCurrentVisualTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      }
    };
    determineVisualTheme();
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = () => {
      if (settingsForm.theme === 'system') {
        determineVisualTheme();
      }
    };
    mediaQuery.addEventListener('change', handleSystemThemeChange);
    return () => mediaQuery.removeEventListener('change', handleSystemThemeChange);
  }, [settingsForm.theme]);

  const currentCompany = user.companies?.find(company => company.id === user.currentCompanyId);

  const _fetchEvents = async () => {
    if (!user || !user.id || !currentCompany?.id) { // Check for currentCompany.id
      setEvents([]);
      return;
    }
    const { data, error } = await supabase
      .from('events')
      .select('*, notification_dismissed_at')
      .eq('user_id', user.id)
      .eq('company_id', currentCompany.id);
    if (error) {
      setEvents([]);
      return;
    }
    const fetchedEvents = data.map(event => {
      const [year, month, day] = event.date.split('-').map(Number);
      const localDate = new Date(year, month - 1, day);
      return {
        ...event,
        date: localDate,
        eventTasks: event.event_tasks || []
      };
    });
    setEvents(fetchedEvents);
  };

  const _fetchTasks = async () => {
    if (!user || !user.id || !currentCompany?.id) { // Check for currentCompany.id
      setTasks([]);
      return;
    }
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', user.id)
      .eq('company_id', currentCompany.id);
    if (error) {
      setTasks([]);
      return;
    }
    const fetchedTasks = data.map(task => {
      let localDate = null;
      if (task.due_date) {
        const [year, month, day] = task.due_date.split('-').map(Number);
        localDate = new Date(year, month - 1, day);
      }
      return {
        ...task,
        dueDate: localDate,
      };
    });
    setTasks(fetchedTasks);
  };

  const _fetchInvitations = async () => {
    if (!user || !user.email) {
      setInvitations([]);
      return;
    }
    const { data, error } = await supabase
      .from('invitations')
      .select('*, sender_email')
      .or(`recipient_email.eq.${user.email},sender_id.eq.${user.id}`);
    if (error) {
      // console.error("Dashboard: Error fetching invitations:", error.message);
    } else {
      setInvitations(data);
    }
  };

  useEffect(() => { _fetchEvents(); }, [user?.id, currentCompany?.id]);
  useEffect(() => { _fetchTasks(); }, [user?.id, currentCompany?.id]);
  useEffect(() => { _fetchInvitations(); }, [user?.id, user?.email]);

  const fetchTeamMembersForCompany = async (companyId) => {
    if (!companyId) {
      setTeamMembers([]);
      return;
    }
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, name, email, companies')
      .contains('companies', JSON.stringify([{ id: companyId }]));
    if (error) {
      setTeamMembers([]);
      return;
    }
    const membersWithRoles = profiles.map(profile => {
      const companyEntry = profile.companies?.find(c => c.id === companyId);
      return {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        role: companyEntry?.role || 'user',
      };
    });
    setTeamMembers(membersWithRoles);
  };

  useEffect(() => {
    fetchTeamMembersForCompany(currentCompany?.id);
  }, [currentCompany?.id, user.companies]);

  const notificationBellRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notificationBellRef.current && !notificationBellRef.current.contains(event.target)) {
        setShowNotificationsDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleTaskCompletion = async (taskId, isEventTask, parentEventId) => {
    if (!currentCompany?.id) { // Added check
      alert('Please select or create a company first.');
      return;
    }
    if (isEventTask && parentEventId) {
      const eventToUpdate = events.find(event => event.id === parentEventId);
      if (!eventToUpdate) return;
      const updatedEventTasks = eventToUpdate.eventTasks.map(task =>
        task.id === taskId ? { ...task, completed: !task.completed } : task
      );
      const { error } = await supabase
        .from('events')
        .update({ event_tasks: updatedEventTasks, last_activity_at: new Date().toISOString() })
        .eq('id', parentEventId);
      if (error) {
        alert("Failed to update event task status: " + error.message);
      } else {
        setEvents(prev => prev.map(event =>
          event.id === parentEventId ? { ...event, eventTasks: updatedEventTasks } : event
        ));
        updateLastActivity();
      }
    } else {
      const taskToUpdate = tasks.find(task => task.id === taskId);
      if (!taskToUpdate) return;
      const newCompletionStatus = !taskToUpdate.completed;
      const { error } = await supabase
        .from('tasks')
        .update({ completed: newCompletionStatus, last_activity_at: new Date().toISOString() })
        .eq('id', taskId);
      if (error) {
        alert("Failed to update task status: " + error.message);
      } else {
        setTasks(prev => prev.map(task =>
          task.id === taskId ? { ...task, completed: newCompletionStatus } : task
        ));
        updateLastActivity();
      }
    }
  };

  const handleInvitationResponse = async (invitationId, response) => {
    const { error: updateError } = await supabase
      .from('invitations')
      .update({ status: response })
      .eq('id', invitationId);
    if (updateError) {
      alert("Failed to update invitation status: " + updateError.message);
      return;
    }
    if (response === 'accepted') {
      const invitation = invitations.find(inv => inv.id === invitationId);
      if (invitation && user) {
        const newCompany = {
          id: invitation.company_id,
          name: invitation.company_name,
          role: invitation.role,
          createdAt: new Date().toISOString()
        };
        let updatedCompanies = [...(user.companies || [])];
        if (!updatedCompanies.some(c => c.id === newCompany.id)) {
          updatedCompanies.push(newCompany);
        }
        const updatedUser = {
          ...user,
          companies: updatedCompanies,
          currentCompanyId: user.currentCompanyId || newCompany.id
        };
        await onUserUpdate(updatedUser);
      }
    }
    await _fetchInvitations();
    updateLastActivity();
  }

  const handleAddCompany = () => {
    setEditingCompany(null);
    setCompanyForm({ name: '' });
    setShowCompanyModal(true);
  }

  const handleEditCompany = (company) => {
    setEditingCompany(company);
    setCompanyForm({ name: company.name });
    setShowCompanyModal(true);
  }

  const handleDeleteCompany = (companyId) => {
    if (!window.confirm('Are you sure you want to delete this company?')) return;
    const updatedCompanies = user.companies.filter(company => company.id !== companyId);
    let newCurrentCompanyId = user.currentCompanyId;
    if (newCurrentCompanyId === companyId) {
      newCurrentCompanyId = updatedCompanies.length > 0 ? updatedCompanies[0].id : null;
    }
    const updatedUser = { ...user, companies: updatedCompanies, currentCompanyId: newCurrentCompanyId };
    onUserUpdate(updatedUser);
    updateLastActivity();
  }

  const handleCompanyFormSubmit = (e) => {
    e.preventDefault();
    if (!companyForm.name.trim()) return;
    let updatedCompanies = [...(user.companies || [])];
    let newCurrentCompanyId = user.currentCompanyId;
    if (editingCompany) {
      updatedCompanies = updatedCompanies.map(c => c.id === editingCompany.id ? { ...c, name: companyForm.name } : c);
    } else {
      const newCompany = {
        id: crypto.randomUUID(),
        name: companyForm.name,
        role: 'owner',
        createdAt: new Date().toISOString()
      };
      updatedCompanies.push(newCompany);
      if (!newCurrentCompanyId) newCurrentCompanyId = newCompany.id;
    }
    onUserUpdate({ ...user, companies: updatedCompanies, currentCompanyId: newCurrentCompanyId });
    setShowCompanyModal(false);
    updateLastActivity();
  }

  const handleInviteFormSubmit = async (e) => {
    e.preventDefault();
    if (!inviteForm.email.trim() || !inviteForm.companyId || !user) return;
    const companyToInviteTo = user.companies.find(c => c.id === inviteForm.companyId);
    if (!companyToInviteTo) return;

    // Clear previous messages
    setInviteMessage('');
    setInviteMessageType('');

    const invitationPayload = {
      sender_id: user.id,
      sender_email: user.email,
      recipient_email: inviteForm.email.toLowerCase(),
      company_id: inviteForm.companyId,
      company_name: companyToInviteTo.name,
      role: inviteForm.role,
    };

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      const response = await fetch(`${backendUrl}/api/send-invitation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(invitationPayload),
      });

      const result = await response.json();

      if (response.ok || response.status === 202) {
        setInviteMessage(result.message || 'Invitation sent successfully!');
        setInviteMessageType('success');
        await _fetchInvitations();
        setInviteForm({ email: '', role: 'user', companyId: null }); // Clear form inputs
      } else {
        setInviteMessage(result.message || 'Failed to send invitation.');
        setInviteMessageType('error');
      }
    } catch (error) {
      setInviteMessage(`An unexpected error occurred: ${error.message}`);
      setInviteMessageType('error');
    } finally {
      updateLastActivity();
    }
  };

  const handleEventFormSubmit = async (e) => {
    e.preventDefault();
    if (!currentCompany?.id) { // Added check
      alert('Please select or create a company first to add events.');
      return;
    }
    if (!eventForm.title.trim() || !eventForm.date) {
      alert('Event Title and Date are required.');
      return;
    }
    const eventPayload = {
      title: eventForm.title,
      date: formatDateToYYYYMMDD(eventForm.date),
      time: eventForm.time || null,
      description: eventForm.description || null,
      location: eventForm.location || null,
      event_tasks: eventForm.eventTasks || [],
      user_id: user.id,
      company_id: currentCompany.id, // Ensure company_id is always from currentCompany
    };
    if (editingEvent) {
      const { data, error } = await supabase.from('events').update(eventPayload).eq('id', editingEvent.id).select().single();
      if (error) {
        alert("Failed to update event: " + error.message);
      } else {
        const [y, m, d] = data.date.split('-').map(Number);
        const localDate = new Date(y, m - 1, d);
        setEvents(prev => prev.map(event => event.id === editingEvent.id ? { ...data, date: localDate, eventTasks: data.event_tasks || [] } : event));
      }
    } else {
      const { data, error } = await supabase.from('events').insert(eventPayload).select().single();
      if (error) {
        alert("Failed to add event: " + error.message);
      } else {
        const [y, m, d] = data.date.split('-').map(Number);
        const localDate = new Date(y, m - 1, d);
        setEvents(prev => [...prev, { ...data, date: localDate, eventTasks: data.event_tasks || [] }]);
      }
    }
    setShowEventModal(false);
    setEventForm({ title: '', date: new Date(), time: '', description: '', location: '', eventTasks: [] });
    updateLastActivity();
  }

  const handleProfileFormSubmit = async (e) => {
    e.preventDefault();
    const { error } = await supabase
      .from('profiles')
      .update({ name: profileForm.name, email: profileForm.email, last_activity_at: new Date().toISOString() })
      .eq('id', user.id);
    if (error) {
      alert("Failed to update profile: " + error.message);
    } else {
      onUserUpdate({ ...user, name: profileForm.name, email: profileForm.email });
      alert("Profile updated successfully!");
    }
  }

  const handleChangePasswordClick = () => {
    alert("Password change functionality is not yet fully implemented.");
    setProfileForm(prev => ({ ...prev, currentPassword: '', newPassword: '', confirmPassword: '' }));
    updateLastActivity();
  };

  const handleSettingsFormSubmit = async (e) => {
    e.preventDefault();
    const { error } = await supabase
      .from('profiles')
      .update({ ...settingsForm, last_activity_at: new Date().toISOString() })
      .eq('id', user.id);
    if (error) {
      alert("Failed to update settings: " + error.message);
    } else {
      onUserUpdate({ ...user, ...settingsForm });
      alert("Settings updated successfully!");
    }
  }

  const handleThemeToggle = async () => {
    const newTheme = currentVisualTheme === 'light' ? 'dark' : 'light';
    setSettingsForm(prev => ({ ...prev, theme: newTheme }));
    const { error } = await supabase
      .from('profiles')
      .update({ theme: newTheme, last_activity_at: new Date().toISOString() })
      .eq('id', user.id);
    if (!error) {
      onUserUpdate({ ...user, theme: newTheme });
    }
  };

  const handleAddEvent = (dateToPreselect = null) => {
    if (!currentCompany?.id) { // Added check
      alert('Please select or create a company first to add events.');
      return;
    }
    setEditingEvent(null);
    setEventForm({ title: '', date: dateToPreselect || selectedDate, time: '17:00', description: '', location: '', eventTasks: [] });
    setCurrentEventTaskForm({ id: null, title: '', description: '', assignedTo: user.email, completed: false, dueDate: '', expenses: '' });
    setShowEventModal(true);
    updateLastActivity();
  }

  const handleAddEventFromModal = (dateToPreselect) => {
    setIsDateModalOpen(false);
    handleAddEvent(dateToPreselect);
  };

  const handleEditEvent = (event) => {
    if (!currentCompany?.id) { // Added check
      alert('Please select or create a company first to edit events.');
      return;
    }
    setEditingEvent(event);
    setEventForm({ ...event, eventTasks: event.eventTasks || [] });
    setCurrentEventTaskForm({ id: null, title: '', description: '', assignedTo: user.email, completed: false, dueDate: '', expenses: '' });
    setShowEventModal(true);
    updateLastActivity();
  }

  const handleDeleteEvent = async (eventId) => {
    if (!currentCompany?.id) { // Added check
      alert('Please select or create a company first to delete events.');
      return;
    }
    if (!window.confirm('Are you sure you want to delete this event?')) return;
    const { error } = await supabase.from('events').delete().eq('id', eventId);
    if (error) {
      alert("Failed to delete event: " + error.message);
    } else {
      setEvents(prev => prev.filter(event => event.id !== eventId));
      updateLastActivity();
    }
  }

  const handleDateClick = (date) => {
    if (date) {
      setSelectedDate(date);
      setSelectedDateForModal(date);
      setIsDateModalOpen(true);
      updateLastActivity();
    }
  }

  const navigateMonth = (direction) => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(newDate.getMonth() + direction);
      return newDate;
    });
    updateLastActivity();
  }

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const days = Array(firstDayOfMonth).fill(null);
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    return days;
  };

  const isToday = (date) => {
    if (!date) return false;
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isSelected = (date) => {
    if (!date || !selectedDate) return false;
    return date.toDateString() === selectedDate.toDateString();
  };

  const isTaskOverdue = (task) => {
    if (task.completed || !task.dueDate) return false;
    if (task.notification_dismissed_at) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const taskDueDate = new Date(task.dueDate);
    taskDueDate.setHours(0, 0, 0, 0);
    return taskDueDate < today;
  };

  const getCalendarItemsForDate = (date) => {
    if (!date) return [];
    const targetDateString = date.toDateString();
    const items = [];
    events.filter(event => event.date.toDateString() === targetDateString)
      .forEach(event => items.push({ type: 'event', ...event }));
    tasks.filter(task => task.dueDate && task.dueDate.toDateString() === targetDateString)
      .forEach(task => items.push({ type: 'task', ...task, isOverdue: isTaskOverdue(task) }));
    return items.sort((a, b) => {
      if (a.type === 'event' && b.type === 'task') return -1;
      if (a.type === 'task' && b.type === 'event') return 1;
      if (a.type === 'event') {
        const timeA = parseTime(a.time);
        const timeB = parseTime(b.time);
        return timeA.hours - timeB.hours || timeA.minutes - timeB.minutes;
      } else if (a.type === 'task') {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        const priorityOrder = { 'high': 1, 'medium': 2, 'low': 3 };
        if (priorityOrder[a.priority] !== priorityOrder[b.priority]) return priorityOrder[a.priority] - priorityOrder[b.priority];
        if (!a.dueDate && !b.dueDate) return 0;
        if (!b.dueDate) return -1;
        return a.dueDate.getTime() - b.dueDate.getTime();
      }
      return 0;
    });
  };

  const hasCalendarItem = (date) => {
    if (!date) return false;
    return getCalendarItemsForDate(date).length > 0;
  };

  const getCalendarItemCountForDate = (date) => {
    if (!date) return 0;
    return getCalendarItemsForDate(date).length;
  };

  const getFilteredUpcomingEvents = (filter) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (filter === 'all') {
      return events
        .filter(event => new Date(event.date) >= today)
        .sort((a, b) => a.date.getTime() - b.date.getTime());
    }
    let startDate = null;
    let endDate = null;
    if (filter === 'week') {
      startDate = new Date(today);
      startDate.setDate(today.getDate() - today.getDay());
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
    } else if (filter === 'month') {
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      endDate.setHours(23, 59, 59, 999);
    } else if (filter === 'nextMonth') {
      startDate = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(today.getFullYear(), today.getMonth() + 2, 0);
      endDate.setHours(23, 59, 59, 999);
    } else if (filter === 'lastMonth') {
      startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(today.getFullYear(), today.getMonth(), 0);
      endDate.setHours(23, 59, 59, 999);
    } else if (filter === 'lastYear') {
      const lastYear = today.getFullYear() - 1;
      startDate = new Date(lastYear, 0, 1);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(lastYear, 11, 31);
      endDate.setHours(23, 59, 59, 999);
    }
    if (startDate && endDate) {
      return events
        .filter(event => {
          const eventDate = new Date(event.date);
          return eventDate >= startDate && eventDate <= endDate;
        })
        .sort((a, b) => a.date.getTime() - b.date.getTime());
    }
    return events
      .filter(event => new Date(event.date) >= today)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  };

  const getTasksInDateRange = (allTasks, startDate, endDate) => {
    if (!startDate && !endDate) return allTasks;
    return allTasks.filter(task => {
      if (!task.dueDate) return false;
      const taskDueDate = new Date(task.dueDate);
      taskDueDate.setHours(0, 0, 0, 0);
      const start = startDate ? new Date(startDate) : null;
      if (start) start.setHours(0, 0, 0, 0);
      const end = endDate ? new Date(endDate) : null;
      if (end) end.setHours(23, 59, 59, 999);
      return (!start || taskDueDate >= start) && (!end || taskDueDate <= end);
    });
  };

  useEffect(() => {
    const calculateOverviewStats = () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      let startDate = null;
      let endDate = null;
      if (eventFilter === 'week') {
        startDate = new Date(today);
        startDate.setDate(today.getDate() - today.getDay());
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        endDate.setHours(23, 59, 59, 999);
      } else if (eventFilter === 'month') {
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        endDate.setHours(23, 59, 59, 999);
      } else if (eventFilter === 'nextMonth') {
        startDate = new Date(today.getFullYear(), today.getMonth() + 1, 1);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(today.getFullYear(), today.getMonth() + 2, 0);
        endDate.setHours(23, 59, 59, 999);
      } else if (eventFilter === 'lastMonth') {
        startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(today.getFullYear(), today.getMonth(), 0);
        endDate.setHours(23, 59, 59, 999);
      } else if (eventFilter === 'lastYear') {
        const lastYear = today.getFullYear() - 1;
        startDate = new Date(lastYear, 0, 1);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(lastYear, 11, 31);
        endDate.setHours(23, 59, 59, 999);
      }
      const filteredEventsForStats = getFilteredUpcomingEvents(eventFilter);
      let allRelevantTasks = [];
      if (eventFilter === 'all') {
        const upcomingGeneralTasks = tasks.filter(t => t.dueDate && new Date(t.dueDate) >= today);
        const upcomingEventTasks = events
          .filter(e => new Date(e.date) >= today)
          .flatMap(e => (e.eventTasks || []).map(t => ({ ...t, dueDate: t.dueDate ? new Date(t.dueDate) : null })))
          .filter(t => t.dueDate && t.dueDate >= today);
        allRelevantTasks = [...upcomingGeneralTasks, ...upcomingEventTasks];
      } else {
        const filteredGeneralTasks = getTasksInDateRange(tasks, startDate, endDate);
        const allEventTasks = events.flatMap(event =>
          (event.eventTasks || []).map(task => ({
            ...task,
            dueDate: task.dueDate ? new Date(task.dueDate) : null
          }))
        );
        const filteredEventTasks = getTasksInDateRange(allEventTasks, startDate, endDate);
        allRelevantTasks = [...filteredGeneralTasks, ...filteredEventTasks];
      }
      const completedTasksCount = allRelevantTasks.filter(t => t.completed).length;
      const pendingTasks = allRelevantTasks.filter(t => !t.completed);
      const overdueTasksCount = pendingTasks.filter(t => isTaskOverdue(t)).length;
      const pendingTasksCount = pendingTasks.length - overdueTasksCount;
      const totalTasksCount = allRelevantTasks.length;
      const taskCompletionPercentage = totalTasksCount > 0
        ? Math.round((completedTasksCount / totalTasksCount) * 100)
        : 0;
      const pendingTasksPercentage = totalTasksCount > 0
        ? Math.round((pendingTasksCount / totalTasksCount) * 100)
        : 0;
      const totalExpenses = allRelevantTasks.reduce((sum, task) => sum + (Number(task.expenses) || 0), 0);
      setOverviewStats({
        totalEvents: filteredEventsForStats.length,
        completedTasks: completedTasksCount,
        pendingTasks: pendingTasksCount,
        overdueTasks: overdueTasksCount,
        taskCompletionPercentage: taskCompletionPercentage,
        pendingTasksPercentage: pendingTasksPercentage,
        totalExpenses: totalExpenses,
      });
    };
    calculateOverviewStats();
  }, [events, tasks, eventFilter]);

  const allTasks = useMemo(() => {
    const generalTasks = tasks.map(t => ({
      ...t,
      type: 'general',
      parentEvent: null
    }));
    const eventTasks = events.flatMap(event =>
      (event.eventTasks || []).map(task => {
        let localDate = null;
        if (task.dueDate) {
          const [year, month, day] = task.dueDate.split('-').map(Number);
          localDate = new Date(year, month - 1, day);
        }
        return {
          ...task,
          dueDate: localDate,
          type: 'event',
          parentEvent: { id: event.id, title: event.title }
        };
      })
    );
    return [...generalTasks, ...eventTasks];
  }, [tasks, events]);

  const getFilteredAndCategorizedTasks = (tasksToFilter, dueDateFilter, statusFilter) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let filtered = [...tasksToFilter];
    if (dueDateFilter === 'today') {
      filtered = filtered.filter(task => {
        if (!task.dueDate) return false;
        const taskDate = new Date(task.dueDate);
        taskDate.setHours(0, 0, 0, 0);
        return taskDate.getTime() === today.getTime();
      });
    } else if (dueDateFilter === 'week') {
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);
      filtered = filtered.filter(task => task.dueDate && task.dueDate >= startOfWeek && task.dueDate <= endOfWeek);
    } else if (dueDateFilter === 'month') {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      startOfMonth.setHours(0, 0, 0, 0);
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      endOfMonth.setHours(23, 59, 59, 999);
      filtered = filtered.filter(task => task.dueDate && task.dueDate >= startOfMonth && task.dueDate <= endOfMonth);
    } else if (dueDateFilter === 'nextMonth') {
      const startOfNextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      startOfNextMonth.setHours(0, 0, 0, 0);
      const endOfNextMonth = new Date(today.getFullYear(), today.getMonth() + 2, 0);
      endOfNextMonth.setHours(23, 59, 59, 999);
      filtered = filtered.filter(task => task.dueDate && task.dueDate >= startOfNextMonth && task.dueDate <= endOfNextMonth);
    } else if (dueDateFilter === 'lastMonth') {
      const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      startOfLastMonth.setHours(0, 0, 0, 0);
      const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
      endOfLastMonth.setHours(23, 59, 59, 999);
      filtered = filtered.filter(task => task.dueDate && task.dueDate >= startOfLastMonth && task.dueDate <= endOfLastMonth);
    } else if (dueDateFilter === 'lastYear') {
      const lastYear = today.getFullYear() - 1;
      const startOfLastYear = new Date(lastYear, 0, 1);
      startOfLastYear.setHours(0, 0, 0, 0);
      const endOfLastYear = new Date(lastYear, 11, 31);
      endOfLastYear.setHours(23, 59, 59, 999);
      filtered = filtered.filter(task => task.dueDate && task.dueDate >= startOfLastYear && task.dueDate <= endOfLastYear);
    } else if (dueDateFilter === 'later') {
      const endOfNextMonth = new Date(today.getFullYear(), today.getMonth() + 2, 0);
      endOfNextMonth.setHours(23, 59, 59, 999);
      filtered = filtered.filter(task => !task.dueDate || task.dueDate > endOfNextMonth);
    }
    if (statusFilter === 'completed') {
      filtered = filtered.filter(task => task.completed);
    } else if (statusFilter === 'pending') {
      filtered = filtered.filter(task => !task.completed && !isTaskOverdue(task));
    } else if (statusFilter === 'overdue') {
      filtered = filtered.filter(task => isTaskOverdue(task));
    }
    const categories = filtered.reduce((acc, task) => {
      const categoryName = task.type === 'event' ? `Event: ${task.parentEvent.title}` : 'General Tasks';
      if (!acc[categoryName]) {
        acc[categoryName] = [];
      }
      acc[categoryName].push(task);
      return acc;
    }, {});
    return Object.entries(categories).map(([category, tasks]) => ({
      category,
      tasks: tasks.sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.getTime() - b.dueDate.getTime();
      })
    }));
  };

  const performSearch = (term) => {
    const lowerCaseTerm = term.toLowerCase();
    const results = {
      events: [],
      tasks: []
    };
    if (!lowerCaseTerm) return results;
    results.events = events.filter(event =>
      event.title.toLowerCase().includes(lowerCaseTerm) ||
      event.description?.toLowerCase().includes(lowerCaseTerm) ||
      event.location?.toLowerCase().includes(lowerCaseTerm) ||
      event.eventTasks.some(task => task.title.toLowerCase().includes(lowerCaseTerm) || task.description?.toLowerCase().includes(lowerCaseTerm))
    );
    results.tasks = tasks.filter(task =>
      task.title.toLowerCase().includes(lowerCaseTerm) ||
      task.description?.toLowerCase().includes(lowerCaseTerm) ||
      task.category?.toLowerCase().includes(lowerCaseTerm)
    );
    return results;
  };

  const searchResults = performSearch(searchTerm);

  const handleAddEventTask = () => {
    if (!currentCompany?.id) { // Added check
      alert('Please select or create a company first to add tasks to events.');
      return;
    }
    if (!currentEventTaskForm.title.trim()) {
      alert("Task title cannot be empty.");
      return;
    }
    if (!currentEventTaskForm.dueDate) {
      alert("Due Date is mandatory for event tasks.");
      return;
    }
    const newEventTask = {
      id: currentEventTaskForm.id || Date.now(),
      title: currentEventTaskForm.title,
      description: currentEventTaskForm.description || null,
      assignedTo: currentEventTaskForm.assignedTo || user.email,
      completed: currentEventTaskForm.completed,
      dueDate: currentEventTaskForm.dueDate || null,
      priority: currentEventTaskForm.priority || 'medium',
      expenses: currentEventTaskForm.expenses ? parseFloat(currentEventTaskForm.expenses) : null
    };
    setEventForm(prev => {
      const existingTaskIndex = prev.eventTasks.findIndex(task => task.id === newEventTask.id);
      if (existingTaskIndex > -1) {
        const updatedTasks = [...prev.eventTasks];
        updatedTasks[existingTaskIndex] = newEventTask;
        return { ...prev, eventTasks: updatedTasks };
      } else {
        return { ...prev, eventTasks: [...prev.eventTasks, newEventTask] };
      }
    });
    setCurrentEventTaskForm({ id: null, title: '', description: '', assignedTo: user.email, completed: false, dueDate: '', expenses: '' });
  };

  const handleEditEventTask = (task) => {
    setCurrentEventTaskForm({
      id: task.id,
      title: task.title,
      description: task.description || '',
      assignedTo: task.assignedTo,
      completed: task.completed,
      dueDate: task.dueDate ? formatDateToYYYYMMDD(new Date(task.dueDate)) : '',
      priority: task.priority,
      expenses: task.expenses || ''
    });
  };

  const handleDeleteEventTask = (taskId) => {
    setEventForm(prev => ({
      ...prev,
      eventTasks: prev.eventTasks.filter(task => task.id !== taskId)
    }));
  };

  const handleToggleEventTaskCompletion = (taskId) => {
    setEventForm(prev => ({
      ...prev,
      eventTasks: prev.eventTasks.map(task =>
        task.id === taskId ? { ...task, completed: !task.completed } : task
      )
    }));
  };

  const handleAddGeneralTask = async () => {
    if (!currentCompany?.id) { // Added check
      alert('Please select or create a company first to add general tasks.');
      return;
    }
    if (!currentEventTaskForm.title.trim()) {
      alert("Task title cannot be empty.");
      return;
    }
    const newTaskPayload = {
      title: currentEventTaskForm.title,
      description: currentEventTaskForm.description || null,
      due_date: currentEventTaskForm.dueDate || null,
      priority: currentEventTaskForm.priority || 'medium',
      category: currentEventTaskForm.category || null,
      completed: false,
      user_id: user.id,
      company_id: currentCompany.id, // Ensure company_id is always from currentCompany
      expenses: currentEventTaskForm.expenses ? parseFloat(currentEventTaskForm.expenses) : null
    };
    const { data, error } = await supabase
      .from('tasks')
      .insert(newTaskPayload)
      .select()
      .single();
    if (error) {
      alert("Failed to add task: " + error.message);
    } else {
      let dueDate = null;
      if (data.due_date) {
        const [year, month, day] = data.due_date.split('-').map(Number);
        dueDate = new Date(year, month - 1, day);
      }
      const newTask = { ...data, dueDate };
      setTasks(prev => [...prev, newTask]);
      setCurrentEventTaskForm({ id: null, title: '', description: '', assignedTo: user.email, completed: false, dueDate: '', expenses: '' });
      updateLastActivity();
    }
  };

  const handleEditGeneralTask = async (taskId) => {
    if (!currentCompany?.id) { // Added check
      alert('Please select or create a company first to edit tasks.');
      return;
    }
    const taskToEdit = tasks.find(task => task.id === taskId);
    if (!taskToEdit) return;
    setCurrentEventTaskForm({
      id: taskToEdit.id,
      title: taskToEdit.title,
      description: taskToEdit.description || '',
      dueDate: taskToEdit.dueDate ? formatDateToYYYYMMDD(taskToEdit.dueDate) : '',
      priority: taskToEdit.priority,
      category: taskToEdit.category || '',
      completed: taskToEdit.completed,
      expenses: taskToEdit.expenses || ''
    });
  };

  const handleSaveGeneralTask = async () => {
    if (!currentCompany?.id) { // Added check
      alert('Please select or create a company first to save tasks.');
      return;
    }
    if (!currentEventTaskForm.title.trim()) {
      alert("Task title cannot be empty.");
      return;
    }
    const updatedTaskPayload = {
      title: currentEventTaskForm.title,
      description: currentEventTaskForm.description || null,
      due_date: currentEventTaskForm.dueDate || null,
      priority: currentEventTaskForm.priority || 'medium',
      category: currentEventTaskForm.category || null,
      completed: currentEventTaskForm.completed,
      last_activity_at: new Date().toISOString(),
      expenses: currentEventTaskForm.expenses ? parseFloat(currentEventTaskForm.expenses) : null
    };
    const { data, error } = await supabase
      .from('tasks')
      .update(updatedTaskPayload)
      .eq('id', currentEventTaskForm.id)
      .select()
      .single();
    if (error) {
      alert("Failed to update task: " + error.message);
    } else {
      let dueDate = null;
      if (data.due_date) {
        const [year, month, day] = data.due_date.split('-').map(Number);
        dueDate = new Date(year, month - 1, day);
      }
      const updatedTask = { ...data, dueDate };
      setTasks(prev => prev.map(task =>
        task.id === data.id ? updatedTask : task
      ));
      setCurrentEventTaskForm({ id: null, title: '', description: '', assignedTo: user.email, completed: false, dueDate: '', expenses: '' });
      updateLastActivity();
    }
  };

  const handleDeleteGeneralTask = async (taskId) => {
    if (!currentCompany?.id) { // Added check
      alert('Please select or create a company first to delete tasks.');
      return;
    }
    if (!window.confirm('Are you sure you want to delete this task? This action cannot be undone.')) {
      return;
    }
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', taskId);
    if (error) {
      alert("Failed to delete task: " + error.message);
    } else {
      setTasks(prev => prev.filter(task => task.id !== taskId));
      updateLastActivity();
    }
  };

  const handleUpdateMemberRole = async (memberId, newRole, companyId) => {
    alert('Changing member roles requires a secure admin API and cannot be performed from the browser. Please configure a backend admin endpoint to handle this action.');
  };

  const handleRemoveMember = async (memberId, companyId) => {
    alert('Removing members requires a secure admin API and cannot be performed from the browser. Please configure a backend admin endpoint to handle this action.');
  };

  const getFilteredCurrencyOptions = (searchTerm) => {
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    const favorites = [];
    const nonFavorites = [];
    allCurrencyOptions.forEach(option => {
      if (topFavoriteCurrencyCodes.includes(option.value)) {
        favorites.push(option);
      } else {
        nonFavorites.push(option);
      }
    });
    const sortedFavorites = topFavoriteCurrencyCodes
      .map(code => favorites.find(fav => fav.value === code))
      .filter(Boolean);
    const filteredFavorites = sortedFavorites.filter(option =>
      option.label.toLowerCase().includes(lowerCaseSearchTerm)
    );
    const filteredNonFavorites = nonFavorites.filter(option =>
      option.label.toLowerCase().includes(lowerCaseSearchTerm)
    );
    return { filteredFavorites, filteredNonFavorites };
  };

  const { filteredFavorites, filteredNonFavorites } = getFilteredCurrencyOptions(currencySearchTerm);

  const daysInMonth = getDaysInMonth(currentDate);
  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const pendingInvitationsCount = invitations.filter(inv => inv.status === 'pending' && inv.recipient_email === user.email).length;
  const overdueTasksCount = tasks.filter(task => isTaskOverdue(task)).length;

  const upcomingEventsToday = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const filtered = events.filter(event => {
      const isEventToday = event.date.toDateString() === today.toDateString();
      const isNotDismissed = !event.notification_dismissed_at;
      return isEventToday && isNotDismissed;
    })
      .sort((a, b) => {
        const timeA = parseTime(a.time);
        const timeB = parseTime(b.time);
        return timeA.hours - timeB.hours || timeA.minutes - timeB.minutes;
      });
    return filtered;
  }, [events]);

  const upcomingEventsTodayCount = upcomingEventsToday.length;

  const totalNotifications = pendingInvitationsCount + overdueTasksCount + upcomingEventsTodayCount;

  const taskTabStats = useMemo(() => {
    const total = allTasks.length;
    const completed = allTasks.filter(t => t.completed).length;
    const pending = allTasks.filter(t => !t.completed && !isTaskOverdue(t)).length;
    const overdue = allTasks.filter(t => isTaskOverdue(t)).length;
    const completedPercentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    const pendingPercentage = total > 0 ? Math.round((pending / total) * 100) : 0;
    return {
      total,
      completed,
      pending,
      overdue,
      completedPercentage,
      pendingPercentage,
    };
  }, [allTasks]);

  const receivedInvitations = useMemo(() =>
    invitations.filter(inv => inv.recipient_email === user.email),
    [invitations, user.email]
  );

  const sentInvitations = useMemo(() =>
    invitations.filter(inv => inv.sender_id === user.id),
    [invitations, user.id]
  );

  const invitationStats = useMemo(() => {
    const source = invitationsActiveTab === 'received' ? receivedInvitations : sentInvitations;
    return {
      total: source.length,
      pending: source.filter(inv => inv.status === 'pending').length,
      accepted: source.filter(inv => inv.status === 'accepted').length,
      declined: source.filter(inv => inv.status === 'declined').length,
    };
  }, [invitationsActiveTab, receivedInvitations, sentInvitations]);

  const handleMarkAllAsRead = async () => {
    const now = new Date().toISOString();
    const pendingInvitesToDismiss = invitations.filter(inv => inv.status === 'pending' && inv.recipient_email === user.email);
    if (pendingInvitesToDismiss.length > 0) {
      const { error: inviteError } = await supabase
        .from('invitations')
        .update({ status: 'dismissed' })
        .in('id', pendingInvitesToDismiss.map(inv => inv.id));
      if (inviteError) {
        console.error("Failed to dismiss invitations:", inviteError.message);
      }
    }
    const overdueTasksToDismiss = tasks.filter(task => isTaskOverdue(task) && !task.notification_dismissed_at);
    if (overdueTasksToDismiss.length > 0) {
      const { error: taskError } = await supabase
        .from('tasks')
        .update({ notification_dismissed_at: now })
        .in('id', overdueTasksToDismiss.map(task => task.id));
      if (taskError) {
        console.error("Failed to dismiss task notifications:", taskError.message);
      }
    }
    const upcomingEventsToDismiss = upcomingEventsToday.filter(event => !event.notification_dismissed_at);
    if (upcomingEventsToDismiss.length > 0) {
      const { error: eventError } = await supabase
        .from('events')
        .update({ notification_dismissed_at: now })
        .in('id', upcomingEventsToDismiss.map(event => event.id));
      if (eventError) {
        console.error("Failed to dismiss event notifications:", eventError.message);
      }
    }
    await _fetchInvitations();
    await _fetchTasks();
    await _fetchEvents();
    setShowNotificationsDropdown(false);
    updateLastActivity();
  };

  return (
    <div className={`dashboard ${currentVisualTheme}-mode ${activeTab === 'calendar' ? 'calendar-active' : ''}`}>
      <header className="dashboard-header">
        <div className="container dashboard-nav">
          <div className="nav-items">
            <div className="logo">
              <Calendar className="logo-icon" />
              <span className="logo-text">DayClap</span>
            </div>
            <div className="search-bar">
              <Search className="search-icon" />
              <input
                type="text"
                placeholder="Search events, tasks, people..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
              {searchTerm && (
                <button className="clear-search-btn" onClick={() => setSearchTerm('')}>
                  <X size={16} />
                </button>
              )}
            </div>
          </div>

          <div className="nav-items">
            <div className="user-info">
              {/* Removed the User profile icon as requested */}
              <div className="user-details">
                <span className="user-name">{user.name || user.email}</span>
                <div className="company-selector">
                  <button className="company-btn" onClick={() => setShowCompanyDropdown(!showCompanyDropdown)}>
                    <Building2 size={16} />
                    <span>{currentCompany ? currentCompany.name : 'No Company'}</span>
                    <ChevronDown size={16} />
                  </button>
                  {showCompanyDropdown && (
                    <div className="company-dropdown">
                      {user.companies && user.companies.length > 0 ? (
                        user.companies.map(company => (
                          <button
                            key={company.id}
                            className={`company-option ${user.currentCompanyId === company.id ? 'active' : ''}`}
                            onClick={() => {
                              onUserUpdate({ ...user, currentCompanyId: company.id });
                              setShowCompanyDropdown(false);
                            }}
                          >
                            <Building2 size={16} />
                            <span>{company.name}</span>
                            {user.currentCompanyId === company.id && <Check size={16} />}
                          </button>
                        ))
                      ) : (
                        <p className="no-companies-message" style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No companies yet.</p>
                      )}
                      <div className="company-divider"></div>
                      <button className="company-option add-company" onClick={() => { handleAddCompany(); setShowCompanyDropdown(false); }}>
                        <Plus size={16} />
                        <span>Add New Company</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <button className={`nav-button ${totalNotifications > 0 ? 'has-notifications' : ''}`} onClick={() => setShowNotificationsDropdown(!showNotificationsDropdown)} ref={notificationBellRef}>
              <Bell size={20} />
              {totalNotifications > 0 && <span className="notification-badge">{totalNotifications}</span>}
              {showNotificationsDropdown && (
                <div className="notification-dropdown">
                  <div className="dropdown-header">
                    <h3>Notifications</h3>
                    {totalNotifications > 0 && (
                      <button className="btn-link" onClick={handleMarkAllAsRead}>Mark All as Read</button>
                    )}
                  </div>
                  {upcomingEventsTodayCount > 0 && (
                    <>
                      <p className="notification-category-title">Upcoming Events Today ({upcomingEventsTodayCount})</p>
                      {upcomingEventsToday.map(event => (
                        <div key={event.id} className="notification-item">
                          <CalendarDays size={18} color={currentVisualTheme === 'dark' ? '#60a5fa' : '#3b82f6'} />
                          <div className="notification-details">
                            <p className="notification-title">{event.title}</p>
                            <p className="notification-meta">Time: {event.time || 'All Day'}</p>
                            {event.location && <p className="notification-meta">Location: {event.location}</p>}
                          </div>
                          <div className="notification-actions">
                            <button className="btn-icon-small btn-outline" onClick={(e) => { e.stopPropagation(); handleEditEvent(event); setShowNotificationsDropdown(false); }} title="View Event">
                              <Eye size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </>
                  )}

                  {pendingInvitationsCount > 0 && (
                    <>
                      <p className="notification-category-title" style={{ marginTop: '1rem' }}>Invitations ({pendingInvitationsCount})</p>
                      {invitations.filter(inv => inv.status === 'pending' && inv.recipient_email === user.email).map(inv => (
                        <div key={inv.id} className="notification-item">
                          <Mail size={18} />
                          <div className="notification-details">
                            <p className="notification-title">Invitation to join {inv.company_name}</p>
                            <p className="notification-meta">From: {inv.sender_email}</p>
                            <p className="notification-time">{new Date(inv.created_at).toLocaleDateString()}</p>
                          </div>
                          <div className="notification-actions">
                            <button className="btn-icon-small btn-success" onClick={() => handleInvitationResponse(inv.id, 'accepted')} title="Accept">
                              <Check size={16} />
                            </button>
                            <button className="btn-icon-small btn-outline" onClick={() => handleInvitationResponse(inv.id, 'declined')} title="Decline">
                              <X size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </>
                  )}

                  {overdueTasksCount > 0 && (
                    <>
                      <p className="notification-category-title" style={{ marginTop: '1rem' }}>Overdue Tasks ({overdueTasksCount})</p>
                      {tasks.filter(task => isTaskOverdue(task)).map(task => (
                        <div key={task.id} className="notification-item">
                          <CheckSquare size={18} color="#ef4444" />
                          <div className="notification-details">
                            <p className="notification-title">{task.title}</p>
                            <p className="notification-meta">Due: {task.dueDate?.toLocaleDateString()}</p>
                            <p className="notification-time">Priority: {task.priority}</p>
                          </div>
                          <div className="notification-actions">
                            <button className="btn-icon-small btn-success" onClick={(e) => { e.stopPropagation(); toggleTaskCompletion(task.id, false); }} title="Mark Complete">
                              <Check size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </>
                  )}

                  {totalNotifications === 0 && (
                    <div className="no-notifications-message">
                      <Bell size={40} />
                      <p>No new notifications.</p>
                    </div>
                  )}
                </div>
              )}
            </button>

            <button className="nav-button" onClick={handleThemeToggle} title="Toggle Theme">
              {currentVisualTheme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>

            <button className="nav-button logout-btn" onClick={onLogout} title="Logout">
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      <div className={`dashboard-layout container`}>
        <aside className="sidebar">
          <nav className="sidebar-nav">
            <button className={`nav-tab ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => { setActiveTab('overview'); setSearchTerm(''); }}>
              <LayoutDashboard className="tab-icon" />
              Overview
            </button>
            <button className={`nav-tab ${activeTab === 'calendar' ? 'active' : ''}`} onClick={() => { setActiveTab('calendar'); setSearchTerm(''); }}>
              <CalendarDays className="tab-icon" />
              Calendar
            </button>
            <button className={`nav-tab ${activeTab === 'all-events' ? 'active' : ''}`} onClick={() => { setActiveTab('all-events'); setSearchTerm(''); }}>
              <CalendarDays className="tab-icon" />
              All Events
            </button>
            <button className={`nav-tab ${activeTab === 'tasks' ? 'active' : ''}`} onClick={() => { setActiveTab('tasks'); setSearchTerm(''); }}>
              <CheckSquare className="tab-icon" />
              Tasks
              {overdueTasksCount > 0 && <span className="notification-badge overdue">{overdueTasksCount}</span>}
            </button>
            <button className={`nav-tab ${activeTab === 'invitations' ? 'active' : ''}`} onClick={() => { setActiveTab('invitations'); setSearchTerm(''); }}>
              <Mail className="tab-icon" />
              Invitations
              {pendingInvitationsCount > 0 && <span className="notification-badge">{pendingInvitationsCount}</span>}
            </button>
            <button className={`nav-tab ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => { setActiveTab('settings'); setSearchTerm(''); }}>
              <Settings className="tab-icon" />
              Settings
            </button>
          </nav>
        </aside>

        <main className="main-content">
          {searchTerm ? (
            <div className="search-results-content">
              <h2>Search Results for "{searchTerm}"</h2>

              <div className="search-results-section">
                <h3 className="section-title">Events ({searchResults.events.length})</h3>
                {searchResults.events.length > 0 ? (
                  <div className="events-list">
                    {searchResults.events.map(event => (
                      <div key={event.id} className="event-card upcoming">
                        <div className="event-date">
                          <span className="event-day">{event.date.getDate()}</span>
                          <span className="event-month">{event.date.toLocaleString('en-US', { month: 'short' })}</span>
                        </div>
                        <div className="event-details">
                          <h4 className="event-title clickable-title" onClick={() => handleEditEvent(event)}>{event.title}</h4>
                          <p className="event-time-desc">
                            {event.time && <><Clock size={14} /> {event.time} • </>}
                            {event.location && <><MapPin size={14} /> {event.location}</>}
                          </p>
                          {event.eventTasks && event.eventTasks.length > 0 && (
                            <p className="event-task-summary">
                              <CheckSquare size={14} /> {event.eventTasks.filter(t => !t.completed).length} pending tasks
                            </p>
                          )}
                        </div>
                        <div className="event-actions">
                          <button className="btn-icon-small edit" onClick={() => handleEditEvent(event)} title="Edit Event"><Edit size={16} /></button>
                          <button className="btn-icon-small delete" onClick={() => handleDeleteEvent(event.id)} title="Delete Event"><Trash2 size={16} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="no-results-message">No events found matching your search.</p>
                )}
              </div>

              <div className="search-results-section">
                <h3 className="section-title">Tasks ({searchResults.tasks.length})</h3>
                {searchResults.tasks.length > 0 ? (
                  <div className="tasks-list">
                    {searchResults.tasks.map(task => (
                      <div key={task.id} className={`task-card ${task.completed ? 'completed' : ''} ${isTaskOverdue(task) ? 'overdue' : ''}`}>
                        <div className="task-checkbox">
                          <button className="checkbox-btn" onClick={() => toggleTaskCompletion(task.id, false)}>
                            {task.completed ? <CheckSquare size={20} /> : <Square size={20} />}
                          </button>
                        </div>
                        <div className="task-content">
                          <div className="task-header">
                            <h4 className="task-title clickable-title" onClick={() => handleEditGeneralTask(task.id)}>{task.title}</h4>
                            <div className="task-meta">
                              {task.priority && <span className={`priority-badge ${task.priority}`}>{task.priority}</span>}
                              {task.category && <span className="category-badge">{task.category}</span>}
                            </div>
                          </div>
                          {task.description && <p className="task-description">{task.description}</p>}
                          <div className="task-footer">
                            {task.dueDate && (
                              <span className={`due-date ${isTaskOverdue(task) ? 'overdue' : ''}`}>
                                Due: {task.dueDate.toLocaleDateString()}
                              </span>
                            )}
                            {task.expenses && (
                              <span className="task-expenses">
                                <DollarSign size={14} /> {formatCurrency(task.expenses, user.currency)}
                              </span>
                            )}
                            <div className="task-actions">
                              <button className="btn-icon-small edit" onClick={() => handleEditGeneralTask(task.id)} title="Edit Task"><Edit size={16} /></button>
                              <button className="btn-icon-small delete" onClick={() => handleDeleteGeneralTask(task.id)} title="Delete Task"><Trash2 size={16} /></button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="no-results-message">No general tasks found matching your search.</p>
                )}
              </div>
            </div>
          ) : (
            <>
              {!currentCompany?.id ? (
                <div className="no-companies-message">
                  <Building2 className="no-companies-icon" />
                  <h4>No Company Selected</h4>
                  <p>It looks like you haven't created or joined any companies yet. To start organizing your events and tasks, please create your first company.</p>
                  <button className="btn btn-primary" onClick={handleAddCompany}><Plus size={16} /> Create Your First Company</button>
                </div>
              ) : (
                <>
                  {activeTab === 'overview' && (
                    <div className="overview-content">
                      <div className="overview-header">
                        <h2>Welcome, {user.name || user.email}!</h2>
                        <p className="overview-subtitle">Here's a quick overview of your DayClap activity.</p>
                      </div>

                      <div className="stats-grid">
                        <div className="stat-card">
                          <div className="stat-icon"><CalendarDays size={24} /></div>
                          <div className="stat-content"><h3>{overviewStats.totalEvents}</h3><p>Total Events</p></div>
                        </div>
                        <div className="stat-card">
                          <div className="stat-icon completed"><CheckSquare size={24} /></div>
                          <div className="stat-content"><h3>{overviewStats.completedTasks}</h3><p>Completed Tasks</p></div>
                        </div>
                        <div className="stat-card">
                          <div className="stat-icon pending"><Flag size={24} /></div>
                          <div className="stat-content"><h3>{overviewStats.pendingTasks}</h3><p>Pending Tasks</p></div>
                        </div>
                        <div className="stat-card">
                          <div className="stat-icon overdue"><Clock size={24} /></div>
                          <div className="stat-content"><h3>{overviewStats.overdueTasks}</h3><p>Overdue Tasks</p></div>
                        </div>
                        <div className="stat-card percentage-card">
                          <div className="stat-icon percentage-completed"><BarChart3 size={24} /></div>
                          <div className="stat-content"><h3>{overviewStats.taskCompletionPercentage}%</h3><p>Tasks Completed</p></div>
                        </div>
                        <div className="stat-card percentage-card">
                          <div className="stat-icon percentage-pending"><BarChart3 size={24} /></div>
                          <div className="stat-content"><h3>{overviewStats.pendingTasksPercentage}%</h3><p>Tasks Pending</p></div>
                        </div>
                        <div className="stat-card expenses-card">
                          <div className="stat-icon expenses"><DollarSign size={24} /></div>
                          <div className="stat-content"><h3>{formatCurrency(overviewStats.totalExpenses, user.currency)}</h3><p>Total Expenses</p></div>
                        </div>
                      </div>

                      <div className="overview-sections">
                        <div className="section">
                          <div className="section-header">
                            <h3 className="section-title">Events</h3>
                            <div className="header-actions">
                              <div className="event-filter-dropdown">
                                <select className="form-select" value={eventFilter} onChange={(e) => setEventFilter(e.target.value)}>
                                  <option value="all">All Upcoming</option>
                                  <option value="week">This Week</option>
                                  <option value="month">This Month</option>
                                  <option value="nextMonth">Next Month</option>
                                  <option value="lastMonth">Last Month</option>
                                  <option value="lastYear">Last Year</option>
                                </select>
                              </div>
                              <button className="btn btn-primary btn-small" onClick={() => handleAddEvent()} disabled={!currentCompany?.id}><Plus size={16} /> Add Event</button>
                            </div>
                          </div>
                          <div className="events-list">
                            {getFilteredUpcomingEvents(eventFilter).length > 0 ? (
                              getFilteredUpcomingEvents(eventFilter).map(event => (
                                <div key={event.id} className="event-card upcoming">
                                  <div className="event-date">
                                    <span className="event-day">{event.date.getDate()}</span>
                                    <span className="event-month">{event.date.toLocaleString('en-US', { month: 'short' })}</span>
                                  </div>
                                  <div className="event-details">
                                    <h4 className="event-title clickable-title" onClick={() => handleEditEvent(event)}>{event.title}</h4>
                                    <p className="event-time-desc">
                                      {event.time && <><Clock size={14} /> {event.time} • </>}
                                      {event.location && <><MapPin size={14} /> {event.location}</>}
                                    </p>
                                    {event.eventTasks && event.eventTasks.length > 0 && (
                                      <p className="event-task-summary"><CheckSquare size={14} /> {event.eventTasks.filter(t => !t.completed).length} pending tasks</p>
                                    )}
                                  </div>
                                  <div className="event-actions">
                                    <button className="btn-icon-small edit" onClick={() => handleEditEvent(event)} title="Edit Event"><Edit size={16} /></button>
                                    <button className="btn-icon-small delete" onClick={() => handleDeleteEvent(event.id)} title="Delete Event"><Trash2 size={16} /></button>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="no-events">
                                <CalendarDays className="no-events-icon" />
                                <p>No events for this period.</p>
                                <button className="btn btn-primary btn-small" onClick={() => handleAddEvent()} disabled={!currentCompany?.id}><Plus size={16} /> Create Event</button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'calendar' && (
                    <div className="calendar-content">
                      <div className="calendar-section">
                        <div className="calendar-header">
                          <button className="nav-arrow" onClick={() => navigateMonth(-1)}><ChevronLeft /></button>
                          <h3 className="calendar-title">{currentDate.toLocaleString('en-US', { month: 'long', year: 'numeric' })}</h3>
                          <button className="nav-arrow" onClick={() => navigateMonth(1)}><ChevronRight /></button>
                        </div>
                        <div className="calendar-grid">
                          {daysOfWeek.map(day => (<div key={day} className="day-header">{day}</div>))}
                          {daysInMonth.map((date, index) => (
                            <div key={index} className={`calendar-day ${date ? '' : 'empty'} ${isToday(date) ? 'today' : ''} ${isSelected(date) ? 'selected' : ''} ${hasCalendarItem(date) ? 'has-item' : ''}`} onClick={() => date && handleDateClick(date)}>
                              {date && <span className="day-number">{date.getDate()}</span>}
                              {date && getCalendarItemsForDate(date).slice(0, 2).map(item => (
                                <span key={item.id} className={`item-mini-text ${item.type === 'task' ? (item.completed ? 'completed-task' : (item.isOverdue ? 'overdue-task' : 'pending-task')) : 'event-text'}`}>{item.title}</span>
                              ))}
                              {date && getCalendarItemCountForDate(date) > 2 && (
                                <div className="item-indicators"><span className="item-count">+{getCalendarItemCountForDate(date) - 2}</span></div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'all-events' && (
                    <div className="all-events-content">
                      <div className="all-events-header">
                        <h2>All Events</h2>
                        <p className="all-events-subtitle">A comprehensive list of all your events, past and future.</p>
                      </div>
                      <div className="events-list">
                        {events.length > 0 ? (
                          events.sort((a, b) => b.date.getTime() - a.date.getTime()).map(event => (
                            <div key={event.id} className="event-card detailed">
                              <div className="event-date-time-block">
                                <span className="event-date-display">{event.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                                <span className="event-time-display">{event.time || 'All Day'}</span>
                              </div>
                              <div className="event-details">
                                <h4 className="event-title clickable-title" onClick={() => handleEditEvent(event)}>{event.title}</h4>
                                {event.description && <p className="event-description">{event.description}</p>}
                                {event.location && <p className="event-location"><MapPin size={14} /> {event.location}</p>}
                                {event.eventTasks && event.eventTasks.length > 0 && (<p className="event-task-summary"><CheckSquare size={14} /> {event.eventTasks.filter(t => !t.completed).length} pending tasks</p>)}
                              </div>
                              <div className="event-actions">
                                <button className="btn-icon-small edit" onClick={() => handleEditEvent(event)} title="Edit Event"><Edit size={16} /></button>
                                <button className="btn-icon-small delete" onClick={() => handleDeleteEvent(event.id)} title="Delete Event"><Trash2 size={16} /></button>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="no-events">
                            <CalendarDays className="no-events-icon" />
                            <p>No events found.</p>
                            <button className="btn btn-primary btn-small" onClick={() => handleAddEvent()} disabled={!currentCompany?.id}><Plus size={16} /> Create Event</button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {activeTab === 'tasks' && (
                    <div className="tasks-content">
                      <div className="tasks-header">
                        <h2>My Tasks</h2>
                        <p className="tasks-subtitle">Manage your personal and event-related tasks.</p>
                      </div>

                      <div className="tasks-stats">
                        <div className="stat-card">
                          <div className="stat-icon"><CheckSquare size={24} /></div>
                          <div className="stat-content"><h3>{taskTabStats.total}</h3><p>Total Tasks</p></div>
                        </div>
                        <div className="stat-card">
                          <div className="stat-icon completed"><CheckSquare size={24} /></div>
                          <div className="stat-content"><h3>{taskTabStats.completed}</h3><p>Completed</p></div>
                        </div>
                        <div className="stat-card">
                          <div className="stat-icon pending"><Flag size={24} /></div>
                          <div className="stat-content"><h3>{taskTabStats.pending}</h3><p>Pending Tasks</p></div>
                        </div>
                        <div className="stat-card">
                          <div className="stat-icon overdue"><Clock size={24} /></div>
                          <div className="stat-content"><h3>{taskTabStats.overdue}</h3><p>Overdue Tasks</p></div>
                        </div>
                        <div className="stat-card percentage-card">
                          <div className="stat-icon percentage-completed"><BarChart3 size={24} /></div>
                          <div className="stat-content"><h3>{taskTabStats.completedPercentage}%</h3><p>Tasks Completed</p></div>
                        </div>
                        <div className="stat-card percentage-card">
                          <div className="stat-icon percentage-pending"><BarChart3 size={24} /></div>
                          <div className="stat-content"><h3>{taskTabStats.pendingPercentage}%</h3><p>Tasks Pending</p></div>
                        </div>
                      </div>

                      <div className="tasks-sections">
                        <div className="section">
                          <div className="section-header">
                            <h3 className="section-title">All Tasks</h3>
                            <div className="header-actions">
                              <div className="task-filter-dropdown">
                                <select className="form-select" value={taskDueDateFilter} onChange={(e) => setTaskDueDateFilter(e.target.value)}>
                                  <option value="all">All Due Dates</option>
                                  <option value="today">Due Today</option>
                                  <option value="week">This Week</option>
                                  <option value="month">This Month</option>
                                  <option value="nextMonth">Next Month</option>
                                  <option value="lastMonth">Last Month</option>
                                  <option value="lastYear">Last Year</option>
                                  <option value="later">Later / No Due Date</option>
                                </select>
                              </div>
                              <div className="task-filter-dropdown">
                                <select className="form-select" value={taskStatusFilter} onChange={(e) => setTaskStatusFilter(e.target.value)}>
                                  <option value="all">All Statuses</option>
                                  <option value="completed">Completed</option>
                                  <option value="pending">Pending</option>
                                  <option value="overdue">Overdue</option>
                                </select>
                              </div>
                            </div>
                          </div>
                          <div className="tasks-list">
                            {getFilteredAndCategorizedTasks(allTasks, taskDueDateFilter, taskStatusFilter).length > 0 ? (
                              getFilteredAndCategorizedTasks(allTasks, taskDueDateFilter, taskStatusFilter).map(({ category, tasks: categoryTasks }) => (
                                <div key={category} className="task-category-section">
                                  <h3 className="category-title">{category}</h3>
                                  {categoryTasks.map(task => (
                                    <div key={task.id} className={`task-card ${task.completed ? 'completed' : ''} ${isTaskOverdue(task) ? 'overdue' : ''}`}>
                                      <div className="task-checkbox"><button className="checkbox-btn" onClick={() => toggleTaskCompletion(task.id, task.type === 'event', task.parentEvent?.id)}>{task.completed ? <CheckSquare size={20} /> : <Square size={20} />}</button></div>
                                      <div className="task-content">
                                        <div className="task-header">
                                          <h4 className="task-title clickable-title" onClick={() => { if (task.type === 'general') { handleEditGeneralTask(task.id); } else { const parentEvent = events.find(e => e.id === task.parentEvent.id); if (parentEvent) handleEditEvent(parentEvent); } }}>{task.title}</h4>
                                          <div className="task-meta">
                                            {task.priority && <span className={`priority-badge ${task.priority}`}>{task.priority}</span>}
                                            {task.category && <span className="category-badge">{task.category}</span>}
                                          </div>
                                        </div>
                                        {task.description && <p className="task-description">{task.description}</p>}
                                        <div className="task-footer">
                                          {task.dueDate && (<span className={`due-date ${isTaskOverdue(task) ? 'overdue' : ''}`}>Due: {task.dueDate.toLocaleDateString()}</span>)}
                                          {task.expenses && (<span className="task-expenses"><DollarSign size={14} /> {formatCurrency(task.expenses, user.currency)}</span>)}
                                          <div className="task-actions">
                                            <button className="btn-icon-small edit" onClick={() => { if (task.type === 'general') { handleEditGeneralTask(task.id); } else { const parentEvent = events.find(e => e.id === task.parentEvent.id); if (parentEvent) handleEditEvent(parentEvent); } }} title={task.type === 'event' ? 'Edit Parent Event' : 'Edit Task'}><Edit size={16} /></button>
                                            <button className="btn-icon-small delete" onClick={() => task.type === 'general' && handleDeleteGeneralTask(task.id)} title={task.type === 'event' ? 'Delete from event view' : 'Delete Task'} disabled={task.type === 'event'}><Trash2 size={16} /></button>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ))
                            ) : (
                              <div className="no-tasks">
                                <CheckSquare className="no-tasks-icon" />
                                <p>No tasks found for the selected filters.</p>
                                <button className="btn btn-primary btn-small" onClick={() => handleAddEvent()} disabled={!currentCompany?.id}><Plus size={16} /> Create an Event to add tasks</button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'invitations' && (
                    <div className="invitations-content">
                      <div className="invitations-header">
                        <h2>My Invitations</h2>
                        <p className="invitations-subtitle">Manage invitations to join companies and teams.</p>
                      </div>

                      <div className="invitations-stats">
                        <div className="stat-card">
                          <div className="stat-icon"><Mail size={24} /></div>
                          <div className="stat-content"><h3>{invitationStats.total}</h3><p>Total Invitations</p></div>
                        </div>
                        <div className="stat-card">
                          <div className="stat-icon pending"><Clock size={24} /></div>
                          <div className="stat-content"><h3>{invitationStats.pending}</h3><p>Pending</p></div>
                        </div>
                        <div className="stat-card">
                          <div className="stat-icon accepted"><Check size={24} /></div>
                          <div className="stat-content"><h3>{invitationStats.accepted}</h3><p>Accepted</p></div>
                        </div>
                        <div className="stat-card">
                          <div className="stat-icon declined"><X size={24} /></div>
                          <div className="stat-content"><h3>{invitationStats.declined}</h3><p>Declined</p></div>
                        </div>
                      </div>

                      <nav className="invitations-nav">
                        <button 
                          className={`invitations-nav-tab ${invitationsActiveTab === 'received' ? 'active' : ''}`}
                          onClick={() => setInvitationsActiveTab('received')}
                        >
                          <Building2 /> Received Invitations
                        </button>
                        <button 
                          className={`invitations-nav-tab ${invitationsActiveTab === 'sent' ? 'active' : ''}`}
                          onClick={() => setInvitationsActiveTab('sent')}
                        >
                          <Users /> Sent Invitations
                        </button>
                      </nav>

                      <div className="invitations-sections">
                        {currentCompany ? (
                          <>
                            {invitationsActiveTab === 'received' && (
                              <div className="section">
                                <h3 className="section-title">Invitations to Join Companies</h3>
                                <div className="invitations-list">
                                  {receivedInvitations.length > 0 ? (
                                    receivedInvitations.map(inv => (
                                      <div key={inv.id} className={`invitation-card ${inv.status}`}>
                                        <div className="invitation-header">
                                          <div className="invitation-info">
                                            <h4 className="invitation-title">Join {inv.company_name}</h4>
                                            <p className="invitation-organizer">From: {inv.sender_email}</p>
                                          </div>
                                          <div className="invitation-status"><span className={`status-badge ${inv.status}`}>{inv.status}</span></div>
                                        </div>
                                        <div className="invitation-details">
                                          <div className="detail-row"><Building2 size={16} /><span>Company: {inv.company_name}</span></div>
                                          <div className="detail-row"><UserCheck size={16} /><span>Your Role: {inv.role}</span></div>
                                          <div className="detail-row"><Clock size={16} /><span>Sent: {new Date(inv.created_at).toLocaleDateString()}</span></div>
                                        </div>
                                        {inv.status === 'pending' && (
                                          <div className="invitation-actions">
                                            {inv.role === 'user' ? (
                                              <button className="btn btn-success btn-small" onClick={() => handleInvitationResponse(inv.id, 'accepted')}>
                                                <Check size={16} /> Add to Team
                                              </button>
                                            ) : (
                                              <button className="btn btn-success btn-small" onClick={() => handleInvitationResponse(inv.id, 'accepted')}>
                                                <Check size={16} /> Add to Company
                                              </button>
                                            )}
                                            <button className="btn btn-outline btn-small" onClick={() => handleInvitationResponse(inv.id, 'declined')}><X size={16} /> Decline</button>
                                          </div>
                                        )}
                                      </div>
                                    ))
                                  ) : (
                                    <div className="no-invitations"><Mail className="no-invitations-icon" /><p>No invitations received.</p></div>
                                  )}
                                </div>
                              </div>
                            )}

                            {invitationsActiveTab === 'sent' && (
                              <div className="section">
                                <h3 className="section-title">Invitations Sent from {currentCompany.name}</h3>
                                <div className="invitations-list">
                                  {sentInvitations.filter(inv => inv.company_id === currentCompany.id).length > 0 ? (
                                    sentInvitations.filter(inv => inv.company_id === currentCompany.id).map(inv => (
                                      <div key={inv.id} className="team-invite-item">
                                        <div className="team-invite-info">
                                          <div className="team-invite-avatar"><Mail size={18} /></div>
                                          <div>
                                            <p className="team-invite-email">{inv.recipient_email}</p>
                                            <p className="team-invite-company-name">To join: {inv.company_name}</p>
                                            <p className="team-invite-date">Invited: {new Date(inv.created_at).toLocaleDateString()}</p>
                                          </div>
                                        </div>
                                        <div className="team-invite-role"><span className={`role-badge ${inv.role}`}>{inv.role}</span></div>
                                        <div className="team-invite-actions"></div>
                                      </div>
                                    ))
                                  ) : (
                                    <p className="no-data">No pending invitations for this company.</p>
                                  )}
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="no-companies-message">
                            <Building2 className="no-companies-icon" />
                            <h4>No Company Selected</h4>
                            <p>Select or create a company from the dropdown above to manage its team members and invitations.</p>
                            <button className="btn btn-primary" onClick={handleAddCompany}><Plus size={16} /> Create Company</button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {activeTab === 'settings' && (
                    <div className="settings-content">
                      <div className="settings-header">
                        <h2>Settings</h2>
                        <p className="settings-subtitle">Manage your profile, preferences, and account settings.</p>
                      </div>
                      <nav className="settings-nav">
                        <button className={`settings-nav-tab ${settingsActiveTab === 'profile' ? 'active' : ''}`} onClick={() => setSettingsActiveTab('profile')}><User /> Profile</button>
                        <button className={`settings-nav-tab ${settingsActiveTab === 'preferences' ? 'active' : ''}`} onClick={() => setSettingsActiveTab('preferences')}><Palette /> Preferences</button>
                        <button className={`settings-nav-tab ${settingsActiveTab === 'security' ? 'active' : ''}`} onClick={() => setSettingsActiveTab('security')}><Shield /> Security</button>
                        <button className={`settings-nav-tab ${settingsActiveTab === 'team' ? 'active' : ''}`} onClick={() => setSettingsActiveTab('team')}><Building2 /> Manage Companies</button>
                        <button className={`settings-nav-tab ${settingsActiveTab === 'team-members' ? 'active' : ''}`} onClick={() => setSettingsActiveTab('team-members')}><Users /> Team Members</button>
                      </nav>
                      <div className="settings-tab-content">
                        {settingsActiveTab === 'profile' && (
                          <div className="settings-section">
                            <div className="settings-section-header">
                              <div>
                                <h3 className="settings-section-title">Personal Information</h3>
                                <p className="settings-section-subtitle">Update your name and email address.</p>
                              </div>
                            </div>
                            <form className="settings-form" onSubmit={handleProfileFormSubmit}>
                              <div className="form-group">
                                <label className="form-label">Full Name</label>
                                <div className="input-wrapper"><User className="input-icon" /><input type="text" className="form-input" value={profileForm.name} onChange={(e) => setProfileForm(prev => ({ ...prev, name: e.target.value }))} /></div>
                              </div>
                              <div className="form-group">
                                <label className="form-label">Email Address</label>
                                <div className="input-wrapper"><Mail className="input-icon" /><input type="email" className="form-input" value={profileForm.email} onChange={(e) => setProfileForm(prev => ({ ...prev, email: e.target.value }))} /></div>
                              </div>
                              <div style={{ textAlign: 'right' }}><button type="submit" className="btn btn-primary">Save Changes</button></div>
                            </form>
                          </div>
                        )}
                        {settingsActiveTab === 'preferences' && (
                          <div className="settings-section">
                            <div className="settings-section-header">
                              <div>
                                <h3 className="settings-section-title">Appearance & Behavior</h3>
                                <p className="settings-section-subtitle">Customize the look and feel of your dashboard.</p>
                              </div>
                            </div>
                            <form className="settings-form" onSubmit={handleSettingsFormSubmit}>
                              <div className="form-group">
                                <label className="form-label">Currency</label>
                                <div className="input-wrapper" ref={currencyDropdownRef}>
                                  <Globe className="input-icon" />
                                  <div className="selected-currency-display form-input" onClick={() => setShowCurrencyDropdown(!showCurrencyDropdown)}>
                                    {allCurrencyOptions.find(opt => opt.value === settingsForm.currency)?.label || 'Select Currency'}
                                    <ChevronDown size={16} className={`dropdown-arrow ${showCurrencyDropdown ? 'open' : ''}`} />
                                  </div>
                                  {showCurrencyDropdown && (
                                    <div className="currency-dropdown-options">
                                      <input type="text" className="currency-search-input" placeholder="Search currency..." value={currencySearchTerm} onChange={(e) => setCurrencySearchTerm(e.target.value)} autoFocus />
                                      <div className="options-list">
                                        {filteredFavorites.length > 0 && (
                                          <>
                                            {filteredFavorites.map(option => (<div key={option.value} className={`currency-option-item ${settingsForm.currency === option.value ? 'selected' : ''}`} onClick={() => { setSettingsForm(prev => ({ ...prev, currency: option.value })); setShowCurrencyDropdown(false); setCurrencySearchTerm(''); }}>{option.label}</div>))}
                                            {filteredNonFavorites.length > 0 && <div className="currency-divider"></div>}
                                          </>
                                        )}
                                        {filteredNonFavorites.length > 0 ? (
                                          filteredNonFavorites.map(option => (<div key={option.value} className={`currency-option-item ${settingsForm.currency === option.value ? 'selected' : ''}`} onClick={() => { setSettingsForm(prev => ({ ...prev, currency: option.value })); setShowCurrencyDropdown(false); setCurrencySearchTerm(''); }}>{option.label}</div>))
                                        ) : (
                                          filteredFavorites.length === 0 && <div className="no-options-message">No matching currencies</div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="form-group">
                                <label className="form-label">Theme</label>
                                <select className="form-select" value={settingsForm.theme} onChange={(e) => setSettingsForm(prev => ({ ...prev, theme: e.target.value }))}>
                                  <option value="light">Light</option>
                                  <option value="dark">Dark</option>
                                  <option value="system">System</option>
                                </select>
                              </div>
                              
                              <div className="form-group">
                                <label className="form-label">Email Notification Settings</label>
                                <div className="setting-item">
                                  <div className="setting-info"><h4>Daily Email Summary</h4><p>Receive a daily email with upcoming events and pending tasks.</p></div>
                                  <label className="toggle-switch"><input type="checkbox" checked={settingsForm.notifications.email_daily} onChange={(e) => setSettingsForm(prev => ({ ...prev, notifications: { ...prev.notifications, email_daily: e.target.checked } }))} /><span className="toggle-slider"></span></label>
                                </div>
                                <div className="setting-item">
                                  <div className="setting-info"><h4>Weekly Email Update</h4><p>Get a summary of your week ahead, including events and tasks.</p></div>
                                  <label className="toggle-switch"><input type="checkbox" checked={settingsForm.notifications.email_weekly} onChange={(e) => setSettingsForm(prev => ({ ...prev, notifications: { ...prev.notifications, email_weekly: e.target.checked } }))} /><span className="toggle-slider"></span></label>
                                </div>
                                <div className="setting-item">
                                  <div className="setting-info"><h4>Monthly Overview</h4><p>Receive a monthly email with a comprehensive overview of your schedule.</p></div>
                                  <label className="toggle-switch"><input type="checkbox" checked={settingsForm.notifications.email_monthly} onChange={(e) => setSettingsForm(prev => ({ ...prev, notifications: { ...prev.notifications, email_monthly: e.target.checked } }))} /><span className="toggle-slider"></span></label>
                                </div>
                                <div className="setting-item">
                                  <div className="setting-info"><h4>3-Day Countdown Alerts</h4><p>Receive an email alert for events and tasks due in 3 days.</p></div>
                                  <label className="toggle-switch"><input type="checkbox" checked={settingsForm.notifications.email_3day_countdown} onChange={(e) => setSettingsForm(prev => ({ ...prev, notifications: { ...prev.notifications, email_3day_countdown: e.target.checked } }))} /><span className="toggle-slider"></span></label>
                                </div>
                              </div>

                              <div style={{ textAlign: 'right' }}><button type="submit" className="btn btn-primary">Save Preferences</button></div>
                            </form>
                          </div>
                        )}
                        {settingsActiveTab === 'security' && (
                          <div className="settings-section">
                            <div className="settings-section-header">
                              <div>
                                <h3 className="settings-section-title">Password</h3>
                                <p className="settings-section-subtitle">Change your password. It's a good idea to use a strong password that you're not using elsewhere.</p>
                              </div>
                            </div>
                            <form className="settings-form" onSubmit={(e) => { e.preventDefault(); handleChangePasswordClick(); }}>
                              <div className="form-group">
                                <label className="form-label">Current Password</label>
                                <div className="input-wrapper"><Lock className="input-icon" /><input type={showCurrentPassword ? 'text' : 'password'} className="form-input" value={profileForm.currentPassword} onChange={(e) => setProfileForm(prev => ({ ...prev, currentPassword: e.target.value }))} /><button type="button" className="password-toggle" onClick={() => setShowCurrentPassword(!showCurrentPassword)}>{showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
                              </div>
                              <div className="form-group">
                                <label className="form-label">New Password</label>
                                <div className="input-wrapper"><Lock className="input-icon" /><input type={showNewPassword ? 'text' : 'password'} className="form-input" value={profileForm.newPassword} onChange={(e) => setProfileForm(prev => ({ ...prev, newPassword: e.target.value }))} /><button type="button" className="password-toggle" onClick={() => setShowNewPassword(!showNewPassword)}>{showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
                              </div>
                              <div className="form-group">
                                <label className="form-label">Confirm New Password</label>
                                <div className="input-wrapper"><Lock className="input-icon" /><input type={showConfirmPassword ? 'text' : 'password'} className="form-input" value={profileForm.confirmPassword} onChange={(e) => setProfileForm(prev => ({ ...prev, confirmPassword: e.target.value }))} /><button type="button" className="password-toggle" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>{showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
                              </div>
                              <div style={{ textAlign: 'right' }}><button type="submit" className="btn btn-primary">Change Password</button></div>
                            </form>
                          </div>
                        )}
                        {settingsActiveTab === 'team' && (
                          <div className="settings-section">
                            <div className="settings-section-header">
                              <div>
                                <h3 className="settings-section-title">Manage Companies</h3>
                                <p className="settings-section-subtitle">Add, edit, or delete your companies.</p>
                              </div>
                              <button className="btn btn-primary btn-small" onClick={handleAddCompany}><Plus size={16} /> Add Company</button>
                            </div>
                            <div className="companies-list">
                              {user.companies && user.companies.length > 0 ? (
                                user.companies.map(company => {
                                  const currentUserRoleForThisCompany = user.companies.find(c => c.id === company.id)?.role;
                                  const canManageCompany = currentUserRoleForThisCompany === 'owner' || currentUserRoleForThisCompany === 'admin';

                                  return (
                                    <div key={company.id} className="company-item">
                                      <div className="company-item-info">
                                        <Building2 className="company-item-icon" />
                                        <div>
                                          <p className="company-item-name">{company.name}</p>
                                          <p className="company-item-date">Created: {new Date(company.createdAt).toLocaleDateString()}</p>
                                        </div>
                                        {user.currentCompanyId === company.id && <span className="current-badge">Current</span>}
                                      </div>
                                      <div className="company-item-actions">
                                        {canManageCompany && (<button className="btn btn-outline btn-small" onClick={() => handleEditCompany(company)} title="Edit Company"><Edit size={16} /></button>)}
                                        {canManageCompany && (<button className="btn btn-primary btn-small" onClick={() => { setInviteForm(prev => ({ ...prev, companyId: company.id })); setShowInviteModal(true); }} title="Invite Team Member"><UserPlus size={16} /></button>)}
                                      </div>
                                    </div>
                                  );
                                })
                              ) : (
                                <p>You haven't created or joined any companies yet.</p>
                              )}
                            </div>
                          </div>
                        )}
                        {settingsActiveTab === 'team-members' && (
                          <div className="settings-section">
                            <div className="settings-section-header">
                              <div>
                                <h3 className="settings-section-title">Manage Team Members</h3>
                                <p className="settings-section-subtitle">View and manage members of your currently selected company.</p>
                              </div>
                              {currentCompany?.id && (<button className="btn btn-primary btn-small" onClick={() => { setInviteForm(prev => ({ ...prev, companyId: currentCompany.id })); setShowInviteModal(true); }} title="Invite Team Member"><UserPlus size={16} /></button>)}
                            </div>

                            {currentCompany ? (
                              <div className="team-members-list">
                                {teamMembers.length > 0 ? (
                                  teamMembers.map(member => {
                                    const currentUserRole = currentCompany?.role;
                                    const canEditRole = (currentUserRole === 'owner' || currentUserRole === 'admin') && member.id !== user.id && member.role !== 'owner';
                                    const canRemoveMember = (currentUserRole === 'owner' || currentUserRole === 'admin') && member.id !== user.id && member.role !== 'owner';

                                    return (
                                      <div key={member.id} className="team-member-item">
                                        <div className="team-member-info">
                                          <div className="team-member-avatar">{member.name?.charAt(0).toUpperCase() || member.email?.charAt(0).toUpperCase()}</div>
                                          <div>
                                            <p className="team-member-name">{member.name || member.email}</p>
                                            <p className="team-member-email">{member.email}</p>
                                          </div>
                                        </div>
                                        <div className="team-member-role">
                                          <select className="role-select" value={member.role} onChange={(e) => handleUpdateMemberRole(member.id, e.target.value, currentCompany.id)} disabled={!canEditRole}>
                                            <option value="user">User</option>
                                            <option value="admin">Admin</option>
                                            {member.role === 'owner' && <option value="owner">Owner</option>}
                                          </select>
                                        </div>
                                        <div className="team-member-actions">
                                          {canRemoveMember && (<button className="btn-icon-small delete" onClick={() => handleRemoveMember(member.id, currentCompany.id)} title="Remove Member"><Trash2 size={16} /></button>)}
                                        </div>
                                      </div>
                                    );
                                  })
                                ) : (
                                  <p className="no-data-message">No team members found for this company.</p>
                                )}
                              </div>
                            ) : (
                              <div className="no-companies-message">
                                <Building2 className="no-companies-icon" />
                                <h4>No Company Selected</h4>
                                <p>Please select a company from the main dashboard dropdown to manage its team members.</p>
                                <button className="btn btn-primary" onClick={handleAddCompany}><Plus size={16} /> Create Company</button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </main>
      </div>

      {showCompanyModal && (
        <div className="modal-backdrop" onClick={() => setShowCompanyModal(false)}>
          <div className="modal-content company-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingCompany ? 'Edit Company' : 'Add New Company'}</h3>
              <button className="modal-close" onClick={() => setShowCompanyModal(false)}><X /></button>
            </div>
            <form onSubmit={handleCompanyFormSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Company Name</label>
                  <div className="input-wrapper"><Building2 className="input-icon" /><input type="text" name="name" value={companyForm.name} onChange={(e) => setCompanyForm(prev => ({ ...prev, name: e.target.value }))} className="form-input" placeholder="e.g., DayClap Inc." required /></div>
                </div>
                {editingCompany && (
                  (() => {
                    const currentUserRoleForEditingCompany = user.companies.find(c => c.id === editingCompany.id)?.role;
                    const canDeleteCompany = currentUserRoleForEditingCompany === 'owner';
                    return canDeleteCompany && (
                      <div className="company-actions"><button type="button" className="btn btn-danger btn-full" onClick={() => handleDeleteCompany(editingCompany.id)}><Trash2 size={16} /> Delete Company</button></div>
                    );
                  })()
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowCompanyModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary"><Save size={16} /> {editingCompany ? 'Save Changes' : 'Create Company'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showInviteModal && (
        <div className="modal-backdrop" onClick={() => { setShowInviteModal(false); setInviteMessage(''); setInviteMessageType(''); }}>
          <div className="modal-content invite-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Invite Team Member</h3>
              <button className="modal-close" onClick={() => { setShowInviteModal(false); setInviteMessage(''); setInviteMessageType(''); }}><X /></button>
            </div>
            <form onSubmit={handleInviteFormSubmit}>
              <div className="modal-body">
                {inviteMessage && (
                  <div className={`info-message ${inviteMessageType}`} style={{ marginBottom: '1rem', textAlign: 'center' }}>
                    {inviteMessage}
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Recipient Email</label>
                  <div className="input-wrapper"><Mail className="input-icon" /><input type="email" name="email" value={inviteForm.email} onChange={(e) => setInviteForm(prev => ({ ...prev, email: e.target.value }))} className="form-input" placeholder="member@example.com" required /></div>
                </div>
                <div className="form-group">
                  <label className="form-label">Company</label>
                  <div className="input-wrapper">
                    <Building2 className="input-icon" />
                    <select name="companyId" value={inviteForm.companyId || ''} onChange={(e) => setInviteForm(prev => ({ ...prev, companyId: e.target.value }))} className="form-select" required>
                      <option value="" disabled>Select a company</option>
                      {user.companies.map(company => (<option key={company.id} value={company.id}>{company.name}</option>))}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Role</label>
                  <div className="input-wrapper">
                    <Crown className="input-icon" />
                    <select name="role" value={inviteForm.role} onChange={(e) => setInviteForm(prev => ({ ...prev, role: e.target.value }))} className="form-select" required>
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                </div>
                <div className="invite-info"><p>An invitation email will be sent to the recipient. They will need to accept it to join your company.</p></div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => { setShowInviteModal(false); setInviteMessage(''); setInviteMessageType(''); }}>Cancel</button>
                <button type="submit" className="btn btn-primary"><UserPlus size={16} /> Send Invitation</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isDateModalOpen && selectedDateForModal && (
        <div className="modal-backdrop" onClick={() => setIsDateModalOpen(false)}>
          <div className="modal-content date-schedule-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Schedule for {selectedDateForModal.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</h3>
              <button className="modal-close" onClick={() => setIsDateModalOpen(false)}><X /></button>
            </div>
            <div className="modal-body">
              <div className="events-list">
                {getCalendarItemsForDate(selectedDateForModal).length > 0 ? (
                  getCalendarItemsForDate(selectedDateForModal).map(item => (
                    item.type === 'event' ? (
                      <div key={item.id} className="event-card detailed">
                        <div className="event-date-time-block">
                          <span className="event-date-display">{item.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                          <span className="event-time-display">{item.time || 'All Day'}</span>
                        </div>
                        <div className="event-details">
                          <h4 className="event-title clickable-title" onClick={() => handleEditEvent(item)}>{item.title}</h4>
                          {item.description && <p className="event-description">{item.description}</p>}
                          {item.location && <p className="event-location"><MapPin size={14} /> {item.location}</p>}
                          {item.eventTasks && item.eventTasks.length > 0 && (<p className="event-task-summary"><CheckSquare size={14} /> {item.eventTasks.filter(t => !t.completed).length} pending tasks</p>)}
                        </div>
                        <div className="event-actions">
                          <button className="btn-icon-small edit" onClick={() => handleEditEvent(item)} title="Edit Event"><Edit size={16} /></button>
                          <button className="btn-icon-small delete" onClick={() => handleDeleteEvent(item.id)} title="Delete Event"><Trash2 size={16} /></button>
                        </div>
                      </div>
                    ) : (
                      <div key={item.id} className={`task-card ${item.completed ? 'completed' : ''} ${item.isOverdue ? 'overdue' : ''}`}>
                        <div className="task-checkbox"><button className="checkbox-btn" onClick={() => toggleTaskCompletion(item.id, false)}>{item.completed ? <CheckSquare size={20} /> : <Square size={20} />}</button></div>
                        <div className="task-content">
                          <div className="task-header">
                            <h4 className="task-title clickable-title" onClick={() => handleEditGeneralTask(item.id)}>{item.title}</h4>
                            <div className="task-meta">
                              {item.priority && <span className={`priority-badge ${item.priority}`}>{item.priority}</span>}
                              {item.category && <span className="category-badge">{item.category}</span>}
                            </div>
                          </div>
                          {item.description && <p className="task-description">{item.description}</p>}
                          <div className="task-footer">
                            {item.dueDate && (<span className={`due-date ${item.isOverdue ? 'overdue' : ''}`}>Due: {item.dueDate.toLocaleDateString()}</span>)}
                            {item.expenses && (<span className="task-expenses"><DollarSign size={14} /> {formatCurrency(item.expenses, user.currency)}</span>)}
                            <div className="task-actions">
                              <button className="btn-icon-small edit" onClick={() => handleEditGeneralTask(item.id)} title="Edit Task"><Edit size={16} /></button>
                              <button className="btn-icon-small delete" onClick={() => handleDeleteGeneralTask(item.id)} title="Delete Task"><Trash2 size={16} /></button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  ))
                ) : (
                  <div className="no-events">
                    <CalendarDays className="no-events-icon" />
                    <p>No events or tasks scheduled for this day.</p>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-primary" onClick={() => handleAddEventFromModal(selectedDateForModal)} disabled={!currentCompany?.id}><Plus size={16} /> Add Event for this Day</button>
            </div>
          </div>
        </div>
      )}

      <EventModal
        showModal={showEventModal}
        onClose={() => setShowEventModal(false)}
        eventForm={eventForm}
        setEventForm={setEventForm}
        editingEvent={editingEvent}
        onSaveEvent={handleEventFormSubmit}
        currentEventTaskForm={currentEventTaskForm}
        setCurrentEventTaskForm={setCurrentEventTaskForm}
        handleAddEventTask={handleAddEventTask}
        handleEditEventTask={handleEditEventTask}
        handleDeleteEventTask={handleDeleteEventTask}
        handleToggleEventTaskCompletion={handleToggleEventTaskCompletion}
        teamMembers={teamMembers}
        user={user}
      />
    </div>
  )
}

export default Dashboard

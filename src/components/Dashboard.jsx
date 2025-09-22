import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  CalendarDays,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Mail,
  MapPin,
  Moon,
  Plus,
  Search,
  Settings,
  Square,
  Sun,
  Users,
  Building2,
  X,
  User,
  Shield,
  BellRing,
  Globe,
  Languages,
  DollarSign,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import './Dashboard.css';
import LoadingAnimation from './LoadingAnimation';
import EventDetailsModal from './EventDetailsModal';
import EventModal from './EventModal'; // Import the EventModal
import DateActionsModal from './DateActionsModal'; // Import the new DateActionsModal
import DayItemsModal from './DayItemsModal'; // NEW: Lists events & tasks for a day

function toLocalDate(yyyy_mm_dd) {
  if (!yyyy_mm_dd) return null;
  const [y, m, d] = yyyy_mm_dd.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function formatDate(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = typeof window !== 'undefined' ? window.atob(base64) : Buffer.from(base64, 'base64').toString('binary');
  const outputArray = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) {
    outputArray[i] = raw.charCodeAt(i);
  }
  return outputArray;
}

// Common lists
const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'hi', name: 'Hindi' },
];

const TIMEZONES = [
  'UTC',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'Europe/Madrid',
  'Europe/Rome',
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Tokyo',
  'Australia/Sydney',
];

const CURRENCIES = [
  'USD', 'EUR', 'GBP', 'INR', 'JPY', 'AUD', 'CAD', 'BRL', 'MXN', 'ZAR',
];

const Dashboard = ({ user, onLogout, onUserUpdate }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [events, setEvents] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  // Company & Team state
  const [companyTeamTab, setCompanyTeamTab] = useState('company'); // NEW: 'company' | 'team'
  const [teamMembers, setTeamMembers] = useState([]);
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [editingCompany, setEditingCompany] = useState(null);
  const [companyForm, setCompanyForm] = useState({ name: '' });
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false); // NEW: State for company dropdown

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'user', companyId: '' });
  const [inviteMessage, setInviteMessage] = useState('');

  // Invitations state
  const [invitations, setInvitations] = useState([]);
  const [invitationsActiveTab, setInvitationsActiveTab] = useState('received'); // 'received' | 'sent'

  // Settings state
  const [settingsTab, setSettingsTab] = useState('profile'); // 'profile' | 'preferences' | 'notifications' | 'privacy' | 'push'
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState('');
  const [settingsMessageType, setSettingsMessageType] = useState(''); // success | error

  // Event details state
  const [showEventDetails, setShowEventDetails] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);

  // NEW: Event/Task Modals for Add/Edit
  const [showEventModal, setShowEventModal] = useState(false);
  const [eventForm, setEventForm] = useState({
    title: '',
    date: new Date(),
    time: '',
    location: '',
    description: '',
    eventTasks: [],
  });
  const [editingEvent, setEditingEvent] = useState(null); // Null for new event, object for editing
  const [currentEventTaskForm, setCurrentEventTaskForm] = useState({
    id: null,
    title: '',
    description: '',
    dueDate: '',
    assignedTo: user?.email || '',
    priority: 'medium',
    expenses: 0,
    completed: false,
  });

  // NEW: Date Actions Modal state
  const [showDateActionsModal, setShowDateActionsModal] = useState(false);
  const [dateForActions, setDateForActions] = useState(null);

  // NEW: Day Items Modal state
  const [showDayItemsModal, setShowDayItemsModal] = useState(false);

  const defaultNotifications = {
    email_daily: true,
    email_weekly: false,
    email_monthly: false,
    email_3day_countdown: false,
    email_1week_countdown: true,
    push: true,
    reminders: true,
    invitations: true,
  };

  const initialTimezone = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  })();

  const [settingsForm, setSettingsForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    theme: user?.theme || 'light',
    language: user?.language || 'en',
    timezone: user?.timezone || initialTimezone,
    currency: user?.currency || 'USD',
    notifications: user?.notifications || defaultNotifications,
    privacy: user?.privacy || { profileVisibility: 'team', calendarSharing: 'private' },
  });

  const [pushLoading, setPushLoading] = useState(false);
  const [pushMessage, setPushMessage] = useState('');
  const [pushMessageType, setPushMessageType] = useState(''); // success | error

  const backendUrl = import.meta.env.VITE_BACKEND_URL;
  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  const pushSupported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  const currentCompanyId =
    user?.currentCompanyId ||
    user?.current_company_id ||
    (Array.isArray(user?.companies) && user.companies.length > 0 ? user.companies[0].id : null);

  const currentCompany = useMemo(() => {
    if (!user?.companies) return null;
    return user.companies.find(c => c.id === currentCompanyId) || null;
  }, [user, currentCompanyId]);

  useEffect(() => {
    // Sync invite modal company selection
    setInviteForm(prev => ({ ...prev, companyId: currentCompanyId || '' }));
  }, [currentCompanyId]);

  // Apply initial theme from user setting
  useEffect(() => {
    document.body.classList.remove('dark-mode');
    if (user?.theme === 'dark') {
      document.body.classList.add('dark-mode');
    } else if (user?.theme === 'system') {
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.body.classList.add('dark-mode');
      }
    }
    return () => {
      // leave as-is
    };
  }, [user?.theme]);

  const applyTheme = (theme) => {
    document.body.classList.remove('dark-mode');
    if (theme === 'dark') {
      document.body.classList.add('dark-mode');
    } else if (theme === 'system') {
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.body.classList.add('dark-mode');
      }
    }
  };

  const handleThemeToggle = async () => {
    const isDark = document.body.classList.contains('dark-mode');
    const newTheme = isDark ? 'light' : 'dark';
    document.body.classList.toggle('dark-mode', newTheme === 'dark');

    try {
      if (user?.id) {
        await supabase
          .from('profiles')
          .update({ theme: newTheme, last_activity_at: new Date().toISOString() })
          .eq('id', user.id);
      }
      onUserUpdate && onUserUpdate({ ...user, theme: newTheme });
    } catch {
      // ignore
    }
  };

  // Keep settings form in sync with user changes
  useEffect(() => {
    setSettingsForm({
      name: user?.name || '',
      email: user?.email || '',
      theme: user?.theme || 'light',
      language: user?.language || 'en',
      timezone: user?.timezone || initialTimezone,
      currency: user?.currency || 'USD',
      notifications: user?.notifications || defaultNotifications,
      privacy: user?.privacy || { profileVisibility: 'team', calendarSharing: 'private' },
    });
    setSettingsMessage('');
    setSettingsMessageType('');
    setPushMessage('');
    setPushMessageType('');
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveProfile = async (e) => {
    e?.preventDefault?.();
    setSettingsSaving(true);
    setSettingsMessage('');
    try {
      await onUserUpdate({ ...user, name: settingsForm.name });
      setSettingsMessageType('success');
      setSettingsMessage('Profile updated.');
    } catch (err) {
      setSettingsMessageType('error');
      setSettingsMessage(err?.message || 'Failed to update profile.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const savePreferences = async (e) => {
    e?.preventDefault?.();
    setSettingsSaving(true);
    setSettingsMessage('');
    try {
      applyTheme(settingsForm.theme);
      await onUserUpdate({
        ...user,
        theme: settingsForm.theme,
        language: settingsForm.language,
        timezone: settingsForm.timezone,
        currency: settingsForm.currency,
      });
      setSettingsMessageType('success');
      setSettingsMessage('Preferences saved.');
    } catch (err) {
      setSettingsMessageType('error');
      setSettingsMessage(err?.message || 'Failed to save preferences.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const saveNotifications = async (e) => {
    e?.preventDefault?.();
    setSettingsSaving(true);
    setSettingsMessage('');
    try {
      await onUserUpdate({
        ...user,
        notifications: {
          ...defaultNotifications,
          ...(settingsForm.notifications || {}),
        },
      });
      setSettingsMessageType('success');
      setSettingsMessage('Notification settings saved.');
    } catch (err) {
      setSettingsMessageType('error');
      setSettingsMessage(err?.message || 'Failed to save notification settings.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const savePrivacy = async (e) => {
    e?.preventDefault?.();
    setSettingsSaving(true);
    setSettingsMessage('');
    try {
      await onUserUpdate({
        ...user,
        privacy: settingsForm.privacy || { profileVisibility: 'team', calendarSharing: 'private' },
      });
      setSettingsMessageType('success');
      setSettingsMessage('Privacy settings saved.');
    } catch (err) {
      setSettingsMessageType('error');
      setSettingsMessage(err?.message || 'Failed to save privacy settings.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const getAccessToken = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      return session?.access_token || null;
    } catch {
      return null;
    }
  };

  const subscribePush = async () => {
    setPushMessage('');
    setPushMessageType('');
    if (!pushSupported) {
      setPushMessageType('error');
      setPushMessage('Push notifications are not supported in this browser.');
      return;
    }
    if (!backendUrl) {
      setPushMessageType('error');
      setPushMessage('Backend URL is not configured.');
      return;
    }
    if (!vapidPublicKey) {
      setPushMessageType('error');
      setPushMessage('VAPID public key is not configured.');
      return;
    }
    try {
      setPushLoading(true);

      if (Notification.permission === 'default') {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') {
          setPushMessageType('error');
          setPushMessage('Notification permission was denied.');
          setPushLoading(false);
          return;
        }
      } else if (Notification.permission === 'denied') {
        setPushMessageType('error');
        setPushMessage('Notification permission is blocked. Please enable it in your browser settings.');
        setPushLoading(false);
        return;
      }

      let reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        try {
          reg = await navigator.serviceWorker.register('/sw.js');
        } catch {
          // If register fails, try ready anyway
          reg = await navigator.serviceWorker.ready;
        }
      }
      if (!reg) {
        setPushMessageType('error');
        setPushMessage('Could not initialize service worker registration.');
        setPushLoading(false);
        return;
      }

      const existing = await reg.pushManager.getSubscription();
      let subscription = existing;
      if (!subscription) {
        const appServerKey = urlBase64ToUint8Array(vapidPublicKey);
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: appServerKey,
        });
      }

      const token = await getAccessToken();
      if (!token) {
        setPushMessageType('error');
        setPushMessage('Auth session not found.');
        setPushLoading(false);
        return;
      }

      const res = await fetch(`${backendUrl}/api/subscribe-push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(subscription),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || 'Failed to save subscription.');
      }

      await onUserUpdate({
        ...user,
        notifications: { ...(user?.notifications || defaultNotifications), push: true },
        push_subscription: subscription,
      });
      setSettingsForm(prev => ({
        ...prev,
        notifications: { ...(prev.notifications || defaultNotifications), push: true },
      }));
      setPushMessageType('success');
      setPushMessage('Push notifications enabled.');
    } catch (err) {
      setPushMessageType('error');
      setPushMessage(err?.message || 'Failed to enable push notifications.');
    } finally {
      setPushLoading(false);
    }
  };

  const unsubscribePush = async () => {
    setPushMessage('');
    setPushMessageType('');
    if (!pushSupported) {
      setPushMessageType('error');
      setPushMessage('Push notifications are not supported in this browser.');
      return;
    }
    if (!backendUrl) {
      setPushMessageType('error');
      setPushMessage('Backend URL is not configured.');
      return;
    }
    try {
      setPushLoading(true);

      let reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        reg = await navigator.serviceWorker.ready;
      }
      let endpoint = null;
      if (reg) {
        const subscription = await reg.pushManager.getSubscription();
        if (subscription) {
          endpoint = subscription.endpoint;
          await subscription.unsubscribe();
        }
      }

      const token = await getAccessToken();
      if (!token) {
        setPushMessageType('error');
        setPushMessage('Auth session not found.');
        setPushLoading(false);
        return;
      }

      const res = await fetch(`${backendUrl}/api/unsubscribe-push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ endpoint }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || 'Failed to disable subscription.');
      }

      await onUserUpdate({
        ...user,
        notifications: { ...(user?.notifications || defaultNotifications), push: false },
        push_subscription: null,
      });
      setSettingsForm(prev => ({
        ...prev,
        notifications: { ...(prev.notifications || defaultNotifications), push: false },
      }));
      setPushMessageType('success');
      setPushMessage('Push notifications disabled.');
    } catch (err) {
      setPushMessageType('error');
      setPushMessage(err?.message || 'Failed to disable push notifications.');
    } finally {
      setPushLoading(false);
    }
  };

  // Fetch events and tasks
  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      if (!user?.id || !currentCompanyId) {
        setEvents([]);
        setTasks([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const [{ data: ev, error: e1 }, { data: tk, error: e2 }] = await Promise.all([
          supabase.from('events').select('*').eq('company_id', currentCompanyId).order('date', { ascending: true }),
          supabase.from('tasks').select('*').eq('company_id', currentCompanyId).order('due_date', { ascending: true }),
        ]);

        if (!cancelled) {
          const mappedEvents = (ev || []).map(e => ({
            ...e,
            dateObj: toLocalDate(e.date),
          }));
          const mappedTasks = (tk || []).map(t => ({
            ...t,
            dueDateObj: toLocalDate(t.due_date),
          }));
          if (!e1 && !e2) {
            setEvents(mappedEvents);
            setTasks(mappedTasks);
          } else {
            setEvents([]);
            setTasks([]);
          }
        }
      } catch {
        if (!cancelled) {
          setEvents([]);
          setTasks([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [user?.id, currentCompanyId]);

  // Fetch team members when the current company changes
  useEffect(() => {
    const fetchTeamMembersForCompany = async (companyId) => {
      if (!companyId) {
        setTeamMembers([]);
        return;
      }
      try {
        // Updated: fetch minimal fields and filter client-side for array-of-objects JSON
        const { data: profiles, error } = await supabase
          .from('profiles')
          .select('id, name, email, companies');

        if (error) {
          setTeamMembers([]);
          return;
        }

        const members = (profiles || [])
          .filter(p => Array.isArray(p.companies) && p.companies.some(c => c.id === companyId))
          .map(p => {
            const entry = Array.isArray(p.companies) ? p.companies.find(c => c.id === companyId) : null;
            return {
              id: p.id,
              name: p.name,
              email: p.email,
              role: (entry?.role || 'user').toLowerCase(),
            };
          });

        // Sort: Owner first, then Admin, then User; then by name/email
        const roleRank = { owner: 0, admin: 1, user: 2 };
        members.sort((a, b) => {
          const r = (roleRank[a.role] ?? 99) - (roleRank[b.role] ?? 99);
          if (r !== 0) return r;
          const an = (a.name || a.email || '').toLowerCase();
          const bn = (b.name || b.email || '').toLowerCase();
          return an.localeCompare(bn);
        });

        setTeamMembers(members);
      } catch {
        setTeamMembers([]);
      }
    };
    fetchTeamMembersForCompany(currentCompanyId);
  }, [currentCompanyId, user?.companies]);

  // Fetch invitations (received and sent)
  const fetchInvitations = async () => {
    if (!user?.id || !user?.email) {
      setInvitations([]);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('invitations')
        .select('*')
        .or(`recipient_email.eq.${user.email},sender_id.eq.${user.id}`)
        .order('created_at', { ascending: false });
      if (error) {
        setInvitations([]);
      } else {
        setInvitations(data || []);
      }
    } catch {
      setInvitations([]);
    }
  };

  useEffect(() => {
    fetchInvitations();
  }, [user?.id, user?.email]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const stats = useMemo(() => {
    const completedTasks = tasks.filter(t => t.completed).length;
    const overdueTasks = tasks.filter(t => !t.completed && t.dueDateObj && t.dueDateObj < today).length;
    const pendingTasks = tasks.filter(t => !t.completed).length - overdueTasks;
    const totalEvents = events.length;
    return { completedTasks, overdueTasks, pendingTasks: Math.max(0, pendingTasks), totalEvents };
  }, [tasks, events, today]);

  const allEventsSorted = useMemo(() => {
    return [...events].sort((a, b) => {
      const ta = a.dateObj?.getTime() || 0;
      const tb = b.dateObj?.getTime() || 0;
      return ta - tb;
    });
  }, [events]);

  const searchResults = useMemo(() => {
    const term = (searchTerm || '').toLowerCase().trim();
    if (!term) return { events: [], tasks: [] };
    const e = allEventsSorted.filter(
      ev =>
        ev.title?.toLowerCase().includes(term) ||
        ev.description?.toLowerCase().includes(term) ||
        ev.location?.toLowerCase().includes(term)
    );
    const t = tasks.filter(
      tk =>
        tk.title?.toLowerCase().includes(term) ||
        tk.description?.toLowerCase().includes(term) ||
        tk.category?.toLowerCase().includes(term)
    );
    return { events: e, tasks: t };
  }, [searchTerm, allEventsSorted, tasks]);

  const handleToggleTask = async (taskId) => {
    try {
      const target = tasks.find(t => t.id === taskId);
      if (!target) return;
      const newVal = !target.completed;
      const { error } = await supabase
        .from('tasks')
        .update({ completed: newVal, last_activity_at: new Date().toISOString() })
        .eq('id', taskId);
      if (!error) {
        setTasks(prev => prev.map(t => (t.id === taskId ? { ...t, completed: newVal } : t)));
      }
    } catch {
      // ignore
    }
  };

  // Calendar helpers (Month view)
  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const getMonthGridDays = (refDate) => {
    const year = refDate.getFullYear();
    const month = refDate.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const firstDayIndex = firstOfMonth.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const grid = [];
    for (let i = 0; i < firstDayIndex; i++) grid.push(null);
    for (let d = 1; d <= daysInMonth; d++) grid.push(new Date(year, month, d));
    return grid;
  };

  const monthGridDays = useMemo(() => getMonthGridDays(currentDate), [currentDate]);

  const isToday = (d) => {
    if (!d) return false;
    const a = new Date(d);
    const b = new Date();
    a.setHours(0, 0, 0, 0);
    b.setHours(0, 0, 0, 0);
    return a.getTime() === b.getTime();
  };

  const isSelected = (d) => {
    if (!d || !selectedDate) return false;
    const a = new Date(d);
    const b = new Date(selectedDate);
    a.setHours(0, 0, 0, 0);
    b.setHours(0, 0, 0, 0);
    return a.getTime() === b.getTime();
  };

  const eventsAndTasksForDate = (d) => {
    if (!d) return [];
    const key = d.toDateString();
    const items = [];
    events.forEach(ev => {
      if (ev.dateObj && ev.dateObj.toDateString() === key) items.push({ type: 'event', ...ev });
    });
    tasks.forEach(t => {
      if (t.dueDateObj && t.dueDateObj.toDateString() === key) items.push({ type: 'task', ...t });
    });
    // Sort: events first, then tasks (incomplete first)
    return items.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'event' ? -1 : 1;
      if (a.type === 'event') return 0;
      return (a.completed ? 1 : 0) - (b.completed ? 1 : 0);
    });
  };

  const hasItems = (d) => (eventsAndTasksForDate(d).length > 0 ? true : false);

  const changeMonth = (delta) => {
    setCurrentDate(prev => {
      const nd = new Date(prev);
      nd.setMonth(nd.getMonth() + delta);
      return nd;
    });
  };

  // NEW: Handle date click on calendar grid
  const handleSelectDate = (date) => {
    if (!date) return;
    setSelectedDate(date);
    setDateForActions(date);
    setShowDateActionsModal(true);
  };

  // UPDATED: Handle "View Events & Tasks" from DateActionsModal to open day list modal
  const handleViewEventsForDate = () => {
    if (dateForActions) {
      setSelectedDate(dateForActions);
      setCurrentDate(dateForActions);
    }
    setShowDateActionsModal(false);
    setShowDayItemsModal(true);
  };

  // NEW: Handle "Add New Event" from DateActionsModal
  const handleOpenAddEventModal = () => {
    if (dateForActions) {
      setEditingEvent(null); // Indicate new event
      setEventForm({
        title: '',
        date: dateForActions, // Pre-fill date
        time: '',
        location: '',
        description: '',
        eventTasks: [],
      });
      setCurrentEventTaskForm({ // Reset current task form
        id: null,
        title: '',
        description: '',
        dueDate: '',
        assignedTo: user?.email || '',
        priority: 'medium',
        expenses: 0,
        completed: false,
      });
      setShowEventModal(true); // Open EventModal
    }
    setShowDateActionsModal(false); // Close the actions modal
  };

  // NEW: Handle saving an event (from EventModal)
  const handleSaveEvent = async (e) => {
    e.preventDefault();
    if (!currentCompanyId) {
      alert('Please select a company before adding an event.');
      return;
    }

    const payload = {
      user_id: user.id,
      company_id: currentCompanyId,
      title: eventForm.title,
      date: eventForm.date.toISOString().split('T')[0], // YYYY-MM-DD
      time: eventForm.time,
      location: eventForm.location,
      description: eventForm.description,
      event_tasks: eventForm.eventTasks, // Ensure this matches DB column name
      last_activity_at: new Date().toISOString(),
    };

    try {
      let response;
      if (editingEvent) {
        response = await supabase
          .from('events')
          .update(payload)
          .eq('id', editingEvent.id)
          .select();
      } else {
        response = await supabase
          .from('events')
          .insert(payload)
          .select();
      }

      if (response.error) {
        throw response.error;
      }

      // Refresh events list
      const { data: updatedEvents, error: fetchError } = await supabase
        .from('events')
        .select('*')
        .eq('company_id', currentCompanyId)
        .order('date', { ascending: true });

      if (fetchError) throw fetchError;

      setEvents((updatedEvents || []).map(e => ({ ...e, dateObj: toLocalDate(e.date) })));
      setShowEventModal(false);
      setEditingEvent(null);
      setEventForm({
        title: '',
        date: new Date(),
        time: '',
        location: '',
        description: '',
        eventTasks: [],
      });
      setCurrentEventTaskForm({
        id: null,
        title: '',
        description: '',
        dueDate: '',
        assignedTo: user?.email || '',
        priority: 'medium',
        expenses: 0,
        completed: false,
      });
    } catch (error) {
      console.error('Error saving event:', error.message);
      alert('Failed to save event: ' + error.message);
    }
  };

  // NEW: Event Task Handlers (passed to EventModal)
  const handleAddEventTask = () => {
    if (!currentEventTaskForm.title.trim()) return;

    const newId = currentEventTaskForm.id || (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now());
    const newTask = {
      ...currentEventTaskForm,
      id: newId,
      assignedTo: currentEventTaskForm.assignedTo || user.email,
      dueDate: currentEventTaskForm.dueDate || null,
      expenses: Number(currentEventTaskForm.expenses) || 0,
    };

    setEventForm(prev => ({
      ...prev,
      eventTasks: prev.eventTasks.some(task => task.id === newId)
        ? prev.eventTasks.map(task => (task.id === newId ? newTask : task))
        : [...prev.eventTasks, newTask],
    }));

    setCurrentEventTaskForm({
      id: null,
      title: '',
      description: '',
      dueDate: '',
      assignedTo: user?.email || '',
      priority: 'medium',
      expenses: 0,
      completed: false,
    });
  };

  const handleEditEventTask = (taskToEdit) => {
    setCurrentEventTaskForm({ ...taskToEdit });
  };

  const handleDeleteEventTask = (taskId) => {
    setEventForm(prev => ({
      ...prev,
      eventTasks: prev.eventTasks.filter(task => task.id !== taskId),
    }));
    if (currentEventTaskForm.id === taskId) {
      setCurrentEventTaskForm({
        id: null,
        title: '',
        description: '',
        dueDate: '',
        assignedTo: user?.email || '',
        priority: 'medium',
        expenses: 0,
        completed: false,
      });
    }
  };

  const handleToggleEventTaskCompletion = (taskId) => {
    setEventForm(prev => ({
      ...prev,
      eventTasks: prev.eventTasks.map(task =>
        task.id === taskId ? { ...task, completed: !task.completed } : task
      ),
    }));
  };

  // Company & Team handlers
  const handleAddCompany = () => {
    setEditingCompany(null);
    setCompanyForm({ name: '' });
    setShowCompanyModal(true);
  };

  const handleEditCompany = () => {
    if (!currentCompany) return;
    setEditingCompany(currentCompany);
    setCompanyForm({ name: currentCompany.name || '' });
    setShowCompanyModal(true);
  };

  const handleDeleteCompany = () => {
    if (!currentCompanyId) return;
    if (!window.confirm('Are you sure you want to delete this company from your profile?')) return;
    const updatedCompanies = (user.companies || []).filter(c => c.id !== currentCompanyId);
    const nextCompanyId = updatedCompanies.length > 0 ? updatedCompanies[0].id : null;
    const updatedUser = { ...user, companies: updatedCompanies, currentCompanyId: nextCompanyId };
    onUserUpdate && onUserUpdate(updatedUser);
  };

  const handleCompanyFormSubmit = (e) => {
    e.preventDefault();
    const name = (companyForm.name || '').trim();
    if (!name) return;

    const companies = Array.isArray(user.companies) ? [...user.companies] : [];
    let nextCompanies;
    let nextCurrentCompanyId = user.currentCompanyId || null;

    if (editingCompany) {
      nextCompanies = companies.map(c => (c.id === editingCompany.id ? { ...c, name } : c));
    } else {
      const newCompany = {
        id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()),
        name,
        role: 'owner',
        createdAt: new Date().toISOString(),
      };
      nextCompanies = [...companies, newCompany];
      if (!nextCurrentCompanyId) nextCurrentCompanyId = newCompany.id;
    }

    const updatedUser = { ...user, companies: nextCompanies, currentCompanyId: nextCurrentCompanyId };
    onUserUpdate && onUserUpdate(updatedUser);
    setShowCompanyModal(false);
  };

  const handleInviteFormChange = (e) => {
    const { name, value } = e.target;
    setInviteForm(prev => ({ ...prev, [name]: value }));
    setInviteMessage('');
  };

  const handleInviteFormSubmit = async (e) => {
    e.preventDefault();
    setInviteMessage('');
    const recipient = (inviteForm.email || '').trim().toLowerCase();
    const companyId = inviteForm.companyId || currentCompanyId;
    if (!recipient || !companyId) {
      setInviteMessage('Please provide recipient email and select a company.');
      return;
    }
    try {
      if (!backendUrl) {
        setInviteMessage('Error: VITE_BACKEND_URL is not configured.');
        return;
      }
      const company = (user.companies || []).find(c => c.id === companyId);
      const payload = {
        sender_id: user.id,
        sender_email: user.email,
        recipient_email: recipient,
        company_id: companyId,
        company_name: company?.name || 'Company',
        role: inviteForm.role || 'user',
      };
      const res = await fetch(`${backendUrl}/api/send-invitation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok || res.status === 202) {
        setInviteMessage('Invitation sent successfully.');
        setInviteForm({ email: '', role: 'user', companyId });
        // Refresh sent list
        fetchInvitations();
      } else {
        const data = await res.json().catch(() => ({}));
        setInviteMessage(data?.message || 'Failed to send invitation.');
      }
    } catch (err) {
      setInviteMessage(`Unexpected error: ${err?.message || 'unknown'}`);
    }
  };

  // Invitations derived data and handlers
  const receivedInvitations = useMemo(
    () => invitations.filter(inv => inv.recipient_email === user?.email),
    [invitations, user?.email]
  );
  const sentInvitations = useMemo(
    () => invitations.filter(inv => inv.sender_id === user?.id),
    [invitations, user?.id]
  );

  const pendingInvitationsCount = useMemo(
    () => receivedInvitations.filter(inv => inv.status === 'pending').length,
    [receivedInvitations]
  );

  const handleInvitationResponse = async (invitationId, response) => {
    try {
      const { error } = await supabase
        .from('invitations')
        .update({ status: response })
        .eq('id', invitationId);
      if (error) return;

      if (response === 'accepted') {
        const inv = invitations.find(i => i.id === invitationId);
        if (inv) {
          const newCompany = {
            id: inv.company_id,
            name: inv.company_name,
            role: inv.role,
            createdAt: new Date().toISOString(),
          };
          const existing = Array.isArray(user.companies) ? [...user.companies] : [];
          const hasCompany = existing.some(c => c.id === newCompany.id);
          const updatedCompanies = hasCompany ? existing : [...existing, newCompany];
          const nextCurrentCompanyId = user.currentCompanyId || newCompany.id;
          onUserUpdate && onUserUpdate({ ...user, companies: updatedCompanies, currentCompanyId: nextCurrentCompanyId });
        }
      }

      // Refresh invitations
      fetchInvitations();
    } catch {
      // ignore
    }
  };

  // Company switcher
  const handleSelectCompany = async (companyId) => {
    if (companyId === currentCompanyId) {
      setShowCompanyDropdown(false);
      return;
    }
    try {
      await onUserUpdate({ ...user, currentCompanyId: companyId });
      setShowCompanyDropdown(false);
    } catch (error) {
      console.error('Failed to switch company:', error);
    }
  };

  // Event details helpers
  const openEventDetails = (ev) => {
    setSelectedEvent(ev);
    setShowEventDetails(true);
  };

  const goToEventInCalendar = (ev) => {
    if (!ev) return;
    const d = ev.dateObj || (ev.date ? toLocalDate(ev.date) : null);
    if (d instanceof Date && !isNaN(d.getTime())) {
      setSelectedDate(d);
      setCurrentDate(d);
      setActiveTab('calendar');
      setShowEventDetails(false);
    }
  };

  // Permissions to toggle sub-task inside an event
  const canToggleEventTask = (ev, task) => {
    try {
      if (!user) return false;
      if (ev?.user_id && user?.id && ev.user_id === user.id) return true;
      const assigned = (task?.assignedTo || '').toLowerCase();
      const email = (user?.email || '').toLowerCase();
      return assigned && email && assigned === email;
    } catch {
      return false;
    }
  };

  const toggleEventTaskCompletion = async (ev, taskRef) => {
    if (!ev) return;
    const tasksArray = Array.isArray(ev.event_tasks)
      ? [...ev.event_tasks]
      : Array.isArray(ev.eventTasks)
      ? [...ev.eventTasks]
      : [];
    let idx = typeof taskRef?.index === 'number' ? taskRef.index : tasksArray.findIndex(t => t && t.id === taskRef?.id);
    if (idx < 0 || !tasksArray[idx]) return;

    const task = tasksArray[idx];
    if (!canToggleEventTask(ev, task)) return;

    const prevTasks = tasksArray;
    const updatedTasks = [...tasksArray];
    updatedTasks[idx] = { ...task, completed: !task.completed };

    // Optimistic update in events list
    setEvents(prev => prev.map(e => (e.id === ev.id ? { ...e, event_tasks: updatedTasks } : e)));
    // Also update open modal state if it's the same event
    if (selectedEvent?.id === ev.id) {
      setSelectedEvent(prev => ({ ...prev, event_tasks: updatedTasks }));
    }

    // Persist to DB
    const { error } = await supabase
      .from('events')
      .update({ event_tasks: updatedTasks, last_activity_at: new Date().toISOString() })
      .eq('id', ev.id);

    if (error) {
      // Revert on failure
      setEvents(prev => prev.map(e => (e.id === ev.id ? { ...e, event_tasks: prevTasks } : e)));
      if (selectedEvent?.id === ev.id) {
        setSelectedEvent(prev => ({ ...prev, event_tasks: prevTasks }));
      }
      console.error('Failed to update event sub-task:', error);
    }
  };

  return (
    <div className={`dashboard ${activeTab === 'calendar' ? 'calendar-active' : ''}`}>
      {/* Header */}
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
                placeholder="Search events, tasks..."
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
              <div className="user-details">
                <span className="user-name">{user?.name || user?.email}</span>
                {user?.account_type === 'business' && (
                  <div className="company-selector">
                    <button className="company-btn" title="Current company" onClick={() => setShowCompanyDropdown(prev => !prev)}>
                      <Building2 size={16} />
                      <span>{currentCompany ? currentCompany.name : 'No Company'}</span>
                      <ChevronDown size={16} className={showCompanyDropdown ? 'dropdown-arrow open' : 'dropdown-arrow'} />
                    </button>
                    {showCompanyDropdown && (
                      <div className="company-dropdown">
                        {(user.companies || []).length > 0 ? (
                          (user.companies || []).map(company => (
                            <button
                              key={company.id}
                              className={`company-option ${company.id === currentCompanyId ? 'active' : ''}`}
                              onClick={() => handleSelectCompany(company.id)}
                            >
                              <Building2 size={16} /> {company.name}
                            </button>
                          ))
                        ) : (
                          <div className="no-options-message">No companies available.</div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <button className="nav-button" onClick={handleThemeToggle} title="Toggle Theme">
              {document.body.classList.contains('dark-mode') ? <Sun size={20} /> : <Moon size={20} />}
            </button>

            <button className="nav-button logout-btn" onClick={onLogout} title="Logout">
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* Layout */}
      <div className="dashboard-layout">
        <aside className="sidebar">
          <nav className="sidebar-nav">
            <button className={`nav-tab ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
              <LayoutDashboard className="tab-icon" />
              Overview
            </button>
            <button className={`nav-tab ${activeTab === 'calendar' ? 'active' : ''}`} onClick={() => setActiveTab('calendar')}>
              <CalendarDays className="tab-icon" />
              Calendar
            </button>
            <button className={`nav-tab ${activeTab === 'all-events' ? 'active' : ''}`} onClick={() => setActiveTab('all-events')}>
              <CalendarDays className="tab-icon" />
              All Events
            </button>
            <button className={`nav-tab ${activeTab === 'tasks' ? 'active' : ''}`} onClick={() => setActiveTab('tasks')}>
              <CheckSquare className="tab-icon" />
              Tasks
              {stats.overdueTasks > 0 && <span className="notification-badge overdue">{stats.overdueTasks}</span>}
            </button>
            {user?.account_type === 'business' && (
              <button className={`nav-tab ${activeTab === 'company-team' ? 'active' : ''}`} onClick={() => setActiveTab('company-team')}>
                <Users className="tab-icon" />
                Company & Team
              </button>
            )}
            <button className={`nav-tab ${activeTab === 'invitations' ? 'active' : ''}`} onClick={() => setActiveTab('invitations')}>
              <Mail className="tab-icon" />
              Invitations
              {pendingInvitationsCount > 0 && <span className="notification-badge">{pendingInvitationsCount}</span>}
            </button>
            <button className={`nav-tab ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
              <Settings className="tab-icon" />
              Settings
            </button>
          </nav>
        </aside>

        <main className="main-content">
          {loading ? (
            <div className="constrained-content">
              <LoadingAnimation message="Loading your dashboard..." />
            </div>
          ) : searchTerm ? (
            <div className="constrained-content search-results-content">
              <h2>Search Results for "{searchTerm}"</h2>

              <div className="section">
                <h3 className="section-title">Events ({searchResults.events.length})</h3>
                {searchResults.events.length > 0 ? (
                  <div className="events-list">
                    {searchResults.events.map(ev => (
                      <div key={ev.id} className="event-card">
                        <div className="event-date">
                          <span className="event-day">{ev.dateObj ? ev.dateObj.getDate() : '-'}</span>
                          <span className="event-month">{ev.dateObj ? ev.dateObj.toLocaleString('en-US', { month: 'short' }) : ''}</span>
                        </div>
                        <div className="event-details">
                          <h4 className="event-title" onClick={() => openEventDetails(ev)} style={{ cursor: 'pointer' }}>{ev.title}</h4>
                          <p className="event-time-desc">
                            {formatDate(ev.dateObj)} {ev.time ? ` • ${ev.time}` : ''}
                          </p>
                          {ev.location && (
                            <p className="event-location">
                              <MapPin size={14} /> {ev.location}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="no-results-message">No events match your search.</p>
                )}
              </div>

              <div className="section">
                <h3 className="section-title">Tasks ({searchResults.tasks.length})</h3>
                {searchResults.tasks.length > 0 ? (
                  <div className="tasks-list">
                    {searchResults.tasks.map(task => (
                      <div key={task.id} className={`task-card ${task.completed ? 'completed' : ''}`}>
                        <div className="task-checkbox">
                          <button className="checkbox-btn" onClick={() => handleToggleTask(task.id)}>
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
                              <span className={`due-date ${task.dueDateObj < today && !task.completed ? 'overdue' : ''}`}>
                                Due: {formatDate(task.dueDateObj)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="no-results-message">No tasks match your search.</p>
                )}
              </div>
            </div>
          ) : (
            <>
              {activeTab === 'overview' && (
                <div className="constrained-content">
                  <div className="overview-header">
                    <h2>Welcome, {user?.name || user?.email}!</h2>
                    <p className="overview-subtitle">Here’s a quick overview of your activity.</p>
                  </div>

                  <div className="stats-grid">
                    <div className="stat-card">
                      <div className="stat-icon"><CalendarDays size={24} /></div>
                      <div className="stat-content"><h3>{stats.totalEvents}</h3><p>Total Events</p></div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-icon completed"><Check size={24} /></div>
                      <div className="stat-content"><h3>{stats.completedTasks}</h3><p>Completed Tasks</p></div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-icon pending"><Calendar size={24} /></div>
                      <div className="stat-content"><h3>{stats.pendingTasks}</h3><p>Pending Tasks</p></div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-icon overdue"><CalendarDays size={24} /></div>
                      <div className="stat-content"><h3>{stats.overdueTasks}</h3><p>Overdue Tasks</p></div>
                    </div>
                  </div>

                  <div className="section">
                    <div className="section-header">
                      <h3 className="section-title">Upcoming Events</h3>
                      <div className="header-actions">
                        <button className="btn btn-primary btn-small" onClick={() => handleOpenAddEventModal(new Date())}>
                          <Plus size={16} /> Add Event
                        </button>
                      </div>
                    </div>
                    {allEventsSorted.length > 0 ? (
                      <div className="events-list">
                        {allEventsSorted.slice(0, 5).map(ev => (
                          <div key={ev.id} className="event-card">
                            <div className="event-date">
                              <span className="event-day">{ev.dateObj ? ev.dateObj.getDate() : '-'}</span>
                              <span className="event-month">{ev.dateObj ? ev.dateObj.toLocaleString('en-US', { month: 'short' }) : ''}</span>
                            </div>
                            <div className="event-details">
                              <h4 className="event-title" onClick={() => openEventDetails(ev)} style={{ cursor: 'pointer' }}>{ev.title}</h4>
                              <p className="event-time-desc">
                                {formatDate(ev.dateObj)} {ev.time ? ` • ${ev.time}` : ''}
                              </p>
                              {ev.location && (
                                <p className="event-location">
                                  <MapPin size={14} /> {ev.location}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="no-events">
                        <CalendarDays className="no-events-icon" />
                        <p>No events yet.</p>
                        <button className="btn btn-primary" onClick={() => handleOpenAddEventModal(new Date())}><Plus size={16} /> Add Your First Event</button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'all-events' && (
                currentCompanyId ? (
                  <div className="constrained-content">
                    <div className="section-header">
                      <h3 className="section-title">All Events</h3>
                    </div>
                    {allEventsSorted.length > 0 ? (
                      <div className="events-list">
                        {allEventsSorted.map(ev => (
                          <div key={ev.id} className="event-card">
                            <div className="event-date">
                              <span className="event-day">{ev.dateObj ? ev.dateObj.getDate() : '-'}</span>
                              <span className="event-month">{ev.dateObj ? ev.dateObj.toLocaleString('en-US', { month: 'short' }) : ''}</span>
                            </div>
                            <div className="event-details">
                              <h4 className="event-title" onClick={() => openEventDetails(ev)} style={{ cursor: 'pointer' }}>{ev.title}</h4>
                              <p className="event-time-desc">
                                {formatDate(ev.dateObj)} {ev.time ? ` • ${ev.time}` : ''}
                              </p>
                              {ev.location && (
                                <p className="event-location">
                                  <MapPin size={14} /> {ev.location}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="no-events">
                        <CalendarDays className="no-events-icon" />
                        <p>No events found.</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="constrained-content">
                    <div className="no-companies-selected-message">
                      <Building2 className="no-companies-icon" />
                      <p>Please create or select a company to continue.</p>
                      {user?.account_type === 'business' && (
                        <button className="btn btn-primary" onClick={handleAddCompany}><Plus size={16} /> Create Company</button>
                      )}
                    </div>
                  </div>
                )
              )}

              {activeTab === 'tasks' && (
                currentCompanyId ? (
                  <div className="constrained-content">
                    <div className="section-header">
                      <h3 className="section-title">My Tasks</h3>
                    </div>
                    {tasks.length > 0 ? (
                      <div className="tasks-list">
                        {tasks.map(task => {
                          const overdue = !task.completed && task.dueDateObj && task.dueDateObj < today;
                          return (
                            <div key={task.id} className={`task-card ${task.completed ? 'completed' : ''} ${overdue ? 'overdue' : ''}`}>
                              <div className="task-checkbox">
                                <button className="checkbox-btn" onClick={() => handleToggleTask(task.id)}>
                                  {task.completed ? <CheckSquare size={20} /> : <Square size={20} />}
                                </button>
                              </div>
                              <div className="task-content">
                                <div className="task-header">
                                  <h4 className="task-title">{task.title}</h4>
                                </div>
                                {task.description && <p className="task-description">{task.description}</p>}
                                <div className="task-footer">
                                  {task.dueDateObj && <span className={`due-date ${overdue ? 'overdue' : ''}`}>Due: {formatDate(task.dueDateObj)}</span>}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="no-tasks">
                        <CheckSquare className="no-tasks-icon" />
                        <p>No tasks yet.</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="constrained-content">
                    <div className="no-companies-selected-message">
                      <Building2 className="no-companies-icon" />
                      <p>Please create or select a company to continue.</p>
                      {user?.account_type === 'business' && (
                        <button className="btn btn-primary" onClick={handleAddCompany}><Plus size={16} /> Create Company</button>
                      )}
                    </div>
                  </div>
                )
              )}

              {activeTab === 'calendar' && (
                currentCompanyId ? (
                  <div className="constrained-content">
                    <div className="calendar-header">
                      <button className="nav-arrow" onClick={() => changeMonth(-1)}><ChevronLeft size={20} /></button>
                      <h2 className="calendar-title">
                        {currentDate.toLocaleString('en-US', { month: 'long', year: 'numeric' })}
                      </h2>
                      <button className="nav-arrow" onClick={() => changeMonth(1)}><ChevronRight size={20} /></button>
                    </div>

                    <div className="calendar-grid month-view">
                      {daysOfWeek.map(day => <div key={day} className="day-header">{day}</div>)}
                      {monthGridDays.map((date, index) => {
                        const items = eventsAndTasksForDate(date);
                        const firstTwo = items.slice(0, 2);
                        const moreCount = Math.max(0, items.length - 2);
                        return (
                          <div
                            key={index}
                            className={`calendar-day ${date ? '' : 'empty'} ${isToday(date) ? 'today' : ''} ${isSelected(date) ? 'selected' : ''} ${hasItems(date) ? 'has-item' : ''}`}
                            onClick={() => handleSelectDate(date)}
                          >
                            {date && <span className="day-number">{date.getDate()}</span>}
                            {date && firstTwo.map((item, i) => (
                              <span
                                key={i}
                                className={`item-mini-text ${item.type === 'event' ? 'event-text' : (item.completed ? 'completed-task' : 'pending-task')}`}
                                title={item.title}
                                onClick={(e) => {
                                  if (item.type === 'event') {
                                    e.stopPropagation();
                                    openEventDetails(item);
                                  }
                                }}
                                style={{ cursor: item.type === 'event' ? 'pointer' : 'default' }}
                              >
                                {item.title}
                              </span>
                            ))}
                            {date && moreCount > 0 && (
                              <div className="item-indicators">
                                <span className="item-count">+{moreCount}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="constrained-content">
                    <div className="no-companies-selected-message">
                      <Building2 className="no-companies-icon" />
                      <p>Please create or select a company to continue.</p>
                      {user?.account_type === 'business' && (
                        <button className="btn btn-primary" onClick={handleAddCompany}><Plus size={16} /> Create Company</button>
                      )}
                    </div>
                  </div>
                )
              )}

              {activeTab === 'company-team' && user?.account_type === 'business' && (
                <div className="constrained-content">
                  <div className="section">
                    <div className="section-header">
                      <h3 className="section-title">Company & Team</h3>
                    </div>

                    <div className="company-team-nav">
                      <button
                        className={`company-team-nav-tab ${companyTeamTab === 'company' ? 'active' : ''}`}
                        onClick={() => setCompanyTeamTab('company')}
                      >
                        <Building2 size={16} /> Company
                      </button>
                      <button
                        className={`company-team-nav-tab ${companyTeamTab === 'team' ? 'active' : ''}`}
                        onClick={() => setCompanyTeamTab('team')}
                      >
                        <Users size={16} /> Team
                      </button>
                    </div>

                    {companyTeamTab === 'company' && (
                      <div className="company-tab-content">
                        <div className="section-header">
                          <h4 className="settings-section-title">Company Details</h4>
                          <div className="header-actions">
                            <button className="btn btn-primary btn-small" onClick={handleAddCompany}>
                              <Plus size={16} /> Add Company
                            </button>
                            {currentCompany && (
                              <>
                                <button className="btn btn-outline btn-small" onClick={handleEditCompany}>
                                  Edit Company Name
                                </button>
                                <button className="btn btn-danger btn-small" onClick={handleDeleteCompany}>
                                  Delete Company
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {currentCompany ? (
                          <div className="form-group">
                            <label className="form-label">Current Company</label>
                            <div className="input-wrapper">
                              <Building2 className="input-icon" />
                              <input type="text" className="form-input" value={currentCompany.name} disabled />
                            </div>
                          </div>
                        ) : (
                          <div className="no-companies">
                            <Building2 className="no-companies-icon" />
                            <p>You are not currently associated with any company.</p>
                          </div>
                        )}
                      </div>
                    )}

                    {companyTeamTab === 'team' && (
                      <div className="team-tab-content">
                        <div className="section-header">
                          <h4 className="settings-section-title">Team Members</h4>
                          <div className="header-actions">
                            {currentCompany && (
                              <button className="btn btn-primary btn-small" onClick={() => setShowInviteModal(true)}>
                                <Plus size={16} /> Invite Member
                              </button>
                            )}
                          </div>
                        </div>

                        {currentCompany ? (
                          teamMembers.length > 0 ? (
                            <div className="team-members-list">
                              {teamMembers.map(m => (
                                <div key={m.id} className="team-member-item">
                                  <div className="team-member-info">
                                    <div className="team-member-avatar">{(m.name || m.email || '?').charAt(0).toUpperCase()}</div>
                                    <div>
                                      <p className="team-member-email">{m.name || m.email}</p>
                                      <span className="team-member-role">Role: {m.role}</span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="no-members">
                              <Users className="no-members-icon" />
                              <p>No members in this company yet.</p>
                              <button className="btn btn-primary" onClick={() => setShowInviteModal(true)}><Plus size={16} /> Invite First Member</button>
                            </div>
                          )
                        ) : (
                          <div className="no-companies-selected-message">
                            <Building2 className="no-companies-icon" />
                            <p>Please create or select a company to manage team members.</p>
                            <button className="btn btn-primary" onClick={handleAddCompany}><Plus size={16} /> Create Company</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'invitations' && (
                <div className="constrained-content">
                  <div className="section-header">
                    <h3 className="section-title">Team Invitations</h3>
                    <div className="header-actions">
                      <button className="btn btn-primary btn-small" onClick={() => setShowInviteModal(true)}>
                        <Plus size={16} /> Invite Member
                      </button>
                    </div>
                  </div>

                  <div className="invitations-nav">
                    <button
                      className={`invitations-nav-tab ${invitationsActiveTab === 'received' ? 'active' : ''}`}
                      onClick={() => setInvitationsActiveTab('received')}
                    >
                      Received ({receivedInvitations.length})
                    </button>
                    <button
                      className={`invitations-nav-tab ${invitationsActiveTab === 'sent' ? 'active' : ''}`}
                      onClick={() => setInvitationsActiveTab('sent')}
                    >
                      Sent ({sentInvitations.length})
                    </button>
                  </div>

                  {invitationsActiveTab === 'received' ? (
                    receivedInvitations.length > 0 ? (
                      <div className="events-list">
                        {receivedInvitations.map(inv => (
                          <div key={inv.id} className={`invitation-card ${inv.status}`}>
                            <div className="invitation-header">
                              <div className="invitation-info">
                                <h4 className="invitation-title">Invitation to join {inv.company_name}</h4>
                                <p className="invitation-organizer">From: {inv.sender_email}</p>
                              </div>
                              <div className="invitation-status">
                                <span className={`status-badge ${inv.status}`}>{inv.status}</span>
                              </div>
                            </div>
                            <div className="invitation-details">
                              <div className="detail-row"><Building2 size={16} /> <span>Company: {inv.company_name}</span></div>
                              <div className="detail-row"><CalendarDays size={16} /> <span>Sent: {new Date(inv.created_at).toLocaleDateString()}</span></div>
                            </div>
                            {inv.status === 'pending' && (
                              <div className="invitation-actions">
                                <button className="btn btn-success btn-small" onClick={() => handleInvitationResponse(inv.id, 'accepted')}>
                                  Accept
                                </button>
                                <button className="btn btn-outline btn-small" onClick={() => handleInvitationResponse(inv.id, 'declined')}>
                                  Decline
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="no-invitations">
                        <Mail className="no-invitations-icon" />
                        <p>No invitations received yet.</p>
                      </div>
                    )
                  ) : (
                    sentInvitations.length > 0 ? (
                      <div className="events-list">
                        {sentInvitations.map(inv => (
                          <div key={inv.id} className={`invitation-card ${inv.status}`}>
                            <div className="invitation-header">
                              <div className="invitation-info">
                                <h4 className="invitation-title">Invitation to {inv.recipient_email}</h4>
                                <p className="invitation-organizer">Company: {inv.company_name}</p>
                              </div>
                              <div className="invitation-status">
                                <span className={`status-badge ${inv.status}`}>{inv.status}</span>
                              </div>
                            </div>
                            <div className="invitation-details">
                              <div className="detail-row"><CalendarDays size={16} /> <span>Sent: {new Date(inv.created_at).toLocaleDateString()}</span></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="no-invitations">
                        <Mail className="no-invitations-icon" />
                        <p>No invitations sent yet.</p>
                        <button className="btn btn-primary" onClick={() => setShowInviteModal(true)}>
                          <Plus size={16} /> Invite Your First Member
                        </button>
                      </div>
                    )
                  )}
                </div>
              )}

              {activeTab === 'settings' && (
                <div className="constrained-content">
                  <div className="section">
                    <div className="section-header">
                      <h3 className="section-title">Settings</h3>
                    </div>

                    <div className="settings-nav">
                      <button
                        className={`settings-nav-tab ${settingsTab === 'profile' ? 'active' : ''}`}
                        onClick={() => { setSettingsTab('profile'); setSettingsMessage(''); setSettingsMessageType(''); }}
                        title="Profile"
                      >
                        <User size={16} /> Profile
                      </button>
                      <button
                        className={`settings-nav-tab ${settingsTab === 'preferences' ? 'active' : ''}`}
                        onClick={() => { setSettingsTab('preferences'); setSettingsMessage(''); setSettingsMessageType(''); }}
                        title="Preferences"
                      >
                        <Sun size={16} /> Preferences
                      </button>
                      <button
                        className={`settings-nav-tab ${settingsTab === 'notifications' ? 'active' : ''}`}
                        onClick={() => { setSettingsTab('notifications'); setSettingsMessage(''); setSettingsMessageType(''); }}
                        title="Notifications"
                      >
                        <BellRing size={16} /> Notifications
                      </button>
                      <button
                        className={`settings-nav-tab ${settingsTab === 'privacy' ? 'active' : ''}`}
                        onClick={() => { setSettingsTab('privacy'); setSettingsMessage(''); setSettingsMessageType(''); }}
                        title="Privacy"
                      >
                        <Shield size={16} /> Privacy
                      </button>
                      <button
                        className={`settings-nav-tab ${settingsTab === 'push' ? 'active' : ''}`}
                        onClick={() => { setSettingsTab('push'); setSettingsMessage(''); setSettingsMessageType(''); }}
                        title="Push Notifications"
                      >
                        <BellRing size={16} /> Push
                      </button>
                    </div>

                    {settingsTab === 'profile' && (
                      <div className="settings-tab-content">
                        <div className="settings-section-header">
                          <div>
                            <h4 className="settings-section-title">Profile</h4>
                            <p className="settings-section-subtitle">Manage your name and account details.</p>
                          </div>
                        </div>
                        <form onSubmit={saveProfile}>
                          <div className="form-group">
                            <label className="form-label">Name</label>
                            <div className="input-wrapper">
                              <User className="input-icon" />
                              <input
                                type="text"
                                value={settingsForm.name}
                                onChange={(e) => setSettingsForm(prev => ({ ...prev, name: e.target.value }))}
                                className="form-input"
                                placeholder="Your name"
                                required
                              />
                            </div>
                          </div>

                          <div className="form-group">
                            <label className="form-label">Email</label>
                            <div className="input-wrapper">
                              <Mail className="input-icon" />
                              <input
                                type="email"
                                value={settingsForm.email}
                                className="form-input"
                                disabled
                              />
                            </div>
                            {currentCompany && (
                              <div className="company-display">Active Company: {currentCompany.name}</div>
                            )}
                          </div>

                          {settingsMessage && (
                            <div className={`info-message ${settingsMessageType}`} style={{ marginTop: '0.5rem' }}>
                              {settingsMessage}
                            </div>
                          )}

                          <div style={{ textAlign: 'right', marginTop: '1rem' }}>
                            <button type="submit" className="btn btn-primary" disabled={settingsSaving}>
                              {settingsSaving ? 'Saving...' : 'Save Profile'}
                            </button>
                          </div>
                        </form>
                      </div>
                    )}

                    {settingsTab === 'preferences' && (
                      <div className="settings-tab-content">
                        <div className="settings-section-header">
                          <div>
                            <h4 className="settings-section-title">Preferences</h4>
                            <p className="settings-section-subtitle">Theme, language, timezone, and currency.</p>
                          </div>
                        </div>

                        <form onSubmit={savePreferences}>
                          <div className="form-group">
                            <label className="form-label">Theme</label>
                            <div className="input-wrapper">
                              <Sun className="input-icon" />
                              <select
                                className="form-select"
                                value={settingsForm.theme}
                                onChange={(e) => setSettingsForm(prev => ({ ...prev, theme: e.target.value }))}
                              >
                                <option value="light">Light</option>
                                <option value="dark">Dark</option>
                                <option value="system">System</option>
                              </select>
                            </div>
                          </div>

                          <div className="form-group">
                            <label className="form-label">Language</label>
                            <div className="input-wrapper">
                              <Languages className="input-icon" />
                              <select
                                className="form-select"
                                value={settingsForm.language}
                                onChange={(e) => setSettingsForm(prev => ({ ...prev, language: e.target.value }))}
                              >
                                {LANGUAGES.map(l => (
                                  <option key={l.code} value={l.code}>{l.name}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="form-group">
                            <label className="form-label">Timezone</label>
                            <div className="input-wrapper">
                              <Globe className="input-icon" />
                              <select
                                className="form-select"
                                value={settingsForm.timezone}
                                onChange={(e) => setSettingsForm(prev => ({ ...prev, timezone: e.target.value }))}
                              >
                                {TIMEZONES.map(tz => (
                                  <option key={tz} value={tz}>{tz}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="form-group">
                            <label className="form-label">Currency</label>
                            <div className="input-wrapper">
                              <DollarSign className="input-icon" />
                              <select
                                className="form-select"
                                value={settingsForm.currency}
                                onChange={(e) => setSettingsForm(prev => ({ ...prev, currency: e.target.value }))}
                              >
                                {CURRENCIES.map(c => (
                                  <option key={c} value={c}>{c}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {settingsMessage && (
                            <div className={`info-message ${settingsMessageType}`} style={{ marginTop: '0.5rem' }}>
                              {settingsMessage}
                            </div>
                          )}

                          <div style={{ textAlign: 'right', marginTop: '1rem' }}>
                            <button type="submit" className="btn btn-primary" disabled={settingsSaving}>
                              {settingsSaving ? 'Saving...' : 'Save Preferences'}
                            </button>
                          </div>
                        </form>
                      </div>
                    )}

                    {settingsTab === 'notifications' && (
                      <div className="settings-tab-content">
                        <div className="settings-section-header">
                          <div>
                            <h4 className="settings-section-title">Notifications</h4>
                            <p className="settings-section-subtitle">Email and in-app notifications.</p>
                          </div>
                        </div>

                        <form onSubmit={saveNotifications}>
                          <div className="setting-item">
                            <div className="setting-info">
                              <h4>Daily summary</h4>
                              <p>Receive a daily summary of your tasks and events.</p>
                            </div>
                            <label className="toggle-switch">
                              <input
                                type="checkbox"
                                checked={!!settingsForm.notifications?.email_daily}
                                onChange={(e) => setSettingsForm(prev => ({
                                  ...prev,
                                  notifications: { ...(prev.notifications || defaultNotifications), email_daily: e.target.checked }
                                }))}
                              />
                              <span className="toggle-slider"></span>
                            </label>
                          </div>

                          <div className="setting-item">
                            <div className="setting-info">
                              <h4>Weekly summary</h4>
                              <p>A weekly recap every Monday morning.</p>
                            </div>
                            <label className="toggle-switch">
                              <input
                                type="checkbox"
                                checked={!!settingsForm.notifications?.email_weekly}
                                onChange={(e) => setSettingsForm(prev => ({
                                  ...prev,
                                  notifications: { ...(prev.notifications || defaultNotifications), email_weekly: e.target.checked }
                                }))}
                              />
                              <span className="toggle-slider"></span>
                            </label>
                          </div>

                          <div className="setting-item">
                            <div className="setting-info">
                              <h4>Monthly summary</h4>
                              <p>Monthly overview of your productivity.</p>
                            </div>
                            <label className="toggle-switch">
                              <input
                                type="checkbox"
                                checked={!!settingsForm.notifications?.email_monthly}
                                onChange={(e) => setSettingsForm(prev => ({
                                  ...prev,
                                  notifications: { ...(prev.notifications || defaultNotifications), email_monthly: e.target.checked }
                                }))}
                              />
                              <span className="toggle-slider"></span>
                            </label>
                          </div>

                          <div className="setting-item">
                            <div className="setting-info">
                              <h4>1-week event reminder (Email)</h4>
                              <p>Get an email reminder 7 days before an event.</p>
                            </div>
                            <label className="toggle-switch">
                              <input
                                type="checkbox"
                                checked={!!settingsForm.notifications?.email_1week_countdown}
                                onChange={(e) => setSettingsForm(prev => ({
                                  ...prev,
                                  notifications: { ...(prev.notifications || defaultNotifications), email_1week_countdown: e.target.checked }
                                }))}
                              />
                              <span className="toggle-slider"></span>
                            </label>
                          </div>

                          <div className="setting-item">
                            <div className="setting-info">
                              <h4>Reminders (in-app)</h4>
                              <p>Show reminders inside the app for due dates and meetings.</p>
                            </div>
                            <label className="toggle-switch">
                              <input
                                type="checkbox"
                                checked={!!settingsForm.notifications?.reminders}
                                onChange={(e) => setSettingsForm(prev => ({
                                  ...prev,
                                  notifications: { ...(prev.notifications || defaultNotifications), reminders: e.target.checked }
                                }))}
                              />
                              <span className="toggle-slider"></span>
                            </label>
                          </div>

                          <div className="setting-item">
                            <div className="setting-info">
                              <h4>Invitations</h4>
                              <p>Notifications about company/team invitations.</p>
                            </div>
                            <label className="toggle-switch">
                              <input
                                type="checkbox"
                                checked={!!settingsForm.notifications?.invitations}
                                onChange={(e) => setSettingsForm(prev => ({
                                  ...prev,
                                  notifications: { ...(prev.notifications || defaultNotifications), invitations: e.target.checked }
                                }))}
                              />
                              <span className="toggle-slider"></span>
                            </label>
                          </div>

                          {settingsMessage && (
                            <div className={`info-message ${settingsMessageType}`} style={{ marginTop: '0.5rem' }}>
                              {settingsMessage}
                            </div>
                          )}

                          <div style={{ textAlign: 'right', marginTop: '1rem' }}>
                            <button type="submit" className="btn btn-primary" disabled={settingsSaving}>
                              {settingsSaving ? 'Saving...' : 'Save Notification Settings'}
                            </button>
                          </div>
                        </form>
                      </div>
                    )}

                    {settingsTab === 'privacy' && (
                      <div className="settings-tab-content">
                        <div className="settings-section-header">
                          <div>
                            <h4 className="settings-section-title">Privacy</h4>
                            <p className="settings-section-subtitle">Control who can see your profile and calendar.</p>
                          </div>
                        </div>

                        <form onSubmit={savePrivacy}>
                          <div className="form-group">
                            <label className="form-label">Profile Visibility</label>
                            <div className="input-wrapper">
                              <Shield className="input-icon" />
                              <select
                                className="form-select"
                                value={settingsForm.privacy?.profileVisibility || 'team'}
                                onChange={(e) => setSettingsForm(prev => ({
                                  ...prev,
                                  privacy: { ...(prev.privacy || {}), profileVisibility: e.target.value }
                                }))}
                              >
                                <option value="public">Public</option>
                                <option value="team">Team</option>
                                <option value="private">Private</option>
                              </select>
                            </div>
                          </div>

                          <div className="form-group">
                            <label className="form-label">Calendar Sharing</label>
                            <div className="input-wrapper">
                              <Calendar className="input-icon" />
                              <select
                                className="form-select"
                                value={settingsForm.privacy?.calendarSharing || 'private'}
                                onChange={(e) => setSettingsForm(prev => ({
                                  ...prev,
                                  privacy: { ...(prev.privacy || {}), calendarSharing: e.target.value }
                                }))}
                              >
                                <option value="public">Public</option>
                                <option value="team">Team</option>
                                <option value="private">Private</option>
                              </select>
                            </div>
                          </div>

                          {settingsMessage && (
                            <div className={`info-message ${settingsMessageType}`} style={{ marginTop: '0.5rem' }}>
                              {settingsMessage}
                            </div>
                          )}

                          <div style={{ textAlign: 'right', marginTop: '1rem' }}>
                            <button type="submit" className="btn btn-primary" disabled={settingsSaving}>
                              {settingsSaving ? 'Saving...' : 'Save Privacy Settings'}
                            </button>
                          </div>
                        </form>
                      </div>
                    )}

                    {settingsTab === 'push' && (
                      <div className="settings-tab-content">
                        <div className="settings-section-header">
                          <div>
                            <h4 className="settings-section-title">Push Notifications</h4>
                            <p className="settings-section-subtitle">
                              Enable browser push notifications for timely alerts.
                            </p>
                          </div>
                        </div>

                        <div className="setting-item" style={{ borderBottom: 'none' }}>
                          <div className="setting-info">
                            <h4>Status</h4>
                            <p>
                              {pushSupported
                                ? (settingsForm.notifications?.push ? 'Enabled' : 'Disabled')
                                : 'Not supported by this browser'}
                            </p>
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                              className="btn btn-success btn-small"
                              onClick={subscribePush}
                              disabled={pushLoading || !pushSupported}
                              type="button"
                            >
                              {pushLoading ? 'Working...' : 'Enable'}
                            </button>
                            <button
                              className="btn btn-outline btn-small"
                              onClick={unsubscribePush}
                              disabled={pushLoading || !pushSupported}
                              type="button"
                            >
                              Disable
                            </button>
                          </div>
                        </div>

                        {pushMessage && (
                          <div className={`info-message ${pushMessageType}`} style={{ marginTop: '0.5rem' }}>
                            {pushMessage}
                          </div>
                        )}

                        <div className="settings-section" style={{ marginTop: '1rem' }}>
                          <p className="settings-section-subtitle">
                            Tip: Ensure notifications are allowed for this site in your browser settings.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Company Modal */}
      {showCompanyModal && (
        <div className="modal-backdrop" onClick={() => setShowCompanyModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingCompany ? 'Edit Company' : 'Create New Company'}</h3>
              <button className="modal-close" onClick={() => setShowCompanyModal(false)}><X /></button>
            </div>
            <form onSubmit={handleCompanyFormSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Company Name</label>
                  <div className="input-wrapper">
                    <Building2 className="input-icon" />
                    <input
                      type="text"
                      name="name"
                      value={companyForm.name}
                      onChange={(e) => setCompanyForm({ name: e.target.value })}
                      className="form-input"
                      placeholder="e.g., My Awesome Company"
                      required
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowCompanyModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editingCompany ? 'Save Changes' : 'Create Company'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="modal-backdrop" onClick={() => setShowInviteModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Invite Team Member</h3>
              <button className="modal-close" onClick={() => setShowInviteModal(false)}><X /></button>
            </div>
            <form onSubmit={handleInviteFormSubmit}>
              <div className="modal-body">
                {inviteMessage && (
                  <div className="info-message" style={{ marginBottom: '1rem' }}>
                    {inviteMessage}
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Recipient Email</label>
                  <div className="input-wrapper">
                    <Mail className="input-icon" />
                    <input
                      type="email"
                      name="email"
                      value={inviteForm.email}
                      onChange={handleInviteFormChange}
                      className="form-input"
                      placeholder="member@example.com"
                      required
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Company</label>
                  <div className="input-wrapper">
                    <Building2 className="input-icon" />
                    <select
                      name="companyId"
                      value={inviteForm.companyId || ''}
                      onChange={handleInviteFormChange}
                      className="form-select"
                      required
                    >
                      <option value="">Select a company</option>
                      {(user.companies || []).map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Role</label>
                  <div className="input-wrapper">
                    <select
                      name="role"
                      value={inviteForm.role}
                      onChange={handleInviteFormChange}
                      className="form-select"
                      required
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowInviteModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary"><Plus size={16} /> Send Invitation</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Event Details Modal */}
      {showEventDetails && selectedEvent && (
        <EventDetailsModal
          event={selectedEvent}
          user={user}
          onClose={() => setShowEventDetails(false)}
          onGoToDate={() => goToEventInCalendar(selectedEvent)}
          onToggleTask={(ref) => toggleEventTaskCompletion(selectedEvent, ref)}
        />
      )}

      {/* NEW: Event Add/Edit Modal */}
      {showEventModal && (
        <EventModal
          showModal={showEventModal}
          onClose={() => setShowEventModal(false)}
          eventForm={eventForm}
          setEventForm={setEventForm}
          editingEvent={editingEvent}
          onSaveEvent={handleSaveEvent}
          currentEventTaskForm={currentEventTaskForm}
          setCurrentEventTaskForm={setCurrentEventTaskForm}
          handleAddEventTask={handleAddEventTask}
          handleEditEventTask={handleEditEventTask}
          handleDeleteEventTask={handleDeleteEventTask}
          handleToggleEventTaskCompletion={handleToggleEventTaskCompletion}
          teamMembers={teamMembers}
          user={user}
        />
      )}

      {/* NEW: Date Actions Modal */}
      {showDateActionsModal && (
        <DateActionsModal
          showModal={showDateActionsModal}
          onClose={() => setShowDateActionsModal(false)}
          selectedDate={dateForActions}
          onViewEvents={handleViewEventsForDate}
          onAddEvent={handleOpenAddEventModal}
        />
      )}

      {/* NEW: Day Items Modal (list events & tasks for a selected date) */}
      {showDayItemsModal && (
        <DayItemsModal
          showModal={showDayItemsModal}
          onClose={() => setShowDayItemsModal(false)}
          selectedDate={dateForActions || selectedDate}
          items={eventsAndTasksForDate(dateForActions || selectedDate)}
          onOpenEvent={(ev) => openEventDetails(ev)}
          onToggleTask={(taskId) => handleToggleTask(taskId)}
          onOpenInCalendar={() => {
            const d = dateForActions || selectedDate;
            if (d) {
              setSelectedDate(d);
              setCurrentDate(d);
              setActiveTab('calendar');
            }
            setShowDayItemsModal(false);
          }}
        />
      )}
    </div>
  );
};

export default Dashboard;

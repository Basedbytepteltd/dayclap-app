import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import {
  Calendar,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  MapPin,
  Clock,
  Plus,
  Search,
  Settings,
  Users,
  CheckSquare,
  Square,
  Building2,
  ChevronDown,
  Percent,
  Trash2,
  DollarSign,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import './Dashboard.css';
import LoadingAnimation from './LoadingAnimation';
import EventDetailsModal from './EventDetailsModal';
import EventModal from './EventModal';
import DateActionsModal from './DateActionsModal';
import DayItemsModal from './DayItemsModal';
import SettingsTab from './SettingsTab';
import { getCurrencySymbol, formatCurrency } from '../utils/currencyHelpers';
import {
  toUserTimezone,
  fromUserTimezone,
  formatToYYYYMMDDInUserTimezone,
  formatToHHMMInUserTimezone,
  isSameDay,
  getStartOfDayInTimezone,
  getEndOfDayInTimezone,
  getStartOfWeekInTimezone,
  getEndOfWeekInTimezone,
  getStartOfMonthInTimezone,
  getEndOfMonthInTimezone,
  getStartOfNextMonthInTimezone,
  getEndOfNextMonthInTimezone,
  getStartOfYearInTimezone,
  getEndOfYearInTimezone,
  getStartOfLastYearInTimezone,
  getEndOfLastYearInTimezone,
} from '../utils/datetimeHelpers';

// Helper: parse 'YYYY-MM-DD' as a local date (avoid UTC shift) - ONLY FOR TASK DUE DATES
function parseLocalDateFromYYYYMMDD(yyyy_mm_dd) {
  if (!yyyy_mm_dd || typeof yyyy_mm_dd !== 'string') return null;
  const parts = yyyy_mm_dd.split('-').map(Number);
  const [y, m, d] = parts;
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

const Dashboard = ({ user, onLogout, onUserUpdate }) => {
  const [activeTab, setActiveTab] = useState('calendar');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);

  const [events, setEvents] = useState([]);

  const [currentDate, setCurrentDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [selectedDate, setSelectedDate] = useState(new Date());

  const [teamMembers, setTeamMembers] = useState([]);

  const [showEventDetails, setShowEventDetails] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);

  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [eventForm, setEventForm] = useState({
    title: '',
    eventDateTime: new Date(),
    location: '',
    description: '',
    eventTasks: [],
  });
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

  const [showDateActionsModal, setShowDateActionsModal] = useState(false);
  const [dateForActions, setDateForActions] = useState(null);
  const [showDayItemsModal, setShowDayItemsModal] = useState(false);

  const [currentTime, setCurrentTime] = useState(new Date());

  const [eventFilter, setEventFilter] = useState('all');
  const eventFilterDropdownRef = useRef(null);
  const [showEventFilterDropdown, setShowEventFilterDropdown] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const currentCompanyId =
    user?.currentCompanyId ||
    user?.current_company_id ||
    (Array.isArray(user?.companies) && user.companies.length > 0 ? user.companies[0].id : null);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      if (!user?.id || !currentCompanyId) {
        setEvents([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const { data: ev, error: e1 } = await supabase.from('events').select('*').eq('company_id', currentCompanyId).order('event_datetime', { ascending: true });

        if (!cancelled) {
          const mappedEvents = (ev || []).map((e) => ({
            ...e,
            eventDateTimeObj: toUserTimezone(e.event_datetime, user?.timezone || 'UTC'),
          }));

          if (!e1) {
            setEvents(mappedEvents);
          } else {
            setEvents([]);
          }
        }
      } catch (error) {
        console.error("Error fetching events:", error);
        if (!cancelled) setEvents([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [user?.id, currentCompanyId, user?.timezone]);

  useEffect(() => {
    const fetchTeamMembersForCompany = async (companyId) => {
      if (!companyId) {
        setTeamMembers([]);
        return;
      }
      try {
        const { data: profiles, error } = await supabase.from('profiles').select('id, name, email, companies');
        if (error) {
          setTeamMembers([]);
          return;
        }
        const members = (profiles || [])
          .filter((p) => Array.isArray(p.companies) && p.companies.some((c) => String(c.id) === String(companyId)))
          .map((p) => {
            const entry = Array.isArray(p.companies) ? p.companies.find((c) => String(c.id) === String(companyId)) : null;
            return {
              id: p.id,
              name: p.name,
              email: p.email,
              role: (entry?.role || 'user').toLowerCase(),
            };
          });
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

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const stats = useMemo(() => {
    let allTasks = [];
    let totalExpenses = 0;

    events.forEach(event => {
      const eventTasks = Array.isArray(event.event_tasks) ? event.event_tasks : [];
      const mappedEventTasks = eventTasks.map(t => ({
        ...t,
        dueDateObj: t.dueDate ? parseLocalDateFromYYYYMMDD(t.dueDate) : null,
      }));
      allTasks = [...allTasks, ...mappedEventTasks];
      
      eventTasks.forEach(task => {
        totalExpenses += Number(task.expenses || 0);
      });
    });

    const totalTasks = allTasks.length;
    const completedTasks = allTasks.filter((t) => t.completed).length;
    const overdueTasks = allTasks.filter((t) => !t.completed && t.dueDateObj && t.dueDateObj < today).length;
    const pendingTasks = totalTasks - completedTasks;
    const completedPercentage = totalTasks > 0 ? (completedTasks / totalTasks * 100).toFixed(0) : 0;
    const pendingPercentage = totalTasks > 0 ? (pendingTasks / totalTasks * 100).toFixed(0) : 0;

    return {
      completedTasks,
      overdueTasks,
      pendingTasks: Math.max(0, pendingTasks),
      totalEvents: events.length,
      completedPercentage,
      pendingPercentage,
      totalExpenses,
    };
  }, [events, today]);

  const allEventsSorted = useMemo(() => {
    return [...events].sort((a, b) => (a.eventDateTimeObj?.getTime() || 0) - (b.eventDateTimeObj?.getTime() || 0));
  }, [events]);

  const filteredEvents = useMemo(() => {
    const now = new Date();
    let startDate, endDate;

    switch (eventFilter) {
      case 'today':
        startDate = getStartOfDayInTimezone(now);
        endDate = getEndOfDayInTimezone(now);
        break;
      case 'thisWeek':
        startDate = getStartOfWeekInTimezone(now);
        endDate = getEndOfWeekInTimezone(now);
        break;
      case 'thisMonth':
        startDate = getStartOfMonthInTimezone(now);
        endDate = getEndOfMonthInTimezone(now);
        break;
      case 'nextMonth':
        startDate = getStartOfNextMonthInTimezone(now);
        endDate = getEndOfNextMonthInTimezone(now);
        break;
      case 'thisYear':
        startDate = getStartOfYearInTimezone(now);
        endDate = getEndOfYearInTimezone(now);
        break;
      case 'lastYear':
        startDate = getStartOfLastYearInTimezone(now);
        endDate = getEndOfLastYearInTimezone(now);
        break;
      default:
        return allEventsSorted;
    }

    return allEventsSorted.filter(event => event.eventDateTimeObj && event.eventDateTimeObj >= startDate && event.eventDateTimeObj <= endDate);
  }, [allEventsSorted, eventFilter]);

  const allDisplayableTasks = useMemo(() => {
    let combined = [];
    events.forEach(event => {
      const eventTasks = Array.isArray(event.event_tasks) ? event.event_tasks : [];
      eventTasks.forEach(task => {
        combined.push({
          ...task,
          source: 'event',
          eventId: event.id,
          eventTitle: event.title,
          dueDateObj: task.dueDate ? parseLocalDateFromYYYYMMDD(task.dueDate) : null,
          company_id: event.company_id,
          user_id: event.user_id,
        });
      });
    });

    return combined.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      const dateA = a.dueDateObj ? a.dueDateObj.getTime() : Infinity;
      const dateB = b.dueDateObj ? b.dueDateObj.getTime() : Infinity;
      if (dateA !== dateB) return dateA - dateB;
      const priorityOrder = { high: 1, medium: 2, low: 3 };
      return (priorityOrder[a.priority] || 99) - (priorityOrder[b.priority] || 99);
    });
  }, [events]);

  const searchResults = useMemo(() => {
    const term = (searchTerm || '').toLowerCase().trim();
    if (!term) return { events: [], tasks: [] };
    const e = allEventsSorted.filter(ev => ev.title?.toLowerCase().includes(term) || ev.description?.toLowerCase().includes(term) || ev.location?.toLowerCase().includes(term));
    const t = allDisplayableTasks.filter(tk => tk.title?.toLowerCase().includes(term) || tk.description?.toLowerCase().includes(term) || tk.category?.toLowerCase().includes(term) || (tk.source === 'event' && tk.eventTitle?.toLowerCase().includes(term)));
    return { events: e, tasks: t };
  }, [searchTerm, allEventsSorted, allDisplayableTasks]);

  const daysOfWeek = useMemo(() => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], []);

  const getMonthGridDays = useCallback((refDate) => {
    const year = refDate.getFullYear();
    const month = refDate.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const firstDayIndex = firstOfMonth.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const grid = [];
    for (let i = 0; i < firstDayIndex; i++) grid.push(null);
    for (let d = 1; d <= daysInMonth; d++) grid.push(new Date(year, month, d));
    return grid;
  }, []);

  const monthGridDays = useMemo(() => getMonthGridDays(currentDate), [currentDate, getMonthGridDays]);

  const isTodayDate = useCallback((d) => d && isSameDay(d, today), [today]);
  const isSelectedDate = useCallback((d) => d && selectedDate && isSameDay(d, selectedDate), [selectedDate]);

  const eventsAndTasksForDate = useCallback((d) => {
    if (!d) return [];
    const items = [];
    events.forEach(ev => { if (ev.eventDateTimeObj && isSameDay(ev.eventDateTimeObj, d)) items.push({ type: 'event', ...ev }); });
    allDisplayableTasks.forEach(t => { if (t.dueDateObj && isSameDay(t.dueDateObj, d)) items.push({ type: 'task', ...t }); });
    return items.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'event' ? -1 : 1;
      if (a.type === 'event') return 0;
      return (a.completed ? 1 : 0) - (b.completed ? 1 : 0);
    });
  }, [events, allDisplayableTasks]);

  const changeMonth = useCallback((delta) => {
    setCurrentDate(prev => {
      const nd = new Date(prev);
      nd.setMonth(nd.getMonth() + delta);
      return nd;
    });
  }, []);

  const handleSelectDate = useCallback((date) => {
    if (!date) return;
    setSelectedDate(date);
    setDateForActions(date);
    setShowDateActionsModal(true);
  }, []);

  const handleViewEventsForDate = useCallback(() => {
    if (dateForActions) {
      setSelectedDate(dateForActions);
      setCurrentDate(new Date(dateForActions.getFullYear(), dateForActions.getMonth(), 1));
    }
    setShowDateActionsModal(false);
    setShowDayItemsModal(true);
  }, [dateForActions]);

  const handleOpenAddEventModal = useCallback((prefillDate) => {
    const baseDate = prefillDate instanceof Date && !isNaN(prefillDate.getTime()) ? prefillDate : (dateForActions instanceof Date && !isNaN(dateForActions.getTime()) ? dateForActions : new Date());
    setEditingEvent(null);
    setEventForm({ title: '', eventDateTime: baseDate, location: '', description: '', eventTasks: [] });
    setCurrentEventTaskForm({ id: null, title: '', description: '', dueDate: formatToYYYYMMDDInUserTimezone(baseDate, user?.timezone || 'UTC'), assignedTo: user?.email || '', priority: 'medium', expenses: 0, completed: false });
    setShowEventModal(true);
    setShowDateActionsModal(false);
  }, [dateForActions, user]);

  const handleSaveEvent = useCallback(async (e) => {
    e.preventDefault();
    if (!user?.id || !currentCompanyId) {
      alert('Please select a company before adding an event.');
      return;
    }

    const userTimezone = user?.timezone || 'UTC';
    const eventDateString = formatToYYYYMMDDInUserTimezone(eventForm.eventDateTime, userTimezone);
    const eventTimeString = formatToHHMMInUserTimezone(eventForm.eventDateTime, userTimezone);
    const utcEventDateTime = fromUserTimezone(eventDateString, eventTimeString, userTimezone);

    if (!utcEventDateTime) {
      alert('Invalid event date or time. Please check your input.');
      return;
    }

    const payload = {
      user_id: user.id,
      company_id: currentCompanyId,
      title: eventForm.title,
      event_datetime: utcEventDateTime,
      location: eventForm.location || null,
      description: eventForm.description || null,
      event_tasks: eventForm.eventTasks,
      last_activity_at: new Date().toISOString(),
    };

    try {
      let response = editingEvent ? await supabase.from('events').update(payload).eq('id', editingEvent.id).select() : await supabase.from('events').insert(payload).select();
      if (response.error) throw response.error;

      const { data: updatedEvents, error: fetchError } = await supabase.from('events').select('*').eq('company_id', currentCompanyId).order('event_datetime', { ascending: true });
      if (fetchError) throw fetchError;

      setEvents((updatedEvents || []).map(e => ({ ...e, eventDateTimeObj: toUserTimezone(e.event_datetime, userTimezone) })));
      setShowEventModal(false);
      setEditingEvent(null);
      setEventForm({ title: '', eventDateTime: new Date(), location: '', description: '', eventTasks: [] });
      setCurrentEventTaskForm({ id: null, title: '', description: '', dueDate: formatToYYYYMMDDInUserTimezone(new Date(), userTimezone), assignedTo: user?.email || '', priority: 'medium', expenses: 0, completed: false });
    } catch (error) {
      console.error('Error saving event:', error?.message || error);
      alert('Failed to save event: ' + (error?.message || error));
    }
  }, [eventForm, editingEvent, user, currentCompanyId]);

  const handleAddEventTask = useCallback(() => {
    if (!currentEventTaskForm.title.trim()) return;
    const newId = currentEventTaskForm.id || (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : String(Date.now()));
    const newTask = { ...currentEventTaskForm, id: newId, assignedTo: currentEventTaskForm.assignedTo || user.email, dueDate: currentEventTaskForm.dueDate || '', expenses: Number(currentEventTaskForm.expenses) || 0, completed: !!currentEventTaskForm.completed };
    setEventForm(prev => ({ ...prev, eventTasks: prev.eventTasks.some(task => task.id === newId) ? prev.eventTasks.map(task => (task.id === newId ? newTask : task)) : [...prev.eventTasks, newTask] }));
    setCurrentEventTaskForm({ id: null, title: '', description: '', dueDate: formatToYYYYMMDDInUserTimezone(eventForm.eventDateTime, user?.timezone || 'UTC'), assignedTo: user?.email || '', priority: 'medium', expenses: 0, completed: false });
  }, [currentEventTaskForm, user, eventForm.eventDateTime]);

  const handleEditEventTask = useCallback((taskToEdit) => setCurrentEventTaskForm({ ...taskToEdit }), []);

  const handleDeleteEventTask = useCallback((taskId) => {
    setEventForm(prev => ({ ...prev, eventTasks: prev.eventTasks.filter(task => task.id !== taskId) }));
    if (currentEventTaskForm.id === taskId) {
      setCurrentEventTaskForm({ id: null, title: '', description: '', dueDate: formatToYYYYMMDDInUserTimezone(eventForm.eventDateTime, user?.timezone || 'UTC'), assignedTo: user?.email || '', priority: 'medium', expenses: 0, completed: false });
    }
  }, [currentEventTaskForm.id, eventForm.eventDateTime, user]);

  const handleToggleEventTaskCompletion = useCallback((taskId) => {
    setEventForm(prev => ({ ...prev, eventTasks: prev.eventTasks.map(task => (task.id === taskId ? { ...task, completed: !task.completed } : task)) }));
  }, []);

  const openEventDetails = useCallback((ev) => {
    setSelectedEvent(ev);
    setShowEventDetails(true);
  }, []);

  const goToEventInCalendar = useCallback((ev) => {
    if (!ev) return;
    const d = ev.eventDateTimeObj || (ev.event_datetime ? toUserTimezone(ev.event_datetime, user?.timezone || 'UTC') : null);
    if (d instanceof Date && !isNaN(d.getTime())) {
      setSelectedDate(d);
      setCurrentDate(new Date(d.getFullYear(), d.getMonth(), 1));
      setActiveTab('calendar');
      setShowEventDetails(false);
    }
  }, [user]);

  const openEditEvent = useCallback((ev) => {
    if (!ev) return;
    const rawTasks = Array.isArray(ev.event_tasks) ? ev.event_tasks : Array.isArray(ev.eventTasks) ? ev.eventTasks : [];
    const normalizedTasks = rawTasks.map((t, idx) => ({ id: t?.id || (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : String(Date.now() + idx)), title: t?.title || '', description: t?.description || '', dueDate: t?.dueDate || '', assignedTo: t?.assignedTo || (user?.email || ''), priority: t?.priority || 'medium', expenses: typeof t?.expenses === 'number' ? t.expenses : Number(t?.expenses || 0), completed: !!t?.completed }));
    const eventDateTimeForForm = ev.event_datetime ? toUserTimezone(ev.event_datetime, user?.timezone || 'UTC') : new Date();
    setEventForm({ title: ev.title || '', eventDateTime: eventDateTimeForForm, location: ev.location || '', description: ev.description || '', eventTasks: normalizedTasks });
    setEditingEvent(ev);
    setShowEventDetails(false);
    setShowEventModal(true);
    setCurrentEventTaskForm({ id: null, title: '', description: '', dueDate: formatToYYYYMMDDInUserTimezone(eventDateTimeForForm, user?.timezone || 'UTC'), assignedTo: user?.email || '', priority: 'medium', expenses: 0, completed: false });
  }, [user]);

  const toggleEventTaskCompletionPersist = useCallback(async (ev, taskRef) => {
    if (!ev) return;
    const tasksArray = Array.isArray(ev.event_tasks) ? [...ev.event_tasks] : Array.isArray(ev.eventTasks) ? [...ev.eventTasks] : [];
    let idx = typeof taskRef?.index === 'number' ? taskRef.index : tasksArray.findIndex(t => t && t.id === taskRef?.id);
    if (idx < 0 || !tasksArray[idx]) return;

    const prevTasks = tasksArray;
    const task = tasksArray[idx];
    const updatedTasks = [...tasksArray];
    updatedTasks[idx] = { ...task, completed: !task.completed };

    setEvents(prev => prev.map(e => (e.id === ev.id ? { ...e, event_tasks: updatedTasks } : e)));
    if (selectedEvent?.id === ev.id) setSelectedEvent(prev => ({ ...prev, event_tasks: updatedTasks }));

    const { error } = await supabase.from('events').update({ event_tasks: updatedTasks, last_activity_at: new Date().toISOString() }).eq('id', ev.id);
    if (error) {
      setEvents(prev => prev.map(e => (e.id === ev.id ? { ...e, event_tasks: prevTasks } : e)));
      if (selectedEvent?.id === ev.id) setSelectedEvent(prev => ({ ...prev, event_tasks: prevTasks }));
      console.error('Failed to update event sub-task:', error);
    }
  }, [selectedEvent]);

  const quickAddTaskToEvent = useCallback(async (eventId, taskInput) => {
    try {
      const ev = events.find(e => e.id === eventId);
      if (!ev) return { ok: false, message: 'Event not found' };

      const taskId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : String(Date.now());
      const newTask = { id: taskId, title: taskInput.title || '', description: taskInput.description || '', dueDate: taskInput.dueDate || '', assignedTo: taskInput.assignedTo || user?.email || '', priority: taskInput.priority || 'medium', expenses: Number(taskInput.expenses) || 0, completed: !!taskInput.completed };
      const prevTasks = Array.isArray(ev.event_tasks) ? [...ev.event_tasks] : Array.isArray(ev.eventTasks) ? [...ev.eventTasks] : [];
      const updatedTasks = [...prevTasks, newTask];

      setEvents(prev => prev.map(e => (e.id === ev.id ? { ...e, event_tasks: updatedTasks } : e)));
      if (selectedEvent?.id === ev.id) setSelectedEvent(prev => ({ ...prev, event_tasks: updatedTasks }));

      const { error } = await supabase.from('events').update({ event_tasks: updatedTasks, last_activity_at: new Date().toISOString() }).eq('id', ev.id);
      if (error) {
        setEvents(prev => prev.map(e => (e.id === ev.id ? { ...e, event_tasks: prevTasks } : e)));
        if (selectedEvent?.id === ev.id) setSelectedEvent(prev => ({ ...prev, event_tasks: prevTasks }));
        return { ok: false, message: error.message || 'Failed to add task' };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err?.message || 'Unexpected error' };
    }
  }, [events, selectedEvent, user]);

  const handleToggleTask = useCallback(async (task) => {
    if (!user?.id || !currentCompanyId) return alert('Authentication or company selection is required to toggle tasks.');
    const isEventOwner = task.user_id === user.id;
    const isAssignedToCurrentUser = task.assignedTo === user.email;
    if (!isEventOwner && !isAssignedToCurrentUser) return alert('You do not have permission to toggle this task.');

    try {
      const eventToUpdate = events.find(e => e.id === task.eventId);
      if (!eventToUpdate) return console.error(`Parent event ${task.eventId} not found for task ${task.id}`);

      const updatedEventTasks = (eventToUpdate.event_tasks || []).map(et => et.id === task.id ? { ...et, completed: !et.completed } : et);
      const { error } = await supabase.from('events').update({ event_tasks: updatedEventTasks, last_activity_at: new Date().toISOString() }).eq('id', task.eventId);
      if (!error) {
        setEvents(prevEvents => prevEvents.map(e => e.id === task.eventId ? { ...e, event_tasks: updatedEventTasks } : e));
      } else {
        console.error('Error toggling event task:', error);
      }
    } catch (error) {
      console.error('Error in handleToggleTask:', error);
      alert('Failed to toggle task: ' + (error?.message || error));
    }
  }, [user, currentCompanyId, events]);

  const handleDeleteTask = useCallback(async (task) => {
    if (!user?.id || !currentCompanyId) return alert('Authentication or company selection is required to delete tasks.');
    if (!window.confirm(`Are you sure you want to delete the task \"${task.title}\"? This action cannot be undone.`)) return;

    const isEventOwner = task.user_id === user.id;
    const isAssignedToCurrentUser = task.assignedTo === user.email;
    if (!isEventOwner && !isAssignedToCurrentUser) return alert('You do not have permission to delete this task.');

    try {
      const eventToUpdate = events.find(e => e.id === task.eventId);
      if (!eventToUpdate) {
        console.error(`Parent event ${task.eventId} not found for task ${task.id}`);
        return alert('Failed to delete task: Parent event not found.');
      }

      const updatedEventTasks = (eventToUpdate.event_tasks || []).filter(et => et.id !== task.id);
      const { error } = await supabase.from('events').update({ event_tasks: updatedEventTasks, last_activity_at: new Date().toISOString() }).eq('id', task.eventId);
      if (!error) {
        setEvents(prevEvents => prevEvents.map(e => e.id === task.eventId ? { ...e, event_tasks: updatedEventTasks } : e));
      } else {
        console.error('Error deleting event task:', error);
        alert('Failed to delete task: ' + (error?.message || error));
      }
    } catch (error) {
      console.error('Error in handleDeleteTask:', error);
      alert('Failed to delete task: ' + (error?.message || error));
    }
  }, [user, currentCompanyId, events]);

  const handleCompanySwitch = useCallback(async (companyId) => {
    if (!user || user.currentCompanyId === companyId) {
      setShowCompanyDropdown(false);
      return;
    }
    await onUserUpdate({ ...user, currentCompanyId: companyId });
    setShowCompanyDropdown(false);
  }, [user, onUserUpdate]);

  const handleDeleteEvent = useCallback(async (eventId) => {
    if (!user?.id || !currentCompanyId) return alert('Authentication or company selection is required to delete an event.');
    try {
      const { error } = await supabase.from('events').delete().eq('id', eventId).eq('company_id', currentCompanyId);
      if (error) throw error;
      setEvents(prevEvents => prevEvents.filter(event => event.id !== eventId));
      setShowEventDetails(false);
      setSelectedEvent(null);
      alert('Event deleted successfully!');
    } catch (error) {
      console.error('Error deleting event:', error);
      alert('Failed to delete event: ' + (error?.message || error));
    }
  }, [user, currentCompanyId]);

  const getInitialSettingsSubTab = useMemo(() => {
    if (activeTab === 'settings') return 'profile';
    if (activeTab === 'company-team') return 'company-team';
    return 'profile';
  }, [activeTab]);

  const formatDateTimeForTimezone = useCallback((date, timezone) => {
    if (!date || !timezone) return 'N/A';
    try {
      return new Intl.DateTimeFormat('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: timezone, hour12: true }).format(date);
    } catch (e) {
      console.error('Error formatting date for timezone:', e);
      return 'Invalid Timezone';
    }
  }, []);

  const eventFilterOptions = useMemo(() => [
    { key: 'all', label: 'All' }, { key: 'today', label: 'Today' }, { key: 'thisWeek', label: 'This Week' },
    { key: 'thisMonth', label: 'This Month' }, { key: 'nextMonth', label: 'Next Month' },
    { key: 'thisYear', label: 'This Year' }, { key: 'lastYear', label: 'Last Year' },
  ], []);

  const handleSelectEventFilter = useCallback((filterKey) => {
    setEventFilter(filterKey);
    setShowEventFilterDropdown(false);
  }, []);

  const handleEventFilterDropdownBlur = useCallback((e) => {
    if (eventFilterDropdownRef.current && !eventFilterDropdownRef.current.contains(e.relatedTarget)) {
      setShowEventFilterDropdown(false);
    }
  }, []);

  // ** FIX: Moved all modal handler callbacks to the top level **
  const handleCloseEventModal = useCallback(() => setShowEventModal(false), []);
  const handleCloseEventDetailsModal = useCallback(() => { setShowEventDetails(false); setSelectedEvent(null); }, []);
  const handleGoToDateFromDetails = useCallback(() => goToEventInCalendar(selectedEvent), [selectedEvent, goToEventInCalendar]);
  const handleToggleTaskFromDetails = useCallback((taskRef) => toggleEventTaskCompletionPersist(selectedEvent, taskRef), [selectedEvent, toggleEventTaskCompletionPersist]);
  const handleEditFromDetails = useCallback(() => openEditEvent(selectedEvent), [selectedEvent, openEditEvent]);
  const handleQuickAddFromDetails = useCallback((taskInput) => quickAddTaskToEvent(selectedEvent?.id, taskInput), [selectedEvent, quickAddTaskToEvent]);
  const handleCloseDateActionsModal = useCallback(() => setShowDateActionsModal(false), []);
  const handleAddEventFromActions = useCallback(() => handleOpenAddEventModal(dateForActions), [dateForActions, handleOpenAddEventModal]);
  const handleCloseDayItemsModal = useCallback(() => setShowDayItemsModal(false), []);
  const handleOpenEventFromDayItems = useCallback((ev) => { setShowDayItemsModal(false); openEventDetails(ev); }, [openEventDetails]);
  const handleOpenInCalendarFromDayItems = useCallback(() => { setActiveTab('calendar'); setShowDayItemsModal(false); }, []);


  if (loading) {
    return (
      <div className="dashboard">
        <header className="dashboard-header">
          <div className="container dashboard-nav">
            <div className="nav-items">
              <div className="logo"><Calendar className="logo-icon" /><span>DayClap</span></div>
            </div>
          </div>
        </header>
        <main className="dashboard-layout">
          <aside className="sidebar">
            <nav className="sidebar-nav">
              <button className="nav-tab"><LayoutDashboard className="tab-icon" />Overview</button>
              <button className="nav-tab active"><CalendarDays className="tab-icon" />Calendar</button>
            </nav>
          </aside>
          <section className="main-content"><LoadingAnimation message="Loading your data..." /></section>
        </main>
      </div>
    );
  }

  return (
    <div className={`dashboard ${activeTab === 'calendar' ? 'calendar-active' : ''}`}>
      <header className="dashboard-header">
        <div className="container dashboard-nav">
          <div className="nav-items">
            <div className="logo"><Calendar className="logo-icon" /><span>DayClap</span></div>
          </div>
          <div className="nav-items search-bar">
            <Search className="search-icon" /><input type="text" className="search-input" placeholder="Search events or tasks..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            {searchTerm && <button className="clear-search-btn" onClick={() => setSearchTerm('')} title="Clear">&times;</button>}
          </div>
          <div className="nav-items company-selector">
            <button className="company-btn" onClick={() => setShowCompanyDropdown(prev => !prev)}>
              <Building2 size={16} /><span>{user?.companies?.find(c => c.id === user.currentCompanyId)?.name || 'Select Company'}</span><ChevronDown size={16} className={`dropdown-arrow ${showCompanyDropdown ? 'open' : ''}`} />
            </button>
            {showCompanyDropdown && (
              <ul className="company-dropdown">
                {user?.companies?.map(company => (<li key={company.id} className={`company-option ${user.currentCompanyId === company.id ? 'active' : ''}`} onClick={() => handleCompanySwitch(company.id)}><Building2 size={16} />{company.name}</li>))}
                <div className="company-divider" />
                <li className="company-option" onClick={() => { setActiveTab('company-team'); setShowCompanyDropdown(false); }}><Plus size={16} /> Add New Company</li>
              </ul>
            )}
          </div>
          <div className="nav-items user-info">
            <div className="user-details"><p className="user-name">{user?.name || user?.email}</p></div>
            <button className="btn-icon-small header-settings-btn" onClick={() => setActiveTab('settings')} title="Settings"><Settings size={20} /></button>
            <button className="btn btn-outline btn-small" onClick={onLogout}><LogOut size={16} /> Logout</button>
          </div>
        </div>
      </header>
      <main className="dashboard-layout">
        <aside className="sidebar">
          <nav className="sidebar-nav">
            <button className={`nav-tab ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')} title="Overview"><LayoutDashboard className="tab-icon" />Overview</button>
            <button className={`nav-tab ${activeTab === 'calendar' ? 'active' : ''}`} onClick={() => setActiveTab('calendar')} title="Calendar"><CalendarDays className="tab-icon" />Calendar</button>
            <button className={`nav-tab ${activeTab === 'events' ? 'active' : ''}`} onClick={() => setActiveTab('events')} title="Events"><Calendar className="tab-icon" />Events</button>
            <button className={`nav-tab ${activeTab === 'tasks' ? 'active' : ''}`} onClick={() => setActiveTab('tasks')} title="Tasks"><CheckSquare className="tab-icon" />Tasks</button>
            <button className={`nav-tab ${activeTab === 'company-team' ? 'active' : ''}`} onClick={() => setActiveTab('company-team')} title="Company & Team"><Users className="tab-icon" />Company & Team</button>
            <button className={`nav-tab ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')} title="Settings"><Settings className="tab-icon" />Settings</button>
          </nav>
        </aside>
        <section className="main-content">
          {activeTab === 'overview' && <div className="constrained-content">
      <div className="overview-header">
        <h2>Welcome back{user?.name ? `, ${user.name}` : ''}</h2>
        <p className="overview-subtitle">Here's a quick look at your productivity</p>
        <p className="current-datetime"><Clock size={16} style={{ marginRight: '0.5rem' }} />{formatDateTimeForTimezone(currentTime, user?.timezone)}</p>
      </div>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-icon completed"><CheckSquare /></div><div className="stat-content"><h3>{stats.completedTasks}</h3><p>Tasks Completed</p></div></div>
        <div className="stat-card"><div className="stat-icon pending"><Square /></div><div className="stat-content"><h3>{stats.pendingTasks}</h3><p>Tasks Pending</p></div></div>
        <div className="stat-card"><div className="stat-icon overdue"><Square /></div><div className="stat-content"><h3>{stats.overdueTasks}</h3><p>Tasks Overdue</p></div></div>
        <div className="stat-card"><div className="stat-icon"><Calendar /></div><div className="stat-content"><h3>{stats.totalEvents}</h3><p>Total Events</p></div></div>
        <div className="stat-card"><div className="stat-icon expenses"><DollarSign /></div><div className="stat-content"><h3>{formatCurrency(stats.totalExpenses, user?.currency || 'USD')}</h3><p>Total Expenses</p></div></div>
        <div className="stat-card percentage-card"><div className="stat-icon percentage-completed"><Percent /></div><div className="stat-content"><h3>{stats.completedPercentage}%</h3><p>Tasks Completed</p></div></div>
        <div className="stat-card percentage-card"><div className="stat-icon percentage-pending"><Percent /></div><div className="stat-content"><h3>{stats.pendingPercentage}%</h3><p>Tasks Pending</p></div></div>
      </div>
      <div className="section">
        <div className="section-header">
          <h3 className="section-title">Upcoming Events</h3>
          <div className="header-actions">
            <div className="event-filter-dropdown-wrapper" ref={eventFilterDropdownRef} onBlur={handleEventFilterDropdownBlur}>
              <button type="button" className={`event-filter-display-button ${showEventFilterDropdown ? 'open' : ''}`} onClick={() => setShowEventFilterDropdown(prev => !prev)}>
                <span>{eventFilterOptions.find(opt => opt.key === eventFilter)?.label || 'Filter Events'}</span><ChevronDown size={16} className="dropdown-arrow" style={{ marginLeft: 'auto' }} />
              </button>
              {showEventFilterDropdown && <div className="event-filter-options">{eventFilterOptions.map(option => <div key={option.key} className={`event-filter-option-item ${eventFilter === option.key ? 'active' : ''}`} onClick={() => handleSelectEventFilter(option.key)} onMouseDown={(e) => e.preventDefault()}>{option.label}</div>)}</div>}
            </div>
            <button className="btn btn-primary btn-small" onClick={() => handleOpenAddEventModal(new Date())}><Plus size={16} /> Add Event</button>
          </div>
        </div>
        <div className="events-list">
          {filteredEvents.length === 0 ? <div className="no-events"><CalendarDays className="no-events-icon" /><p>No events found for this filter.</p></div> : filteredEvents.slice(0, 5).map(ev => {
            const d = ev.eventDateTimeObj;
            const day = d ? d.getDate() : '-';
            const month = d ? d.toLocaleString('en-US', { month: 'short' }) : '';
            const time = d ? formatToHHMMInUserTimezone(d, user?.timezone || 'UTC') : '';
            return (<div key={ev.id} className="event-card"><div className="event-date"><span className="event-day">{day}</span><span className="event-month">{month}</span></div><div className="event-details"><h4 className="event-title" onClick={() => openEventDetails(ev)} title="Open details">{ev.title}</h4><p className="event-time-desc">{time ? <><Clock size={14} /> {time}</> : 'All Day'}</p>{ev.location && <p className="event-location"><MapPin size={14} /> {ev.location}</p>}</div></div>);
          })}
        </div>
      </div>
      {searchTerm && <div className="section"><div className="section-header"><h3 className="section-title">Search Results</h3></div>{!searchResults.events.length && !searchResults.tasks.length ? <div className="no-events"><Search className="no-events-icon" /><p>No results for \"{searchTerm}\"</p></div> : <>{searchResults.events.length > 0 && <div className="events-list">{searchResults.events.map(ev => { const d = ev.eventDateTimeObj; const day = d ? d.getDate() : '-'; const month = d ? d.toLocaleString('en-US', { month: 'short' }) : ''; const time = d ? formatToHHMMInUserTimezone(d, user?.timezone || 'UTC') : ''; return (<div key={ev.id} className="event-card"><div className="event-date"><span className="event-day">{day}</span><span className="event-month">{month}</span></div><div className="event-details"><h4 className="event-title" onClick={() => openEventDetails(ev)} title="Open details">{ev.title}</h4><p className="event-time-desc">{time ? <><Clock size={14} /> {time}</> : 'All Day'}</p>{ev.location && <p className="event-location"><MapPin size={14} /> {ev.location}</p>}</div></div>); })}</div>}</>}</div>}
    </div>}
          {activeTab === 'calendar' && <div className="calendar-content constrained-content">
      <div className="calendar-section">
        <div className="calendar-header">
          <button className="nav-arrow" onClick={() => changeMonth(-1)} title="Previous month"><ChevronLeft /></button>
          <h3 className="calendar-title">{currentDate.toLocaleString('en-US', { month: 'long', year: 'numeric' })}</h3>
          <button className="nav-arrow" onClick={() => changeMonth(1)} title="Next month"><ChevronRight /></button>
          <div className="header-actions" style={{ marginLeft: 'auto' }}><button className="btn btn-primary btn-small" onClick={() => handleOpenAddEventModal(selectedDate)}><Plus size={16} /> Add Event</button></div>
        </div>
        <div className="calendar-grid month-view">
          {daysOfWeek.map(d => <div key={d} className="day-header">{d}</div>)}
          {monthGridDays.map((d, i) => {
            if (!d) return <div key={`empty-${i}`} className="calendar-day empty" />;
            const items = eventsAndTasksForDate(d);
            const classes = ['calendar-day', isTodayDate(d) ? 'today' : '', isSelectedDate(d) ? 'selected' : '', items.length > 0 ? 'has-item' : ''].filter(Boolean).join(' ');
            return (<div key={d.toISOString()} className={classes} onClick={() => handleSelectDate(d)}><div className="day-number">{d.getDate()}</div>{items.slice(0, 3).map(it => it.type === 'event' ? <span key={`ev-${it.id}`} className="item-mini-text event-text" title={it.title}>{it.title}</span> : <span key={`tk-${it.id}`} className={`item-mini-text ${it.completed ? 'completed-task' : 'pending-task'}`} title={it.title}>{it.title}</span>)}{items.length > 3 && <div className="item-indicators"><span className="item-count">+{items.length - 3}</span></div>}</div>);
          })}
        </div>
      </div>
    </div>}
          {activeTab === 'events' && <div className="constrained-content">
      <div className="section-header">
        <h3 className="section-title">All Events</h3>
        <div className="header-actions"><button className="btn btn-primary btn-small" onClick={() => handleOpenAddEventModal(new Date())}><Plus size={16} /> Add Event</button></div>
      </div>
      <div className="events-list">
        {allEventsSorted.length === 0 ? <div className="no-events"><CalendarDays className="no-events-icon" /><p>No events found.</p></div> : allEventsSorted.map(ev => {
          const d = ev.eventDateTimeObj;
          const day = d ? d.getDate() : '-';
          const month = d ? d.toLocaleString('en-US', { month: 'short' }) : '';
          const time = d ? formatToHHMMInUserTimezone(d, user?.timezone || 'UTC') : '';
          return (<div key={ev.id} className="event-card"><div className="event-date"><span className="event-day">{day}</span><span className="event-month">{month}</span></div><div className="event-details"><h4 className="event-title" onClick={() => openEventDetails(ev)} title="Open details">{ev.title}</h4><p className="event-time-desc">{time ? <><Clock size={14} /> {time}</> : 'All Day'}</p>{ev.location && <p className="event-location"><MapPin size={14} /> {ev.location}</p>}</div></div>);
        })}
      </div>
    </div>}
          {activeTab === 'tasks' && <div className="constrained-content">
      <div className="section-header"><h3 className="section-title">All Tasks</h3></div>
      <div className="tasks-list">
        {allDisplayableTasks.length === 0 ? (
          <div className="no-tasks"><Square className="no-tasks-icon" /><p>No tasks found.</p></div>
        ) : (
          allDisplayableTasks.map(t => (
            <div key={t.id} className={`task-card ${t.completed ? 'completed' : ''} ${t.dueDateObj && t.dueDateObj < today && !t.completed ? 'overdue' : ''}`}>
              <div className="task-checkbox">
                <button className="checkbox-btn" onClick={() => handleToggleTask(t)} disabled={!user || (t.source === 'event' && t.assignedTo !== user.email && t.user_id !== user.id)}>
                  {t.completed ? <CheckSquare size={20} /> : <Square size={20} />}
                </button>
              </div>
              <div className="task-content">
                {t.source === 'event' && t.eventTitle && <div className="task-event-name" title={`From event: ${t.eventTitle}`}><CalendarDays size={14} /> <span>{t.eventTitle}</span></div>}
                <div className="task-header">
                  <h4 className="task-title">{t.title}</h4>
                  <div className="task-actions">
                    <button className="btn-icon-small delete" onClick={() => handleDeleteTask(t)} title="Delete Task" disabled={!user || (t.source === 'event' && t.assignedTo !== user.email && t.user_id !== user.id)}><Trash2 size={16} /></button>
                  </div>
                </div>
                {t.description && <p className="task-description">{t.description}</p>}
                <div className="task-footer">
                  {t.assignedTo && <span>Assigned to: <span className="assigned-to">{t.assignedTo === user.email ? 'Me' : t.assignedTo}</span></span>}
                  {t.dueDateObj && <span className={`due-date ${t.dueDateObj < today && !t.completed ? 'overdue' : ''}`}>Due: {t.dueDateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
                  {t.priority && <span className={`priority-badge ${t.priority}`}>{t.priority}</span>}
                  {typeof t.expenses === 'number' && t.expenses > 0 && <span className="task-expenses">Expenses: {getCurrencySymbol(user?.currency || 'USD')} {formatCurrency(t.expenses, user?.currency || 'USD')}</span>}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>}
          {activeTab === 'settings' && <SettingsTab user={user} onUserUpdate={onUserUpdate} initialSubTab={getInitialSettingsSubTab} />}
          {activeTab === 'company-team' && <SettingsTab user={user} onUserUpdate={onUserUpdate} initialSubTab={getInitialSettingsSubTab} />}
        </section>
      </main>

      <EventModal
        showModal={showEventModal}
        onClose={handleCloseEventModal}
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
      <EventDetailsModal
        event={selectedEvent}
        user={user}
        teamMembers={teamMembers}
        onClose={handleCloseEventDetailsModal}
        onGoToDate={handleGoToDateFromDetails}
        onToggleTask={handleToggleTaskFromDetails}
        onEdit={handleEditFromDetails}
        onDeleteEvent={handleDeleteEvent}
        onQuickAddTask={handleQuickAddFromDetails}
      />
      <DateActionsModal
        showModal={showDateActionsModal}
        onClose={handleCloseDateActionsModal}
        selectedDate={dateForActions}
        onViewEvents={handleViewEventsForDate}
        onAddEvent={handleAddEventFromActions}
      />
      <DayItemsModal
        showModal={showDayItemsModal}
        onClose={handleCloseDayItemsModal}
        selectedDate={selectedDate}
        items={eventsAndTasksForDate(selectedDate)}
        onOpenEvent={handleOpenEventFromDayItems}
        onToggleTask={handleToggleTask}
        onOpenInCalendar={handleOpenInCalendarFromDayItems}
      />
    </div>
  );
};

export default Dashboard;

import React, { useEffect, useMemo, useState } from 'react';
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
  Percent, // NEW: Import Percent icon
  ListTodo, // NEW: Import ListTodo for task source badge
  Trash2, // NEW: Import Trash2 icon for delete
  Edit, // NEW: Import Edit icon for future task editing
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import './Dashboard.css';
import LoadingAnimation from './LoadingAnimation';
import EventDetailsModal from './EventDetailsModal';
import EventModal from './EventModal';
import DateActionsModal from './DateActionsModal';
import DayItemsModal from './DayItemsModal';
import SettingsTab from './SettingsTab';
import { getCurrencySymbol, formatCurrency } from '../utils/currencyHelpers'; // NEW: Import currency helpers

// Parse 'YYYY-MM-DD' into a local Date (avoids UTC shift)
function toLocalDate(yyyy_mm_dd) {
  if (!yyyy_mm_dd) return null;
  const [y, m, d] = String(yyyy_mm_dd).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, (m || 1) - 1, d || 1);
}

// Format Date -> 'YYYY-MM-DD' in LOCAL time (no UTC conversion)
function formatLocalYMD(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Pretty date
function formatPretty(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

const Dashboard = ({ user, onLogout, onUserUpdate }) => {
  const [activeTab, setActiveTab] = useState('calendar'); // 'overview' | 'calendar' | 'events' | 'tasks' | 'settings' | 'company-team'
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false); // NEW: State for company dropdown

  const [events, setEvents] = useState([]); // events from DB with dateObj
  // REMOVED: tasks state is removed as standalone tasks are no longer supported
  // const [tasks, setTasks] = useState([]); // tasks from DB with dueDateObj

  const [currentDate, setCurrentDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [selectedDate, setSelectedDate] = useState(new Date());

  // Team members (for assigning tasks inside EventModal)
  const [teamMembers, setTeamMembers] = useState([]);

  // Event details
  const [showEventDetails, setShowEventDetails] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);

  // Event Add/Edit
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [eventForm, setEventForm] = useState({
    title: '',
    date: new Date(),
    time: '',
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

  // Day actions / items
  const [showDateActionsModal, setShowDateActionsModal] = useState(false);
  const [dateForActions, setDateForActions] = useState(null);
  const [showDayItemsModal, setShowDayItemsModal] = useState(false);

  const currentCompanyId =
    user?.currentCompanyId ||
    user?.current_company_id ||
    (Array.isArray(user?.companies) && user.companies.length > 0 ? user.companies[0].id : null);

  // Fetch events (tasks are now embedded within events)
  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      if (!user?.id || !currentCompanyId) {
        setEvents([]);
        // setTasks([]); // REMOVED
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const { data: ev, error: e1 } = await supabase.from('events').select('*').eq('company_id', currentCompanyId).order('date', { ascending: true });
        // REMOVED: Fetching standalone tasks
        // const { data: tk, error: e2 } = await supabase.from('tasks').select('*').eq('company_id', currentCompanyId).order('due_date', { ascending: true });

        if (!cancelled) {
          const mappedEvents = (ev || []).map((e) => ({
            ...e,
            dateObj: toLocalDate(e.date),
          }));
          // REMOVED: Mapping standalone tasks
          // const mappedTasks = (tk || []).map((t) => ({
          //   ...t,
          //   dueDateObj: toLocalDate(t.due_date),
          // }));

          if (!e1) { // Only check for event errors
            setEvents(mappedEvents);
            // setTasks(mappedTasks); // REMOVED
          } else {
            setEvents([]);
            // setTasks([]); // REMOVED
          }
        }
      } catch {
        if (!cancelled) {
          setEvents([]);
          // setTasks([]); // REMOVED
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

  // Fetch team members for current company
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

  // Derived data
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const stats = useMemo(() => {
    let allTasks = []; // Start with an empty array, as standalone tasks are removed

    // Add tasks from events
    events.forEach(event => {
      const eventTasks = Array.isArray(event.event_tasks) ? event.event_tasks : [];
      const mappedEventTasks = eventTasks.map(t => ({
        ...t,
        dueDateObj: t.dueDate ? toLocalDate(t.dueDate) : null, // Parse dueDate string to Date object
      }));
      allTasks = [...allTasks, ...mappedEventTasks];
    });

    const totalTasks = allTasks.length;
    const completedTasks = allTasks.filter((t) => t.completed).length;
    
    // Filter overdue tasks from the combined list
    const overdueTasks = allTasks.filter((t) => {
      // Ensure task is not completed and has a valid, past due date
      return !t.completed && t.dueDateObj && t.dueDateObj < today;
    }).length;
    
    const pendingTasks = totalTasks - completedTasks; // Simpler calculation for pending

    const completedPercentage = totalTasks > 0 ? (completedTasks / totalTasks * 100).toFixed(0) : 0;
    const pendingPercentage = totalTasks > 0 ? (pendingTasks / totalTasks * 100).toFixed(0) : 0;

    return {
      completedTasks,
      overdueTasks,
      pendingTasks: Math.max(0, pendingTasks), // Ensure it's not negative
      totalEvents: events.length,
      completedPercentage,
      pendingPercentage,
    };
  }, [events, today]); // REMOVED: tasks from dependencies

  const allEventsSorted = useMemo(() => {
    return [...events].sort((a, b) => {
      const ta = a.dateObj?.getTime() || 0;
      const tb = b.dateObj?.getTime() || 0;
      return ta - tb;
    });
  }, [events]);

  // NEW: Combine and sort all tasks (now only event-embedded) for display
  const allDisplayableTasks = useMemo(() => {
    let combined = [];

    // REMOVED: Adding standalone tasks from the 'tasks' table

    // Add event tasks from the 'events' table
    events.forEach(event => {
      const eventTasks = Array.isArray(event.event_tasks) ? event.event_tasks : [];
      eventTasks.forEach(task => {
        combined.push({
          ...task,
          source: 'event', // All tasks are now 'event' source
          eventId: event.id,
          eventTitle: event.title,
          dueDateObj: task.dueDate ? toLocalDate(task.dueDate) : null, // Ensure dueDate is parsed
          company_id: event.company_id,
          user_id: event.user_id, // Inherit user_id from parent event for permission checks
        });
      });
    });

    // Sort tasks: incomplete first, then by due date, then by priority
    return combined.sort((a, b) => {
      // Incomplete tasks first
      if (a.completed !== b.completed) {
        return a.completed ? 1 : -1;
      }

      // Then by due date (nulls last)
      const dateA = a.dueDateObj ? a.dueDateObj.getTime() : Infinity;
      const dateB = b.dueDateObj ? b.dueDateObj.getTime() : Infinity;
      if (dateA !== dateB) {
        return dateA - dateB;
      }

      // Then by priority (high, medium, low)
      const priorityOrder = { high: 1, medium: 2, low: 3 };
      const pA = priorityOrder[a.priority] || 99;
      const pB = priorityOrder[b.priority] || 99;
      return pA - pB;
    });
  }, [events]); // Dependencies: only events from DB

  const searchResults = useMemo(() => {
    const term = (searchTerm || '').toLowerCase().trim();
    if (!term) return { events: [], tasks: [] };
    const e = allEventsSorted.filter(
      (ev) =>
        ev.title?.toLowerCase().includes(term) ||
        ev.description?.toLowerCase().includes(term) ||
        ev.location?.toLowerCase().includes(term)
    );
    const t = allDisplayableTasks.filter( // Use allDisplayableTasks for search
      (tk) =>
        tk.title?.toLowerCase().includes(term) ||
        tk.description?.toLowerCase().includes(term) ||
        tk.category?.toLowerCase().includes(term) ||
        (tk.source === 'event' && tk.eventTitle?.toLowerCase().includes(term))
    );
    return { events: e, tasks: t };
  }, [searchTerm, allEventsSorted, allDisplayableTasks]); // Updated dependencies

  // Calendar helpers
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
    events.forEach((ev) => {
      if (ev.dateObj && ev.dateObj.toDateString() === key) items.push({ type: 'event', ...ev });
    });
    // Use allDisplayableTasks to filter for tasks on this date
    allDisplayableTasks.forEach((t) => {
      if (t.dueDateObj && t.dueDateObj.toDateString() === key) items.push({ type: 'task', ...t });
    });
    return items.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'event' ? -1 : 1;
      if (a.type === 'event') return 0;
      // tasks: incomplete first
      return (a.completed ? 1 : 0) - (b.completed ? 1 : 0);
    });
  };

  const hasItems = (d) => eventsAndTasksForDate(d).length > 0;

  const changeMonth = (delta) => {
    setCurrentDate((prev) => {
      const nd = new Date(prev);
      nd.setMonth(nd.getMonth() + delta);
      return nd;
    });
  };

  const handleSelectDate = (date) => {
    if (!date) return;
    setSelectedDate(date);
    setDateForActions(date);
    setShowDateActionsModal(true);
  };

  const handleViewEventsForDate = () => {
    if (dateForActions) {
      setSelectedDate(dateForActions);
      setCurrentDate(new Date(dateForActions.getFullYear(), dateForActions.getMonth(), 1));
    }
    setShowDateActionsModal(false);
    setShowDayItemsModal(true);
  };

  // Event modal open
  const handleOpenAddEventModal = (prefillDate) => {
    const baseDate =
      prefillDate instanceof Date && !isNaN(prefillDate.getTime())
        ? prefillDate
        : (dateForActions instanceof Date && !isNaN(dateForActions.getTime()) ? dateForActions : new Date());

    setEditingEvent(null);
    setEventForm({
      title: '',
      date: baseDate,
      time: '',
      location: '',
      description: '',
      eventTasks: [],
    });
    setCurrentEventTaskForm({
      id: null,
      title: '',
      description: '',
      dueDate: formatLocalYMD(baseDate), // PRE-FILL: Set dueDate to the event's baseDate
      assignedTo: user?.email || '',
      priority: 'medium',
      expenses: 0,
      completed: false,
    });
    setShowEventModal(true);
    setShowDateActionsModal(false);
  };

  // Save event (INSERT or UPDATE) with LOCAL date string (fixes off-by-one)
  const handleSaveEvent = async (e) => {
    e.preventDefault();
    if (!user?.id || !currentCompanyId) {
      alert('Please select a company before adding an event.');
      return;
    }

    const payload = {
      user_id: user.id,
      company_id: currentCompanyId,
      title: eventForm.title,
      date: formatLocalYMD(eventForm.date), // CRITICAL: Local date string
      time: eventForm.time || null,
      location: eventForm.location || null,
      description: eventForm.description || null,
      event_tasks: eventForm.eventTasks,
      last_activity_at: new Date().toISOString(),
    };

    try {
      let response;
      if (editingEvent) {
        response = await supabase.from('events').update(payload).eq('id', editingEvent.id).select();
      } else {
        response = await supabase.from('events').insert(payload).select();
      }
      if (response.error) throw response.error;

      const { data: updatedEvents, error: fetchError } = await supabase
        .from('events')
        .select('*')
        .eq('company_id', currentCompanyId)
        .order('date', { ascending: true });
      if (fetchError) throw fetchError;

      setEvents((updatedEvents || []).map((e) => ({ ...e, dateObj: toLocalDate(e.date) })));
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
      console.error('Error saving event:', error?.message || error);
      alert('Failed to save event: ' + (error?.message || error));
    }
  };

  // Event task handlers for EventModal (edit-time only)
  const handleAddEventTask = () => {
    if (!currentEventTaskForm.title.trim()) return;
    const newId =
      currentEventTaskForm.id ||
      (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : String(Date.now()));
    const newTask = {
      ...currentEventTaskForm,
      id: newId,
      assignedTo: currentEventTaskForm.assignedTo || user.email,
      dueDate: currentEventTaskForm.dueDate || '',
      expenses: Number(currentEventTaskForm.expenses) || 0,
      completed: !!currentEventTaskForm.completed,
    };

    setEventForm((prev) => ({
      ...prev,
      eventTasks: prev.eventTasks.some((task) => task.id === newId)
        ? prev.eventTasks.map((task) => (task.id === newId ? newTask : task))
        : [...prev.eventTasks, newTask],
    }));

    setCurrentEventTaskForm({
      id: null,
      title: '',
      description: '',
      dueDate: formatLocalYMD(eventForm.date), // PRE-FILL: Reset dueDate to current event's date
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
    setEventForm((prev) => ({
      ...prev,
      eventTasks: prev.eventTasks.filter((task) => task.id !== taskId),
    }));
    if (currentEventTaskForm.id === taskId) {
      setCurrentEventTaskForm({
        id: null,
        title: '',
        description: '',
        dueDate: formatLocalYMD(eventForm.date), // PRE-FILL: Reset dueDate to current event's date
        assignedTo: user?.email || '',
        priority: 'medium',
        expenses: 0,
        completed: false,
      });
    }
  };

  const handleToggleEventTaskCompletion = (taskId) => {
    setEventForm((prev) => ({
      ...prev,
      eventTasks: prev.eventTasks.map((task) => (task.id === taskId ? { ...task, completed: !task.completed } : task)),
    }));
  };

  // Open event details
  const openEventDetails = (ev) => {
    setSelectedEvent(ev);
    setShowEventDetails(true);
  };

  // Go to event date in calendar
  const goToEventInCalendar = (ev) => {
    if (!ev) return;
    const d = ev.dateObj || (ev.date ? toLocalDate(ev.date) : null);
    if (d instanceof Date && !isNaN(d.getTime())) {
      setSelectedDate(d);
      setCurrentDate(new Date(d.getFullYear(), d.getMonth(), 1));
      setActiveTab('calendar');
      setShowEventDetails(false);
    }
  };

  // Edit existing event
  const openEditEvent = (ev) => {
    if (!ev) return;
    const rawTasks = Array.isArray(ev.event_tasks) ? ev.event_tasks : Array.isArray(ev.eventTasks) ? ev.eventTasks : [];
    const normalizedTasks = rawTasks.map((t, idx) => ({
      id:
        t?.id ||
        (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : String(Date.now() + idx)),
      title: t?.title || '',
      description: t?.description || '',
      dueDate: t?.dueDate || '',
      assignedTo: t?.assignedTo || (user?.email || ''),
      priority: t?.priority || 'medium',
      expenses: typeof t?.expenses === 'number' ? t.expenses : Number(t?.expenses || 0),
      completed: !!t?.completed,
    }));

    const eventDateForForm = ev.dateObj instanceof Date ? ev.dateObj : ev.date ? toLocalDate(ev.date) : new Date();

    setEventForm({
      title: ev.title || '',
      date: eventDateForForm,
      time: ev.time || '',
      location: ev.location || '',
      description: ev.description || '',
      eventTasks: normalizedTasks,
    });
    setEditingEvent(ev);
    setShowEventDetails(false);
    setShowEventModal(true);
    setCurrentEventTaskForm({
      id: null,
      title: '',
      description: '',
      dueDate: formatLocalYMD(eventDateForForm), // PRE-FILL: Set dueDate to the event's date
      assignedTo: user?.email || '',
      priority: 'medium',
      expenses: 0,
      completed: false,
    });
  };

  // Toggle a sub-task completion from EventDetails view and persist
  const toggleEventTaskCompletionPersist = async (ev, taskRef) => {
    if (!ev) return;
    const tasksArray = Array.isArray(ev.event_tasks)
      ? [...ev.event_tasks]
      : Array.isArray(ev.eventTasks)
      ? [...ev.eventTasks]
      : [];
    let idx =
      typeof taskRef?.index === 'number' ? taskRef.index : tasksArray.findIndex((t) => t && t.id === taskRef?.id);
    if (idx < 0 || !tasksArray[idx]) return;

    const prevTasks = tasksArray;
    const task = tasksArray[idx];
    const updatedTasks = [...tasksArray];
    updatedTasks[idx] = { ...task, completed: !task.completed };

    // Optimistic UI update
    setEvents((prev) => prev.map((e) => (e.id === ev.id ? { ...e, event_tasks: updatedTasks } : e)));
    if (selectedEvent?.id === ev.id) {
      setSelectedEvent((prev) => ({ ...prev, event_tasks: updatedTasks }));
    }

    const { error } = await supabase
      .from('events')
      .update({ event_tasks: updatedTasks, last_activity_at: new Date().toISOString() })
      .eq('id', ev.id);

    if (error) {
      // Revert on error
      setEvents((prev) => prev.map((e) => (e.id === ev.id ? { ...e, event_tasks: prevTasks } : e)));
      if (selectedEvent?.id === ev.id) {
        setSelectedEvent((prev) => ({ ...prev, event_tasks: prevTasks }));
      }
      console.error('Failed to update event sub-task:', error);
    }
  };

  // Quick add task to an event from EventDetails
  const quickAddTaskToEvent = async (eventId, taskInput) => {
    try {
      const ev = events.find((e) => e.id === eventId);
      if (!ev) return { ok: false, message: 'Event not found' };

      const taskId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : String(Date.now());
      const newTask = {
        id: taskId,
        title: taskInput.title || '',
        description: taskInput.description || '',
        dueDate: taskInput.dueDate || '',
        assignedTo: taskInput.assignedTo || user?.email || '',
        priority: taskInput.priority || 'medium',
        expenses: Number(taskInput.expenses) || 0,
        completed: !!taskInput.completed,
      };

      const prevTasks = Array.isArray(ev.event_tasks)
        ? [...ev.event_tasks]
        : Array.isArray(ev.eventTasks)
        ? [...ev.eventTasks]
        : [];
      const updatedTasks = [...prevTasks, newTask];

      // Optimistic
      setEvents((prev) => prev.map((e) => (e.id === ev.id ? { ...e, event_tasks: updatedTasks } : e)));
      if (selectedEvent?.id === ev.id) {
        setSelectedEvent((prev) => ({ ...prev, event_tasks: updatedTasks }));
      }

      const { error } = await supabase
        .from('events')
        .update({ event_tasks: updatedTasks, last_activity_at: new Date().toISOString() })
        .eq('id', ev.id);

      if (error) {
        // revert
        setEvents((prev) => prev.map((e) => (e.id === ev.id ? { ...e, event_tasks: prevTasks } : e)));
        if (selectedEvent?.id === ev.id) {
          setSelectedEvent((prev) => ({ ...prev, event_tasks: prevTasks }));
        }
        return { ok: false, message: error.message || 'Failed to add task' };
      }

      return { ok: true };
    } catch (err) {
      return { ok: false, message: err?.message || 'Unexpected error' };
    }
  };

  // UPDATED: handleToggleTask now only deals with event tasks
  const handleToggleTask = async (task) => {
    if (!user?.id || !currentCompanyId) {
      alert('Authentication or company selection is required to toggle tasks.');
      return;
    }

    // Permission check: Only the event owner or the assigned user can toggle an event task
    // All tasks are now event tasks, so this check is always relevant.
    const isEventOwner = task.user_id === user.id;
    const isAssignedToCurrentUser = task.assignedTo === user.email;
    if (!isEventOwner && !isAssignedToCurrentUser) {
      alert('You do not have permission to toggle this task.');
      return;
    }

    try {
      // All tasks are now event tasks
      const eventToUpdate = events.find(e => e.id === task.eventId);
      if (!eventToUpdate) {
        console.error(`Parent event ${task.eventId} not found for task ${task.id}`);
        return;
      }

      const updatedEventTasks = (eventToUpdate.event_tasks || []).map(et =>
        et.id === task.id ? { ...et, completed: !et.completed } : et
      );

      const { error } = await supabase
        .from('events')
        .update({ event_tasks: updatedEventTasks, last_activity_at: new Date().toISOString() })
        .eq('id', task.eventId);

      if (!error) {
        setEvents(prevEvents => prevEvents.map(e =>
          e.id === task.eventId ? { ...e, event_tasks: updatedEventTasks } : e
        ));
      } else {
        console.error('Error toggling event task:', error);
      }
    } catch (error) {
      console.error('Error in handleToggleTask:', error);
      alert('Failed to toggle task: ' + (error?.message || error));
    }
  };

  // UPDATED: handleDeleteTask now only deals with event tasks
  const handleDeleteTask = async (task) => {
    if (!user?.id || !currentCompanyId) {
      alert('Authentication or company selection is required to delete tasks.');
      return;
    }

    if (!window.confirm(`Are you sure you want to delete the task "${task.title}"? This action cannot be undone.`)) {
      return;
    }

    // Permission check: Only the event owner or the assigned user can delete an event task
    // All tasks are now event tasks, so this check is always relevant.
    const isEventOwner = task.user_id === user.id;
    const isAssignedToCurrentUser = task.assignedTo === user.email;
    if (!isEventOwner && !isAssignedToCurrentUser) {
      alert('You do not have permission to delete this task.');
      return;
    }

    try {
      // All tasks are now event tasks
      const eventToUpdate = events.find(e => e.id === task.eventId);
      if (!eventToUpdate) {
        console.error(`Parent event ${task.eventId} not found for task ${task.id}`);
        alert('Failed to delete task: Parent event not found.');
        return;
      }

      const updatedEventTasks = (eventToUpdate.event_tasks || []).filter(et => et.id !== task.id);

      const { error } = await supabase
        .from('events')
        .update({ event_tasks: updatedEventTasks, last_activity_at: new Date().toISOString() })
        .eq('id', task.eventId);

      if (!error) {
        setEvents(prevEvents => prevEvents.map(e =>
          e.id === task.eventId ? { ...e, event_tasks: updatedEventTasks } : e
        ));
      } else {
        console.error('Error deleting event task:', error);
        alert('Failed to delete task: ' + (error?.message || error));
      }
    } catch (error) {
      console.error('Error in handleDeleteTask:', error);
      alert('Failed to delete task: ' + (error?.message || error));
    }
  };

  // NEW: Handle company switch
  const handleCompanySwitch = async (companyId) => {
    if (!user || user.currentCompanyId === companyId) {
      setShowCompanyDropdown(false);
      return;
    }

    const updatedUser = {
      ...user,
      currentCompanyId: companyId,
    };

    // Call the parent's update function to persist and refresh user state
    await onUserUpdate(updatedUser);
    setShowCompanyDropdown(false);
  };

  // Handle event deletion
  const handleDeleteEvent = async (eventId) => {
    if (!user?.id || !currentCompanyId) {
      alert('Authentication or company selection is required to delete an event.');
      return;
    }

    try {
      const { error } = await supabase.from('events').delete().eq('id', eventId).eq('company_id', currentCompanyId);

      if (error) {
        throw error;
      }

      // Update local state to remove the deleted event
      setEvents((prevEvents) => prevEvents.filter((event) => event.id !== eventId));
      setShowEventDetails(false); // Close the modal after deletion
      setSelectedEvent(null); // Clear selected event
      alert('Event deleted successfully!');
    } catch (error) {
      console.error('Error deleting event:', error);
      alert('Failed to delete event: ' + (error?.message || error));
    }
  };

  // Determine the initial sub-tab for SettingsTab based on active main tab
  const getInitialSettingsSubTab = useMemo(() => {
    if (activeTab === 'settings') return 'profile';
    // FIX: When 'company-team' is the active main tab, pass 'company-team' as the initial main tab
    // SettingsTab will then internally default to 'overview' for its sub-tabs.
    if (activeTab === 'company-team') return 'company-team';
    return 'profile'; // Default for other cases
  }, [activeTab]);

  // UI renderers
  const renderHeader = () => (
    <header className="dashboard-header">
      <div className="container dashboard-nav">
        <div className="nav-items">
          <div className="logo">
            <Calendar className="logo-icon" />
            <span>DayClap</span>
          </div>
        </div>

        <div className="nav-items search-bar">
          <Search className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Search events or tasks..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm ? (
            <button className="clear-search-btn" onClick={() => setSearchTerm('')} title="Clear">
              &times;
            </button>
          ) : null}
        </div>

        {/* NEW: Company Selector */}
        <div className="nav-items company-selector">
          <button className="company-btn" onClick={() => setShowCompanyDropdown(prev => !prev)}>
            <Building2 size={16} />
            <span>{user?.companies?.find(c => c.id === user.currentCompanyId)?.name || 'Select Company'}</span>
            <ChevronDown size={16} className={`dropdown-arrow ${showCompanyDropdown ? 'open' : ''}`} />
          </button>
          {showCompanyDropdown && (
            <ul className="company-dropdown">
              {user?.companies?.map(company => (
                <li
                  key={company.id}
                  className={`company-option ${user.currentCompanyId === company.id ? 'active' : ''}`}
                  onClick={() => handleCompanySwitch(company.id)}
                >
                  <Building2 size={16} />
                  {company.name}
                </li>
              ))}
              <div className="company-divider" />
              <li className="company-option" onClick={() => {
                setActiveTab('company-team'); // Switch to the main 'company-team' tab
                setShowCompanyDropdown(false); // Close the company dropdown
              }}>
                <Plus size={16} /> Add New Company
              </li>
            </ul>
          )}
        </div>

        <div className="nav-items user-info">
          <Settings className="user-icon" />
          <div className="user-details">
            <p className="user-name">{user?.name || user?.email}</p>
          </div>
          <button className="btn btn-outline btn-small" onClick={onLogout}>
            <LogOut size={16} /> Logout
          </button>
        </div>
      </div>
    </header>
  );

  const renderSidebar = () => (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        <button
          className={`nav-tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
          title="Overview"
        >
          <LayoutDashboard className="tab-icon" />
          Overview
        </button>
        <button
          className={`nav-tab ${activeTab === 'calendar' ? 'active' : ''}`}
          onClick={() => setActiveTab('calendar')}
          title="Calendar"
        >
          <CalendarDays className="tab-icon" />
          Calendar
        </button>
        <button
          className={`nav-tab ${activeTab === 'events' ? 'active' : ''}`}
          onClick={() => setActiveTab('events')}
          title="Events"
        >
          <Calendar className="tab-icon" />
          Events
        </button>
        <button
          className={`nav-tab ${activeTab === 'tasks' ? 'active' : ''}`}
          onClick={() => setActiveTab('tasks')}
          title="Tasks"
        >
          <CheckSquare className="tab-icon" />
          Tasks
        </button>
        {/* Moved Company & Team tab here */}
        <button
          className={`nav-tab ${activeTab === 'company-team' ? 'active' : ''}`}
          onClick={() => setActiveTab('company-team')}
          title="Company & Team"
        >
          <Users className="tab-icon" />
          Company & Team
        </button>
        <button
          className={`nav-tab ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
          title="Settings"
        >
          <Settings className="tab-icon" />
          Settings
        </button>
      </nav>
    </aside>
  );

  const renderOverview = () => (
    <div className="constrained-content">
      <div className="overview-header">
        <h2>Welcome back{user?.name ? `, ${user.name}` : ''}</h2>
        <p className="overview-subtitle">Here's a quick look at your productivity</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon completed">
            <CheckSquare />
          </div>
          <div className="stat-content">
            <h3>{stats.completedTasks}</h3>
            <p>Tasks Completed</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon pending">
            <Square />
          </div>
          <div className="stat-content">
            <h3>{stats.pendingTasks}</h3>
            <p>Tasks Pending</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon overdue">
            <Square />
          </div>
          <div className="stat-content">
            <h3>{stats.overdueTasks}</h3>
            <p>Tasks Overdue</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">
            <Calendar />
          </div>
          <div className="stat-content">
            <h3>{stats.totalEvents}</h3>
            <p>Total Events</p>
          </div>
        </div>
        {/* NEW: Task Percentage Completed */}
        <div className="stat-card percentage-card">
          <div className="stat-icon percentage-completed">
            <Percent />
          </div>
          <div className="stat-content">
            <h3>{stats.completedPercentage}%</h3>
            <p>Tasks Completed</p>
          </div>
        </div>
        {/* NEW: Task Percentage Pending */}
        <div className="stat-card percentage-card">
          <div className="stat-icon percentage-pending">
            <Percent />
          </div>
          <div className="stat-content">
            <h3>{stats.pendingPercentage}%</h3>
            <p>Tasks Pending</p>
          </div>
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
        <div className="events-list">
          {allEventsSorted.length === 0 ? (
            <div className="no-events">
              <CalendarDays className="no-events-icon" />
              <p>No events yet. Click "Add Event" to create one.</p>
            </div>
          ) : (
            allEventsSorted.slice(0, 5).map((ev) => {
              const d = ev.dateObj;
              const day = d ? d.getDate() : '-';
              const month = d ? d.toLocaleString('en-US', { month: 'short' }) : '';
              return (
                <div key={ev.id} className="event-card">
                  <div className="event-date">
                    <span className="event-day">{day}</span>
                    <span className="event-month">{month}</span>
                  </div>
                  <div className="event-details">
                    <h4 className="event-title" onClick={() => openEventDetails(ev)} title="Open details">
                      {ev.title}
                    </h4>
                    <p className="event-time-desc">
                      {ev.time ? (
                        <>
                          <Clock size={14} /> {ev.time}
                        </>
                      ) : (
                        'All Day'
                      )}
                    </p>
                    {ev.location && (
                      <p className="event-location">
                        <MapPin size={14} /> {ev.location}
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {searchTerm && (
        <div className="section">
          <div className="section-header">
            <h3 className="section-title">Search Results</h3>
          </div>
          {!searchResults.events.length && !searchResults.tasks.length ? (
            <div className="no-events">
              <Search className="no-events-icon" />
              <p>No results for "{searchTerm}"</p>
            </div>
          ) : (
            <>
              {searchResults.events.length > 0 && (
                <div className="events-list">
                  {searchResults.events.map((ev) => {
                    const d = ev.dateObj;
                    const day = d ? d.getDate() : '-';
                    const month = d ? d.toLocaleString('en-US', { month: 'short' }) : '';
                    return (
                      <div key={ev.id} className="event-card">
                        <div className="event-date">
                          <span className="event-day">{day}</span>
                          <span className="event-month">{month}</span>
                        </div>
                        <div className="event-details">
                          <h4 className="event-title" onClick={() => openEventDetails(ev)} title="Open details">
                            {ev.title}
                          </h4>
                          <p className="event-time-desc">
                            {ev.time ? (
                              <>
                                <Clock size={14} /> {ev.time}
                              </>
                            ) : (
                              'All Day'
                            )}
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
              )}
            </>
          )}
        </div>
      )}
    </div>
  );

  // --- Start of renderCalendar definition ---
  const renderCalendar = () => (
    <div className="calendar-content constrained-content">
      <div className="calendar-section">
        <div className="calendar-header">
          <button className="nav-arrow" onClick={() => changeMonth(-1)} title="Previous month">
            <ChevronLeft />
          </button>
          <h3 className="calendar-title">
            {currentDate.toLocaleString('en-US', { month: 'long', year: 'numeric' })}
          </h3>
          <button className="nav-arrow" onClick={() => changeMonth(1)} title="Next month">
            <ChevronRight />
          </button>
          <div className="header-actions" style={{ marginLeft: 'auto' }}>
            <button className="btn btn-primary btn-small" onClick={() => handleOpenAddEventModal(selectedDate)}>
              <Plus size={16} /> Add Event
            </button>
          </div>
        </div>

        <div className="calendar-grid month-view">
          {daysOfWeek.map((d) => (
            <div key={d} className="day-header">
              {d}
            </div>
          ))}

          {monthGridDays.map((d, i) => {
            if (!d) return <div key={`empty-${i}`} className="calendar-day empty" />;
            const items = eventsAndTasksForDate(d);
            const classes = [
              'calendar-day',
              isToday(d) ? 'today' : '',
              isSelected(d) ? 'selected' : '',
              items.length > 0 ? 'has-item' : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <div key={d.toISOString()} className={classes} onClick={() => handleSelectDate(d)}>
                <div className="day-number">{d.getDate()}</div>

                {/* Show up to 3 items */}
                {items.slice(0, 3).map((it) =>
                  it.type === 'event' ? (
                    <span key={`ev-${it.id}`} className="item-mini-text event-text" title={it.title}>
                      {it.title}
                    </span>
                  ) : (
                    <span
                      key={`tk-${it.id}`}
                      className={`item-mini-text ${it.completed ? 'completed-task' : 'pending-task'}`}
                      title={it.title}
                    >
                      {it.title}
                    </span>
                  )
                )}
                {items.length > 3 && (
                  <div className="item-indicators">
                    <span className="item-count">+{items.length - 3}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
  // --- End of renderCalendar definition ---
  const renderEventsTab = () => (
    <div className="constrained-content">
      <div className="section-header">
        <h3 className="section-title">All Events</h3>
        <div className="header-actions">
          <button className="btn btn-primary btn-small" onClick={() => handleOpenAddEventModal(new Date())}>
            <Plus size={16} /> Add Event
          </button>
        </div>
      </div>
      <div className="events-list">
        {allEventsSorted.length === 0 ? (
          <div className="no-events">
            <CalendarDays className="no-events-icon" />
            <p>No events found.</p>
          </div>
        ) : (
          allEventsSorted.map((ev) => {
            const d = ev.dateObj;
            const day = d ? d.getDate() : '-';
            const month = d ? d.toLocaleString('en-US', { month: 'short' }) : '';
            return (
              <div key={ev.id} className="event-card">
                <div className="event-date">
                  <span className="event-day">{day}</span>
                  <span className="event-month">{month}</span>
                </div>
                <div className="event-details">
                  <h4 className="event-title" onClick={() => openEventDetails(ev)} title="Open details">
                    {ev.title}
                  </h4>
                  <p className="event-time-desc">
                    {ev.time ? (
                      <>
                        <Clock size={14} /> {ev.time}
                      </>
                    ) : (
                      'All Day'
                    )}
                  </p>
                    {ev.location && (
                      <p className="event-location">
                        <MapPin size={14} /> {ev.location}
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );

  // UPDATED: renderTasksTab to use allDisplayableTasks (which now only contains event tasks)
  const renderTasksTab = () => (
    <div className="constrained-content">
      <div className="section-header">
        <h3 className="section-title">All Tasks</h3>
      </div>
      <div className="tasks-list">
        {allDisplayableTasks.length === 0 ? (
          <div className="no-tasks">
            <Square className="no-tasks-icon" />
            <p>No tasks found.</p>
          </div>
        ) : (
          allDisplayableTasks.map((t) => (
            <div key={t.id} className={`task-card ${t.completed ? 'completed' : ''} ${t.dueDateObj && t.dueDateObj < today && !t.completed ? 'overdue' : ''}`}>
              <div className="task-checkbox">
                <button
                  className="checkbox-btn"
                  onClick={() => handleToggleTask(t)}
                  // Disable if not current user or event owner for event tasks
                  disabled={!user || (t.source === 'event' && t.assignedTo !== user.email && t.user_id !== user.id)}
                >
                  {t.completed ? <CheckSquare size={20} /> : <Square size={20} />}
                </button>
              </div>
              <div className="task-content">
                {t.source === 'event' && t.eventTitle && (
                  <div className="task-event-name" title={`From event: ${t.eventTitle}`}>
                    <CalendarDays size={14} /> <span>{t.eventTitle}</span>
                  </div>
                )}
                <div className="task-header">
                  <h4 className="task-title">{t.title}</h4>
                  <div className="task-actions">
                    {/* NEW: Edit button (placeholder for future functionality) */}
                    {/* <button className="btn-icon-small edit" onClick={() => handleEditTask(t)} title="Edit Task"><Edit size={16} /></button> */}
                    {/* NEW: Delete button */}
                    <button
                      className="btn-icon-small delete"
                      onClick={() => handleDeleteTask(t)}
                      title="Delete Task"
                      disabled={!user || (t.source === 'event' && t.assignedTo !== user.email && t.user_id !== user.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                {t.description && <p className="task-description">{t.description}</p>}
                <div className="task-footer">
                  {t.assignedTo && <span>Assigned to: <span className="assigned-to">{t.assignedTo === user.email ? 'Me' : t.assignedTo}</span></span>}
                  {t.dueDateObj && (
                    <span className={`due-date ${t.dueDateObj < today && !t.completed ? 'overdue' : ''}`}>
                      Due: {t.dueDateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  )}
                  {t.priority && <span className={`priority-badge ${t.priority}`}>{t.priority}</span>}
                  {typeof t.expenses === 'number' && t.expenses > 0 && (
                    <span className="task-expenses">Expenses: {getCurrencySymbol(user?.currency || 'USD')} {formatCurrency(t.expenses, user?.currency || 'USD')}</span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  // renderSettings now uses getInitialSettingsSubTab
  const renderSettings = () => (
    <SettingsTab user={user} onUserUpdate={onUserUpdate} initialSubTab={getInitialSettingsSubTab} />
  );

  if (loading) {
    return (
      <div className="dashboard">
        {renderHeader()}
        <main className="dashboard-layout">
          {renderSidebar()}
          <section className="main-content">
            <LoadingAnimation message="Loading your data..." />
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className={`dashboard ${activeTab === 'calendar' ? 'calendar-active' : ''}`}>
      {renderHeader()}
      <main className="dashboard-layout">
        {renderSidebar()}
        <section className="main-content">
          {activeTab === 'overview' && renderOverview()}
          {activeTab === 'calendar' && renderCalendar()}
          {activeTab === 'events' && renderEventsTab()}
          {activeTab === 'tasks' && renderTasksTab()}
          {activeTab === 'settings' && renderSettings()}
          {activeTab === 'company-team' && renderSettings()}
        </section>
      </main>

      {/* Modals */}
      <EventModal
        showModal={showEventModal}
        onClose={() => {
          console.log('Dashboard: EventModal onClose triggered!');
          setShowEventModal(false);
        }}
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
        onClose={() => {
          console.log('Dashboard: EventDetailsModal onClose triggered!');
          setShowEventDetails(false);
          setSelectedEvent(null);
        }}
        onGoToDate={() => goToEventInCalendar(selectedEvent)}
        onToggleTask={(taskRef) => toggleEventTaskCompletionPersist(selectedEvent, taskRef)}
        onEdit={() => openEditEvent(selectedEvent)}
        onDeleteEvent={handleDeleteEvent} // Pass the new delete handler
        onQuickAddTask={(taskInput) => quickAddTaskToEvent(selectedEvent?.id, taskInput)}
      />

      <DateActionsModal
        showModal={showDateActionsModal}
        onClose={() => setShowDateActionsModal(false)}
        selectedDate={dateForActions}
        onViewEvents={handleViewEventsForDate}
        onAddEvent={() => handleOpenAddEventModal(dateForActions)}
      />

      <DayItemsModal
        showModal={showDayItemsModal}
        onClose={() => setShowDayItemsModal(false)}
        selectedDate={selectedDate}
        items={eventsAndTasksForDate(selectedDate)}
        onOpenEvent={(ev) => {
          setShowDayItemsModal(false);
          openEventDetails(ev);
        }}
        onToggleTask={handleToggleTask}
        onOpenInCalendar={() => {
          setActiveTab('calendar');
          setShowDayItemsModal(false);
        }}
      />
    </div>
  );
};

export default Dashboard;

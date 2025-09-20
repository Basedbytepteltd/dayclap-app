import 'dotenv/config'; // Load .env file at the very top
import { getSupabaseAdmin } from '../src/supabaseClient.js';
import { randomUUID } from 'crypto'; // Import randomUUID for creating new company IDs

const supabaseAdmin = getSupabaseAdmin();
if (!supabaseAdmin) {
  console.error('Supabase admin client is not available. Ensure VITE_SUPABASE_URL and VITE_SUPABASE_SERVICE_ROLE_KEY are set in your environment before running this script.');
  process.exit(1);
}

const TARGET_USER_EMAIL = 'fernando@fit-pair.com';
const TARGET_COMPANY_NAME = 'Fitness';

const addSampleData = async () => {
  console.log(`Attempting to add sample data for user: ${TARGET_USER_EMAIL}, company: ${TARGET_COMPANY_NAME}`);

  // 1. Find the user's ID
  const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers({
    email: TARGET_USER_EMAIL,
  });

  if (authError) {
    console.error('Error fetching user from auth:', authError.message);
    return;
  }

  const targetUser = authUsers.users.find(u => u.email === TARGET_USER_EMAIL);

  if (!targetUser) {
    console.error(`User with email ${TARGET_USER_EMAIL} not found in Supabase Auth.`);
    return;
  }
  const userId = targetUser.id;
  console.log(`Found user ID: ${userId}`);

  // 2. Find the user's profile and check for the target company
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('companies, current_company_id')
    .eq('id', userId)
    .single();

  if (profileError) {
    console.error('Error fetching user profile:', profileError.message);
    return;
  }

  let targetCompany = profile.companies?.find(c => c.name === TARGET_COMPANY_NAME);
  let companyId;

  // If the company doesn't exist for the user, create it.
  if (!targetCompany) {
    console.log(`Company '${TARGET_COMPANY_NAME}' not found. Creating it for the user...`);
    const newCompany = {
      id: randomUUID(),
      name: TARGET_COMPANY_NAME,
      role: 'owner',
      createdAt: new Date().toISOString()
    };
    const updatedCompanies = [...(profile.companies || []), newCompany];

    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        companies: updatedCompanies,
        current_company_id: newCompany.id // Set the new company as the current one
      })
      .eq('id', userId);

    if (updateError) {
      console.error(`Failed to create and add company for user:`, updateError.message);
      return;
    }
    
    console.log(`Successfully created and set '${TARGET_COMPANY_NAME}' as the current company.`);
    companyId = newCompany.id;
  } else {
    companyId = targetCompany.id;
    console.log(`Found company ID for '${TARGET_COMPANY_NAME}': ${companyId}`);
  }

  const sampleEvents = [
    // September Events
    {
      title: 'Fitness Goal Setting Workshop',
      date: '2025-09-05',
      time: '10:00',
      description: 'Workshop to set personal fitness goals for the quarter.',
      location: 'Online (Zoom)',
      eventTasks: [
        { id: Date.now() + 1, title: 'Prepare presentation slides', description: 'Include SMART goal framework.', assignedTo: TARGET_USER_EMAIL, completed: false, dueDate: '2025-09-03', priority: 'high', expenses: 0 },
        { id: Date.now() + 2, title: 'Send out Zoom link', description: 'To all registered participants.', assignedTo: TARGET_USER_EMAIL, completed: false, dueDate: '2025-09-04', priority: 'medium', expenses: 0 },
      ],
    },
    {
      title: 'Team Workout Session',
      date: '2025-09-12',
      time: '18:00',
      description: 'Weekly team workout focusing on strength training.',
      location: 'Local Gym',
      eventTasks: [],
    },
    {
      title: 'Nutrition Seminar',
      date: '2025-09-20',
      time: '14:00',
      description: 'Guest speaker on healthy eating habits and meal prep.',
      location: 'Community Hall',
      eventTasks: [
        { id: Date.now() + 3, title: 'Book community hall', description: 'Confirm availability and payment.', assignedTo: TARGET_USER_EMAIL, completed: true, dueDate: '2025-09-01', priority: 'high', expenses: 50 },
        { id: Date.now() + 4, title: 'Order healthy snacks', description: 'For attendees during the break.', assignedTo: TARGET_USER_EMAIL, completed: false, dueDate: '2025-09-18', priority: 'medium', expenses: 120 },
      ],
    },

    // October Events
    {
      title: 'October Fitness Challenge Kick-off',
      date: '2025-10-01',
      time: '09:00',
      description: 'Start of the 30-day "Step Up" challenge.',
      location: 'Fitness App',
      eventTasks: [
        { id: Date.now() + 5, title: 'Promote challenge on social media', description: 'Create engaging posts and stories.', assignedTo: TARGET_USER_EMAIL, completed: false, dueDate: '2025-09-28', priority: 'high', expenses: 0 },
        { id: Date.now() + 6, title: 'Prepare participant welcome kits', description: 'Include challenge guide and small gift.', assignedTo: TARGET_USER_EMAIL, completed: false, dueDate: '2025-09-29', priority: 'high', expenses: 200 },
      ],
    },
    {
      title: 'Yoga & Mindfulness Session',
      date: '2025-10-15',
      time: '17:30',
      description: 'Relaxing evening session to de-stress.',
      location: 'Studio B',
      eventTasks: [],
    },
    {
      title: 'Client Progress Review',
      date: '2025-10-25',
      time: '11:00',
      description: 'Review progress with key clients and gather feedback.',
      location: 'Office Meeting Room',
      eventTasks: [
        { id: Date.now() + 7, title: 'Compile client reports', description: 'For all clients attending the review.', assignedTo: TARGET_USER_EMAIL, completed: false, dueDate: '2025-10-23', priority: 'high', expenses: 0 },
      ],
    },

    // November Events
    {
      title: 'Winter Fitness Prep Workshop',
      date: '2025-11-08',
      time: '10:30',
      description: 'Tips and routines for staying active during colder months.',
      location: 'Online (Google Meet)',
      eventTasks: [
        { id: Date.now() + 8, title: 'Create winter workout plan handout', description: 'Design a printable PDF.', assignedTo: TARGET_USER_EMAIL, completed: false, dueDate: '2025-11-05', priority: 'medium', expenses: 0 },
      ],
    },
    {
      title: 'Annual Fitness Gala Planning Meeting',
      date: '2025-11-18',
      time: '16:00',
      description: 'First meeting to plan the end-of-year gala event.',
      location: 'Head Office',
      eventTasks: [
        { id: Date.now() + 9, title: 'Research potential venues', description: 'Look for venues suitable for 100+ guests.', assignedTo: TARGET_USER_EMAIL, completed: false, dueDate: '2025-11-15', priority: 'high', expenses: 0 },
        { id: Date.now() + 10, title: 'Draft initial budget proposal', description: 'Estimate costs for catering, entertainment, etc.', assignedTo: TARGET_USER_EMAIL, completed: false, dueDate: '2025-11-17', priority: 'high', expenses: 0 },
      ],
    },
    {
      title: 'Holiday Season Wellness Challenge',
      date: '2025-11-25',
      time: '12:00',
      description: 'Launch of a challenge to maintain health during holidays.',
      location: 'Fitness App',
      eventTasks: [],
    },
  ];

  const sampleTasks = [
    // September Tasks
    {
      title: 'Update client contact list',
      description: 'Review and update all client phone numbers and emails.',
      due_date: '2025-09-10',
      priority: 'medium',
      category: 'Admin',
      completed: false,
      expenses: 0,
    },
    {
      title: 'Research new fitness trends',
      description: 'Look into emerging trends like AI-powered workouts or new equipment.',
      due_date: '2025-09-25',
      priority: 'low',
      category: 'Research',
      completed: false,
      expenses: 0,
    },
    {
      title: 'Order new gym equipment',
      description: 'Replace worn-out resistance bands and yoga mats.',
      due_date: '2025-09-15',
      priority: 'high',
      category: 'Operations',
      completed: true,
      expenses: 350.00,
    },

    // October Tasks
    {
      title: 'Prepare Q4 marketing strategy',
      description: 'Outline campaigns for holiday promotions and new year sign-ups.',
      due_date: '2025-10-07',
      priority: 'high',
      category: 'Marketing',
      completed: false,
      expenses: 0,
    },
    {
      title: 'Review membership plans',
      description: 'Analyze current plans and consider new offerings or price adjustments.',
      due_date: '2025-10-20',
      priority: 'medium',
      category: 'Business Development',
      completed: false,
      expenses: 0,
    },
    {
      title: 'Schedule staff training',
      description: 'Organize a first-aid and CPR certification renewal for all trainers.',
      due_date: '2025-10-10',
      priority: 'high',
      category: 'HR',
      completed: false,
      expenses: 500.00,
    },

    // November Tasks
    {
      title: 'Plan Q1 2026 content calendar',
      description: 'Outline blog posts, social media content, and email newsletters.',
      due_date: '2025-11-15',
      priority: 'medium',
      category: 'Marketing',
      completed: false,
      expenses: 0,
    },
    {
      title: 'Annual software license renewal',
      description: 'Renew licenses for CRM and scheduling software.',
      due_date: '2025-11-30',
      priority: 'high',
      category: 'IT',
      completed: false,
      expenses: 1200.00,
    },
    {
      title: 'Client feedback survey',
      description: 'Design and distribute a survey to gather client satisfaction data.',
      due_date: '2025-11-20',
      priority: 'low',
      category: 'Customer Service',
      completed: false,
      expenses: 0,
    },
  ];

  console.log('Inserting sample events...');
  for (const event of sampleEvents) {
    // Explicitly map JS object keys to DB column names for clarity and safety
    const eventPayload = {
      user_id: userId,
      company_id: companyId,
      title: event.title,
      date: event.date,
      time: event.time,
      description: event.description,
      location: event.location,
      event_tasks: event.eventTasks, // Map eventTasks (JS) to event_tasks (DB)
    };

    const { data, error } = await supabaseAdmin
      .from('events')
      .insert(eventPayload)
      .select();

    if (error) {
      console.error(`Error inserting event '${event.title}':`, error.message);
    } else {
      console.log(`Successfully inserted event: '${event.title}'`);
    }
  }

  console.log('Inserting sample general tasks...');
  for (const task of sampleTasks) {
    const { data, error } = await supabaseAdmin
      .from('tasks')
      .insert({
        ...task,
        user_id: userId,
        company_id: companyId,
      })
      .select();

    if (error) {
      console.error(`Error inserting task '${task.title}':`, error.message);
    } else {
      console.log(`Successfully inserted task: '${task.title}'`);
    }
  }

  console.log('Sample data insertion complete.');
};

addSampleData();

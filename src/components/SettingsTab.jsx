import React, { useState, useEffect, useRef } from 'react';
import { User, Palette, Bell, Building2, Users, Save, Globe, DollarSign, Clock, Mail, Plus, Send, Key, CheckCircle, LogOut, UserMinus, Search } from 'lucide-react';
import './SettingsTab.css';
import { supabase } from '../supabaseClient'; // Ensure supabase is imported for direct DB ops if needed, or for token

const currencies = [
  { code: 'USD', name: 'US Dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British Pound' },
  { code: 'JPY', name: 'Japanese Yen' },
  { code: 'CAD', name: 'Canadian Dollar' },
  { code: 'AUD', name: 'Australian Dollar' },
  { code: 'CHF', name: 'Swiss Franc' },
  { code: 'CNY', name: 'Chinese Yuan' },
  { code: 'SEK', name: 'Swedish Krona' },
  { code: 'NZD', name: 'New Zealand Dollar' },
  { code: 'MXN', name: 'Mexican Peso' },
  { code: 'SGD', name: 'Singapore Dollar' },
  { code: 'HKD', name: 'Hong Kong Dollar' },
  { code: 'NOK', name: 'Norwegian Krone' },
  { code: 'KRW', name: 'South Korean Won' },
  { code: 'TRY', name: 'Turkish Lira' },
  { code: 'RUB', name: 'Russian Ruble' },
  { code: 'INR', name: 'Indian Rupee' },
  { code: 'BRL', name: 'Brazilian Real' },
  { code: 'ZAR', name: 'South African Rand' },
  { code: 'AED', name: 'UAE Dirham' },
  { code: 'ARS', name: 'Argentine Peso' },
  { code: 'CLP', name: 'Chilean Peso' },
  { code: 'COP', name: 'Colombian Peso' },
  { code: 'DKK', name: 'Danish Krone' },
  { code: 'EGP', name: 'Egyptian Pound' },
  { code: 'ILS', name: 'Israeli New Shekel' },
  { code: 'MYR', name: 'Malaysian Ringgit' },
  { code: 'NGN', name: 'Nigerian Naira' },
  { code: 'PHP', name: 'Philippine Peso' },
  { code: 'PLN', name: 'Polish Zloty' },
  { code: 'SAR', name: 'Saudi Riyal' },
  { code: 'THB', name: 'Thai Baht' },
  { code: 'VND', name: 'Vietnamese Dong' },
  { code: 'LKR', name: 'Sri Lankan Rupee' }, // Added Sri Lankan Rupee
  // Add more currencies as needed
];

// Custom CurrencySelect component
const CurrencySelect = ({ value, onChange, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef(null);

  const filteredCurrencies = currencies.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelect = (currencyCode) => {
    onChange({ target: { name: 'currency', value: currencyCode } });
    setIsOpen(false);
    setSearchTerm(''); // Clear search term on selection
  };

  const toggleDropdown = () => {
    if (!disabled) {
      setIsOpen(prev => !prev);
      setSearchTerm(''); // Clear search term when opening/closing
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const selectedCurrencyName = currencies.find(c => c.code === value)?.name || value;

  return (
    <div className="currency-select-wrapper" ref={dropdownRef}>
      <button
        type="button"
        className={`currency-display-button ${isOpen ? 'open' : ''}`}
        onClick={toggleDropdown}
        disabled={disabled}
      >
        <DollarSign className="input-icon" />
        <span>{value} - {selectedCurrencyName}</span>
      </button>

      {isOpen && (
        <div className="currency-dropdown-options">
          <div className="currency-search-input-wrapper">
            <Search className="input-icon" />
            <input
              type="text"
              className="currency-search-input"
              placeholder="Search currency..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoFocus
            />
          </div>
          <div className="currency-options-list">
            {filteredCurrencies.length > 0 ? (
              filteredCurrencies.map(c => (
                <div
                  key={c.code}
                  className={`currency-option-item ${value === c.code ? 'active' : ''}`}
                  onClick={() => handleSelect(c.code)}
                >
                  {c.code} - {c.name}
                </div>
              ))
            ) : (
              <div className="no-options-message">No currencies found.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};


const SettingsTab = ({ user, onUserUpdate, initialSubTab = 'profile' }) => {
  const [activeMainTab, setActiveMainTab] = useState(initialSubTab); // Renamed for clarity

  // NEW: State for nested Company & Team tabs
  const [activeCompanySubTab, setActiveCompanySubTab] = useState('overview'); // 'overview', 'invite-user', 'add-company', 'team-members'

  const [profileForm, setProfileForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    language: user?.language || 'en',
    timezone: user?.timezone || 'UTC',
    currency: user?.currency || 'USD',
  });
  const [themeSetting, setThemeSetting] = useState(user?.theme || 'system');
  const [notificationSettings, setNotificationSettings] = useState(user?.notifications || {
    email_daily: true,
    email_weekly: false,
    email_monthly: false,
    email_3day_countdown: false,
    email_1week_countdown: true,
    push: true,
    reminders: true,
    invitations: true,
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState(''); // 'success' or 'error'

  // State for Invite User form
  const [inviteForm, setInviteForm] = useState({
    recipientEmail: '',
    role: 'user',
  });
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteMessage, setInviteMessage] = useState('');
  const [inviteMessageType, setInviteMessageType] = useState('');

  // State for Add New Company form
  const [newCompanyForm, setNewCompanyForm] = useState({
    companyName: '',
  });
  const [companyLoading, setCompanyLoading] = useState(false);
  const [companyMessage, setCompanyMessage] = useState('');
  const [companyMessageType, setCompanyMessageType] = useState('');

  // NEW: State for Team Members list
  const [teamMembers, setTeamMembers] = useState([]);
  const [teamMembersLoading, setTeamMembersLoading] = useState(false);
  const [teamMembersMessage, setTeamMembersMessage] = useState('');
  const [teamMembersMessageType, setTeamMembersMessageType] = useState('');

  // DEBUG LOG: Check user object and initialSubTab when component mounts or updates
  useEffect(() => {
    console.log('SettingsTab: User prop received:', user);
    console.log('SettingsTab: initialSubTab prop received:', initialSubTab);
  }, [user, initialSubTab]);

  useEffect(() => {
    if (user) {
      setProfileForm({
        name: user.name || '',
        email: user.email || '',
        language: user.language || 'en',
        timezone: user.timezone || 'UTC',
        currency: user.currency || 'USD',
      });
      setThemeSetting(user.theme || 'system');
      setNotificationSettings(user.notifications || {
        email_daily: true,
        email_weekly: false,
        email_monthly: false,
        email_3day_countdown: false,
        email_1week_countdown: true,
        push: true,
        reminders: true,
        invitations: true,
      });
    }
  }, [user]);

  // Effect to update activeMainTab and reset activeCompanySubTab if initialSubTab prop changes
  useEffect(() => {
    setActiveMainTab(initialSubTab);
    // When the main tab changes to 'company-team', default its sub-tab to 'overview'
    if (initialSubTab === 'company-team') {
      setActiveCompanySubTab('overview');
    }
  }, [initialSubTab]);

  // NEW: Effect to fetch team members when the tab is active or currentCompanyId changes
  useEffect(() => {
    if (activeCompanySubTab === 'team-members' && user?.currentCompanyId) {
      fetchTeamMembers(user.currentCompanyId);
    } else if (activeCompanySubTab === 'team-members' && !user?.currentCompanyId) {
      setTeamMembers([]);
      setTeamMembersMessage('Please select a company to view its team members.');
      setTeamMembersMessageType('info');
    }
  }, [activeCompanySubTab, user?.currentCompanyId, user?.companies]); // user.companies to re-fetch if company list changes

  const handleProfileChange = (e) => {
    const { name, value } = e.target;
    setProfileForm(prev => ({ ...prev, [name]: value }));
  };

  const handleThemeChange = (e) => {
    setThemeSetting(e.target.value);
  };

  const handleNotificationToggle = (key) => {
    setNotificationSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setMessageType('');

    try {
      const updatedUser = {
        ...user,
        name: profileForm.name,
        language: profileForm.language,
        timezone: profileForm.timezone,
        currency: profileForm.currency,
        theme: themeSetting, // Include theme in the profile update
        notifications: notificationSettings, // Include notifications
      };
      await onUserUpdate(updatedUser); // Call the parent update function
      setMessage('Settings saved successfully!');
      setMessageType('success');
    } catch (error) {
      console.error('Error saving settings:', error);
      setMessage('Failed to save settings.');
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  // Handle Invite User
  const handleInviteUserChange = (e) => {
    const { name, value } = e.target;
    setInviteForm(prev => ({ ...prev, [name]: value }));
    setInviteMessage(''); // Clear message on input change
    setInviteMessageType('');
  };

  const handleSendInvitation = async (e) => {
    e.preventDefault();
    setInviteLoading(true);
    setInviteMessage('');
    setInviteMessageType('');

    if (!inviteForm.recipientEmail.trim()) {
      setInviteMessage('Recipient email is required.');
      setInviteMessageType('error');
      setInviteLoading(false);
      return;
    }
    if (!user?.currentCompanyId) {
      setInviteMessage('No current company selected. Cannot send invitation.');
      setInviteMessageType('error');
      setInviteLoading(false);
      return;
    }

    const currentCompany = user.companies?.find(c => c.id === user.currentCompanyId);
    if (!currentCompany) {
      setInviteMessage('Current company details not found. Cannot send invitation.');
      setInviteMessageType('error');
      setInviteLoading(false);
      return;
    }

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL;
      if (!backendUrl) {
        throw new Error('VITE_BACKEND_URL is not configured.');
      }

      // Get the user's current session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setInviteMessage('Authentication required to send invitations.');
        setInviteMessageType('error');
        setInviteLoading(false);
        return;
      }

      const response = await fetch(`${backendUrl}/api/send-invitation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`, // Use the session token
        },
        body: JSON.stringify({
          recipient_email: inviteForm.recipientEmail,
          company_id: user.currentCompanyId,
          company_name: currentCompany.name,
          role: inviteForm.role,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setInviteMessage(data.message || 'Invitation sent successfully!');
        setInviteMessageType('success');
        setInviteForm({ recipientEmail: '', role: 'user' }); // Clear form
      } else {
        setInviteMessage(data.message || 'Failed to send invitation.');
        setInviteMessageType('error');
      }
    } catch (error) {
      console.error('Error sending invitation:', error);
      setInviteMessage('An unexpected error occurred while sending the invitation.');
      setInviteMessageType('error');
    } finally {
      setInviteLoading(false);
    }
  };

  // Handle Add New Company
  const handleNewCompanyChange = (e) => {
    const { name, value } = e.target;
    setNewCompanyForm(prev => ({ ...prev, [name]: value }));
    setCompanyMessage(''); // Clear message on input change
    setCompanyMessageType('');
  };

  const handleAddNewCompany = async (e) => {
    e.preventDefault();
    setCompanyLoading(true);
    setCompanyMessage('');
    setCompanyMessageType('');

    if (!newCompanyForm.companyName.trim()) {
      setCompanyMessage('Company name is required.');
      setCompanyMessageType('error');
      setCompanyLoading(false);
      return;
    }

    try {
      // Generate a new UUID for the company
      const newCompanyId = crypto.randomUUID();
      const newCompany = {
        id: newCompanyId,
        name: newCompanyForm.companyName.trim(),
        role: 'owner', // The creator is always the owner
        createdAt: new Date().toISOString(),
      };

      const updatedCompanies = [...(user.companies || []), newCompany];

      const updatedUser = {
        ...user,
        companies: updatedCompanies,
        currentCompanyId: newCompanyId, // Automatically switch to the new company
      };

      await onUserUpdate(updatedUser); // Update user profile in Supabase
      setCompanyMessage(`Company "${newCompany.name}" added and set as current!`);
      setCompanyMessageType('success');
      setNewCompanyForm({ companyName: '' }); // Clear form
    } catch (error) {
      console.error('Error adding new company:', error);
      setCompanyMessage('Failed to add new company.');
      setCompanyMessageType('error');
    } finally {
      setCompanyLoading(false);
    }
  };

  // Handle switching current company
  const handleSwitchCompany = async (companyId) => {
    if (!user || user.currentCompanyId === companyId) return;

    setLoading(true);
    setMessage('');
    setMessageType('');

    try {
      const updatedUser = {
        ...user,
        currentCompanyId: companyId,
      };
      await onUserUpdate(updatedUser);
      setMessage('Switched company successfully!');
      setMessageType('success');
    } catch (error) {
      console.error('Error switching company:', error);
      setMessage('Failed to switch company.');
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  // Handle leaving a company
  const handleLeaveCompany = async (companyId, companyName) => {
    if (!window.confirm(`Are you sure you want to leave "${companyName}"? This action cannot be undone.`)) {
      return;
    }

    setLoading(true);
    setMessage('');
    setMessageType('');

    try {
      const updatedCompanies = (user.companies || []).filter(c => c.id !== companyId);
      let newCurrentCompanyId = user.currentCompanyId;

      if (user.currentCompanyId === companyId) {
        // If leaving the current company, switch to another or set to null
        newCurrentCompanyId = updatedCompanies.length > 0 ? updatedCompanies[0].id : null;
      }

      const updatedUser = {
        ...user,
        companies: updatedCompanies,
        currentCompanyId: newCurrentCompanyId,
      };

      await onUserUpdate(updatedUser);
      setMessage(`Successfully left "${companyName}".`);
      setMessageType('success');
    } catch (error) {
      console.error('Error leaving company:', error);
      setMessage('Failed to leave company.');
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  // NEW: Fetch team members for the current company
  const fetchTeamMembers = async (companyId) => {
    setTeamMembersLoading(true);
    setTeamMembersMessage('');
    setTeamMembersMessageType('');
    if (!companyId) {
      setTeamMembers([]);
      setTeamMembersLoading(false);
      return;
    }
    try {
      // Fetch all profiles and filter them client-side for simplicity.
      // In a production app, consider a backend endpoint for server-side filtering
      // to avoid fetching all profiles.
      const { data: profiles, error } = await supabase.from('profiles').select('id, name, email, companies');
      if (error) throw error;

      const members = (profiles || [])
        .filter(p => Array.isArray(p.companies) && p.companies.some(c => String(c.id) === String(companyId)))
        .map(p => {
          const companyEntry = p.companies.find(c => String(c.id) === String(companyId));
          return {
            id: p.id,
            name: p.name || p.email.split('@')[0],
            email: p.email,
            role: companyEntry?.role || 'user',
          };
        });

      // Sort by role (owner, admin, user) then name
      const roleOrder = { 'owner': 1, 'admin': 2, 'user': 3 };
      members.sort((a, b) => {
        const roleDiff = (roleOrder[a.role] || 99) - (roleOrder[b.role] || 99);
        if (roleDiff !== 0) return roleDiff;
        return a.name.localeCompare(b.name);
      });

      setTeamMembers(members);
    } catch (error) {
      console.error('Error fetching team members:', error);
      setTeamMembersMessage('Failed to load team members.');
      setTeamMembersMessageType('error');
      setTeamMembers([]);
    } finally {
      setTeamMembersLoading(false);
    }
  };

  // NEW: Handle changing a member's role
  const handleChangeMemberRole = async (memberId, currentMemberEmail, companyId, newRole) => {
    if (!window.confirm(`Are you sure you want to change ${currentMemberEmail}'s role to '${newRole}'?`)) {
      return;
    }
    setTeamMembersLoading(true);
    setTeamMembersMessage('');
    setTeamMembersMessageType('');

    // Prevent user from changing their own role
    if (user.id === memberId) {
      setTeamMembersMessage('You cannot change your own role here. Please contact an owner if you need to change your role.');
      setTeamMembersMessageType('error');
      setTeamMembersLoading(false);
      return;
    }

    // Check if current user has permission (owner/admin of this company)
    const currentUserCompanyRole = user.companies?.find(c => c.id === companyId)?.role;
    if (!['owner', 'admin'].includes(currentUserCompanyRole)) {
      setTeamMembersMessage('You do not have permission to change roles in this company.');
      setTeamMembersMessageType('error');
      setTeamMembersLoading(false);
      return;
    }

    // Prevent admin from changing owner's role
    const targetMember = teamMembers.find(m => m.id === memberId);
    if (targetMember?.role === 'owner' && currentUserCompanyRole === 'admin') {
      setTeamMembersMessage('Admins cannot change an owner\'s role.');
      setTeamMembersMessageType('error');
      setTeamMembersLoading(false);
      return;
    }

    try {
      // In a production app, this would be an API call to your backend
      // which uses the service role key to update the profile.
      // For this exercise, we're directly updating via Supabase client.
      const { data: targetProfile, error: fetchError } = await supabase
        .from('profiles')
        .select('companies')
        .eq('id', memberId)
        .single();

      if (fetchError) throw fetchError;

      const updatedCompanies = (targetProfile.companies || []).map(c => {
        if (String(c.id) === String(companyId)) {
          return { ...c, role: newRole };
        }
        return c;
      });

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ companies: updatedCompanies, last_activity_at: new Date().toISOString() })
        .eq('id', memberId);

      if (updateError) throw updateError;

      setTeamMembersMessage(`Successfully updated ${currentMemberEmail}'s role to ${newRole}.`);
      setTeamMembersMessageType('success');
      fetchTeamMembers(companyId); // Re-fetch to update the list
    } catch (error) {
      console.error('Error changing member role:', error);
      setTeamMembersMessage('Failed to change member role. Ensure RLS policies allow this action.');
      setTeamMembersMessageType('error');
    } finally {
      setTeamMembersLoading(false);
    }
  };

  // NEW: Handle removing a member from the company
  const handleRemoveMember = async (memberId, memberName, companyId) => {
    if (!window.confirm(`Are you sure you want to remove ${memberName} from this company? This action cannot be undone.`)) {
      return;
    }
    setTeamMembersLoading(true);
    setTeamMembersMessage('');
    setTeamMembersMessageType('');

    // Prevent user from removing themselves
    if (user.id === memberId) {
      setTeamMembersMessage('You cannot remove yourself from the company here. Use the "Leave" button in the overview.');
      setTeamMembersMessageType('error');
      setTeamMembersLoading(false);
      return;
    }

    // Check if current user has permission (owner/admin of this company)
    const currentUserCompanyRole = user.companies?.find(c => c.id === companyId)?.role;
    if (!['owner', 'admin'].includes(currentUserCompanyRole)) {
      setTeamMembersMessage('You do not have permission to remove members from this company.');
      setTeamMembersMessageType('error');
      setTeamMembersLoading(false);
      return;
    }

    // Prevent removing the last owner
    const ownersInCompany = teamMembers.filter(m => m.role === 'owner' && String(m.id) !== String(memberId));
    const targetMember = teamMembers.find(m => m.id === memberId);
    if (targetMember?.role === 'owner' && ownersInCompany.length === 0) {
      setTeamMembersMessage('Cannot remove the last owner of the company. Assign another owner first.');
      setTeamMembersMessageType('error');
      setTeamMembersLoading(false);
      return;
    }

    try {
      // In a production app, this would be an API call to your backend
      // which uses the service role key to update the profile.
      // For this exercise, we're directly updating via Supabase client.
      const { data: targetProfile, error: fetchError } = await supabase
        .from('profiles')
        .select('companies, current_company_id')
        .eq('id', memberId)
        .single();

      if (fetchError) throw fetchError;

      const updatedCompanies = (targetProfile.companies || []).filter(c => String(c.id) !== String(companyId));
      let newCurrentCompanyId = targetProfile.current_company_id;

      if (String(newCurrentCompanyId) === String(companyId)) {
        // If the removed company was their current, set to null or another company
        newCurrentCompanyId = updatedCompanies.length > 0 ? updatedCompanies[0].id : null;
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ companies: updatedCompanies, current_company_id: newCurrentCompanyId, last_activity_at: new Date().toISOString() })
        .eq('id', memberId);

      if (updateError) throw updateError;

      setTeamMembersMessage(`Successfully removed ${memberName} from the company.`);
      setTeamMembersMessageType('success');
      fetchTeamMembers(companyId); // Re-fetch to update the list
    } catch (error) {
      console.error('Error removing member:', error);
      setTeamMembersMessage('Failed to remove member. Ensure RLS policies allow this action.');
      setTeamMembersMessageType('error');
    } finally {
      setTeamMembersLoading(false);
    }
  };

  const renderProfileSettings = () => (
    <div className="settings-section">
      <div className="settings-section-header">
        <div>
          <h3 className="settings-section-title">Personal Information</h3>
          <p className="settings-section-subtitle">Update your name, email, and other personal details.</p>
        </div>
      </div>
      <form onSubmit={handleSaveSettings}>
        <div className="form-group">
          <label className="form-label">Name</label>
          <div className="input-wrapper">
            <User className="input-icon" />
            <input
              type="text"
              name="name"
              value={profileForm.name}
              onChange={handleProfileChange}
              className="form-input"
              placeholder="Your Name"
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
              name="email"
              value={profileForm.email}
              className="form-input"
              disabled // Email is typically managed via auth.updateUser or is read-only
            />
          </div>
          <p className="optional-text" style={{ marginTop: '0.5rem' }}>To change your email, please use the account management features provided by your authentication provider.</p>
        </div>
        <div className="form-group">
          <label className="form-label">Language</label>
          <div className="input-wrapper">
            <Globe className="input-icon" />
            <select
              name="language"
              value={profileForm.language}
              onChange={handleProfileChange}
              className="form-select"
            >
              <option value="en">English</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              {/* Add more languages as needed */}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Timezone</label>
          <div className="input-wrapper">
            <Clock className="input-icon" />
            <select
              name="timezone"
              value={profileForm.timezone}
              onChange={handleProfileChange}
              className="form-select"
            >
              <option value="UTC">UTC</option>
              <option value="America/New_York">America/New_York</option>
              <option value="Europe/London">Europe/London</option>
              {/* Add more timezones as needed */}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Currency</label>
          <CurrencySelect
            value={profileForm.currency}
            onChange={handleProfileChange}
            disabled={loading}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Account Type</label>
          <p className="company-display">{user?.account_type || 'personal'}</p>
          {user?.account_type === 'business' && user?.companies?.length > 0 && (
            <p className="company-display">Current Company: {user.companies.find(c => c.id === user.currentCompanyId)?.name || 'N/A'}</p>
          )}
        </div>
        {message && activeMainTab === 'profile' && <div className={`info-message ${messageType}`}>{message}</div>}
        <div style={{ textAlign: 'right', marginTop: '1.5rem' }}>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            <Save size={16} /> {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );

  const renderAppearanceSettings = () => (
    <div className="settings-section">
      <div className="settings-section-header">
        <div>
          <h3 className="settings-section-title">Appearance</h3>
          <p className="settings-section-subtitle">Customize the look and feel of your dashboard.</p>
        </div>
      </div>
      <form onSubmit={handleSaveSettings}>
        <div className="form-group">
          <label className="form-label">Theme</label>
          <div className="radio-group">
            <label>
              <input
                type="radio"
                name="theme"
                value="light"
                checked={themeSetting === 'light'}
                onChange={handleThemeChange}
              /> Light
            </label>
            <label>
              <input
                type="radio"
                name="theme"
                value="dark"
                checked={themeSetting === 'dark'}
                onChange={handleThemeChange}
              /> Dark
            </label>
            <label>
              <input
                type="radio"
                name="theme"
                value="system"
                checked={themeSetting === 'system'}
                onChange={handleThemeChange}
              /> System
            </label>
          </div>
        </div>
        {message && activeMainTab === 'appearance' && <div className={`info-message ${messageType}`}>{message}</div>}
        <div style={{ textAlign: 'right', marginTop: '1.5rem' }}>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            <Save size={16} /> {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );

  const renderNotificationSettings = () => (
    <div className="settings-section">
      <div className="settings-section-header">
        <div>
          <h3 className="settings-section-title">Notifications</h3>
          <p className="settings-section-subtitle">Manage how you receive alerts and reminders.</p>
        </div>
      </div>
      <form onSubmit={handleSaveSettings}>
        <div className="setting-item">
          <div className="setting-info">
            <h4>Daily Email Summary</h4>
            <p>Receive a daily email with your upcoming events and tasks.</p>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={notificationSettings.email_daily}
              onChange={() => handleNotificationToggle('email_daily')}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
        <div className="setting-item">
          <div className="setting-info">
            <h4>1-Week Event Countdown</h4>
            <p>Get an email reminder one week before an event.</p>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={notificationSettings.email_1week_countdown}
              onChange={() => handleNotificationToggle('email_1week_countdown')}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
        <div className="setting-item">
          <div className="setting-info">
            <h4>Push Notifications</h4>
            <p>Receive real-time alerts directly to your device (browser/PWA).</p>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={notificationSettings.push}
              onChange={() => handleNotificationToggle('push')}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
        <div className="setting-item">
          <div className="setting-info">
            <h4>Task Reminders</h4>
            <p>Get reminders for upcoming task due dates.</p>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={notificationSettings.reminders}
              onChange={() => handleNotificationToggle('reminders')}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
        <div className="setting-item">
          <div className="setting-info">
            <h4>Invitation Alerts</h4>
            <p>Receive notifications when you get a new company invitation.</p>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={notificationSettings.invitations}
              onChange={() => handleNotificationToggle('invitations')}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
        {message && activeMainTab === 'notifications' && <div className={`info-message ${messageType}`}>{message}</div>}
        <div style={{ textAlign: 'right', marginTop: '1.5rem' }}>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            <Save size={16} /> {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );

  // Render function for the Company & Team Overview content
  const renderCompanyTeamOverview = () => {
    // DEBUG LOGS for renderCompanyTeamOverview
    console.log('DEBUG: renderCompanyTeamOverview called.');
    console.log('DEBUG: renderCompanyTeamOverview - user.companies:', user?.companies);
    console.log('DEBUG: renderCompanyTeamOverview - user.currentCompanyId:', user?.currentCompanyId);

    const hasCompanies = user.companies && user.companies.length > 0;
    console.log('DEBUG: renderCompanyTeamOverview - hasCompanies:', hasCompanies);

    return (
      <div className="settings-section">
        <div className="settings-section-header">
          <div>
            <h3 className="settings-section-title">Your Companies</h3>
            <p className="settings-section-subtitle">Manage your company memberships and switch active contexts.</p>
          </div>
        </div>
        {message && activeCompanySubTab === 'overview' && <div className={`info-message ${messageType}`}>{message}</div>}
        {hasCompanies ? (
          <div className="companies-list">
            {user.companies.map(company => {
              console.log('DEBUG: renderCompanyTeamOverview - rendering company:', company.name, company.id);
              return (
                <div key={company.id} className={`company-item ${user.currentCompanyId === company.id ? 'active' : ''}`}>
                  <div className="company-info">
                    <Building2 size={20} className="company-icon" />
                    <div>
                      <p className="company-name">{company.name}</p>
                      <p className="company-role">Your Role: <strong>{company.role}</strong></p>
                      <p className="company-joined">Joined: {new Date(company.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="company-actions">
                    {user.currentCompanyId === company.id ? (
                      <span className="current-company-badge"><CheckCircle size={16} /> Current</span>
                    ) : (
                      <button
                        className="btn btn-outline btn-small"
                        onClick={() => handleSwitchCompany(company.id)}
                        disabled={loading}
                      >
                        Switch
                      </button>
                    )}
                    {company.role !== 'owner' && ( // Owners cannot leave their own company directly here
                      <button
                        className="btn btn-danger btn-small"
                        onClick={() => handleLeaveCompany(company.id, company.name)}
                        disabled={loading}
                      >
                        <LogOut size={16} /> Leave
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="no-companies">
            <Building2 className="no-companies-icon" />
            <p>You are not part of any companies yet.</p>
            <p>Use the "Add Company" tab to create your first company!</p>
            {console.log('DEBUG: renderCompanyTeamOverview - "No companies" message rendered.')}
          </div>
        )}
      </div>
    );
  };

  // Render Invite User to Company section
  const renderInviteUserToCompany = () => (
    <div className="settings-section">
      <div className="settings-section-header">
        <div>
          <h3 className="settings-section-title">Invite User to Company</h3>
          <p className="settings-section-subtitle">Send an invitation to a user to join your current company.</p>
        </div>
      </div>
      <form onSubmit={handleSendInvitation}>
        <div className="form-group">
          <label className="form-label">Recipient Email</label>
          <div className="input-wrapper">
            <Mail className="input-icon" />
            <input
              type="email"
              name="recipientEmail"
              value={inviteForm.recipientEmail}
              onChange={handleInviteUserChange}
              className="form-input"
              placeholder="user@example.com"
              required
              disabled={inviteLoading}
            />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Role</label>
          <div className="input-wrapper">
            <Key className="input-icon" />
            <select
              name="role"
              value={inviteForm.role}
              onChange={handleInviteUserChange}
              className="form-select"
              disabled={inviteLoading}
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>
        {user?.currentCompanyId ? (
          <p className="optional-text">Inviting to: <strong>{user.companies?.find(c => c.id === user.currentCompanyId)?.name || 'N/A'}</strong></p>
        ) : (
          <p className="info-message error">Please select a company first to send invitations.</p>
        )}

        {inviteMessage && <div className={`info-message ${inviteMessageType}`}>{inviteMessage}</div>}
        <div style={{ textAlign: 'right', marginTop: '1.5rem' }}>
          <button type="submit" className="btn btn-primary" disabled={inviteLoading || !user?.currentCompanyId}>
            <Send size={16} /> {inviteLoading ? 'Sending...' : 'Send Invitation'}
          </button>
        </div>
      </form>
    </div>
  );

  // Render Add New Company section
  const renderAddNewCompany = () => (
    <div className="settings-section">
      <div className="settings-section-header">
        <div>
          <h3 className="settings-section-title">Add New Company</h3>
          <p className="settings-section-subtitle">Create a new company and automatically set it as your current active company.</p>
        </div>
      </div>
      <form onSubmit={handleAddNewCompany}>
        <div className="form-group">
          <label className="form-label">Company Name</label>
          <div className="input-wrapper">
            <Building2 className="input-icon" />
            <input
              type="text"
              name="companyName"
              value={newCompanyForm.companyName}
              onChange={handleNewCompanyChange}
              className="form-input"
              placeholder="e.g., My New Venture"
              required
              disabled={companyLoading}
            />
          </div>
        </div>
        {companyMessage && <div className={`info-message ${companyMessageType}`}>{companyMessage}</div>}
        <div style={{ textAlign: 'right', marginTop: '1.5rem' }}>
          <button type="submit" className="btn btn-primary" disabled={companyLoading}>
            <Plus size={16} /> {companyLoading ? 'Adding...' : 'Add Company'}
          </button>
        </div>
      </form>
    </div>
  );

  // NEW: Render Team Members section
  const renderTeamMembers = () => {
    const currentCompany = user.companies?.find(c => c.id === user.currentCompanyId);
    const currentUserRoleInCompany = currentCompany?.role;
    const canManageMembers = ['owner', 'admin'].includes(currentUserRoleInCompany);

    // DEBUG LOGS
    console.log('DEBUG: renderTeamMembers - currentUserRoleInCompany:', currentUserRoleInCompany);
    console.log('DEBUG: renderTeamMembers - canManageMembers:', canManageMembers);

    if (!user?.currentCompanyId) {
      return (
        <div className="no-companies">
          <Users className="no-companies-icon" />
          <p>Please select a company to view its team members.</p>
          <p>You can select a company from the dropdown in the header or add a new one.</p>
        </div>
      );
    }

    return (
      <div className="settings-section">
        <div className="settings-section-header">
          <div>
            <h3 className="settings-section-title">Team Members for "{currentCompany?.name || 'N/A'}"</h3>
            <p className="settings-section-subtitle">Manage roles and remove members from your company.</p>
          </div>
        </div>
        {teamMembersMessage && <div className={`info-message ${teamMembersMessageType}`}>{teamMembersMessage}</div>}
        {teamMembersLoading ? (
          <div className="loading-message">Loading team members...</div>
        ) : (teamMembers.length > 0 ? (
          <div className="team-members-list">
            {teamMembers.map(member => (
              <div key={member.id} className={`team-member-item`}>
                <div className="member-info">
                  <User size={20} className="member-icon" />
                  <div>
                    <p className="member-name">{member.name}</p>
                    <p className="member-email">{member.email}</p>
                  </div>
                </div>
                <div className="member-actions">
                  {canManageMembers && member.id !== user.id && (
                    <select
                      className="role-select"
                      value={member.role}
                      onChange={(e) => handleChangeMemberRole(member.id, member.email, user.currentCompanyId, e.target.value)}
                      disabled={teamMembersLoading || (currentUserRoleInCompany === 'admin' && member.role === 'owner')}
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                      <option value="owner">Owner</option>
                    </select>
                  )}
                  {!canManageMembers && (
                    <span className="member-role-display">{member.role}</span>
                  )}
                  {canManageMembers && member.id !== user.id && (
                    <button
                      className="btn btn-danger btn-small"
                      onClick={() => handleRemoveMember(member.id, member.name, user.currentCompanyId)}
                      disabled={teamMembersLoading || (member.role === 'owner' && teamMembers.filter(m => m.role === 'owner').length === 1)} // Prevent removing last owner
                    >
                      <UserMinus size={16} /> Remove
                    </button>
                  )}
                  {member.id === user.id && (
                    <span className="current-user-badge">You ({member.role})</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="no-members">
            <Users className="no-members-icon" />
            <p>No team members found for this company.</p>
            <p>Invite users using the "Invite User" tab.</p>
          </div>
        ))}
      </div>
    );
  };

  // Main render function for the "Company & Team" tab, including its nested navigation
  const renderCompanyTeamSection = () => {
    console.log('DEBUG: renderCompanyTeamSection called. activeCompanySubTab:', activeCompanySubTab);
    return (
      <>
        <nav className="company-team-sub-nav"> {/* New class for nested nav */}
          <button
            className={`company-team-sub-nav-tab ${activeCompanySubTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveCompanySubTab('overview')}
          >
            <Building2 size={16} /> Overview
          </button>
          <button
            className={`company-team-sub-nav-tab ${activeCompanySubTab === 'team-members' ? 'active' : ''}`}
            onClick={() => setActiveCompanySubTab('team-members')}
          >
            <Users size={16} /> Team Members
          </button>
          <button
            className={`company-team-sub-nav-tab ${activeCompanySubTab === 'invite-user' ? 'active' : ''}`}
            onClick={() => setActiveCompanySubTab('invite-user')}
          >
            <Send size={16} /> Invite User
          </button>
          <button
            className={`company-team-sub-nav-tab ${activeCompanySubTab === 'add-company' ? 'active' : ''}`}
            onClick={() => setActiveCompanySubTab('add-company')}
          >
            <Plus size={16} /> Add Company
          </button>
        </nav>

        {/* This wrapper ensures consistent styling for the content of the company sub-tabs */}
        <div className="settings-tab-content">
          {activeCompanySubTab === 'overview' && renderCompanyTeamOverview()}
          {activeCompanySubTab === 'team-members' && renderTeamMembers()}
          {activeCompanySubTab === 'invite-user' && renderInviteUserToCompany()}
          {activeCompanySubTab === 'add-company' && renderAddNewCompany()}
        </div>
      </>
    );
  };

  return (
    <div className="settings-tab-container constrained-content">
      <nav className="settings-nav">
        <button
          className={`settings-nav-tab ${activeMainTab === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveMainTab('profile')}
        >
          <User size={16} /> Profile
        </button>
        <button
          className={`settings-nav-tab ${activeMainTab === 'appearance' ? 'active' : ''}`}
          onClick={() => setActiveMainTab('appearance')}
        >
          <Palette size={16} /> Appearance
        </button>
        <button
          className={`settings-nav-tab ${activeMainTab === 'notifications' ? 'active' : ''}`}
          onClick={() => setActiveMainTab('notifications')}
        >
          <Bell size={16} /> Notifications
        </button>
        <button
          className={`settings-nav-tab ${activeMainTab === 'company-team' ? 'active' : ''}`}
          onClick={() => setActiveMainTab('company-team')}
        >
          <Building2 size={16} /> Company & Team
        </button>
      </nav>

      {/* Conditional rendering for main tab content */}
      {activeMainTab === 'profile' && (
        <div className="settings-tab-content">
          {renderProfileSettings()}
        </div>
      )}
      {activeMainTab === 'appearance' && (
        <div className="settings-tab-content">
          {renderAppearanceSettings()}
        </div>
      )}
      {activeMainTab === 'notifications' && (
        <div className="settings-tab-content">
          {renderNotificationSettings()}
        </div>
      )}
      {activeMainTab === 'company-team' && (
        // The Company & Team section has its own internal structure
        // so it doesn't need an outer .settings-tab-content wrapper here.
        // Its internal renderCompanyTeamSection will manage its own content layout.
        renderCompanyTeamSection()
      )}
    </div>
  );
};

export default SettingsTab;

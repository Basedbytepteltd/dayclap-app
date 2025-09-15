import React from 'react';
import { LayoutDashboard } from 'lucide-react';
import './AdminPanel.css';

// This component is being removed as SuperAdminDashboard will take over its role.
// It's kept here as a placeholder to explain the change.
const AdminPanel = () => {
  return (
    <div className="admin-panel-content container">
      <div className="admin-panel-header">
        <h2>Admin Panel</h2>
        <p className="admin-panel-subtitle">
          This Admin Panel has been deprecated. All super admin functionalities are now
          managed directly within the <span style={{ fontWeight: 'bold' }}>Super Admin Dashboard</span>.
        </p>
      </div>
      <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--secondary-text)' }}>
        <LayoutDashboard size={64} style={{ marginBottom: '1rem', color: 'var(--border-color)' }} />
        <h3>Functionality Moved</h3>
        <p>
          Please navigate to the Super Admin Dashboard to manage users, companies, events, and tasks.
        </p>
      </div>
    </div>
  );
};

export default AdminPanel;
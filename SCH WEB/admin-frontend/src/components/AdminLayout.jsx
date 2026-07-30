import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import SchoolCrest from './SchoolCrest';
import Icon from './Icon';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: 'grid', end: true },
  { to: '/applications', label: 'Applications', icon: 'fileText' },
  { to: '/career-applications', label: 'Career Applications', icon: 'briefcase' },
  { to: '/messages', label: 'Messages', icon: 'mail' },
  { to: '/students', label: 'Students', icon: 'users' },
  { to: '/staff', label: 'Staff', icon: 'userCog', adminOnly: true },
  { to: '/notices', label: 'Notices', icon: 'bell' },
  { to: '/resources', label: 'Resources', icon: 'bookOpen' },
  { to: '/exams', label: 'CBT Exams', icon: 'clipboard' },
  { to: '/billing', label: 'Billing', icon: 'creditCard', financeOnly: true },
  { to: '/report-cards', label: 'Report Cards', icon: 'fileText' },
  { to: '/settings', label: 'Settings', icon: 'settings' }
];

const AdminLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Staff management (viewing accounts, and especially creating new
  // admin/staff logins) is an admin-only capability on the backend — hide
  // the nav entry for staff so it's not a dead link that 403s on click.
  // Billing is limited to admins and bursars — teaching staff have no
  // finance responsibilities.
  const isFinanceUser = user?.role === 'admin' || user?.staffType === 'bursar';
  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (item.adminOnly && user?.role !== 'admin') return false;
    if (item.financeOnly && !isFinanceUser) return false;
    return true;
  });

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="admin-shell">
      <aside className={`admin-sidebar ${sidebarOpen ? 'admin-sidebar-open' : ''}`}>
        <div className="admin-sidebar-brand">
          <SchoolCrest size={36} />
          <span>GMA Admin</span>
        </div>
        <nav className="admin-nav">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `admin-nav-link ${isActive ? 'admin-nav-link-active' : ''}`}
              onClick={() => setSidebarOpen(false)}
            >
              <Icon name={item.icon} size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {sidebarOpen && <div className="admin-sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

      <div className="admin-main">
        <header className="admin-topbar">
          <button className="admin-menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
            <Icon name="menu" size={22} />
          </button>
          <div className="admin-topbar-spacer" />
          <div className="admin-user">
            <span className="admin-user-identifier">{user?.name || user?.email || user?.phone}</span>
            <span className="admin-user-role">{user?.role}</span>
          </div>
          <button className="btn btn-outline btn-sm" onClick={handleLogout}>
            <Icon name="logOut" size={16} />
            Logout
          </button>
        </header>

        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;

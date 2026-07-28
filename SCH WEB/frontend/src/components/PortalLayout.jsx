import React, { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { SelectedChildProvider, useSelectedChild } from '../contexts/SelectedChildContext';
import SVGIcon from './icons/SVGIcon';

const ChildSwitcher = () => {
  const { selectedChildId, setSelectedChildId, childOptions } = useSelectedChild();
  if (childOptions.length <= 1) return null;

  return (
    <select
      className="child-switcher"
      value={selectedChildId || ''}
      onChange={(e) => setSelectedChildId(e.target.value)}
      aria-label="Select child"
    >
      {childOptions.map((child) => (
        <option key={child.id} value={child.id}>{child.fullName}</option>
      ))}
    </select>
  );
};

const PortalLayout = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const menuItems = [
    {
      path: '/portal',
      icon: 'home',
      label: 'Dashboard',
      exact: true
    },
    {
      path: '/portal/profile',
      icon: 'user',
      label: 'Profile'
    },
    {
      path: '/portal/report-cards',
      icon: 'file-text',
      label: 'Report Cards'
    },
    {
      path: '/portal/bills',
      icon: 'credit-card',
      label: 'Bills & Payments'
    },
    {
      path: '/portal/notices',
      icon: 'bell',
      label: 'School Notices'
    },
    {
      path: '/portal/exams',
      icon: 'clock',
      label: 'CBT Exams'
    },
    {
      path: '/portal/resources',
      icon: 'bookOpen',
      label: 'Learning Resources'
    }
  // Bills & Payments is a parent/staff/admin concern — students don't
  // manage fees for their own account
  ].filter((item) => item.path !== '/portal/bills' || user?.role !== 'student');

  const isActive = (item) => {
    if (item.exact) {
      return location.pathname === item.path;
    }
    return location.pathname.startsWith(item.path);
  };

  return (
    <SelectedChildProvider>
    <div className="portal-layout">
      {/* Top Navigation */}
      <header className="portal-header">
        <div className="header-left">
          <button
            className="sidebar-toggle"
            onClick={toggleSidebar}
            aria-label="Toggle sidebar"
          >
            <SVGIcon name="menu" size="24" />
          </button>
          <Link to="/portal" className="portal-logo">
            <SVGIcon name="graduation-cap" size="32" />
            <span>GMA Portal</span>
          </Link>
        </div>

        <div className="header-right">
          {user?.role === 'parent' && <ChildSwitcher />}
          <div className="user-menu">
            <div className="user-info">
              <span className="user-name">
                {user?.student?.fullName || user?.email || user?.phone}
              </span>
              <span className="user-role">
                {user?.role === 'student' ? 'Student' :
                 user?.role === 'parent' ? 'Parent' :
                 user?.role?.charAt(0).toUpperCase() + user?.role?.slice(1)}
              </span>
            </div>

            <div className="user-avatar">
              {user?.student?.photoUrl ? (
                <img src={user.student.photoUrl} alt="Profile" />
              ) : (
                <SVGIcon name="user" size="24" />
              )}
            </div>

            <div className="user-dropdown">
              <Link to="/portal/profile" className="dropdown-item">
                <SVGIcon name="settings" size="16" />
                Settings
              </Link>
              <button onClick={handleLogout} className="dropdown-item">
                <SVGIcon name="log-out" size="16" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="portal-body">
        {/* Sidebar Navigation */}
        <aside className={`portal-sidebar ${isSidebarOpen ? 'open' : ''}`}>
          <nav className="sidebar-nav">
            <ul>
              {menuItems.map((item) => (
                <li key={item.path}>
                  <Link 
                    to={item.path}
                    className={`nav-item ${isActive(item) ? 'active' : ''}`}
                    onClick={() => setIsSidebarOpen(false)}
                  >
                    <SVGIcon name={item.icon} size="20" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="sidebar-footer">
            <Link to="/" className="back-to-website">
              <SVGIcon name="arrow-left" size="16" />
              Back to Website
            </Link>
            
            <div className="help-section">
              <h4>Need Help?</h4>
              <Link to="/contact" className="help-link">
                <SVGIcon name="help-circle" size="16" />
                Contact Support
              </Link>
            </div>
          </div>
        </aside>

        {/* Sidebar Overlay for Mobile */}
        {isSidebarOpen && (
          <div 
            className="sidebar-overlay"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Main Content */}
        <main className="portal-main">
          <div className="portal-content">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
    </SelectedChildProvider>
  );
};

export default PortalLayout;
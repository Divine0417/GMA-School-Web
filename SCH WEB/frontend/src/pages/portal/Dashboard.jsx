import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSelectedChild } from '../../contexts/SelectedChildContext';
import { Link } from 'react-router-dom';
import SVGIcon from '../../components/icons/SVGIcon';
import StaffClassOverview from './StaffClassOverview';

const StudentParentDashboard = () => {
  const { user, apiCall } = useAuth();
  const { selectedChildId } = useSelectedChild();
  const [dashboardData, setDashboardData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    // Guards against a slower response for a previously-selected child
    // arriving after a faster one for the newly-selected child, which would
    // otherwise overwrite the correct data with stale data.
    let cancelled = false;

    const fetchDashboardData = async () => {
      // Students always have their own record; parents/staff/admin only
      // have one once a child/student has actually been selected (staff and
      // admin have no personal record of their own, so this is always the
      // case for them — see the render guard below).
      if (user?.role !== 'student' && !selectedChildId) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const query = selectedChildId ? `?studentId=${selectedChildId}` : '';
        const { data } = await apiCall(`/student/dashboard${query}`);
        if (cancelled) return;

        if (data.success) {
          setDashboardData(data.data);
        } else {
          setError(data.message || 'Failed to load dashboard');
        }
      } catch (error) {
        if (cancelled) return;
        setError('Failed to connect to server');
        console.error('Dashboard fetch error:', error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchDashboardData();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChildId, retryCount]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN'
    }).format(amount);
  };

  if (user?.role !== 'student' && !selectedChildId) {
    return (
      <div className="dashboard">
        <div className="card">
          <div className="card-body">
            <p>
              {user?.role === 'parent'
                ? 'Select a student to view their dashboard.'
                : 'Search for a student using the box at the top of the page to view their dashboard. No students found in your assigned division/class yet.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="dashboard-loading">
        <SVGIcon name="loader" size="48" className="spinning" />
        <p>Loading dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-error">
        <SVGIcon name="alert-circle" size="48" />
        <h3>Unable to load dashboard</h3>
        <p>{error}</p>
        <button onClick={() => setRetryCount((c) => c + 1)} className="btn btn-primary">
          Try Again
        </button>
      </div>
    );
  }

  const { student, stats, recentActivity } = dashboardData || {};

  return (
    <div className="dashboard">
      {/* Welcome Header */}
      <div className="dashboard-header">
        <div className="welcome-section">
          <div className="student-info">
            {student?.photoUrl && (
              <div className="student-photo">
                <img src={student.photoUrl} alt={student.fullName} />
              </div>
            )}
            <div className="student-details">
              <h1>Welcome back, {student?.fullName?.split(' ')[0] || 'Student'}!</h1>
              <div className="student-meta">
                <span className="reg-number">{student?.regNumber}</span>
                <span className="class-info">{student?.class} • {student?.division}</span>
                <span className="session">{student?.session}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="quick-actions">
          <Link to="/portal/report-cards" className="quick-action">
            <SVGIcon name="file-text" size="24" />
            <span>Report Cards</span>
          </Link>
          {user?.role !== 'student' && (
            <Link to="/portal/bills" className="quick-action">
              <SVGIcon name="credit-card" size="24" />
              <span>Bills</span>
            </Link>
          )}
          <Link to="/portal/notices" className="quick-action">
            {stats?.unreadNotices > 0 && (
              <span className="quick-action-badge">{stats.unreadNotices > 9 ? '9+' : stats.unreadNotices}</span>
            )}
            <SVGIcon name="bell" size="24" />
            <span>Notices</span>
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid">
        {user?.role !== 'student' && (
          <div className="stat-card">
            <div className="stat-icon">
              <SVGIcon name="credit-card" size="32" />
            </div>
            <div className="stat-info">
              <h3>Outstanding Balance</h3>
              <div className={`stat-value ${stats?.totalOwed > 0 ? 'amount-owed' : 'amount-clear'}`}>
                {formatCurrency(stats?.totalOwed || 0)}
              </div>
              {stats?.overdueCount > 0 && (
                <p className="stat-note overdue">
                  {stats.overdueCount} overdue payment{stats.overdueCount > 1 ? 's' : ''}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="stat-card">
          <div className="stat-icon">
            <SVGIcon name="file-text" size="32" />
          </div>
          <div className="stat-info">
            <h3>Report Cards</h3>
            <div className="stat-value">{stats?.recentReportCards || 0}</div>
            <p className="stat-note">Available this session</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <SVGIcon name="bell" size="32" />
          </div>
          <div className="stat-info">
            <h3>Unread Notices</h3>
            <div className="stat-value">{stats?.unreadNotices || 0}</div>
            <p className="stat-note">New notifications</p>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="recent-activity">
        {user?.role !== 'student' && (
          <div className="activity-section">
            <div className="section-header">
              <h2>Recent Bills</h2>
              <Link to="/portal/bills" className="view-all">
                View All <SVGIcon name="arrowRight" size="16" />
              </Link>
            </div>

            <div className="activity-cards">
              {recentActivity?.invoices?.length > 0 ? (
                recentActivity.invoices.map((invoice, index) => (
                  <div key={index} className="activity-card">
                    <div className="activity-icon">
                      <SVGIcon name="credit-card" size="20" />
                    </div>
                    <div className="activity-info">
                      <h4>{invoice.term} Term {invoice.session}</h4>
                      <p>{formatCurrency(invoice.balance)} due</p>
                      <span className={`status ${invoice.status}`}>
                        {invoice.status === 'overdue' ? 'Overdue' : 'Pending'}
                      </span>
                    </div>
                    <div className="activity-date">
                      {new Date(invoice.dueDate).toLocaleDateString()}
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-state">
                  <SVGIcon name="checkCircle" size="48" />
                  <p>No outstanding bills</p>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="activity-section">
          <div className="section-header">
            <h2>Recent Notices</h2>
            <Link to="/portal/notices" className="view-all">
              View All <SVGIcon name="arrowRight" size="16" />
            </Link>
          </div>
          
          <div className="activity-cards">
            {recentActivity?.notices?.length > 0 ? (
              recentActivity.notices.slice(0, 3).map((notice, index) => (
                <div key={index} className="activity-card">
                  <div className={`activity-icon priority-${notice.priority}`}>
                    <SVGIcon name="bell" size="20" />
                  </div>
                  <div className="activity-info">
                    <h4>{notice.title}</h4>
                    <p>{notice.summary || notice.body?.substring(0, 100) + '...'}</p>
                    <span className="category">{notice.category}</span>
                  </div>
                  <div className="activity-date">
                    {new Date(notice.publishDate).toLocaleDateString()}
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">
                <SVGIcon name="bell-off" size="48" />
                <p>No recent notices</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Staff/admin land on a class overview (roster + summary); students and
// parents keep the single-student dashboard below.
const Dashboard = () => {
  const { isStaffOrAdmin } = useSelectedChild();
  return isStaffOrAdmin ? <StaffClassOverview /> : <StudentParentDashboard />;
};

export default Dashboard;
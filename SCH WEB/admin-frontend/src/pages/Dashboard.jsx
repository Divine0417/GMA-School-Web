import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Icon from '../components/Icon';
import BarChart from '../components/BarChart';
import DonutChart from '../components/DonutChart';

const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(amount || 0);

const compactCurrency = (v) => formatCurrency(v).replace('NGN', '₦').replace(/\.00$/, '');

const APPLICATION_STATUS_COLORS = { pending: '#F59E0B', under_review: '#3B82F6', approved: '#10B981', rejected: '#EF4444', waitlisted: '#8B5CF6' };
const INVOICE_STATUS_COLORS = { pending: '#F59E0B', partial: '#3B82F6', paid: '#10B981', overdue: '#EF4444', cancelled: '#9CA3AF' };
const DIVISION_COLORS = { nursery: '#C9A84C', primary: '#3B82F6', secondary: '#10B981', college: '#0A1F44' };

const monthLabel = (ym) => {
  const [year, month] = ym.split('-');
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('en-GB', { month: 'short' });
};

const formatDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

const greetingForNow = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

// Staff/admin accounts have no first name — derive a friendly handle from the
// email local-part, otherwise fall back to the role.
const displayName = (user) => {
  if (user?.name) return user.name;
  if (user?.email) {
    const local = user.email.split('@')[0].replace(/[._-]+/g, ' ');
    return local.charAt(0).toUpperCase() + local.slice(1);
  }
  return user?.role === 'admin' ? 'Administrator' : 'Staff';
};

const Dashboard = () => {
  const { apiCall, user } = useAuth();
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchStats = async () => {
      setIsLoading(true);
      const { data } = await apiCall('/admin/dashboard/stats');
      if (data.success) {
        setStats(data.data);
      } else {
        setError(data.message || 'Failed to load dashboard');
      }
      setIsLoading(false);
    };
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLoading) {
    return <div className="empty-state"><Icon name="loader" size={24} className="spinning" /></div>;
  }

  if (error) {
    return <div className="empty-state">{error}</div>;
  }

  const now = new Date();

  // Actionable metrics get an `alert` flag when they carry a non-zero backlog,
  // so the card surfaces a coloured dot and stronger accent.
  const kpis = [
    { label: 'Total Students', value: stats.students.total, icon: 'users', color: '#0A1F44', to: '/students' },
    { label: 'Pending Applications', value: stats.applications.pending, icon: 'fileText', color: '#F59E0B', to: '/applications', alert: stats.applications.pending > 0 },
    { label: 'New Applications · 7d', value: stats.applications.thisWeek, icon: 'clipboard', color: '#3B82F6', to: '/applications' },
    { label: 'New Messages', value: stats.messages.new, icon: 'mail', color: '#C9A84C', to: '/messages', alert: stats.messages.new > 0 },
    { label: 'Pending Career Apps', value: stats.careerApplications.pending, icon: 'briefcase', color: '#8B5CF6', to: '/career-applications', alert: stats.careerApplications.pending > 0 },
    { label: 'Overdue Invoices', value: stats.financial.overdueInvoices, icon: 'alertCircle', color: '#EF4444', to: '/billing', alert: stats.financial.overdueInvoices > 0 },
    { label: 'Revenue Collected', value: compactCurrency(stats.financial.totalRevenue), icon: 'creditCard', color: '#10B981', to: '/billing' },
    { label: 'Active Notices', value: stats.notices.active, icon: 'bell', color: '#14B8A6', to: '/notices' }
  ];

  const studentsByDivision = stats.students.byDivision?.map((d) => ({
    label: d.division, value: d.count, color: DIVISION_COLORS[d.division]
  })) || [];

  const applicationsByStatus = stats.applications.byStatus?.map((s) => ({
    label: s.status.replace('_', ' '), value: s.count, color: APPLICATION_STATUS_COLORS[s.status]
  })) || [];

  const invoicesByStatus = stats.financial.byStatus?.map((s) => ({
    label: s.status, value: s.count, color: INVOICE_STATUS_COLORS[s.status]
  })) || [];

  const revenueByMonth = stats.financial.revenueByMonth?.map((m) => ({
    label: monthLabel(m.month), value: m.total
  })) || [];

  return (
    <div className="dashboard">
      {/* Hero / greeting */}
      <div className="dash-hero">
        <div className="dash-hero-main">
          <div className="dash-hero-greeting">{greetingForNow()}, {displayName(user)}</div>
          <p className="dash-hero-sub">Here's what's happening across the school today.</p>
          <span className="dash-hero-scope">
            <Icon name="userCog" size={13} />
            {user?.role === 'admin' ? 'Administrator' : 'Staff'}
            {user?.division ? ` · ${user.division}` : ' · All divisions'}
          </span>
        </div>
        <div className="dash-hero-date">
          <div className="d-day">{now.toLocaleDateString('en-GB', { weekday: 'long' })}</div>
          <div className="d-full">{now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="kpi-grid">
        {kpis.map((k) => (
          <Link className={`kpi-card${k.alert ? ' kpi-card--alert' : ''}`} to={k.to} key={k.label} style={k.alert ? { '--kpi-accent': k.color } : undefined}>
            <div className="kpi-top">
              <span className="kpi-icon" style={{ background: `${k.color}1A`, color: k.color }}>
                <Icon name={k.icon} size={22} />
              </span>
              {k.alert
                ? <span className="kpi-alert-dot" style={{ background: k.color }} />
                : <span className="kpi-arrow"><Icon name="externalLink" size={16} /></span>}
            </div>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-label">{k.label}</div>
          </Link>
        ))}
      </div>

      {/* Analytics */}
      <div className="dash-section">
        <h2>Analytics</h2>
        <span className="dash-section-line" />
      </div>

      <div className="dash-grid-2">
        <div className="card">
          <h3 className="dash-card-title">Students by Division</h3>
          {studentsByDivision.length > 0 ? <DonutChart data={studentsByDivision} /> : <div className="text-secondary text-sm">No students yet.</div>}
        </div>

        <div className="card">
          <h3 className="dash-card-title">Applications by Status</h3>
          {applicationsByStatus.length > 0 ? <DonutChart data={applicationsByStatus} /> : <div className="text-secondary text-sm">No applications yet.</div>}
        </div>

        <div className="card">
          <h3 className="dash-card-title">Invoices by Status</h3>
          {invoicesByStatus.length > 0 ? <DonutChart data={invoicesByStatus} /> : <div className="text-secondary text-sm">No invoices yet.</div>}
        </div>

        <div className="card">
          <h3 className="dash-card-title">Revenue · Last 6 Months</h3>
          {revenueByMonth.length > 0 ? <BarChart data={revenueByMonth} formatValue={compactCurrency} /> : <div className="text-secondary text-sm">No revenue recorded yet.</div>}
        </div>
      </div>

      {/* Recent applications */}
      {stats.applications.recent?.length > 0 && (
        <>
          <div className="dash-section">
            <h2>Recent Applications</h2>
            <span className="dash-section-line" />
            <Link to="/applications" className="btn btn-outline btn-sm">View all</Link>
          </div>
          <div className="card">
            <div className="data-table-wrap" style={{ border: 'none' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Application #</th>
                    <th>Applicant</th>
                    <th>Division</th>
                    <th>Submitted</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.applications.recent.map((app) => (
                    <tr key={app._id}>
                      <td data-label="Application #">{app.applicationNumber}</td>
                      <td data-label="Applicant">{[app.applicantName?.firstName, app.applicantName?.lastName].filter(Boolean).join(' ')}</td>
                      <td data-label="Division" style={{ textTransform: 'capitalize' }}>{app.divisionApplied}</td>
                      <td data-label="Submitted">{formatDate(app.createdAt)}</td>
                      <td data-label="Status"><span className={`badge badge-${app.status}`}>{app.status.replace('_', ' ')}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Fee defaulters */}
      {stats.financial.defaulters?.length > 0 && (
        <>
          <div className="dash-section">
            <h2>Fee Defaulters</h2>
            <span className="dash-section-line" />
            <Link to="/billing" className="btn btn-outline btn-sm">Go to Billing</Link>
          </div>
          <div className="card">
            <p className="text-secondary text-sm" style={{ marginBottom: 'var(--space-4)' }}>
              Students with an unpaid balance past their due date, highest amount owed first.
            </p>
            <div className="data-table-wrap" style={{ border: 'none' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Division / Class</th>
                    <th>Parent Contact</th>
                    <th>Amount Owed</th>
                    <th>Overdue Invoices</th>
                    <th>Oldest Due</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {stats.financial.defaulters.map((d) => (
                    <tr key={d.studentId}>
                      <td data-label="Student">{d.studentName}<br /><span className="text-secondary text-sm">{d.regNumber}</span></td>
                      <td data-label="Division / Class" style={{ textTransform: 'capitalize' }}>{d.division} / {d.class}</td>
                      <td data-label="Parent Contact">{d.parentName}<br /><span className="text-secondary text-sm">{d.parentPhone}</span></td>
                      <td data-label="Amount Owed"><strong>{formatCurrency(d.totalOwed)}</strong></td>
                      <td data-label="Overdue Invoices">{d.invoiceCount}</td>
                      <td data-label="Oldest Due">{formatDate(d.oldestDueDate)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                          {d.parentPhone && <a className="btn btn-outline btn-sm" href={`tel:${d.parentPhone}`}><Icon name="phone" size={14} /></a>}
                          {d.parentEmail && <a className="btn btn-outline btn-sm" href={`mailto:${d.parentEmail}`}><Icon name="mail" size={14} /></a>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;

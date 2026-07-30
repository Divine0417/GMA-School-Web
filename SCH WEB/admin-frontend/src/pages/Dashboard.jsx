import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Icon from '../components/Icon';
import BarChart from '../components/BarChart';
import DonutChart from '../components/DonutChart';

const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(amount || 0);

const APPLICATION_STATUS_COLORS = { pending: '#F59E0B', under_review: '#3B82F6', approved: '#10B981', rejected: '#EF4444', waitlisted: '#8B5CF6' };
const INVOICE_STATUS_COLORS = { pending: '#F59E0B', partial: '#3B82F6', paid: '#10B981', overdue: '#EF4444', cancelled: '#9CA3AF' };
const DIVISION_COLORS = { nursery: '#C9A84C', primary: '#3B82F6', secondary: '#10B981', college: '#0A1F44' };

const monthLabel = (ym) => {
  const [year, month] = ym.split('-');
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('en-GB', { month: 'short' });
};

const formatDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

const Dashboard = () => {
  const { apiCall } = useAuth();
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

  const cards = [
    { label: 'Total Students', value: stats.students.total },
    { label: 'Pending Applications', value: stats.applications.pending },
    { label: 'New Applications (7 days)', value: stats.applications.thisWeek },
    { label: 'New Messages', value: stats.messages.new },
    { label: 'Pending Career Applications', value: stats.careerApplications.pending },
    { label: 'Overdue Invoices', value: stats.financial.overdueInvoices },
    { label: 'Total Revenue Collected', value: formatCurrency(stats.financial.totalRevenue) },
    { label: 'Active Notices', value: stats.notices.active }
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
    <div>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p className="text-secondary">Overview of school activity</p>
        </div>
      </div>

      <div className="stats-grid">
        {cards.map((card) => (
          <div className="stat-card" key={card.label}>
            <div className="stat-card-label">{card.label}</div>
            <div className="stat-card-value">{card.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 'var(--space-5)', marginTop: 'var(--space-6)' }}>
        <div className="card">
          <h3 style={{ marginBottom: 'var(--space-4)' }}>Students by Division</h3>
          <DonutChart data={studentsByDivision} />
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 'var(--space-4)' }}>Applications by Status</h3>
          {applicationsByStatus.length > 0 ? <DonutChart data={applicationsByStatus} /> : <div className="text-secondary text-sm">No applications yet.</div>}
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 'var(--space-4)' }}>Invoices by Status</h3>
          {invoicesByStatus.length > 0 ? <DonutChart data={invoicesByStatus} /> : <div className="text-secondary text-sm">No invoices yet.</div>}
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 'var(--space-4)' }}>Revenue — Last 6 Months</h3>
          <BarChart data={revenueByMonth} formatValue={(v) => formatCurrency(v).replace('NGN', '₦').replace(/\.00$/, '')} />
        </div>
      </div>

      {stats.applications.recent?.length > 0 && (
        <div className="card" style={{ marginTop: 'var(--space-5)' }}>
          <h3 style={{ marginBottom: 'var(--space-4)' }}>Recent Applications</h3>
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
      )}

      {stats.financial.defaulters?.length > 0 && (
        <div className="card" style={{ marginTop: 'var(--space-5)' }}>
          <h3 style={{ marginBottom: 'var(--space-2)' }}>Fee Defaulters</h3>
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
      )}
    </div>
  );
};

export default Dashboard;

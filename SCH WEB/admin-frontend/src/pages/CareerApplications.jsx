import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Icon from '../components/Icon';

const STATUSES = ['pending', 'reviewing', 'shortlisted', 'rejected', 'hired'];

const formatDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

const CareerApplications = () => {
  const { apiCall } = useAuth();
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ current: 1, total: 1 });
  const [statusFilter, setStatusFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);

  const fetchItems = async (page = 1) => {
    setIsLoading(true);
    const query = new URLSearchParams({ page, limit: 20, ...(statusFilter && { status: statusFilter }) });
    const { data } = await apiCall(`/admin/career-applications?${query}`);
    if (data.success) {
      setItems(data.data.careerApplications);
      setPagination(data.data.pagination);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchItems(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const handleStatusChange = async (id, status) => {
    setUpdatingId(id);
    const { data } = await apiCall(`/admin/career-applications/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
    if (data.success) {
      setItems((prev) => prev.map((item) => (item._id === id ? data.data : item)));
      if (selected?._id === id) setSelected(data.data);
    }
    setUpdatingId(null);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Career Applications</h1>
          <p className="text-secondary">{pagination.totalRecords || 0} total applications</p>
        </div>
      </div>

      <div className="filter-bar">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="empty-state"><Icon name="loader" size={24} className="spinning" /></div>
      ) : items.length === 0 ? (
        <div className="empty-state">No career applications found.</div>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Position</th>
                <th>Contact</th>
                <th>Submitted</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item._id}>
                  <td data-label="Name">{item.fullName}</td>
                  <td data-label="Position">{item.position}</td>
                  <td data-label="Contact">{item.email}<br /><span className="text-secondary text-sm">{item.phone}</span></td>
                  <td data-label="Submitted">{formatDate(item.createdAt)}</td>
                  <td data-label="Status">
                    <select
                      value={item.status}
                      disabled={updatingId === item._id}
                      onChange={(e) => handleStatusChange(item._id, e.target.value)}
                      className={`badge badge-${item.status}`}
                      style={{ border: 'none', cursor: 'pointer' }}
                    >
                      {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td>
                    <button className="btn btn-outline btn-sm" onClick={() => setSelected(item)}>View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination.total > 1 && (
        <div className="pagination-bar">
          <button className="btn btn-outline btn-sm" disabled={pagination.current <= 1} onClick={() => fetchItems(pagination.current - 1)}>Previous</button>
          <span className="text-sm">Page {pagination.current} of {pagination.total}</span>
          <button className="btn btn-outline btn-sm" disabled={pagination.current >= pagination.total} onClick={() => fetchItems(pagination.current + 1)}>Next</button>
        </div>
      )}

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selected.fullName}</h2>
              <button className="modal-close-btn" onClick={() => setSelected(null)}><Icon name="close" size={22} /></button>
            </div>

            <dl className="detail-grid">
              <div><dt>Position</dt><dd>{selected.position}</dd></div>
              <div><dt>Status</dt><dd className={`badge badge-${selected.status}`}>{selected.status}</dd></div>
              <div><dt>Email</dt><dd>{selected.email}</dd></div>
              <div><dt>Phone</dt><dd>{selected.phone}</dd></div>
              <div className="detail-grid-full"><dt>Experience</dt><dd>{selected.experience}</dd></div>
              {selected.education && <div className="detail-grid-full"><dt>Education</dt><dd>{selected.education}</dd></div>}
              {selected.coverLetter?.fileUrl && (
                <div className="detail-grid-full">
                  <dt>Cover Letter</dt>
                  <dd><a href={selected.coverLetter.fileUrl} target="_blank" rel="noreferrer">{selected.coverLetter.fileName}</a></dd>
                </div>
              )}
            </dl>

            <div className="filter-bar">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  className={`btn btn-sm ${selected.status === s ? 'btn-primary' : 'btn-outline'}`}
                  disabled={updatingId === selected._id}
                  onClick={() => handleStatusChange(selected._id, s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CareerApplications;

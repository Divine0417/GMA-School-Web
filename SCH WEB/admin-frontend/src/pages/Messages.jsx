import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Icon from '../components/Icon';

const STATUSES = ['new', 'read', 'replied'];

const formatDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const Messages = () => {
  const { apiCall } = useAuth();
  const [messages, setMessages] = useState([]);
  const [pagination, setPagination] = useState({ current: 1, total: 1 });
  const [statusFilter, setStatusFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);

  const fetchMessages = async (page = 1) => {
    setIsLoading(true);
    const query = new URLSearchParams({ page, limit: 20, ...(statusFilter && { status: statusFilter }) });
    const { data } = await apiCall(`/admin/messages?${query}`);
    if (data.success) {
      setMessages(data.data.messages);
      setPagination(data.data.pagination);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchMessages(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const handleStatusChange = async (id, status) => {
    setUpdatingId(id);
    const { data } = await apiCall(`/admin/messages/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
    if (data.success) {
      setMessages((prev) => prev.map((m) => (m._id === id ? data.data : m)));
      if (selected?._id === id) setSelected(data.data);
    }
    setUpdatingId(null);
  };

  const openMessage = (msg) => {
    setSelected(msg);
    if (msg.status === 'new') handleStatusChange(msg._id, 'read');
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Contact Messages</h1>
          <p className="text-secondary">{pagination.totalRecords || 0} total messages</p>
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
      ) : messages.length === 0 ? (
        <div className="empty-state">No messages found.</div>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>From</th>
                <th>Subject</th>
                <th>Received</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {messages.map((msg) => (
                <tr key={msg._id} style={{ fontWeight: msg.status === 'new' ? 700 : 400 }}>
                  <td data-label="From">{msg.name}<br /><span className="text-secondary text-sm" style={{ fontWeight: 400 }}>{msg.email}</span></td>
                  <td data-label="Subject">{msg.subject || 'General enquiry'}</td>
                  <td data-label="Received">{formatDate(msg.createdAt)}</td>
                  <td data-label="Status"><span className={`badge badge-${msg.status}`}>{msg.status}</span></td>
                  <td>
                    <button className="btn btn-outline btn-sm" onClick={() => openMessage(msg)}>View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination.total > 1 && (
        <div className="pagination-bar">
          <button className="btn btn-outline btn-sm" disabled={pagination.current <= 1} onClick={() => fetchMessages(pagination.current - 1)}>Previous</button>
          <span className="text-sm">Page {pagination.current} of {pagination.total}</span>
          <button className="btn btn-outline btn-sm" disabled={pagination.current >= pagination.total} onClick={() => fetchMessages(pagination.current + 1)}>Next</button>
        </div>
      )}

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selected.subject || 'General enquiry'}</h2>
              <button className="modal-close-btn" onClick={() => setSelected(null)}><Icon name="close" size={22} /></button>
            </div>

            <dl className="detail-grid">
              <div><dt>Name</dt><dd>{selected.name}</dd></div>
              <div><dt>Status</dt><dd className={`badge badge-${selected.status}`}>{selected.status}</dd></div>
              <div><dt>Email</dt><dd>{selected.email}</dd></div>
              <div><dt>Phone</dt><dd>{selected.phone}</dd></div>
              <div className="detail-grid-full"><dt>Message</dt><dd>{selected.message}</dd></div>
            </dl>

            <div className="filter-bar">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  className={`btn btn-sm ${selected.status === s ? 'btn-primary' : 'btn-outline'}`}
                  disabled={updatingId === selected._id}
                  onClick={() => handleStatusChange(selected._id, s)}
                >
                  Mark {s}
                </button>
              ))}
              <a className="btn btn-outline btn-sm" href={`mailto:${selected.email}`}>
                <Icon name="mail" size={16} /> Reply by Email
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Messages;

import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Icon from '../components/Icon';
import PasswordField from '../components/PasswordField';

const DIVISIONS = ['nursery', 'primary', 'secondary', 'college'];

const emptyForm = { email: '', phone: '', password: '', role: 'staff', division: '', classesText: '' };

const toClassList = (text) => text.split(',').map((c) => c.trim()).filter(Boolean);

const Staff = () => {
  const { apiCall } = useAuth();
  const [staff, setStaff] = useState([]);
  const [pagination, setPagination] = useState({ current: 1, total: 1 });
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editError, setEditError] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [knownClasses, setKnownClasses] = useState([]);

  const fetchKnownClasses = async (division) => {
    if (!division) { setKnownClasses([]); return; }
    const { data } = await apiCall(`/admin/classes?division=${division}`);
    if (data.success) setKnownClasses(data.data);
  };

  const fetchStaff = async (page = 1) => {
    setIsLoading(true);
    const query = new URLSearchParams({ page, limit: 20, ...(search && { search }) });
    const { data } = await apiCall(`/admin/staff?${query}`);
    if (data.success) {
      setStaff(data.data.staff);
      setPagination(data.data.pagination);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchStaff(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchStaff(1);
  };

  const handleToggleStatus = async (userId, isActive) => {
    const { data } = await apiCall(`/admin/staff/${userId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: !isActive })
    });
    if (data.success) {
      setStaff((prev) => prev.map((s) => (s._id === userId ? data.data : s)));
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError('');

    const { classesText, ...rest } = form;
    const payload = {
      ...rest,
      email: form.email || undefined,
      phone: form.phone || undefined,
      division: form.division || undefined,
      classes: form.role === 'staff' ? toClassList(classesText) : undefined
    };
    const { data } = await apiCall('/auth/admin/register', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (data.success) {
      setShowForm(false);
      setForm(emptyForm);
      fetchStaff(1);
    } else {
      setFormError(data.message || data.errors?.[0]?.msg || 'Failed to create staff account');
    }
    setIsSubmitting(false);
  };

  const openEditForm = (member) => {
    setEditingStaff(member);
    setEditForm({
      email: member.email || '',
      phone: member.phone || '',
      role: member.role,
      division: member.division || '',
      classesText: (member.classes || []).join(', ')
    });
    setEditError('');
    fetchKnownClasses(member.division);
  };

  const handleUpdateStaff = async (e) => {
    e.preventDefault();
    setIsSavingEdit(true);
    setEditError('');

    const { classesText, ...rest } = editForm;
    const payload = {
      ...rest,
      email: editForm.email || undefined,
      phone: editForm.phone || undefined,
      division: editForm.division || undefined,
      classes: editForm.role === 'staff' ? toClassList(classesText) : undefined
    };

    const { data } = await apiCall(`/admin/staff/${editingStaff._id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });

    if (data.success) {
      setStaff((prev) => prev.map((s) => (s._id === editingStaff._id ? data.data : s)));
      setEditingStaff(null);
      setEditForm(null);
    } else {
      setEditError(data.message || data.errors?.[0]?.msg || 'Failed to update staff account');
    }
    setIsSavingEdit(false);
  };

  return (
    <div>
      <datalist id="known-classes">
        {knownClasses.map((c) => <option key={c} value={c} />)}
      </datalist>

      <div className="page-header">
        <div>
          <h1>Staff</h1>
          <p className="text-secondary">{pagination.totalRecords || 0} total staff/admin accounts</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          <Icon name="plus" size={16} /> Add Staff
        </button>
      </div>

      <form className="filter-bar" onSubmit={handleSearchSubmit}>
        <input type="text" placeholder="Search by email or phone..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <button type="submit" className="btn btn-outline btn-sm"><Icon name="search" size={16} /> Search</button>
      </form>

      {isLoading ? (
        <div className="empty-state"><Icon name="loader" size={24} className="spinning" /></div>
      ) : staff.length === 0 ? (
        <div className="empty-state">No staff accounts found.</div>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Phone</th>
                <th>Role</th>
                <th>Scope</th>
                <th>Status</th>
                <th>Last Login</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s._id}>
                  <td data-label="Email">{s.email || '—'}</td>
                  <td data-label="Phone">{s.phone || '—'}</td>
                  <td data-label="Role" style={{ textTransform: 'capitalize' }}>{s.role}</td>
                  <td data-label="Scope">
                    {s.role !== 'staff' || !s.division ? (
                      <span className="text-secondary text-sm">Unrestricted</span>
                    ) : (
                      <span className="text-sm" style={{ textTransform: 'capitalize' }}>
                        {s.division}{s.classes?.length ? ` — ${s.classes.join(', ')}` : ' (all classes)'}
                      </span>
                    )}
                  </td>
                  <td data-label="Status"><span className={`badge badge-${s.isActive ? 'approved' : 'rejected'}`}>{s.isActive ? 'Active' : 'Inactive'}</span></td>
                  <td data-label="Last Login">{s.lastLogin ? new Date(s.lastLogin).toLocaleDateString('en-GB') : 'Never'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                      <button className="btn btn-outline btn-sm" onClick={() => openEditForm(s)}>
                        <Icon name="edit" size={14} /> Edit
                      </button>
                      <button className="btn btn-outline btn-sm" onClick={() => handleToggleStatus(s._id, s.isActive)}>
                        {s.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination.total > 1 && (
        <div className="pagination-bar">
          <button className="btn btn-outline btn-sm" disabled={pagination.current <= 1} onClick={() => fetchStaff(pagination.current - 1)}>Previous</button>
          <span className="text-sm">Page {pagination.current} of {pagination.total}</span>
          <button className="btn btn-outline btn-sm" disabled={pagination.current >= pagination.total} onClick={() => fetchStaff(pagination.current + 1)}>Next</button>
        </div>
      )}

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Staff</h2>
              <button className="modal-close-btn" onClick={() => setShowForm(false)}><Icon name="close" size={22} /></button>
            </div>

            <form onSubmit={handleCreate}>
              {formError && (
                <div className="admin-error-message">
                  <Icon name="alertCircle" size={18} />
                  <span>{formError}</span>
                </div>
              )}

              <div className="form-group">
                <label>Role</label>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  <option value="staff">Staff</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Email (optional)</label>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Phone (optional)</label>
                  <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
              </div>
              <p className="text-secondary text-sm" style={{ marginTop: '-8px', marginBottom: 'var(--space-4)' }}>
                At least one of email or phone is required — credentials are sent by SMS if a phone is given.
              </p>

              <div className="form-group">
                <label>Password</label>
                <PasswordField
                  required
                  minLength={6}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>

              {form.role === 'staff' && (
                <>
                  <div className="form-group">
                    <label>Division (optional)</label>
                    <select
                      value={form.division}
                      onChange={(e) => { setForm({ ...form, division: e.target.value, classesText: e.target.value ? form.classesText : '' }); fetchKnownClasses(e.target.value); }}
                    >
                      <option value="">None — unrestricted access</option>
                      {DIVISIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  {form.division && (
                    <div className="form-group">
                      <label>Classes (optional)</label>
                      <input
                        type="text"
                        list="known-classes"
                        placeholder="e.g. Primary 3, Primary 4"
                        value={form.classesText}
                        onChange={(e) => setForm({ ...form, classesText: e.target.value })}
                      />
                      <p className="text-secondary text-sm" style={{ marginTop: 'var(--space-2)' }}>
                        {knownClasses.length > 0
                          ? `Comma-separated. Must match a student's class exactly — currently in use: ${knownClasses.join(', ')}.`
                          : `Comma-separated. No students are in the ${form.division} division yet, so there's nothing to match against — double check the spelling once students exist.`}
                        {' '}Leave blank to give access to all classes in the {form.division} division.
                      </p>
                    </div>
                  )}
                </>
              )}

              <button type="submit" className="btn btn-primary btn-full" disabled={isSubmitting}>
                {isSubmitting ? <Icon name="loader" size={18} className="spinning" /> : 'Create Staff Account'}
              </button>
            </form>
          </div>
        </div>
      )}

      {editingStaff && editForm && (
        <div className="modal-backdrop" onClick={() => setEditingStaff(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Staff</h2>
              <button className="modal-close-btn" onClick={() => setEditingStaff(null)}><Icon name="close" size={22} /></button>
            </div>

            <form onSubmit={handleUpdateStaff}>
              {editError && (
                <div className="admin-error-message">
                  <Icon name="alertCircle" size={18} />
                  <span>{editError}</span>
                </div>
              )}

              <div className="form-group">
                <label>Role</label>
                <select value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}>
                  <option value="staff">Staff</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Email (optional)</label>
                  <input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Phone (optional)</label>
                  <input type="text" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
                </div>
              </div>
              <p className="text-secondary text-sm" style={{ marginTop: '-8px', marginBottom: 'var(--space-4)' }}>
                At least one of email or phone is required.
              </p>

              {editForm.role === 'staff' && (
                <>
                  <div className="form-group">
                    <label>Division (optional)</label>
                    <select
                      value={editForm.division}
                      onChange={(e) => { setEditForm({ ...editForm, division: e.target.value, classesText: e.target.value ? editForm.classesText : '' }); fetchKnownClasses(e.target.value); }}
                    >
                      <option value="">None — unrestricted access</option>
                      {DIVISIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  {editForm.division && (
                    <div className="form-group">
                      <label>Classes (optional)</label>
                      <input
                        type="text"
                        list="known-classes"
                        placeholder="e.g. Primary 3, Primary 4"
                        value={editForm.classesText}
                        onChange={(e) => setEditForm({ ...editForm, classesText: e.target.value })}
                      />
                      <p className="text-secondary text-sm" style={{ marginTop: 'var(--space-2)' }}>
                        {knownClasses.length > 0
                          ? `Comma-separated. Must match a student's class exactly — currently in use: ${knownClasses.join(', ')}.`
                          : `Comma-separated. No students are in the ${editForm.division} division yet, so there's nothing to match against — double check the spelling once students exist.`}
                        {' '}Leave blank to give access to all classes in the {editForm.division} division.
                      </p>
                    </div>
                  )}
                </>
              )}

              <button type="submit" className="btn btn-primary btn-full" disabled={isSavingEdit}>
                {isSavingEdit ? <Icon name="loader" size={18} className="spinning" /> : 'Save Changes'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Staff;

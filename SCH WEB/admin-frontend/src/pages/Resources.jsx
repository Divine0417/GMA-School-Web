import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useDialog } from '../contexts/DialogContext';
import Icon from '../components/Icon';
import { API_BASE_URL } from '../config/api';

const TYPES = ['document', 'video', 'link'];
const DIVISIONS = ['nursery', 'primary', 'secondary', 'college', 'all'];
const TYPE_ICON = { document: 'fileText', video: 'video', link: 'externalLink' };

const emptyForm = {
  title: '',
  description: '',
  subject: '',
  type: 'document',
  externalUrl: '',
  divisions: ['all'],
  classesText: '',
  file: null
};

const Resources = () => {
  const { apiCall, token } = useAuth();
  const { confirmDialog } = useDialog();
  const [resources, setResources] = useState([]);
  const [pagination, setPagination] = useState({ current: 1, total: 1 });
  const [publishedFilter, setPublishedFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [knownClasses, setKnownClasses] = useState([]);

  const fetchKnownClasses = async (divisions) => {
    const specific = divisions.filter((d) => d !== 'all');
    if (specific.length === 0) { setKnownClasses([]); return; }
    const results = await Promise.all(specific.map((d) => apiCall(`/admin/classes?division=${d}`)));
    const merged = [...new Set(results.flatMap((r) => r.data.data || []))];
    setKnownClasses(merged);
  };

  const fetchResources = async (page = 1) => {
    setIsLoading(true);
    const query = new URLSearchParams({
      page,
      limit: 20,
      ...(publishedFilter && { isPublished: publishedFilter }),
      ...(typeFilter && { type: typeFilter })
    });
    const { data } = await apiCall(`/admin/resources?${query}`);
    if (data.success) {
      setResources(data.data.resources);
      setPagination(data.data.pagination);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchResources(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publishedFilter, typeFilter]);

  const togglePublish = async (resourceId, isPublished) => {
    const { data } = await apiCall(`/admin/resources/${resourceId}/publish`, {
      method: 'PATCH',
      body: JSON.stringify({ isPublished: !isPublished })
    });
    if (data.success) {
      setResources((prev) => prev.map((r) => (r._id === resourceId ? data.data : r)));
    }
  };

  const deleteResource = async (resourceId) => {
    if (!(await confirmDialog('Delete this resource? This cannot be undone.', { confirmLabel: 'Delete' }))) return;
    const { data } = await apiCall(`/admin/resources/${resourceId}`, { method: 'DELETE' });
    if (data.success) {
      setResources((prev) => prev.filter((r) => r._id !== resourceId));
    }
  };

  // "All" and specific divisions are mutually exclusive, same reasoning as
  // the Notices target-audience picker: the backend treats "all" as a
  // wildcard, so leaving it selected alongside specific divisions would
  // silently broadcast to every division regardless of the other choices.
  const toggleDivision = (value) => {
    setForm((prev) => {
      const current = prev.divisions;
      let next;

      if (value === 'all') {
        next = current.includes('all') ? [] : ['all'];
      } else if (current.includes(value)) {
        next = current.filter((v) => v !== value);
      } else {
        next = [...current.filter((v) => v !== 'all'), value];
      }

      fetchKnownClasses(next);
      return { ...prev, divisions: next };
    });
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError('');

    const classes = form.classesText.split(',').map((c) => c.trim()).filter(Boolean);

    const formData = new FormData();
    formData.append('title', form.title);
    formData.append('type', form.type);
    if (form.description) formData.append('description', form.description);
    if (form.subject) formData.append('subject', form.subject);
    formData.append('divisions', JSON.stringify(form.divisions));
    formData.append('classes', JSON.stringify(classes));
    if (form.type === 'document') {
      if (form.file) formData.append('file', form.file);
    } else {
      formData.append('externalUrl', form.externalUrl);
    }

    try {
      const response = await fetch(`${API_BASE_URL}/admin/resources`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      const data = await response.json();

      if (data.success) {
        setShowForm(false);
        setForm(emptyForm);
        fetchResources(1);
      } else {
        setFormError(data.message || data.errors?.[0]?.msg || 'Failed to create resource');
      }
    } catch (err) {
      setFormError('Network error. Please try again.');
    }
    setIsSubmitting(false);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Learning Resources</h1>
          <p className="text-secondary">{pagination.totalRecords || 0} total resources</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          <Icon name="plus" size={16} /> New Resource
        </button>
      </div>

      <div className="filter-bar">
        <select value={publishedFilter} onChange={(e) => setPublishedFilter(e.target.value)}>
          <option value="">All resources</option>
          <option value="true">Published</option>
          <option value="false">Drafts</option>
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">All types</option>
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="empty-state"><Icon name="loader" size={24} className="spinning" /></div>
      ) : resources.length === 0 ? (
        <div className="empty-state">No resources found.</div>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Subject</th>
                <th>Divisions</th>
                <th>Last Modified</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {resources.map((r) => (
                <tr key={r._id}>
                  <td><Icon name={TYPE_ICON[r.type]} size={14} className="text-secondary" /> {r.title}</td>
                  <td style={{ textTransform: 'capitalize' }}>{r.type}</td>
                  <td>{r.subject || '—'}</td>
                  <td style={{ textTransform: 'capitalize' }}>{(r.divisions || []).join(', ') || '—'}</td>
                  <td className="text-secondary text-sm">{r.lastModifiedBy ? (r.lastModifiedBy.email || r.lastModifiedBy.phone) : '—'}</td>
                  <td><span className={`badge badge-${r.isPublished ? 'approved' : 'pending'}`}>{r.isPublished ? 'Published' : 'Draft'}</span></td>
                  <td style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    <button className="btn btn-outline btn-sm" onClick={() => togglePublish(r._id, r.isPublished)}>
                      {r.isPublished ? 'Unpublish' : 'Publish'}
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => deleteResource(r._id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination.total > 1 && (
        <div className="pagination-bar">
          <button className="btn btn-outline btn-sm" disabled={pagination.current <= 1} onClick={() => fetchResources(pagination.current - 1)}>Previous</button>
          <span className="text-sm">Page {pagination.current} of {pagination.total}</span>
          <button className="btn btn-outline btn-sm" disabled={pagination.current >= pagination.total} onClick={() => fetchResources(pagination.current + 1)}>Next</button>
        </div>
      )}

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>New Resource</h2>
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
                <label>Title</label>
                <input type="text" required minLength={3} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>

              <div className="form-group">
                <label>Description (optional)</label>
                <textarea rows={3} maxLength={2000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Subject (optional)</label>
                  <input type="text" placeholder="e.g. Mathematics" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Type</label>
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value, file: null, externalUrl: '' })}>
                    {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              {form.type === 'document' ? (
                <div className="form-group">
                  <label>File (PDF, Word, PowerPoint, JPG, PNG, or WEBP)</label>
                  <input
                    type="file"
                    required
                    accept=".pdf,.doc,.docx,.ppt,.pptx,image/jpeg,image/png,image/webp"
                    onChange={(e) => setForm({ ...form, file: e.target.files?.[0] || null })}
                  />
                </div>
              ) : (
                <div className="form-group">
                  <label>{form.type === 'video' ? 'Video URL (e.g. YouTube link)' : 'External URL'}</label>
                  <input
                    type="url"
                    required
                    placeholder="https://..."
                    value={form.externalUrl}
                    onChange={(e) => setForm({ ...form, externalUrl: e.target.value })}
                  />
                </div>
              )}

              <div className="form-group">
                <label>Visible to (divisions)</label>
                <div className="filter-bar" style={{ marginBottom: 0 }}>
                  {DIVISIONS.map((d) => (
                    <button
                      type="button"
                      key={d}
                      className={`btn btn-sm ${form.divisions.includes(d) ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => toggleDivision(d)}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>Visible to (specific classes, optional — comma-separated, leave blank for all classes in the selected division(s))</label>
                <input
                  type="text"
                  list="known-resource-classes"
                  placeholder="e.g. Primary 3, Primary 4"
                  value={form.classesText}
                  onChange={(e) => setForm({ ...form, classesText: e.target.value })}
                />
                {knownClasses.length > 0 && (
                  <p className="text-secondary text-sm" style={{ marginTop: 'var(--space-1)' }}>
                    Must match a student's class exactly — currently in use: {knownClasses.join(', ')}.
                  </p>
                )}
                <datalist id="known-resource-classes">
                  {knownClasses.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>

              <button type="submit" className="btn btn-primary btn-full" disabled={isSubmitting}>
                {isSubmitting ? <Icon name="loader" size={18} className="spinning" /> : 'Create Resource'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Resources;

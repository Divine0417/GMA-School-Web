import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useDialog } from '../contexts/DialogContext';
import Icon from '../components/Icon';
import { API_BASE_URL } from '../config/api';

const DIVISIONS = ['nursery', 'primary', 'secondary', 'college'];

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const emptyForm = {
  fullName: '',
  division: '',
  class: '',
  session: '2024/2025',
  dateOfBirth: '',
  gender: '',
  parentInfo: { name: '', email: '', phone: '', relationship: 'father', address: '' },
  emergencyContact: { name: '', phone: '', relationship: '' },
  medicalInfo: { bloodGroup: '', allergiesText: '', medicationsText: '', specialNeeds: '' },
  academicInfo: { previousSchool: '', subjectsText: '', house: '' },
  createParentAccount: true
};

const toList = (text) => text.split(',').map((v) => v.trim()).filter(Boolean);

const buildMedicalInfo = (m) => ({
  bloodGroup: m.bloodGroup || undefined,
  allergies: toList(m.allergiesText || ''),
  medications: toList(m.medicationsText || ''),
  specialNeeds: m.specialNeeds || undefined
});

const buildAcademicInfo = (a) => ({
  previousSchool: a.previousSchool || undefined,
  subjects: toList(a.subjectsText || ''),
  house: a.house || undefined
});

const Students = () => {
  const { apiCall, token } = useAuth();
  const { confirmDialog, alertDialog } = useDialog();
  const [students, setStudents] = useState([]);
  const [pagination, setPagination] = useState({ current: 1, total: 1 });
  const [search, setSearch] = useState('');
  const [divisionFilter, setDivisionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdStudent, setCreatedStudent] = useState(null);
  const [editingStudent, setEditingStudent] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editError, setEditError] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const fetchStudents = async (page = 1) => {
    setIsLoading(true);
    const query = new URLSearchParams({
      page, limit: 20,
      ...(divisionFilter && { division: divisionFilter }),
      ...(statusFilter && { status: statusFilter }),
      ...(search && { search })
    });
    const { data } = await apiCall(`/admin/students?${query}`);
    if (data.success) {
      setStudents(data.data.students);
      setPagination(data.data.pagination);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchStudents(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [divisionFilter, statusFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchStudents(1);
  };

  const updateField = (path, value) => {
    setForm((prev) => {
      const next = { ...prev };
      if (path.includes('.')) {
        const [parent, child] = path.split('.');
        next[parent] = { ...next[parent], [child]: value };
      } else {
        next[path] = value;
      }
      return next;
    });
  };

  const handleCreateStudent = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError('');

    const payload = {
      ...form,
      medicalInfo: buildMedicalInfo(form.medicalInfo),
      academicInfo: buildAcademicInfo(form.academicInfo)
    };

    const { data } = await apiCall('/admin/students', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (data.success) {
      setShowForm(false);
      setForm(emptyForm);
      setCreatedStudent(data.data);
      fetchStudents(1);
    } else {
      setFormError(data.message || data.errors?.[0]?.msg || 'Failed to create student');
    }
    setIsSubmitting(false);
  };

  const openEditForm = (student) => {
    setEditingStudent(student);
    setEditForm({
      fullName: student.fullName,
      division: student.division,
      class: student.class,
      session: student.session,
      dateOfBirth: student.dateOfBirth?.slice(0, 10) || '',
      gender: student.gender,
      parentInfo: {
        name: student.parentInfo?.name || '',
        email: student.parentInfo?.email || '',
        phone: student.parentInfo?.phone || '',
        relationship: student.parentInfo?.relationship || 'father',
        address: student.parentInfo?.address || ''
      },
      emergencyContact: {
        name: student.emergencyContact?.name || '',
        phone: student.emergencyContact?.phone || '',
        relationship: student.emergencyContact?.relationship || ''
      },
      medicalInfo: {
        bloodGroup: student.medicalInfo?.bloodGroup || '',
        allergiesText: (student.medicalInfo?.allergies || []).join(', '),
        medicationsText: (student.medicalInfo?.medications || []).join(', '),
        specialNeeds: student.medicalInfo?.specialNeeds || ''
      },
      academicInfo: {
        previousSchool: student.academicInfo?.previousSchool || '',
        subjectsText: (student.academicInfo?.subjects || []).join(', '),
        house: student.academicInfo?.house || ''
      },
      notes: student.notes || []
    });
    setNewNote('');
    setEditError('');
  };

  const updateEditField = (path, value) => {
    setEditForm((prev) => {
      const next = { ...prev };
      if (path.includes('.')) {
        const [parent, child] = path.split('.');
        next[parent] = { ...next[parent], [child]: value };
      } else {
        next[path] = value;
      }
      return next;
    });
  };

  const handleUpdateStudent = async (e) => {
    e.preventDefault();
    setIsSavingEdit(true);
    setEditError('');

    const payload = {
      ...editForm,
      medicalInfo: buildMedicalInfo(editForm.medicalInfo),
      // $set replaces the whole academicInfo subdocument, so the existing
      // (required) admissionDate must be carried forward explicitly or it's
      // wiped and the update fails validation.
      academicInfo: { ...buildAcademicInfo(editForm.academicInfo), admissionDate: editingStudent.academicInfo?.admissionDate }
    };

    const { data } = await apiCall(`/admin/students/${editingStudent._id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });

    if (data.success) {
      setStudents((prev) => prev.map((s) => (s._id === editingStudent._id ? data.data : s)));
      setEditingStudent(data.data);
      setEditError('');
    } else {
      setEditError(data.message || data.errors?.[0]?.msg || 'Failed to update student');
    }
    setIsSavingEdit(false);
  };

  const handleAddNote = () => {
    if (!newNote.trim()) return;
    setEditForm((prev) => ({ ...prev, notes: [...(prev.notes || []), newNote.trim()] }));
    setNewNote('');
  };

  const handleRemoveNote = (index) => {
    setEditForm((prev) => ({ ...prev, notes: prev.notes.filter((_, i) => i !== index) }));
  };

  const handlePhotoUpload = async (file) => {
    if (!file) return;
    setIsUploadingPhoto(true);
    const formData = new FormData();
    formData.append('photo', file);

    try {
      const response = await fetch(`${API_BASE_URL}/admin/students/${editingStudent._id}/photo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      const data = await response.json();

      if (data.success) {
        setStudents((prev) => prev.map((s) => (s._id === editingStudent._id ? data.data : s)));
        setEditingStudent(data.data);
      } else {
        await alertDialog(data.message || 'Failed to upload photo', { title: 'Error' });
      }
    } catch (err) {
      await alertDialog('Network error while uploading photo. Please try again.', { title: 'Error' });
    }
    setIsUploadingPhoto(false);
  };

  const handleGraduate = async (student) => {
    const confirmed = await confirmDialog(
      `Mark ${student.fullName} (${student.regNumber}) as graduated? They'll be removed from the active roster but their record and portal login are kept.`,
      { title: 'Graduate Student', confirmLabel: 'Graduate', danger: false }
    );
    if (!confirmed) return;

    const { data } = await apiCall(`/admin/students/${student._id}/graduate`, { method: 'PATCH' });
    if (data.success) {
      setStudents((prev) => (statusFilter === 'active' ? prev.filter((s) => s._id !== student._id) : prev.map((s) => (s._id === student._id ? data.data : s))));
    } else {
      await alertDialog(data.message || 'Failed to graduate student', { title: 'Error' });
    }
  };

  const handleReactivate = async (student) => {
    const confirmed = await confirmDialog(
      `Move ${student.fullName} (${student.regNumber}) back to the active roster?`,
      { title: 'Reactivate Student', confirmLabel: 'Reactivate', danger: false }
    );
    if (!confirmed) return;

    const { data } = await apiCall(`/admin/students/${student._id}/reactivate`, { method: 'PATCH' });
    if (data.success) {
      setStudents((prev) => (statusFilter === 'graduated' ? prev.filter((s) => s._id !== student._id) : prev.map((s) => (s._id === student._id ? data.data : s))));
    } else {
      await alertDialog(data.message || 'Failed to reactivate student', { title: 'Error' });
    }
  };

  const handleDelete = async (student) => {
    const confirmed = await confirmDialog(
      `Delete ${student.fullName} (${student.regNumber})? This removes them from the roster and locks their portal login. This cannot be undone from here.`,
      { title: 'Delete Student', confirmLabel: 'Delete', danger: true }
    );
    if (!confirmed) return;

    const { data } = await apiCall(`/admin/students/${student._id}`, { method: 'DELETE' });
    if (data.success) {
      setStudents((prev) => prev.filter((s) => s._id !== student._id));
    } else {
      await alertDialog(data.message || 'Failed to delete student', { title: 'Error' });
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Students</h1>
          <p className="text-secondary">{pagination.totalRecords || 0} total students</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          <Icon name="plus" size={16} /> Add Student
        </button>
      </div>

      <form className="filter-bar" onSubmit={handleSearchSubmit}>
        <input type="text" placeholder="Search by name..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={divisionFilter} onChange={(e) => setDivisionFilter(e.target.value)}>
          <option value="">All divisions</option>
          {DIVISIONS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="active">Active students</option>
          <option value="graduated">Graduated students</option>
          <option value="">All statuses</option>
        </select>
        <button type="submit" className="btn btn-outline btn-sm"><Icon name="search" size={16} /> Search</button>
      </form>

      {isLoading ? (
        <div className="empty-state"><Icon name="loader" size={24} className="spinning" /></div>
      ) : students.length === 0 ? (
        <div className="empty-state">No students found.</div>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Reg Number</th>
                <th>Name</th>
                <th>Division / Class</th>
                <th>Parent Contact</th>
                <th>Portal Account</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s._id}>
                  <td data-label="Reg Number">{s.regNumber}</td>
                  <td data-label="Name">{s.fullName}</td>
                  <td data-label="Division / Class">{s.division} / {s.class}</td>
                  <td data-label="Parent Contact">{s.parentInfo.name}<br /><span className="text-secondary text-sm">{s.parentInfo.phone}</span></td>
                  <td data-label="Portal Account"><span className={`badge badge-${s.userId?.isActive ? 'approved' : 'rejected'}`}>{s.userId?.isActive ? 'Active' : 'Inactive'}</span></td>
                  <td data-label="Status"><span className={`badge badge-${s.status === 'graduated' ? 'pending' : 'approved'}`}>{s.status === 'graduated' ? 'Graduated' : 'Active'}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                      <button className="btn btn-outline btn-sm" onClick={() => openEditForm(s)}>
                        <Icon name="edit" size={14} /> Edit
                      </button>
                      {s.status === 'graduated' ? (
                        <button className="btn btn-outline btn-sm" onClick={() => handleReactivate(s)}>
                          <Icon name="graduationCap" size={14} /> Reactivate
                        </button>
                      ) : (
                        <button className="btn btn-outline btn-sm" onClick={() => handleGraduate(s)}>
                          <Icon name="graduationCap" size={14} /> Graduate
                        </button>
                      )}
                      <button className="btn btn-outline btn-sm btn-danger" onClick={() => handleDelete(s)}>
                        <Icon name="trash" size={14} /> Delete
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
          <button className="btn btn-outline btn-sm" disabled={pagination.current <= 1} onClick={() => fetchStudents(pagination.current - 1)}>Previous</button>
          <span className="text-sm">Page {pagination.current} of {pagination.total}</span>
          <button className="btn btn-outline btn-sm" disabled={pagination.current >= pagination.total} onClick={() => fetchStudents(pagination.current + 1)}>Next</button>
        </div>
      )}

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Student</h2>
              <button className="modal-close-btn" onClick={() => setShowForm(false)}><Icon name="close" size={22} /></button>
            </div>

            <form onSubmit={handleCreateStudent}>
              {formError && (
                <div className="admin-error-message">
                  <Icon name="alertCircle" size={18} />
                  <span>{formError}</span>
                </div>
              )}

              <div className="form-group">
                <label>Full Name</label>
                <input type="text" required value={form.fullName} onChange={(e) => updateField('fullName', e.target.value)} />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Division</label>
                  <select required value={form.division} onChange={(e) => updateField('division', e.target.value)}>
                    <option value="">Select division</option>
                    {DIVISIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Class</label>
                  <input type="text" required value={form.class} onChange={(e) => updateField('class', e.target.value)} />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Date of Birth</label>
                  <input type="date" required value={form.dateOfBirth} onChange={(e) => updateField('dateOfBirth', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Gender</label>
                  <select required value={form.gender} onChange={(e) => updateField('gender', e.target.value)}>
                    <option value="">Select gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
              </div>

              <p className="text-secondary text-sm" style={{ marginBottom: 'var(--space-4)' }}>
                The student logs in with their registration number (generated automatically) and a
                password we'll generate — both sent to the parent's contact info below.
              </p>

              <h4 style={{ marginBottom: 'var(--space-3)' }}>Parent / Guardian</h4>
              <div className="form-row">
                <div className="form-group">
                  <label>Name</label>
                  <input type="text" required value={form.parentInfo.name} onChange={(e) => updateField('parentInfo.name', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Relationship</label>
                  <select value={form.parentInfo.relationship} onChange={(e) => updateField('parentInfo.relationship', e.target.value)}>
                    <option value="father">Father</option>
                    <option value="mother">Mother</option>
                    <option value="guardian">Guardian</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Phone</label>
                  <input type="text" required value={form.parentInfo.phone} onChange={(e) => updateField('parentInfo.phone', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Email (optional)</label>
                  <input type="email" value={form.parentInfo.email} onChange={(e) => updateField('parentInfo.email', e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label>Address</label>
                <input type="text" required value={form.parentInfo.address} onChange={(e) => updateField('parentInfo.address', e.target.value)} />
              </div>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontWeight: 400 }}>
                  <input
                    type="checkbox"
                    style={{ width: 'auto' }}
                    checked={form.createParentAccount}
                    onChange={(e) => updateField('createParentAccount', e.target.checked)}
                  />
                  Also create a parent portal account (reuses an existing one for siblings)
                </label>
              </div>

              <h4 style={{ marginBottom: 'var(--space-3)' }}>Emergency Contact</h4>
              <div className="form-row">
                <div className="form-group">
                  <label>Name</label>
                  <input type="text" required value={form.emergencyContact.name} onChange={(e) => updateField('emergencyContact.name', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Phone</label>
                  <input type="text" required value={form.emergencyContact.phone} onChange={(e) => updateField('emergencyContact.phone', e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label>Relationship</label>
                <input type="text" required value={form.emergencyContact.relationship} onChange={(e) => updateField('emergencyContact.relationship', e.target.value)} />
              </div>

              <h4 style={{ marginBottom: 'var(--space-3)' }}>Medical Info (optional)</h4>
              <div className="form-row">
                <div className="form-group">
                  <label>Blood Group</label>
                  <select value={form.medicalInfo.bloodGroup} onChange={(e) => updateField('medicalInfo.bloodGroup', e.target.value)}>
                    <option value="">Unknown</option>
                    {BLOOD_GROUPS.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Special Needs</label>
                  <input type="text" value={form.medicalInfo.specialNeeds} onChange={(e) => updateField('medicalInfo.specialNeeds', e.target.value)} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Allergies (comma-separated)</label>
                  <input type="text" value={form.medicalInfo.allergiesText} onChange={(e) => updateField('medicalInfo.allergiesText', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Medications (comma-separated)</label>
                  <input type="text" value={form.medicalInfo.medicationsText} onChange={(e) => updateField('medicalInfo.medicationsText', e.target.value)} />
                </div>
              </div>

              <h4 style={{ marginBottom: 'var(--space-3)' }}>Academic Info (optional)</h4>
              <div className="form-row">
                <div className="form-group">
                  <label>Previous School</label>
                  <input type="text" value={form.academicInfo.previousSchool} onChange={(e) => updateField('academicInfo.previousSchool', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>House</label>
                  <input type="text" value={form.academicInfo.house} onChange={(e) => updateField('academicInfo.house', e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label>Subjects (comma-separated)</label>
                <input type="text" value={form.academicInfo.subjectsText} onChange={(e) => updateField('academicInfo.subjectsText', e.target.value)} />
              </div>

              <button type="submit" className="btn btn-primary btn-full" disabled={isSubmitting}>
                {isSubmitting ? <Icon name="loader" size={18} className="spinning" /> : 'Create Student'}
              </button>
            </form>
          </div>
        </div>
      )}

      {createdStudent && (
        <div className="modal-backdrop" onClick={() => setCreatedStudent(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Student Created</h2>
              <button className="modal-close-btn" onClick={() => setCreatedStudent(null)}><Icon name="close" size={22} /></button>
            </div>
            <p style={{ marginBottom: 'var(--space-4)' }}>
              <strong>{createdStudent.fullName}</strong> has been added. Their login registration number is:
            </p>
            <p className="stat-card-value" style={{ marginBottom: 'var(--space-4)' }}>{createdStudent.regNumber}</p>
            <p className="text-secondary text-sm">
              This registration number and a generated password have been sent to the parent's phone/email on file.
            </p>
          </div>
        </div>
      )}

      {editingStudent && editForm && (
        <div className="modal-backdrop" onClick={() => setEditingStudent(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Student</h2>
              <button className="modal-close-btn" onClick={() => setEditingStudent(null)}><Icon name="close" size={22} /></button>
            </div>
            <p className="text-secondary text-sm" style={{ marginBottom: 'var(--space-4)' }}>
              Registration number: <strong>{editingStudent.regNumber}</strong> (can't be changed)
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
              {editingStudent.photoUrl ? (
                <img src={editingStudent.photoUrl} alt={editingStudent.fullName} style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--color-bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="users" size={24} className="text-secondary" />
                </div>
              )}
              <div>
                <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer' }}>
                  {isUploadingPhoto ? <Icon name="loader" size={14} className="spinning" /> : 'Upload Photo'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    style={{ display: 'none' }}
                    disabled={isUploadingPhoto}
                    onChange={(e) => handlePhotoUpload(e.target.files?.[0])}
                  />
                </label>
              </div>
            </div>

            <form onSubmit={handleUpdateStudent}>
              {editError && (
                <div className="admin-error-message">
                  <Icon name="alertCircle" size={18} />
                  <span>{editError}</span>
                </div>
              )}

              <div className="form-group">
                <label>Full Name</label>
                <input type="text" required value={editForm.fullName} onChange={(e) => updateEditField('fullName', e.target.value)} />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Division</label>
                  <select required value={editForm.division} onChange={(e) => updateEditField('division', e.target.value)}>
                    {DIVISIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Class</label>
                  <input type="text" required value={editForm.class} onChange={(e) => updateEditField('class', e.target.value)} />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Session</label>
                  <input type="text" required value={editForm.session} onChange={(e) => updateEditField('session', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Date of Birth</label>
                  <input type="date" required value={editForm.dateOfBirth} onChange={(e) => updateEditField('dateOfBirth', e.target.value)} />
                </div>
              </div>

              <div className="form-group">
                <label>Gender</label>
                <select required value={editForm.gender} onChange={(e) => updateEditField('gender', e.target.value)}>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>

              <h4 style={{ marginBottom: 'var(--space-3)' }}>Parent / Guardian</h4>
              <div className="form-row">
                <div className="form-group">
                  <label>Name</label>
                  <input type="text" required value={editForm.parentInfo.name} onChange={(e) => updateEditField('parentInfo.name', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Relationship</label>
                  <select value={editForm.parentInfo.relationship} onChange={(e) => updateEditField('parentInfo.relationship', e.target.value)}>
                    <option value="father">Father</option>
                    <option value="mother">Mother</option>
                    <option value="guardian">Guardian</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Phone</label>
                  <input type="text" required value={editForm.parentInfo.phone} onChange={(e) => updateEditField('parentInfo.phone', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Email (optional)</label>
                  <input type="email" value={editForm.parentInfo.email} onChange={(e) => updateEditField('parentInfo.email', e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label>Address</label>
                <input type="text" required value={editForm.parentInfo.address} onChange={(e) => updateEditField('parentInfo.address', e.target.value)} />
              </div>

              <h4 style={{ marginBottom: 'var(--space-3)' }}>Emergency Contact</h4>
              <div className="form-row">
                <div className="form-group">
                  <label>Name</label>
                  <input type="text" required value={editForm.emergencyContact.name} onChange={(e) => updateEditField('emergencyContact.name', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Phone</label>
                  <input type="text" required value={editForm.emergencyContact.phone} onChange={(e) => updateEditField('emergencyContact.phone', e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label>Relationship</label>
                <input type="text" required value={editForm.emergencyContact.relationship} onChange={(e) => updateEditField('emergencyContact.relationship', e.target.value)} />
              </div>

              <h4 style={{ marginBottom: 'var(--space-3)' }}>Medical Info (optional)</h4>
              <div className="form-row">
                <div className="form-group">
                  <label>Blood Group</label>
                  <select value={editForm.medicalInfo.bloodGroup} onChange={(e) => updateEditField('medicalInfo.bloodGroup', e.target.value)}>
                    <option value="">Unknown</option>
                    {BLOOD_GROUPS.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Special Needs</label>
                  <input type="text" value={editForm.medicalInfo.specialNeeds} onChange={(e) => updateEditField('medicalInfo.specialNeeds', e.target.value)} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Allergies (comma-separated)</label>
                  <input type="text" value={editForm.medicalInfo.allergiesText} onChange={(e) => updateEditField('medicalInfo.allergiesText', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Medications (comma-separated)</label>
                  <input type="text" value={editForm.medicalInfo.medicationsText} onChange={(e) => updateEditField('medicalInfo.medicationsText', e.target.value)} />
                </div>
              </div>

              <h4 style={{ marginBottom: 'var(--space-3)' }}>Academic Info (optional)</h4>
              <div className="form-row">
                <div className="form-group">
                  <label>Previous School</label>
                  <input type="text" value={editForm.academicInfo.previousSchool} onChange={(e) => updateEditField('academicInfo.previousSchool', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>House</label>
                  <input type="text" value={editForm.academicInfo.house} onChange={(e) => updateEditField('academicInfo.house', e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label>Subjects (comma-separated)</label>
                <input type="text" value={editForm.academicInfo.subjectsText} onChange={(e) => updateEditField('academicInfo.subjectsText', e.target.value)} />
              </div>

              <h4 style={{ marginBottom: 'var(--space-3)' }}>Admin Notes</h4>
              {editForm.notes.length > 0 && (
                <ul style={{ marginBottom: 'var(--space-3)', paddingLeft: 'var(--space-5)' }}>
                  {editForm.notes.map((note, i) => (
                    <li key={i} style={{ marginBottom: 'var(--space-2)' }}>
                      {note}{' '}
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => handleRemoveNote(i)}>
                        <Icon name="close" size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="form-row">
                <input type="text" placeholder="Add a note..." value={newNote} onChange={(e) => setNewNote(e.target.value)} />
                <button type="button" className="btn btn-outline btn-sm" onClick={handleAddNote}>Add</button>
              </div>

              <button type="submit" className="btn btn-primary btn-full" style={{ marginTop: 'var(--space-4)' }} disabled={isSavingEdit}>
                {isSavingEdit ? <Icon name="loader" size={18} className="spinning" /> : 'Save Changes'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Students;

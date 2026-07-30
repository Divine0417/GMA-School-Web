import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useDialog } from '../contexts/DialogContext';
import { API_BASE_URL } from '../config/api';
import Icon from '../components/Icon';
import SchoolCrest from '../components/SchoolCrest';

const TERMS = ['first', 'second', 'third'];

const emptySubject = { name: '', ca1: '', ca2: '', exam: '' };

const emptyManualForm = {
  term: 'first',
  session: '2024/2025',
  subjects: [{ ...emptySubject }],
  attendance: { daysPresent: '', daysAbsent: '', totalDays: '' },
  position: '',
  numberInClass: '',
  classTeacherComment: '',
  principalComment: '',
  nextTermBeginsDate: ''
};

const formatDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '');

const ReportCards = () => {
  const { apiCall, token } = useAuth();
  const { confirmDialog } = useDialog();
  const [reportCards, setReportCards] = useState([]);
  const [pagination, setPagination] = useState({ current: 1, total: 1 });
  const [isLoading, setIsLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [entryMode, setEntryMode] = useState('manual'); // 'manual' | 'upload'
  const [editingId, setEditingId] = useState(null);

  const [studentSearch, setStudentSearch] = useState('');
  const [studentResults, setStudentResults] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);

  const [manualForm, setManualForm] = useState(emptyManualForm);
  const [uploadTerm, setUploadTerm] = useState('first');
  const [uploadSession, setUploadSession] = useState('2024/2025');
  const [file, setFile] = useState(null);

  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewingReportCard, setViewingReportCard] = useState(null);

  const fetchReportCards = async (page = 1) => {
    setIsLoading(true);
    const { data } = await apiCall(`/admin/report-cards?page=${page}&limit=20`);
    if (data.success) {
      setReportCards(data.data.reportCards);
      setPagination(data.data.pagination);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchReportCards(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const searchStudents = async (value) => {
    setStudentSearch(value);
    setSelectedStudent(null);
    if (value.trim().length < 2) {
      setStudentResults([]);
      return;
    }
    const { data } = await apiCall(`/admin/students?search=${encodeURIComponent(value)}&limit=8`);
    if (data.success) setStudentResults(data.data.students);
  };

  const handleDelete = async (reportCardId) => {
    if (!(await confirmDialog('Delete this report card? This cannot be undone.', { confirmLabel: 'Delete' }))) return;
    const { data } = await apiCall(`/admin/report-cards/${reportCardId}`, { method: 'DELETE' });
    if (data.success) {
      setReportCards((prev) => prev.filter((rc) => rc._id !== reportCardId));
    }
  };

  const handleTogglePublish = async (reportCard) => {
    const { data } = await apiCall(`/admin/report-cards/${reportCard._id}/publish`, {
      method: 'PATCH',
      body: JSON.stringify({ isPublished: !reportCard.isPublished })
    });
    if (data.success) {
      setReportCards((prev) => prev.map((rc) => (rc._id === reportCard._id ? data.data : rc)));
    }
  };

  const openCreateForm = () => {
    setEditingId(null);
    setEntryMode('manual');
    setSelectedStudent(null);
    setStudentSearch('');
    setManualForm(emptyManualForm);
    setUploadTerm('first');
    setUploadSession('2024/2025');
    setFile(null);
    setFormError('');
    setShowForm(true);
  };

  const openEditForm = (reportCard) => {
    setEditingId(reportCard._id);
    setEntryMode('manual');
    setSelectedStudent(reportCard.studentId);
    setManualForm({
      term: reportCard.term,
      session: reportCard.session,
      subjects: reportCard.subjects.map((s) => ({ name: s.name, ca1: s.ca1 ?? '', ca2: s.ca2 ?? '', exam: s.exam ?? '' })),
      attendance: {
        daysPresent: reportCard.attendance?.daysPresent ?? '',
        daysAbsent: reportCard.attendance?.daysAbsent ?? '',
        totalDays: reportCard.attendance?.totalDays ?? ''
      },
      position: reportCard.summary?.position || '',
      numberInClass: reportCard.summary?.numberInClass ?? '',
      classTeacherComment: reportCard.classTeacherComment || '',
      principalComment: reportCard.principalComment || '',
      nextTermBeginsDate: reportCard.nextTermBeginsDate?.slice(0, 10) || ''
    });
    setFormError('');
    setShowForm(true);
  };

  const updateSubject = (index, field, value) => {
    setManualForm((prev) => {
      const subjects = [...prev.subjects];
      subjects[index] = { ...subjects[index], [field]: value };
      return { ...prev, subjects };
    });
  };

  const addSubject = () => {
    setManualForm((prev) => ({ ...prev, subjects: [...prev.subjects, { ...emptySubject }] }));
  };

  const removeSubject = (index) => {
    setManualForm((prev) => ({ ...prev, subjects: prev.subjects.filter((_, i) => i !== index) }));
  };

  const handleSubmitManual = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!editingId && !selectedStudent) {
      setFormError('Select a student first');
      return;
    }

    setIsSubmitting(true);

    const payload = {
      ...(editingId ? {} : { studentId: selectedStudent._id, term: manualForm.term, session: manualForm.session }),
      subjects: manualForm.subjects.map((s) => ({
        name: s.name,
        ca1: s.ca1 === '' ? 0 : parseFloat(s.ca1),
        ca2: s.ca2 === '' ? 0 : parseFloat(s.ca2),
        exam: s.exam === '' ? 0 : parseFloat(s.exam)
      })),
      attendance: {
        daysPresent: manualForm.attendance.daysPresent === '' ? undefined : parseInt(manualForm.attendance.daysPresent),
        daysAbsent: manualForm.attendance.daysAbsent === '' ? undefined : parseInt(manualForm.attendance.daysAbsent),
        totalDays: manualForm.attendance.totalDays === '' ? undefined : parseInt(manualForm.attendance.totalDays)
      },
      summary: {
        position: manualForm.position || undefined,
        numberInClass: manualForm.numberInClass === '' ? undefined : parseInt(manualForm.numberInClass)
      },
      classTeacherComment: manualForm.classTeacherComment || undefined,
      principalComment: manualForm.principalComment || undefined,
      nextTermBeginsDate: manualForm.nextTermBeginsDate || undefined
    };

    const { data } = await apiCall(
      editingId ? `/admin/report-cards/manual/${editingId}` : '/admin/report-cards/manual',
      { method: editingId ? 'PATCH' : 'POST', body: JSON.stringify(payload) }
    );

    if (data.success) {
      setShowForm(false);
      fetchReportCards(pagination.current);
    } else {
      setFormError(data.message || data.errors?.[0]?.msg || `Failed to ${editingId ? 'update' : 'create'} report card`);
    }
    setIsSubmitting(false);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!selectedStudent) {
      setFormError('Select a student first');
      return;
    }
    if (!file) {
      setFormError('Choose a PDF file to upload');
      return;
    }

    setIsSubmitting(true);
    const formData = new FormData();
    formData.append('studentId', selectedStudent._id);
    formData.append('term', uploadTerm);
    formData.append('session', uploadSession);
    formData.append('reportCard', file);

    try {
      const response = await fetch(`${API_BASE_URL}/admin/report-cards`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      const data = await response.json();

      if (data.success) {
        setShowForm(false);
        fetchReportCards(1);
      } else {
        setFormError(data.message || data.errors?.[0]?.msg || 'Failed to upload report card');
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
          <h1>Report Cards</h1>
          <p className="text-secondary">{pagination.totalRecords || 0} total</p>
        </div>
        <button className="btn btn-primary" onClick={openCreateForm}>
          <Icon name="plus" size={16} /> New Report Card
        </button>
      </div>

      {isLoading ? (
        <div className="empty-state"><Icon name="loader" size={24} className="spinning" /></div>
      ) : reportCards.length === 0 ? (
        <div className="empty-state">No report cards yet.</div>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Division / Class</th>
                <th>Term</th>
                <th>Session</th>
                <th>Type</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {reportCards.map((rc) => (
                <tr key={rc._id}>
                  <td data-label="Student">{rc.studentId?.fullName}<br /><span className="text-secondary text-sm">{rc.studentId?.regNumber}</span></td>
                  <td data-label="Division / Class" style={{ textTransform: 'capitalize' }}>{rc.division} / {rc.class}</td>
                  <td data-label="Term" style={{ textTransform: 'capitalize' }}>{rc.term}</td>
                  <td data-label="Session">{rc.session}</td>
                  <td data-label="Type"><span className="badge badge-pending" style={{ textTransform: 'capitalize' }}>{rc.type}</span></td>
                  <td data-label="Status"><span className={`badge badge-${rc.isPublished ? 'approved' : 'pending'}`}>{rc.isPublished ? 'Published' : 'Draft'}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                      {rc.type === 'manual' ? (
                        <button className="btn btn-outline btn-sm" onClick={() => setViewingReportCard(rc)}>View</button>
                      ) : (
                        <a className="btn btn-outline btn-sm" href={rc.fileUrl} target="_blank" rel="noreferrer">View File</a>
                      )}
                      {rc.type === 'manual' && (
                        <button className="btn btn-outline btn-sm" onClick={() => openEditForm(rc)}>
                          <Icon name="edit" size={14} /> Edit
                        </button>
                      )}
                      <button className="btn btn-outline btn-sm" onClick={() => handleTogglePublish(rc)}>
                        {rc.isPublished ? 'Unpublish' : 'Publish'}
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(rc._id)}>Delete</button>
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
          <button className="btn btn-outline btn-sm" disabled={pagination.current <= 1} onClick={() => fetchReportCards(pagination.current - 1)}>Previous</button>
          <span className="text-sm">Page {pagination.current} of {pagination.total}</span>
          <button className="btn btn-outline btn-sm" disabled={pagination.current >= pagination.total} onClick={() => fetchReportCards(pagination.current + 1)}>Next</button>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingId ? 'Edit Report Card' : 'New Report Card'}</h2>
              <button className="modal-close-btn" onClick={() => setShowForm(false)}><Icon name="close" size={22} /></button>
            </div>

            {formError && (
              <div className="admin-error-message">
                <Icon name="alertCircle" size={18} />
                <span>{formError}</span>
              </div>
            )}

            {!editingId && (
              <div className="filter-bar">
                <button type="button" className={`btn btn-sm ${entryMode === 'manual' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setEntryMode('manual')}>
                  Enter Scores
                </button>
                <button type="button" className={`btn btn-sm ${entryMode === 'upload' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setEntryMode('upload')}>
                  Upload PDF Instead
                </button>
              </div>
            )}

            {!editingId && (
              <div className="form-group">
                <label>Student</label>
                <input
                  type="text"
                  placeholder="Search by name..."
                  value={selectedStudent ? selectedStudent.fullName : studentSearch}
                  onChange={(e) => searchStudents(e.target.value)}
                />
                {studentResults.length > 0 && !selectedStudent && (
                  <div className="card" style={{ padding: 0, maxHeight: 180, overflowY: 'auto' }}>
                    {studentResults.map((s) => (
                      <div
                        key={s._id}
                        style={{ padding: 'var(--space-2) var(--space-3)', cursor: 'pointer', borderBottom: '1px solid var(--color-border-light)' }}
                        onClick={() => { setSelectedStudent(s); setStudentResults([]); }}
                      >
                        {s.fullName} — <span className="text-secondary text-sm">{s.regNumber}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {editingId && (
              <p className="text-secondary text-sm" style={{ marginBottom: 'var(--space-4)' }}>
                {selectedStudent?.fullName} — {manualForm.term} term, {manualForm.session}
              </p>
            )}

            {entryMode === 'manual' ? (
              <form onSubmit={handleSubmitManual}>
                {!editingId && (
                  <div className="form-row">
                    <div className="form-group">
                      <label>Term</label>
                      <select value={manualForm.term} onChange={(e) => setManualForm({ ...manualForm, term: e.target.value })}>
                        {TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Session</label>
                      <input type="text" required value={manualForm.session} onChange={(e) => setManualForm({ ...manualForm, session: e.target.value })} />
                    </div>
                  </div>
                )}

                <label style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-2)', display: 'block' }}>Subjects</label>
                {manualForm.subjects.map((subject, i) => {
                  const total = (parseFloat(subject.ca1) || 0) + (parseFloat(subject.ca2) || 0) + (parseFloat(subject.exam) || 0);
                  return (
                    <div key={i} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
                      <div className="form-row" style={{ alignItems: 'end', marginBottom: 0 }}>
                        <div className="form-group" style={{ marginBottom: 0, flex: 2 }}>
                          <input type="text" placeholder="Subject (e.g. Mathematics)" required value={subject.name} onChange={(e) => updateSubject(i, 'name', e.target.value)} />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0, display: 'flex', gap: 'var(--space-2)' }}>
                          <input type="number" placeholder="CA1" min="0" style={{ width: 70 }} value={subject.ca1} onChange={(e) => updateSubject(i, 'ca1', e.target.value)} />
                          <input type="number" placeholder="CA2" min="0" style={{ width: 70 }} value={subject.ca2} onChange={(e) => updateSubject(i, 'ca2', e.target.value)} />
                          <input type="number" placeholder="Exam" min="0" style={{ width: 70 }} value={subject.exam} onChange={(e) => updateSubject(i, 'exam', e.target.value)} />
                          <span className="text-secondary text-sm" style={{ alignSelf: 'center', minWidth: 60 }}>= {total}</span>
                          {manualForm.subjects.length > 1 && (
                            <button type="button" className="btn btn-danger btn-sm" onClick={() => removeSubject(i)}><Icon name="x" size={14} /></button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <button type="button" className="btn btn-outline btn-sm" onClick={addSubject} style={{ marginBottom: 'var(--space-4)' }}>
                  <Icon name="plus" size={14} /> Add Subject
                </button>

                <h4 style={{ marginBottom: 'var(--space-3)' }}>Attendance</h4>
                <div className="form-row">
                  <div className="form-group">
                    <label>Days Present</label>
                    <input type="number" min="0" value={manualForm.attendance.daysPresent} onChange={(e) => setManualForm({ ...manualForm, attendance: { ...manualForm.attendance, daysPresent: e.target.value } })} />
                  </div>
                  <div className="form-group">
                    <label>Days Absent</label>
                    <input type="number" min="0" value={manualForm.attendance.daysAbsent} onChange={(e) => setManualForm({ ...manualForm, attendance: { ...manualForm.attendance, daysAbsent: e.target.value } })} />
                  </div>
                  <div className="form-group">
                    <label>Total Days</label>
                    <input type="number" min="0" value={manualForm.attendance.totalDays} onChange={(e) => setManualForm({ ...manualForm, attendance: { ...manualForm.attendance, totalDays: e.target.value } })} />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Position in Class (optional)</label>
                    <input type="text" placeholder="e.g. 3rd" value={manualForm.position} onChange={(e) => setManualForm({ ...manualForm, position: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Number in Class (optional)</label>
                    <input type="number" min="1" value={manualForm.numberInClass} onChange={(e) => setManualForm({ ...manualForm, numberInClass: e.target.value })} />
                  </div>
                </div>

                <div className="form-group">
                  <label>Class Teacher's Comment (optional)</label>
                  <textarea rows={2} value={manualForm.classTeacherComment} onChange={(e) => setManualForm({ ...manualForm, classTeacherComment: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Principal's Comment (optional)</label>
                  <textarea rows={2} value={manualForm.principalComment} onChange={(e) => setManualForm({ ...manualForm, principalComment: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Next Term Begins (optional)</label>
                  <input type="date" value={manualForm.nextTermBeginsDate} onChange={(e) => setManualForm({ ...manualForm, nextTermBeginsDate: e.target.value })} />
                </div>

                <p className="text-secondary text-sm" style={{ marginBottom: 'var(--space-4)' }}>
                  Grades are computed automatically from scores. The report card saves as a draft — publish it from the list once you're happy with it, so parents don't see it while it's still being entered.
                </p>

                <button type="submit" className="btn btn-primary btn-full" disabled={isSubmitting}>
                  {isSubmitting ? <Icon name="loader" size={18} className="spinning" /> : (editingId ? 'Save Changes' : 'Create Report Card')}
                </button>
              </form>
            ) : (
              <form onSubmit={handleUpload}>
                <div className="form-row">
                  <div className="form-group">
                    <label>Term</label>
                    <select value={uploadTerm} onChange={(e) => setUploadTerm(e.target.value)}>
                      {TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Session</label>
                    <input type="text" value={uploadSession} onChange={(e) => setUploadSession(e.target.value)} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Report Card PDF</label>
                  <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files[0])} />
                </div>
                <button type="submit" className="btn btn-primary btn-full" disabled={isSubmitting}>
                  {isSubmitting ? <Icon name="loader" size={18} className="spinning" /> : 'Upload'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Professional Report Card View */}
      {viewingReportCard && (
        <div className="modal-backdrop" onClick={() => setViewingReportCard(null)}>
          <div className="modal-panel report-card-modal" onClick={(e) => e.stopPropagation()}>
            <SchoolCrest className="report-card-watermark" />
            <button className="modal-close-btn" onClick={() => setViewingReportCard(null)}><Icon name="close" size={22} /></button>

            <div className="report-card-content">
            <div className="invoice-letterhead">
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                <SchoolCrest size={56} />
                <div>
                  <div className="school-mark">GOODNESS AND MERCY ACADEMY</div>
                  <div className="invoice-number">Report Card</div>
                  <div className="invoice-sub">
                    {viewingReportCard.term?.charAt(0).toUpperCase() + viewingReportCard.term?.slice(1)} term · {viewingReportCard.session}
                  </div>
                </div>
              </div>
              <div className="invoice-letterhead-right">
                <span className={`badge badge-${viewingReportCard.isPublished ? 'approved' : 'pending'}`}>{viewingReportCard.isPublished ? 'Published' : 'Draft'}</span>
              </div>
            </div>

            <div className="invoice-parties">
              <div>
                <div className="label">Student</div>
                <div className="value">
                  <strong>{viewingReportCard.studentId?.fullName}</strong>
                  {viewingReportCard.studentId?.regNumber}
                  <br />{viewingReportCard.division} / {viewingReportCard.class}
                </div>
              </div>
              <div>
                <div className="label">Attendance</div>
                <div className="value">
                  {viewingReportCard.attendance?.totalDays
                    ? `${viewingReportCard.attendance.daysPresent || 0} present / ${viewingReportCard.attendance.daysAbsent || 0} absent of ${viewingReportCard.attendance.totalDays} days`
                    : 'Not recorded'}
                </div>
              </div>
            </div>

            <div className="invoice-section-title">Subjects</div>
            <table className="invoice-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th className="amount-col">CA1</th>
                  <th className="amount-col">CA2</th>
                  <th className="amount-col">Exam</th>
                  <th className="amount-col">Total</th>
                  <th className="amount-col">Grade</th>
                  <th>Remark</th>
                </tr>
              </thead>
              <tbody>
                {viewingReportCard.subjects?.map((s, i) => (
                  <tr key={i}>
                    <td>{s.name}</td>
                    <td className="amount-col">{s.ca1}</td>
                    <td className="amount-col">{s.ca2}</td>
                    <td className="amount-col">{s.exam}</td>
                    <td className="amount-col"><strong>{s.total}</strong></td>
                    <td className="amount-col"><span className={`grade-badge grade-${s.grade}`}>{s.grade}</span></td>
                    <td>{s.remark}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="invoice-summary" style={{ maxWidth: 340 }}>
              <div className="invoice-summary-row">
                <span>Total Score</span>
                <span>{viewingReportCard.summary?.totalScore}</span>
              </div>
              <div className="invoice-summary-row">
                <span>Average Score</span>
                <span>{viewingReportCard.summary?.averageScore}</span>
              </div>
              <div className="invoice-summary-row">
                <span>Overall Grade</span>
                <span className={`grade-badge grade-${viewingReportCard.summary?.overallGrade}`}>{viewingReportCard.summary?.overallGrade}</span>
              </div>
              {viewingReportCard.summary?.position && (
                <div className="invoice-summary-row total">
                  <span>Position in Class</span>
                  <span>{viewingReportCard.summary.position}{viewingReportCard.summary.numberInClass ? ` of ${viewingReportCard.summary.numberInClass}` : ''}</span>
                </div>
              )}
            </div>

            {viewingReportCard.classTeacherComment && (
              <div className="report-card-comment-box">
                <div className="label">Class Teacher's Comment</div>
                <p>{viewingReportCard.classTeacherComment}</p>
              </div>
            )}
            {viewingReportCard.principalComment && (
              <div className="report-card-comment-box">
                <div className="label">Principal's Comment</div>
                <p>{viewingReportCard.principalComment}</p>
              </div>
            )}
            {viewingReportCard.nextTermBeginsDate && (
              <p className="text-secondary text-sm" style={{ marginBottom: 'var(--space-4)' }}>
                Next term begins: <strong>{formatDate(viewingReportCard.nextTermBeginsDate)}</strong>
              </p>
            )}

            <div className="report-card-signatures">
              <div className="report-card-signature-line">Class Teacher</div>
              <div className="report-card-signature-line">Principal</div>
            </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportCards;

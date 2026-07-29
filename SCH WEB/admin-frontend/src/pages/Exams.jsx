import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useDialog } from '../contexts/DialogContext';
import Icon from '../components/Icon';
import { API_BASE_URL } from '../config/api';

const DIVISIONS = ['nursery', 'primary', 'secondary', 'college'];
const QUESTION_TYPES = ['mcq', 'short', 'essay'];

const emptyQuestion = () => ({
  key: crypto.randomUUID(),
  questionText: '',
  type: 'mcq',
  marks: 1,
  options: ['', ''],
  correctAnswer: '',
  imageUrl: ''
});

const emptyForm = () => ({
  title: '',
  description: '',
  subject: '',
  division: 'primary',
  classesText: '',
  durationMinutes: 30,
  startTime: '',
  endTime: '',
  shuffleQuestions: false,
  showResultsImmediately: true,
  questions: []
});

const toLocalInput = (iso) => (iso ? new Date(iso).toISOString().slice(0, 16) : '');

const Exams = () => {
  const { apiCall, token } = useAuth();
  const { confirmDialog, alertDialog } = useDialog();

  const [exams, setExams] = useState([]);
  const [pagination, setPagination] = useState({ current: 1, total: 1 });
  const [divisionFilter, setDivisionFilter] = useState('');
  const [publishedFilter, setPublishedFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editingExamId, setEditingExamId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [knownClasses, setKnownClasses] = useState([]);
  const [csvUploading, setCsvUploading] = useState(false);
  const [uploadingImageKey, setUploadingImageKey] = useState(null);

  const [submissionsExam, setSubmissionsExam] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [grading, setGrading] = useState(null); // { submission, marks: { [questionId]: string } }

  const fetchExams = async (page = 1) => {
    setIsLoading(true);
    const query = new URLSearchParams({
      page,
      limit: 20,
      ...(divisionFilter && { division: divisionFilter }),
      ...(publishedFilter && { isPublished: publishedFilter })
    });
    const { data } = await apiCall(`/admin/exams?${query}`);
    if (data.success) {
      setExams(data.data.exams);
      setPagination(data.data.pagination);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchExams(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [divisionFilter, publishedFilter]);

  const fetchKnownClasses = async (division) => {
    if (!division) { setKnownClasses([]); return; }
    const { data } = await apiCall(`/admin/classes?division=${division}`);
    if (data.success) setKnownClasses(data.data || []);
  };

  const openCreateForm = () => {
    setEditingExamId(null);
    setForm(emptyForm());
    setFormError('');
    fetchKnownClasses('primary');
    setShowForm(true);
  };

  const openEditForm = async (examId) => {
    const { data } = await apiCall(`/admin/exams/${examId}`);
    if (!data.success) return;
    const exam = data.data;
    setEditingExamId(examId);
    setForm({
      title: exam.title,
      description: exam.description || '',
      subject: exam.subject || '',
      division: exam.division,
      classesText: (exam.classes || []).join(', '),
      durationMinutes: exam.durationMinutes,
      startTime: toLocalInput(exam.startTime),
      endTime: toLocalInput(exam.endTime),
      shuffleQuestions: exam.shuffleQuestions,
      showResultsImmediately: exam.showResultsImmediately,
      questions: exam.questions.map((q) => ({
        key: q._id,
        questionText: q.questionText,
        type: q.type,
        marks: q.marks,
        options: q.options?.length ? q.options : ['', ''],
        correctAnswer: q.correctAnswer || '',
        imageUrl: q.imageUrl || ''
      }))
    });
    setFormError('');
    fetchKnownClasses(exam.division);
    setShowForm(true);
  };

  const togglePublish = async (examId, isPublished) => {
    const { data } = await apiCall(`/admin/exams/${examId}/publish`, {
      method: 'PATCH',
      body: JSON.stringify({ isPublished: !isPublished })
    });
    if (data.success) {
      setExams((prev) => prev.map((e) => (e._id === examId ? data.data : e)));
    } else {
      alertDialog(data.message || 'Failed to update exam');
    }
  };

  const deleteExam = async (examId) => {
    if (!(await confirmDialog('Delete this exam? This cannot be undone.', { confirmLabel: 'Delete' }))) return;
    const { data } = await apiCall(`/admin/exams/${examId}`, { method: 'DELETE' });
    if (data.success) {
      setExams((prev) => prev.filter((e) => e._id !== examId));
    }
  };

  // --- question builder ---
  const addQuestion = () => setForm((f) => ({ ...f, questions: [...f.questions, emptyQuestion()] }));
  const removeQuestion = (key) => setForm((f) => ({ ...f, questions: f.questions.filter((q) => q.key !== key) }));
  const updateQuestion = (key, patch) => setForm((f) => ({
    ...f,
    questions: f.questions.map((q) => (q.key === key ? { ...q, ...patch } : q))
  }));
  const addOption = (key) => updateQuestion(key, { options: [...form.questions.find((q) => q.key === key).options, ''] });
  const updateOption = (key, index, value) => {
    const question = form.questions.find((q) => q.key === key);
    const options = question.options.map((o, i) => (i === index ? value : o));
    const correctAnswer = question.correctAnswer === question.options[index] ? value : question.correctAnswer;
    updateQuestion(key, { options, correctAnswer });
  };
  const removeOption = (key, index) => {
    const question = form.questions.find((q) => q.key === key);
    const removed = question.options[index];
    updateQuestion(key, {
      options: question.options.filter((_, i) => i !== index),
      correctAnswer: question.correctAnswer === removed ? '' : question.correctAnswer
    });
  };

  const buildMetadataPayload = () => ({
    title: form.title,
    description: form.description || undefined,
    subject: form.subject || undefined,
    division: form.division,
    classes: form.classesText.split(',').map((c) => c.trim()).filter(Boolean),
    durationMinutes: Number(form.durationMinutes),
    startTime: new Date(form.startTime).toISOString(),
    endTime: new Date(form.endTime).toISOString(),
    shuffleQuestions: form.shuffleQuestions,
    showResultsImmediately: form.showResultsImmediately
  });

  // A CSV can be uploaded before the exam itself has ever been saved (e.g.
  // straight from the "New Exam" form) — this silently creates the exam
  // from whatever metadata is filled in so far, so the CSV always has a
  // real exam to attach its questions to.
  const ensureExamId = async () => {
    if (editingExamId) return editingExamId;

    if (!form.title.trim() || !form.startTime || !form.endTime) {
      setFormError('Fill in the title, start time, and end time before uploading a CSV.');
      return null;
    }

    const payload = buildMetadataPayload();
    payload.questions = [];
    const { data } = await apiCall('/admin/exams', { method: 'POST', body: JSON.stringify(payload) });
    if (!data.success) {
      setFormError(data.message || data.errors?.[0]?.msg || 'Failed to create exam before CSV upload');
      return null;
    }

    setEditingExamId(data.data._id);
    fetchExams(pagination.current);
    return data.data._id;
  };

  const downloadCsvTemplate = () => {
    const rows = [
      'questionText,type,marks,option1,option2,option3,option4,correctAnswer,imageUrl',
      '"What is 2 + 2?",mcq,1,2,3,4,5,4,',
      '"What shape is shown in the picture?",mcq,1,Circle,Square,Triangle,Star,Triangle,https://example.com/triangle.png',
      '"Explain photosynthesis in your own words.",short,3,,,,,,',
      '"Write a short essay on your favourite hobby.",essay,5,,,,,,'
    ];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'exam-questions-template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError('');

    for (const q of form.questions) {
      if (q.type === 'mcq') {
        const options = q.options.map((o) => o.trim()).filter(Boolean);
        if (options.length < 2) {
          setFormError(`"${q.questionText || 'Untitled question'}" needs at least 2 non-empty options`);
          setIsSubmitting(false);
          return;
        }
        if (!q.correctAnswer || !options.includes(q.correctAnswer)) {
          setFormError(`"${q.questionText || 'Untitled question'}" needs a correct answer matching one of its options`);
          setIsSubmitting(false);
          return;
        }
      }
    }

    const payload = buildMetadataPayload();
    payload.questions = form.questions.map((q) => ({
      questionText: q.questionText,
      type: q.type,
      marks: Number(q.marks),
      ...(q.imageUrl && { imageUrl: q.imageUrl }),
      ...(q.type === 'mcq' && {
        options: q.options.map((o) => o.trim()).filter(Boolean),
        correctAnswer: q.correctAnswer
      })
    }));

    const { data } = editingExamId
      ? await apiCall(`/admin/exams/${editingExamId}`, { method: 'PATCH', body: JSON.stringify(payload) })
      : await apiCall('/admin/exams', { method: 'POST', body: JSON.stringify(payload) });

    if (data.success) {
      setShowForm(false);
      fetchExams(pagination.current);
    } else {
      setFormError(data.message || data.errors?.[0]?.msg || 'Failed to save exam');
    }
    setIsSubmitting(false);
  };

  const handleQuestionImageUpload = async (key, file) => {
    if (!file) return;
    setUploadingImageKey(key);
    const formData = new FormData();
    formData.append('image', file);
    try {
      const response = await fetch(`${API_BASE_URL}/admin/exams/question-image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      const data = await response.json();
      if (data.success) {
        updateQuestion(key, { imageUrl: data.data.url });
      } else {
        await alertDialog(data.message || 'Image upload failed');
      }
    } catch {
      await alertDialog('Network error during image upload');
    }
    setUploadingImageKey(null);
  };

  const handleCsvUpload = async (file) => {
    if (!file) return;
    const examId = await ensureExamId();
    if (!examId) return;

    setCsvUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await fetch(`${API_BASE_URL}/admin/exams/${examId}/questions/csv`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      const data = await response.json();
      if (data.success) {
        setForm((f) => ({
          ...f,
          questions: data.data.questions.map((q) => ({
            key: q._id,
            questionText: q.questionText,
            type: q.type,
            marks: q.marks,
            options: q.options?.length ? q.options : ['', ''],
            correctAnswer: q.correctAnswer || '',
            imageUrl: q.imageUrl || ''
          }))
        }));
        await alertDialog(data.message + (data.warnings?.length ? `\n\nSkipped:\n${data.warnings.join('\n')}` : ''));
      } else {
        await alertDialog(data.message || 'CSV upload failed');
      }
    } catch {
      await alertDialog('Network error during CSV upload');
    }
    setCsvUploading(false);
  };

  // --- submissions & grading ---
  const openSubmissions = async (exam) => {
    setSubmissionsExam(exam);
    setLoadingSubmissions(true);
    const { data } = await apiCall(`/admin/exams/${exam._id}/submissions`);
    if (data.success) setSubmissions(data.data.submissions);
    setLoadingSubmissions(false);
  };

  const openGrading = (submission) => {
    const marks = {};
    (submissionsExam.questions || []).forEach((q) => {
      if (q.type !== 'mcq') {
        const answer = submission.answers.find((a) => a.questionId === q._id);
        marks[q._id] = answer?.marksAwarded ?? '';
      }
    });
    setGrading({ submission, marks });
  };

  const saveGrades = async () => {
    const answers = Object.entries(grading.marks)
      .filter(([, v]) => v !== '')
      .map(([questionId, marksAwarded]) => ({ questionId, marksAwarded: Number(marksAwarded) }));

    const { data } = await apiCall(`/admin/submissions/${grading.submission._id}/grade`, {
      method: 'PATCH',
      body: JSON.stringify({ answers })
    });
    if (data.success) {
      setSubmissions((prev) => prev.map((s) => (s._id === data.data._id ? data.data : s)));
      setGrading(null);
    } else {
      alertDialog(data.message || 'Failed to save grades');
    }
  };

  const exportResults = async () => {
    const response = await fetch(`${API_BASE_URL}/admin/exams/${submissionsExam._id}/submissions/export`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${submissionsExam.title.replace(/[^a-z0-9]/gi, '-')}-results.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>CBT Exams</h1>
          <p className="text-secondary">{pagination.totalRecords || 0} total exams</p>
        </div>
        <button className="btn btn-primary" onClick={openCreateForm}>
          <Icon name="plus" size={16} /> New Exam
        </button>
      </div>

      <div className="filter-bar">
        <select value={divisionFilter} onChange={(e) => setDivisionFilter(e.target.value)}>
          <option value="">All divisions</option>
          {DIVISIONS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={publishedFilter} onChange={(e) => setPublishedFilter(e.target.value)}>
          <option value="">All exams</option>
          <option value="true">Published</option>
          <option value="false">Drafts</option>
        </select>
      </div>

      {isLoading ? (
        <div className="empty-state"><Icon name="loader" size={24} className="spinning" /></div>
      ) : exams.length === 0 ? (
        <div className="empty-state">No exams found.</div>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Division</th>
                <th>Subject</th>
                <th>Questions</th>
                <th>Duration</th>
                <th>Window</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {exams.map((exam) => (
                <tr key={exam._id}>
                  <td data-label="Title">{exam.title}</td>
                  <td data-label="Division" style={{ textTransform: 'capitalize' }}>{exam.division}</td>
                  <td data-label="Subject">{exam.subject || '—'}</td>
                  <td data-label="Questions">{exam.questions.length}</td>
                  <td data-label="Duration">{exam.durationMinutes} min</td>
                  <td data-label="Window" className="text-sm text-secondary">
                    {new Date(exam.startTime).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                    {' → '}
                    {new Date(exam.endTime).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td data-label="Status"><span className={`badge badge-${exam.isPublished ? 'approved' : 'pending'}`}>{exam.isPublished ? 'Published' : 'Draft'}</span></td>
                  <td style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    <button className="btn btn-outline btn-sm" onClick={() => openEditForm(exam._id)}>Edit</button>
                    <button className="btn btn-outline btn-sm" onClick={() => togglePublish(exam._id, exam.isPublished)}>
                      {exam.isPublished ? 'Unpublish' : 'Publish'}
                    </button>
                    <button className="btn btn-outline btn-sm" onClick={() => openSubmissions(exam)}>Submissions</button>
                    <button className="btn btn-danger btn-sm" onClick={() => deleteExam(exam._id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination.total > 1 && (
        <div className="pagination-bar">
          <button className="btn btn-outline btn-sm" disabled={pagination.current <= 1} onClick={() => fetchExams(pagination.current - 1)}>Previous</button>
          <span className="text-sm">Page {pagination.current} of {pagination.total}</span>
          <button className="btn btn-outline btn-sm" disabled={pagination.current >= pagination.total} onClick={() => fetchExams(pagination.current + 1)}>Next</button>
        </div>
      )}

      {/* Create / Edit exam */}
      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="modal-panel" style={{ maxWidth: 760 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingExamId ? 'Edit Exam' : 'New Exam'}</h2>
              <button className="modal-close-btn" onClick={() => setShowForm(false)}><Icon name="close" size={22} /></button>
            </div>

            <form onSubmit={handleSave}>
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
                <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Subject (optional)</label>
                  <input type="text" placeholder="e.g. Mathematics" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Division</label>
                  <select
                    value={form.division}
                    onChange={(e) => { setForm({ ...form, division: e.target.value }); fetchKnownClasses(e.target.value); }}
                  >
                    {DIVISIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Classes (optional — comma-separated, leave blank for the whole division)</label>
                <input
                  type="text"
                  list="known-exam-classes"
                  placeholder="e.g. Primary 5"
                  value={form.classesText}
                  onChange={(e) => setForm({ ...form, classesText: e.target.value })}
                />
                {knownClasses.length > 0 && (
                  <p className="text-secondary text-sm" style={{ marginTop: 'var(--space-1)' }}>
                    Currently in use: {knownClasses.join(', ')}.
                  </p>
                )}
                <datalist id="known-exam-classes">
                  {knownClasses.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Duration (minutes)</label>
                  <input type="number" required min={1} value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Start time</label>
                  <input type="datetime-local" required value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>End time</label>
                  <input type="datetime-local" required value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
                </div>
              </div>

              <div className="form-row">
                <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <input type="checkbox" checked={form.shuffleQuestions} onChange={(e) => setForm({ ...form, shuffleQuestions: e.target.checked })} />
                  Shuffle question order per student
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <input type="checkbox" checked={form.showResultsImmediately} onChange={(e) => setForm({ ...form, showResultsImmediately: e.target.checked })} />
                  Show results immediately after submission
                </label>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'var(--space-5)', marginBottom: 'var(--space-3)' }}>
                <h4 style={{ margin: 0 }}>Questions ({form.questions.length}, {form.questions.reduce((s, q) => s + (Number(q.marks) || 0), 0)} marks)</h4>
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-outline btn-sm" onClick={downloadCsvTemplate}>
                    Download CSV Template
                  </button>
                  <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer' }}>
                    {csvUploading ? <Icon name="loader" size={14} className="spinning" /> : 'Upload CSV'}
                    <input type="file" accept=".csv" hidden onChange={(e) => handleCsvUpload(e.target.files?.[0])} disabled={csvUploading} />
                  </label>
                  <button type="button" className="btn btn-outline btn-sm" onClick={addQuestion}>
                    <Icon name="plus" size={14} /> Add Question
                  </button>
                </div>
              </div>
              {!editingExamId && (
                <p className="text-secondary text-sm" style={{ marginTop: 0, marginBottom: 'var(--space-3)' }}>
                  Uploading a CSV before saving will auto-create the exam from the title/division/schedule above — fill those in first.
                </p>
              )}

              {form.questions.map((q, qIndex) => (
                <div key={q.key} className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-3)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                    <strong>Question {qIndex + 1}</strong>
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => removeQuestion(q.key)}>Remove</button>
                  </div>
                  <div className="form-group">
                    <label>Question text</label>
                    <textarea rows={2} required value={q.questionText} onChange={(e) => updateQuestion(q.key, { questionText: e.target.value })} />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Type</label>
                      <select value={q.type} onChange={(e) => updateQuestion(q.key, { type: e.target.value })}>
                        {QUESTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Marks</label>
                      <input type="number" min={1} required value={q.marks} onChange={(e) => updateQuestion(q.key, { marks: e.target.value })} />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Image (optional)</label>
                    {q.imageUrl ? (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                        <img src={q.imageUrl} alt="" style={{ maxWidth: 200, maxHeight: 140, borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }} />
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => updateQuestion(q.key, { imageUrl: '' })}>Remove Image</button>
                      </div>
                    ) : (
                      <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer', display: 'inline-flex', width: 'fit-content' }}>
                        {uploadingImageKey === q.key ? <Icon name="loader" size={14} className="spinning" /> : 'Add Image'}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          hidden
                          disabled={uploadingImageKey === q.key}
                          onChange={(e) => handleQuestionImageUpload(q.key, e.target.files?.[0])}
                        />
                      </label>
                    )}
                  </div>

                  {q.type === 'mcq' && (
                    <div className="form-group">
                      <label>Options (select the radio button for the correct answer)</label>
                      {q.options.map((option, oIndex) => (
                        <div key={oIndex} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                          <input
                            type="radio"
                            name={`correct-${q.key}`}
                            checked={q.correctAnswer === option && option !== ''}
                            onChange={() => updateQuestion(q.key, { correctAnswer: option })}
                          />
                          <input
                            type="text"
                            placeholder={`Option ${oIndex + 1}`}
                            value={option}
                            style={{ flex: 1 }}
                            onChange={(e) => updateOption(q.key, oIndex, e.target.value)}
                          />
                          {q.options.length > 2 && (
                            <button type="button" className="btn btn-outline btn-sm" onClick={() => removeOption(q.key, oIndex)}>
                              <Icon name="close" size={12} />
                            </button>
                          )}
                        </div>
                      ))}
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => addOption(q.key)}>
                        <Icon name="plus" size={12} /> Add Option
                      </button>
                    </div>
                  )}
                </div>
              ))}

              <button type="submit" className="btn btn-primary btn-full" disabled={isSubmitting} style={{ marginTop: 'var(--space-4)' }}>
                {isSubmitting ? <Icon name="loader" size={18} className="spinning" /> : editingExamId ? 'Save Changes' : 'Create Exam'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Submissions */}
      {submissionsExam && (
        <div className="modal-backdrop" onClick={() => { setSubmissionsExam(null); setSubmissions([]); }}>
          <div className="modal-panel" style={{ maxWidth: 760 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{submissionsExam.title} — Submissions</h2>
              <button className="modal-close-btn" onClick={() => { setSubmissionsExam(null); setSubmissions([]); }}><Icon name="close" size={22} /></button>
            </div>

            <div style={{ marginBottom: 'var(--space-4)' }}>
              <button className="btn btn-outline btn-sm" onClick={exportResults} disabled={submissions.length === 0}>Export CSV</button>
            </div>

            {loadingSubmissions ? (
              <div className="empty-state"><Icon name="loader" size={24} className="spinning" /></div>
            ) : submissions.length === 0 ? (
              <div className="empty-state">No submissions yet.</div>
            ) : (
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Class</th>
                      <th>Score</th>
                      <th>Status</th>
                      <th>Submitted</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {submissions.map((s) => (
                      <tr key={s._id}>
                        <td data-label="Student">{s.studentId?.fullName} <span className="text-secondary text-sm">({s.studentId?.regNumber})</span></td>
                        <td data-label="Class">{s.studentId?.class}</td>
                        <td data-label="Score">{s.status === 'in_progress' ? '—' : `${s.score ?? 0} / ${s.maxScore ?? submissionsExam.totalMarks}`}</td>
                        <td data-label="Status" style={{ textTransform: 'capitalize' }}>{s.status.replace('_', ' ')}{s.autoSubmitted ? ' (auto)' : ''}</td>
                        <td data-label="Submitted" className="text-sm text-secondary">{s.submittedAt ? new Date(s.submittedAt).toLocaleString('en-GB') : '—'}</td>
                        <td>
                          {s.status !== 'in_progress' && (
                            <button className="btn btn-outline btn-sm" onClick={() => openGrading(s)}>Grade</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Grading */}
      {grading && (
        <div className="modal-backdrop" onClick={() => setGrading(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Grade — {grading.submission.studentId?.fullName}</h2>
              <button className="modal-close-btn" onClick={() => setGrading(null)}><Icon name="close" size={22} /></button>
            </div>

            {(submissionsExam.questions || []).map((q) => {
              const answer = grading.submission.answers.find((a) => a.questionId === q._id);
              return (
                <div key={q._id} className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-3)' }}>
                  <strong>{q.questionText}</strong>
                  {q.imageUrl && (
                    <img src={q.imageUrl} alt="" style={{ display: 'block', maxWidth: 240, maxHeight: 160, borderRadius: 'var(--radius-md)', margin: 'var(--space-2) 0' }} />
                  )}
                  <p className="text-secondary text-sm" style={{ margin: 'var(--space-2) 0' }}>
                    Answer: {answer?.answer || <em>No answer given</em>}
                  </p>
                  {q.type === 'mcq' ? (
                    <p className="text-sm">
                      Correct answer: <strong>{q.correctAnswer}</strong> · Auto-scored: {answer?.marksAwarded ?? 0} / {q.marks}
                    </p>
                  ) : (
                    <div className="form-group" style={{ maxWidth: 160, marginBottom: 0 }}>
                      <label>Marks awarded (out of {q.marks})</label>
                      <input
                        type="number"
                        min={0}
                        max={q.marks}
                        value={grading.marks[q._id]}
                        onChange={(e) => setGrading({ ...grading, marks: { ...grading.marks, [q._id]: e.target.value } })}
                      />
                    </div>
                  )}
                </div>
              );
            })}

            <button className="btn btn-primary btn-full" onClick={saveGrades}>Save Grades</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Exams;

import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import SVGIcon from '../../components/icons/SVGIcon';

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

// Full CBT exam builder for teachers — the same capabilities as the admin
// console modal (question types, per-question images, CSV import, shuffle /
// show-results options), portal-styled. It always creates a DRAFT; publishing
// is admin-only and enforced by the backend, so there's no publish control.
const StaffExamForm = ({ division, classes = [], onClose, onCreated }) => {
  const { apiCall, token, API_BASE_URL } = useAuth();
  const divisionLocked = !!division;

  const [form, setForm] = useState({
    title: '',
    description: '',
    subject: '',
    division: division || 'primary',
    classesText: classes.join(', '),
    durationMinutes: 30,
    startTime: '',
    endTime: '',
    shuffleQuestions: false,
    showResultsImmediately: true,
    questions: []
  });
  // Set once the draft exists (first save or a CSV auto-create), so the final
  // save updates it rather than creating a duplicate.
  const [examId, setExamId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [csvUploading, setCsvUploading] = useState(false);
  const [uploadingImageKey, setUploadingImageKey] = useState(null);
  const [knownClasses, setKnownClasses] = useState([]);

  const fetchKnownClasses = async (div) => {
    if (!div) { setKnownClasses([]); return; }
    try {
      const { data } = await apiCall(`/admin/classes?division=${div}`);
      if (data.success) setKnownClasses(data.data || []);
    } catch { /* non-fatal — datalist is a convenience */ }
  };

  useEffect(() => {
    fetchKnownClasses(form.division);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // A CSV can be uploaded before the exam has been saved — create the draft
  // from whatever metadata is filled in so the CSV has an exam to attach to.
  const ensureExamId = async () => {
    if (examId) return examId;
    if (!form.title.trim() || !form.startTime || !form.endTime) {
      setError('Fill in the title, start time, and end time before uploading a CSV.');
      return null;
    }
    const payload = { ...buildMetadataPayload(), questions: [] };
    const { data } = await apiCall('/admin/exams', { method: 'POST', body: JSON.stringify(payload) });
    if (!data.success) {
      setError(data.message || data.errors?.[0]?.msg || 'Failed to create exam before CSV upload');
      return null;
    }
    setExamId(data.data._id);
    return data.data._id;
  };

  const downloadCsvTemplate = () => {
    const rows = [
      'questionText,type,marks,option1,option2,option3,option4,correctAnswer,imageUrl',
      '"What is 2 + 2?",mcq,1,2,3,4,5,4,',
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

  const mapQuestions = (qs) => qs.map((q) => ({
    key: q._id,
    questionText: q.questionText,
    type: q.type,
    marks: q.marks,
    options: q.options?.length ? q.options : ['', ''],
    correctAnswer: q.correctAnswer || '',
    imageUrl: q.imageUrl || ''
  }));

  const handleCsvUpload = async (file) => {
    if (!file) return;
    setError('');
    setNotice('');
    const id = await ensureExamId();
    if (!id) return;
    setCsvUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await fetch(`${API_BASE_URL}/admin/exams/${id}/questions/csv`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      const data = await response.json();
      if (data.success) {
        setForm((f) => ({ ...f, questions: mapQuestions(data.data.questions) }));
        setNotice(data.message + (data.warnings?.length ? ` (skipped ${data.warnings.length})` : ''));
      } else {
        setError(data.message || 'CSV upload failed');
      }
    } catch {
      setError('Network error during CSV upload');
    }
    setCsvUploading(false);
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
      if (data.success) updateQuestion(key, { imageUrl: data.data.url });
      else setError(data.message || 'Image upload failed');
    } catch {
      setError('Network error during image upload');
    }
    setUploadingImageKey(null);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.title.trim() || form.title.trim().length < 3) return setError('Title must be at least 3 characters.');
    if (!form.division) return setError('Select a division.');
    if (!form.startTime || !form.endTime) return setError('Start and end time are required.');

    for (const q of form.questions) {
      if (q.type === 'mcq') {
        const options = q.options.map((o) => o.trim()).filter(Boolean);
        if (options.length < 2) return setError(`"${q.questionText || 'Untitled question'}" needs at least 2 non-empty options`);
        if (!q.correctAnswer || !options.includes(q.correctAnswer)) return setError(`"${q.questionText || 'Untitled question'}" needs a correct answer matching one of its options`);
      }
    }

    setIsSubmitting(true);
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

    const { data } = examId
      ? await apiCall(`/admin/exams/${examId}`, { method: 'PATCH', body: JSON.stringify(payload) })
      : await apiCall('/admin/exams', { method: 'POST', body: JSON.stringify(payload) });

    if (data.success) {
      onCreated?.();
      onClose();
    } else {
      setError(data.message || data.errors?.[0]?.msg || 'Failed to save exam');
    }
    setIsSubmitting(false);
  };

  const totalMarks = form.questions.reduce((s, q) => s + (Number(q.marks) || 0), 0);

  return (
    <div className="portal-modal-backdrop" onClick={onClose}>
      <div className="portal-modal" style={{ maxWidth: 760 }} onClick={(e) => e.stopPropagation()}>
        <div className="portal-modal-header">
          <h2>New Exam</h2>
          <button className="portal-modal-close" onClick={onClose} aria-label="Close"><SVGIcon name="close" size="22" /></button>
        </div>
        <div className="portal-modal-body">
          {error && (
            <div className="error-message" style={{ marginBottom: 'var(--space-4)' }}>
              <SVGIcon name="alert-circle" size="20" /><span>{error}</span>
            </div>
          )}
          {notice && (
            <div className="success-message" style={{ marginBottom: 'var(--space-4)' }}>
              <SVGIcon name="checkCircle" size="20" /><span>{notice}</span>
            </div>
          )}

          <form onSubmit={handleSave}>
            <div className="form-group">
              <label className="form-label">Title</label>
              <input className="form-input" required minLength={3} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Mathematics — Mid-term Test" />
            </div>

            <div className="form-group">
              <label className="form-label">Description (optional)</label>
              <textarea className="form-input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>

            <div className="portal-form-row">
              <div className="form-group">
                <label className="form-label">Subject (optional)</label>
                <input className="form-input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="e.g. Mathematics" />
              </div>
              <div className="form-group">
                <label className="form-label">Division</label>
                <select
                  className="form-input"
                  value={form.division}
                  disabled={divisionLocked}
                  onChange={(e) => { setForm({ ...form, division: e.target.value }); fetchKnownClasses(e.target.value); }}
                >
                  {DIVISIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Classes <span className="text-secondary">(comma-separated; blank = whole division)</span></label>
              <input className="form-input" list="known-exam-classes" value={form.classesText} onChange={(e) => setForm({ ...form, classesText: e.target.value })} placeholder="e.g. Primary 5" />
              <datalist id="known-exam-classes">
                {knownClasses.map((c) => <option key={c} value={c} />)}
              </datalist>
              {knownClasses.length > 0 && (
                <p className="text-secondary text-sm" style={{ marginTop: 'var(--space-1)' }}>In use: {knownClasses.join(', ')}.</p>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Duration (minutes)</label>
              <input className="form-input" type="number" min={1} required value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} />
            </div>

            <div className="portal-form-row">
              <div className="form-group">
                <label className="form-label">Start time</label>
                <input className="form-input" type="datetime-local" required value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">End time</label>
                <input className="form-input" type="datetime-local" required value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
              <input type="checkbox" checked={form.shuffleQuestions} onChange={(e) => setForm({ ...form, shuffleQuestions: e.target.checked })} />
              Shuffle question order per student
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
              <input type="checkbox" checked={form.showResultsImmediately} onChange={(e) => setForm({ ...form, showResultsImmediately: e.target.checked })} />
              Show results immediately after submission
            </label>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-3)' }}>
              <h4 style={{ margin: 0 }}>Questions ({form.questions.length}, {totalMarks} marks)</h4>
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-outline btn-sm" onClick={downloadCsvTemplate}>CSV Template</button>
                <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer' }}>
                  {csvUploading ? <SVGIcon name="loader" size="14" className="spinning" /> : 'Upload CSV'}
                  <input type="file" accept=".csv" hidden onChange={(e) => handleCsvUpload(e.target.files?.[0])} disabled={csvUploading} />
                </label>
                <button type="button" className="btn btn-outline btn-sm" onClick={addQuestion}>+ Add Question</button>
              </div>
            </div>

            {form.questions.map((q, qIndex) => (
              <div key={q.key} className="card" style={{ marginBottom: 'var(--space-3)' }}>
                <div className="card-body" style={{ padding: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
                    <strong>Question {qIndex + 1}</strong>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => removeQuestion(q.key)}><SVGIcon name="close" size="14" /></button>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Question text</label>
                    <textarea className="form-input" rows={2} required value={q.questionText} onChange={(e) => updateQuestion(q.key, { questionText: e.target.value })} />
                  </div>
                  <div className="portal-form-row">
                    <div className="form-group">
                      <label className="form-label">Type</label>
                      <select className="form-input" value={q.type} onChange={(e) => updateQuestion(q.key, { type: e.target.value })}>
                        {QUESTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Marks</label>
                      <input className="form-input" type="number" min={1} required value={q.marks} onChange={(e) => updateQuestion(q.key, { marks: e.target.value })} />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Image (optional)</label>
                    {q.imageUrl ? (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                        <img src={q.imageUrl} alt="" style={{ maxWidth: 180, maxHeight: 130, borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }} />
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => updateQuestion(q.key, { imageUrl: '' })}>Remove Image</button>
                      </div>
                    ) : (
                      <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer', display: 'inline-flex', width: 'fit-content' }}>
                        {uploadingImageKey === q.key ? <SVGIcon name="loader" size="14" className="spinning" /> : 'Add Image'}
                        <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={uploadingImageKey === q.key} onChange={(e) => handleQuestionImageUpload(q.key, e.target.files?.[0])} />
                      </label>
                    )}
                  </div>

                  {q.type === 'mcq' && (
                    <div className="form-group">
                      <label className="form-label">Options (tick the correct answer)</label>
                      {q.options.map((option, oIndex) => (
                        <div key={oIndex} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                          <input
                            type="radio"
                            name={`correct-${q.key}`}
                            checked={q.correctAnswer === option && option !== ''}
                            onChange={() => updateQuestion(q.key, { correctAnswer: option })}
                          />
                          <input className="form-input" placeholder={`Option ${oIndex + 1}`} value={option} style={{ flex: 1 }} onChange={(e) => updateOption(q.key, oIndex, e.target.value)} />
                          {q.options.length > 2 && (
                            <button type="button" className="btn btn-outline btn-sm" onClick={() => removeOption(q.key, oIndex)}><SVGIcon name="close" size="12" /></button>
                          )}
                        </div>
                      ))}
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => addOption(q.key)}>+ Add Option</button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            <p className="text-secondary text-sm" style={{ marginBottom: 'var(--space-4)' }}>
              This saves as a draft. An administrator will publish it before students can take it.
            </p>

            <button type="submit" className="btn btn-primary btn-full" disabled={isSubmitting}>
              {isSubmitting ? <><SVGIcon name="loader" size="18" className="spinning" /> Saving…</> : 'Save Draft Exam'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default StaffExamForm;

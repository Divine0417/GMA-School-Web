import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import SVGIcon from '../../components/icons/SVGIcon';

const emptyMcq = () => ({ questionText: '', type: 'mcq', options: ['', '', '', ''], correctIndex: 0, marks: 1 });

const DIVISIONS = ['nursery', 'primary', 'secondary', 'college'];

// Compact exam builder for teachers, launched from the portal class overview.
// Creates a DRAFT exam (publishing is admin-only, enforced by the backend), so
// there's intentionally no publish toggle here. Division is fixed to the
// teacher's own division; the backend rejects anything else anyway.
const StaffExamForm = ({ division, classes = [], onClose, onCreated }) => {
  const { apiCall } = useAuth();
  // A scoped teacher's division is fixed; an unscoped staff/admin picks one.
  const divisionLocked = !!division;
  const [divisionValue, setDivisionValue] = useState(division || '');
  const [form, setForm] = useState({
    title: '',
    subject: '',
    durationMinutes: 30,
    startTime: '',
    endTime: '',
    classesText: classes.join(', ')
  });
  const [questions, setQuestions] = useState([emptyMcq()]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const updateQuestion = (i, patch) => setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  const updateOption = (qi, oi, value) => setQuestions((qs) => qs.map((q, idx) => {
    if (idx !== qi) return q;
    const options = [...q.options];
    options[oi] = value;
    return { ...q, options };
  }));
  const addQuestion = () => setQuestions((qs) => [...qs, emptyMcq()]);
  const removeQuestion = (i) => setQuestions((qs) => qs.filter((_, idx) => idx !== i));

  const submit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.title.trim() || form.title.trim().length < 3) return setError('Title must be at least 3 characters.');
    if (!divisionValue) return setError('Select a division.');
    if (!form.startTime || !form.endTime) return setError('Start and end time are required.');
    for (const q of questions) {
      if (!q.questionText.trim()) return setError('Every question needs text.');
      const filled = q.options.map((o) => o.trim()).filter(Boolean);
      if (filled.length < 2) return setError('Each question needs at least 2 options.');
      if (!q.options[q.correctIndex]?.trim()) return setError('Mark the correct option for every question.');
    }

    setSubmitting(true);
    const payload = {
      title: form.title.trim(),
      subject: form.subject || undefined,
      division: divisionValue,
      classes: form.classesText.split(',').map((c) => c.trim()).filter(Boolean),
      durationMinutes: Number(form.durationMinutes),
      startTime: new Date(form.startTime).toISOString(),
      endTime: new Date(form.endTime).toISOString(),
      questions: questions.map((q) => {
        const options = q.options.map((o) => o.trim()).filter(Boolean);
        return {
          questionText: q.questionText.trim(),
          type: 'mcq',
          options,
          correctAnswer: q.options[q.correctIndex].trim(),
          marks: Number(q.marks) || 1
        };
      })
    };
    const { data } = await apiCall('/admin/exams', { method: 'POST', body: JSON.stringify(payload) });
    if (data.success) {
      onCreated?.();
      onClose();
    } else {
      setError(data.message || data.errors?.[0]?.msg || 'Failed to create exam');
    }
    setSubmitting(false);
  };

  return (
    <div className="portal-modal-backdrop" onClick={onClose}>
      <div className="portal-modal" onClick={(e) => e.stopPropagation()}>
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

          <form onSubmit={submit}>
            <div className="form-group">
              <label className="form-label">Title</label>
              <input className="form-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Mathematics — Mid-term Test" />
            </div>

            <div className="portal-form-row">
              <div className="form-group">
                <label className="form-label">Subject (optional)</label>
                <input className="form-input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Duration (minutes)</label>
                <input className="form-input" type="number" min="1" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} />
              </div>
            </div>

            <div className="portal-form-row">
              <div className="form-group">
                <label className="form-label">Start Time</label>
                <input className="form-input" type="datetime-local" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">End Time</label>
                <input className="form-input" type="datetime-local" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
              </div>
            </div>

            {divisionLocked ? (
              <div className="form-group">
                <label className="form-label">Classes <span className="text-secondary">(within {divisionValue}; blank = all)</span></label>
                <input className="form-input" value={form.classesText} onChange={(e) => setForm({ ...form, classesText: e.target.value })} placeholder="e.g. Primary 4, Primary 5" />
              </div>
            ) : (
              <div className="portal-form-row">
                <div className="form-group">
                  <label className="form-label">Division</label>
                  <select className="form-input" value={divisionValue} onChange={(e) => setDivisionValue(e.target.value)}>
                    <option value="">Select division…</option>
                    {DIVISIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Classes <span className="text-secondary">(blank = all)</span></label>
                  <input className="form-input" value={form.classesText} onChange={(e) => setForm({ ...form, classesText: e.target.value })} placeholder="e.g. Primary 4, Primary 5" />
                </div>
              </div>
            )}

            <label className="form-label" style={{ marginTop: 'var(--space-2)' }}>Questions (multiple choice)</label>
            {questions.map((q, qi) => (
              <div key={qi} className="card" style={{ marginBottom: 'var(--space-3)' }}>
                <div className="card-body" style={{ padding: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                    <strong className="text-sm">Question {qi + 1}</strong>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => removeQuestion(qi)} disabled={questions.length === 1}>
                      <SVGIcon name="close" size="14" />
                    </button>
                  </div>
                  <div className="form-group">
                    <textarea className="form-input" rows={2} placeholder="Question text" value={q.questionText} onChange={(e) => updateQuestion(qi, { questionText: e.target.value })} />
                  </div>
                  <p className="text-secondary text-sm" style={{ marginBottom: 'var(--space-2)' }}>Tick the correct answer.</p>
                  {q.options.map((opt, oi) => (
                    <div key={oi} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                      <input
                        type="radio"
                        name={`correct-${qi}`}
                        checked={q.correctIndex === oi}
                        onChange={() => updateQuestion(qi, { correctIndex: oi })}
                        aria-label={`Mark option ${oi + 1} correct`}
                      />
                      <input className="form-input" placeholder={`Option ${oi + 1}`} value={opt} onChange={(e) => updateOption(qi, oi, e.target.value)} />
                    </div>
                  ))}
                  <div className="form-group" style={{ maxWidth: 140, marginTop: 'var(--space-2)' }}>
                    <label className="form-label">Marks</label>
                    <input className="form-input" type="number" min="1" value={q.marks} onChange={(e) => updateQuestion(qi, { marks: e.target.value })} />
                  </div>
                </div>
              </div>
            ))}
            <button type="button" className="btn btn-outline btn-sm" onClick={addQuestion} style={{ marginBottom: 'var(--space-4)' }}>+ Add question</button>

            <p className="text-secondary text-sm" style={{ marginBottom: 'var(--space-4)' }}>
              This saves as a draft. An administrator will publish it before students can take it.
            </p>

            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? <><SVGIcon name="loader" size="18" className="spinning" /> Saving…</> : 'Save Draft Exam'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default StaffExamForm;

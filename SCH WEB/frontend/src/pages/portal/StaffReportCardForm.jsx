import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import SVGIcon from '../../components/icons/SVGIcon';

const emptySubject = { name: '', ca1: '', ca2: '', exam: '' };

// A compact report-card entry form for teachers, used from the portal class
// roster. It always creates a DRAFT — publishing is admin-only and enforced by
// the backend, so there's deliberately no publish control here.
const StaffReportCardForm = ({ student, onClose, onCreated }) => {
  const { apiCall } = useAuth();
  const [form, setForm] = useState({
    term: 'first',
    session: '2024/2025',
    subjects: [{ ...emptySubject }],
    attendance: { daysPresent: '', daysAbsent: '', totalDays: '' },
    position: '',
    numberInClass: '',
    classTeacherComment: '',
    nextTermBeginsDate: ''
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const updateSubject = (i, field, value) => {
    setForm((prev) => {
      const subjects = [...prev.subjects];
      subjects[i] = { ...subjects[i], [field]: value };
      return { ...prev, subjects };
    });
  };
  const addSubject = () => setForm((p) => ({ ...p, subjects: [...p.subjects, { ...emptySubject }] }));
  const removeSubject = (i) => setForm((p) => ({ ...p, subjects: p.subjects.filter((_, idx) => idx !== i) }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.subjects.length === 0 || form.subjects.some((s) => !s.name.trim())) {
      setError('Every subject needs a name.');
      return;
    }
    setSubmitting(true);
    const payload = {
      studentId: student._id,
      term: form.term,
      session: form.session,
      subjects: form.subjects.map((s) => ({
        name: s.name.trim(),
        ca1: s.ca1 === '' ? 0 : parseFloat(s.ca1),
        ca2: s.ca2 === '' ? 0 : parseFloat(s.ca2),
        exam: s.exam === '' ? 0 : parseFloat(s.exam)
      })),
      attendance: {
        daysPresent: form.attendance.daysPresent === '' ? undefined : parseInt(form.attendance.daysPresent),
        daysAbsent: form.attendance.daysAbsent === '' ? undefined : parseInt(form.attendance.daysAbsent),
        totalDays: form.attendance.totalDays === '' ? undefined : parseInt(form.attendance.totalDays)
      },
      summary: {
        position: form.position || undefined,
        numberInClass: form.numberInClass === '' ? undefined : parseInt(form.numberInClass)
      },
      classTeacherComment: form.classTeacherComment || undefined,
      nextTermBeginsDate: form.nextTermBeginsDate || undefined
    };
    const { data } = await apiCall('/admin/report-cards/manual', { method: 'POST', body: JSON.stringify(payload) });
    if (data.success) {
      onCreated?.();
      onClose();
    } else {
      setError(data.message || data.errors?.[0]?.msg || 'Failed to create report card');
    }
    setSubmitting(false);
  };

  return (
    <div className="portal-modal-backdrop" onClick={onClose}>
      <div className="portal-modal" onClick={(e) => e.stopPropagation()}>
        <div className="portal-modal-header">
          <h2>New Report Card — {student.fullName}</h2>
          <button className="portal-modal-close" onClick={onClose} aria-label="Close"><SVGIcon name="close" size="22" /></button>
        </div>
        <div className="portal-modal-body">
          {error && (
            <div className="error-message" style={{ marginBottom: 'var(--space-4)' }}>
              <SVGIcon name="alert-circle" size="20" /><span>{error}</span>
            </div>
          )}

          <form onSubmit={submit}>
            <div className="portal-form-row">
              <div className="form-group">
                <label className="form-label">Term</label>
                <select className="form-input" value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })}>
                  <option value="first">First</option>
                  <option value="second">Second</option>
                  <option value="third">Third</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Session</label>
                <input className="form-input" value={form.session} onChange={(e) => setForm({ ...form, session: e.target.value })} placeholder="2024/2025" />
              </div>
            </div>

            <label className="form-label" style={{ marginTop: 'var(--space-2)' }}>Subjects &amp; Scores</label>
            <p className="text-secondary text-sm" style={{ marginBottom: 'var(--space-2)' }}>Subject · CA1 · CA2 · Exam — grades are computed automatically.</p>
            {form.subjects.map((s, i) => (
              <div className="rc-subject-row" key={i}>
                <input className="form-input" placeholder="Subject" value={s.name} onChange={(e) => updateSubject(i, 'name', e.target.value)} />
                <input className="form-input" type="number" placeholder="CA1" value={s.ca1} onChange={(e) => updateSubject(i, 'ca1', e.target.value)} />
                <input className="form-input" type="number" placeholder="CA2" value={s.ca2} onChange={(e) => updateSubject(i, 'ca2', e.target.value)} />
                <input className="form-input" type="number" placeholder="Exam" value={s.exam} onChange={(e) => updateSubject(i, 'exam', e.target.value)} />
                <button type="button" className="btn btn-outline btn-sm" onClick={() => removeSubject(i)} disabled={form.subjects.length === 1} aria-label="Remove subject">
                  <SVGIcon name="close" size="14" />
                </button>
              </div>
            ))}
            <button type="button" className="btn btn-outline btn-sm" onClick={addSubject} style={{ marginBottom: 'var(--space-4)' }}>+ Add subject</button>

            <div className="portal-form-row">
              <div className="form-group">
                <label className="form-label">Position (optional)</label>
                <input className="form-input" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="e.g. 3rd" />
              </div>
              <div className="form-group">
                <label className="form-label">Number in Class (optional)</label>
                <input className="form-input" type="number" value={form.numberInClass} onChange={(e) => setForm({ ...form, numberInClass: e.target.value })} />
              </div>
            </div>

            <div className="portal-form-row">
              <div className="form-group">
                <label className="form-label">Days Present</label>
                <input className="form-input" type="number" value={form.attendance.daysPresent} onChange={(e) => setForm({ ...form, attendance: { ...form.attendance, daysPresent: e.target.value } })} />
              </div>
              <div className="form-group">
                <label className="form-label">Total Days</label>
                <input className="form-input" type="number" value={form.attendance.totalDays} onChange={(e) => setForm({ ...form, attendance: { ...form.attendance, totalDays: e.target.value } })} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Class Teacher's Comment (optional)</label>
              <textarea className="form-input" rows={2} value={form.classTeacherComment} onChange={(e) => setForm({ ...form, classTeacherComment: e.target.value })} />
            </div>

            <div className="form-group">
              <label className="form-label">Next Term Begins (optional)</label>
              <input className="form-input" type="date" value={form.nextTermBeginsDate} onChange={(e) => setForm({ ...form, nextTermBeginsDate: e.target.value })} />
            </div>

            <p className="text-secondary text-sm" style={{ marginBottom: 'var(--space-4)' }}>
              This saves as a draft. An administrator will publish it before parents/students can see it.
            </p>

            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? <><SVGIcon name="loader" size="18" className="spinning" /> Saving…</> : 'Save Draft Report Card'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default StaffReportCardForm;

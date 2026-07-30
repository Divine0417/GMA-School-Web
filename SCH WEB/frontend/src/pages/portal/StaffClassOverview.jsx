import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useSelectedChild } from '../../contexts/SelectedChildContext';
import SVGIcon from '../../components/icons/SVGIcon';
import StaffExamForm from './StaffExamForm';
import StaffReportCardForm from './StaffReportCardForm';

const greetingForNow = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

const initials = (name = '') =>
  name.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0]?.toUpperCase()).join('');

// The staff/admin portal landing. Instead of forcing a single student to be
// picked before anything shows, this lists every student in the signed-in
// staff member's scope (the backend already restricts /admin/students to their
// division/class). Clicking a student selects them and opens their records.
const StaffClassOverview = () => {
  const { user, apiCall } = useAuth();
  const { selectStudent } = useSelectedChild();
  const navigate = useNavigate();

  const [students, setStudents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [showExamForm, setShowExamForm] = useState(false);
  const [reportStudent, setReportStudent] = useState(null);
  const [flash, setFlash] = useState('');

  // Teachers (and admins) can prepare exams and report cards as drafts;
  // bursars have no academic duties, so they don't get these actions.
  const canManageAcademics = user?.role === 'admin'
    || user?.staffType === 'class_teacher'
    || user?.staffType === 'subject_teacher';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      const { data } = await apiCall('/admin/students?status=active&limit=100');
      if (cancelled) return;
      if (data.success) setStudents(data.data.students || []);
      else setError(data.message || 'Failed to load your class');
      setIsLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    const classes = new Set();
    let boys = 0;
    let girls = 0;
    students.forEach((s) => {
      if (s.class) classes.add(s.class);
      if (s.gender === 'male') boys += 1;
      else if (s.gender === 'female') girls += 1;
    });
    return { total: students.length, classes: classes.size, boys, girls };
  }, [students]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) =>
      s.fullName?.toLowerCase().includes(q) ||
      s.regNumber?.toLowerCase().includes(q) ||
      s.class?.toLowerCase().includes(q)
    );
  }, [students, query]);

  const openStudent = (student) => {
    selectStudent(student);
    navigate('/portal/report-cards');
  };

  const scopeLabel = user?.classes?.length
    ? user.classes.join(', ')
    : (user?.division ? `All ${user.division} classes` : 'All divisions');

  if (isLoading) {
    return (
      <div className="dashboard-loading">
        <SVGIcon name="loader" size="48" className="spinning" />
        <p>Loading your class...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-error">
        <SVGIcon name="alert-circle" size="48" />
        <h3>Unable to load your class</h3>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="dashboard class-overview">
      <div className="co-hero">
        <div className="co-hero-main">
          <h1 className="co-hero-title">{greetingForNow()}{user?.name ? `, ${user.name}` : ''}</h1>
          <p className="co-hero-sub">Here is your class at a glance.</p>
          <span className="co-hero-scope">
            <SVGIcon name="users" size="14" />
            {user?.division ? `${user.division} · ` : ''}{scopeLabel}
          </span>
        </div>
      </div>

      <div className="co-stats">
        <div className="co-stat">
          <span className="co-stat-value">{stats.total}</span>
          <span className="co-stat-label">Total Students</span>
        </div>
        <div className="co-stat">
          <span className="co-stat-value">{stats.classes}</span>
          <span className="co-stat-label">{stats.classes === 1 ? 'Class' : 'Classes'}</span>
        </div>
        <div className="co-stat">
          <span className="co-stat-value">{stats.boys}</span>
          <span className="co-stat-label">Boys</span>
        </div>
        <div className="co-stat">
          <span className="co-stat-value">{stats.girls}</span>
          <span className="co-stat-label">Girls</span>
        </div>
      </div>

      {flash && (
        <div className="success-message" style={{ marginBottom: 'var(--space-4)' }}>
          <SVGIcon name="checkCircle" size="20" /><span>{flash}</span>
        </div>
      )}

      <div className="co-roster-head">
        <h2>Students</h2>
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
          {canManageAcademics && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowExamForm(true)}>
              <SVGIcon name="file-text" size="16" /> New Exam
            </button>
          )}
          <div className="co-search">
            <input
              type="text"
              placeholder="Search by name, reg no. or class"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search students"
            />
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <SVGIcon name="users" size="48" />
          <p>{students.length === 0 ? 'No students found in your assigned class yet.' : 'No students match your search.'}</p>
        </div>
      ) : (
        <div className="co-roster">
          {filtered.map((s) => (
            <div key={s._id} className="co-student">
              <button className="co-student-open" onClick={() => openStudent(s)}>
                <div className="co-student-avatar">
                  {s.photoUrl ? <img src={s.photoUrl} alt={s.fullName} /> : <span>{initials(s.fullName)}</span>}
                </div>
                <div className="co-student-info">
                  <span className="co-student-name">{s.fullName}</span>
                  <span className="co-student-meta">{s.regNumber}{s.class ? ` · ${s.class}` : ''}</span>
                </div>
              </button>
              {canManageAcademics && (
                <div className="co-student-actions">
                  <button className="btn btn-outline btn-sm" onClick={() => setReportStudent(s)} title="Add report card">
                    <SVGIcon name="file-text" size="14" /> Report
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showExamForm && (
        <StaffExamForm
          division={user?.division}
          classes={user?.classes || []}
          onClose={() => setShowExamForm(false)}
          onCreated={() => setFlash('Exam saved as a draft. An administrator will publish it.')}
        />
      )}

      {reportStudent && (
        <StaffReportCardForm
          student={reportStudent}
          onClose={() => setReportStudent(null)}
          onCreated={() => setFlash(`Draft report card saved for ${reportStudent.fullName}. An administrator will publish it.`)}
        />
      )}
    </div>
  );
};

export default StaffClassOverview;

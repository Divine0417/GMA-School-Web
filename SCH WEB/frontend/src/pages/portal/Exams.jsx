import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useSelectedChild } from '../../contexts/SelectedChildContext';
import SVGIcon from '../../components/icons/SVGIcon';

const STATUS_LABEL = {
  not_started: 'Not started',
  in_progress: 'In progress',
  submitted: 'Submitted',
  graded: 'Graded'
};

const Exams = () => {
  const { user, apiCall } = useAuth();
  const { selectedChildId } = useSelectedChild();
  const [tab, setTab] = useState('upcoming');
  const [exams, setExams] = useState([]);
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const canTakeExams = user?.role === 'student';

  useEffect(() => {
    const load = async () => {
      if (!selectedChildId) return;
      setIsLoading(true);
      setError('');
      const [examsRes, historyRes] = await Promise.all([
        apiCall(`/student/${selectedChildId}/exams`),
        apiCall(`/student/${selectedChildId}/exam-history`)
      ]);
      if (examsRes.data.success) setExams(examsRes.data.data);
      else setError(examsRes.data.message || 'Failed to load exams');
      if (historyRes.data.success) setHistory(historyRes.data.data);
      setIsLoading(false);
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChildId]);

  if (!selectedChildId) {
    return (
      <div className="dashboard">
        <div className="card"><div className="card-body"><p>Select a student to view exams.</p></div></div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div className="welcome-section">
          <h1>CBT Exams</h1>
        </div>
      </div>

      <div className="filter-bar" style={{ marginBottom: 'var(--space-5)' }}>
        <button className={`btn btn-sm ${tab === 'upcoming' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('upcoming')}>Upcoming / Active</button>
        <button className={`btn btn-sm ${tab === 'history' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('history')}>History</button>
      </div>

      {error && (
        <div className="error-message" style={{ marginBottom: 'var(--space-4)' }}>
          <SVGIcon name="alert-circle" size="20" />
          <span>{error}</span>
        </div>
      )}

      {isLoading ? (
        <div className="dashboard-loading">
          <SVGIcon name="loader" size="48" className="spinning" />
          <p>Loading exams...</p>
        </div>
      ) : tab === 'upcoming' ? (
        exams.length === 0 ? (
          <div className="card"><div className="card-body" style={{ textAlign: 'center' }}>
            <SVGIcon name="clock" size="48" />
            <p>No exams scheduled right now.</p>
          </div></div>
        ) : (
          <div className="card">
            <div className="card-body" style={{ padding: 0 }}>
              {exams.map((exam) => (
                <div key={exam._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--color-border-light)' }}>
                  <div>
                    <strong>{exam.title}</strong>
                    <div className="text-secondary" style={{ fontSize: 'var(--text-sm)' }}>
                      {exam.subject ? `${exam.subject} · ` : ''}{exam.durationMinutes} min · {exam.totalMarks} marks
                    </div>
                    <div className="text-secondary" style={{ fontSize: 'var(--text-sm)' }}>
                      {new Date(exam.startTime).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                      {' – '}
                      {new Date(exam.endTime).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="text-secondary text-sm" style={{ marginBottom: 'var(--space-2)' }}>{STATUS_LABEL[exam.submissionStatus]}</div>
                    {exam.submissionStatus === 'submitted' || exam.submissionStatus === 'graded' ? (
                      <Link className="btn btn-outline btn-sm" to={`/portal/exams/${exam._id}/result`}>View Result</Link>
                    ) : canTakeExams ? (
                      <Link className="btn btn-primary btn-sm" to={`/exam/${exam._id}`}>
                        {exam.submissionStatus === 'in_progress' ? 'Continue Exam' : 'Start Exam'}
                      </Link>
                    ) : (
                      <span className="text-secondary text-sm">Student only</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      ) : history.length === 0 ? (
        <div className="card"><div className="card-body" style={{ textAlign: 'center' }}>
          <SVGIcon name="clock" size="48" />
          <p>No past exams yet.</p>
        </div></div>
      ) : (
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            {history.map((s) => (
              <div key={s._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--color-border-light)' }}>
                <div>
                  <strong>{s.examId?.title}</strong>
                  <div className="text-secondary" style={{ fontSize: 'var(--text-sm)' }}>
                    {s.examId?.subject ? `${s.examId.subject} · ` : ''}Submitted {new Date(s.submittedAt).toLocaleDateString('en-GB')}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="text-secondary text-sm" style={{ marginBottom: 'var(--space-2)' }}>
                    {s.status === 'graded' ? `${s.score} / ${s.maxScore}` : 'Pending grading'}
                  </div>
                  <Link className="btn btn-outline btn-sm" to={`/portal/exams/${s.examId?._id}/result`}>View Result</Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Exams;

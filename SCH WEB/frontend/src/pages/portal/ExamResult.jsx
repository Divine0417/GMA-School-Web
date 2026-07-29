import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useSelectedChild } from '../../contexts/SelectedChildContext';
import SVGIcon from '../../components/icons/SVGIcon';

const ExamResult = () => {
  const { examId } = useParams();
  const { apiCall } = useAuth();
  const { selectedChildId } = useSelectedChild();
  const [result, setResult] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!selectedChildId) return;
      setIsLoading(true);
      const { data } = await apiCall(`/student/${selectedChildId}/exams/${examId}/result`);
      if (data.success) setResult(data.data);
      else setError(data.message || 'Result not available yet');
      setIsLoading(false);
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChildId, examId]);

  if (isLoading) {
    return (
      <div className="dashboard-loading">
        <SVGIcon name="loader" size="48" className="spinning" />
        <p>Loading result...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard">
        <div className="error-message" style={{ marginBottom: 'var(--space-4)' }}>
          <SVGIcon name="alert-circle" size="20" />
          <span>{error}</span>
        </div>
        <Link className="btn btn-outline btn-sm" to="/portal/exams">Back to Exams</Link>
      </div>
    );
  }

  if (result.pending) {
    return (
      <div className="dashboard">
        <div className="card"><div className="card-body" style={{ textAlign: 'center' }}>
          <SVGIcon name="clock" size="48" />
          <p>Submitted on {new Date(result.submittedAt).toLocaleString('en-GB')}. Results will be available once grading is complete.</p>
        </div></div>
        <Link className="btn btn-outline btn-sm" to="/portal/exams" style={{ marginTop: 'var(--space-4)', display: 'inline-block' }}>Back to Exams</Link>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div className="welcome-section">
          <h1>Exam Result</h1>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 'var(--space-5)' }}>
        <div className="card-body" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 'var(--text-3xl, 2rem)', fontWeight: 700 }}>{result.score} / {result.maxScore}</div>
          <p className="text-secondary">
            {result.status === 'graded' ? 'Fully graded' : 'Auto-graded portion shown — some answers still pending manual grading'}
            {result.autoSubmitted ? ' · auto-submitted at time limit' : ''}
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {result.breakdown.map((q, i) => (
            <div key={i} style={{ padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--color-border-light)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                <strong>Q{i + 1}. {q.questionText}</strong>
                <span className="text-secondary text-sm" style={{ whiteSpace: 'nowrap' }}>
                  {q.marksAwarded ?? '—'} / {q.marks}
                </span>
              </div>
              {q.imageUrl && (
                <img src={q.imageUrl} alt="" style={{ display: 'block', maxWidth: '100%', maxHeight: 200, borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-light)', margin: 'var(--space-2) 0' }} />
              )}
              <p className="text-secondary text-sm" style={{ margin: 'var(--space-2) 0 0' }}>
                Your answer: {q.yourAnswer || <em>No answer given</em>}
              </p>
              {q.type === 'mcq' && q.correctAnswer && q.yourAnswer !== q.correctAnswer && (
                <p className="text-secondary text-sm" style={{ margin: 'var(--space-1) 0 0' }}>
                  Correct answer: {q.correctAnswer}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      <Link className="btn btn-outline btn-sm" to="/portal/exams" style={{ marginTop: 'var(--space-4)', display: 'inline-block' }}>Back to Exams</Link>
    </div>
  );
};

export default ExamResult;

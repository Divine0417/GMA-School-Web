import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import SVGIcon from '../../components/icons/SVGIcon';
import '../../styles/exam.css';

const formatTime = (totalSeconds) => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

const ExamTake = () => {
  const { examId } = useParams();
  const navigate = useNavigate();
  const { user, apiCall } = useAuth();
  const selectedChildId = user?.student?.id;

  const [phase, setPhase] = useState('loading'); // loading | intro | active | submitting | error
  const [error, setError] = useState('');
  const [exam, setExam] = useState(null);
  const [answers, setAnswers] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [violationBanner, setViolationBanner] = useState('');

  const deadlineRef = useRef(null);
  const submittedRef = useRef(false);
  const dirtyRef = useRef(new Set());

  const saveAnswer = useCallback(async (questionId, answer) => {
    if (!selectedChildId) return;
    await apiCall(`/student/${selectedChildId}/exams/${examId}/answer`, {
      method: 'PATCH',
      body: JSON.stringify({ questionId, answer })
    });
    dirtyRef.current.delete(questionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChildId, examId]);

  const beginExam = async () => {
    // Fullscreen must be requested from within this user-gesture handler —
    // browsers reject requestFullscreen() called outside a click/tap.
    try {
      await document.documentElement.requestFullscreen?.();
    } catch {
      // Fullscreen isn't critical — continue even if the browser/device blocks it.
    }

    const { data } = await apiCall(`/student/${selectedChildId}/exams/${examId}/start`, { method: 'POST' });
    if (!data.success) {
      setError(data.message || 'Unable to start this exam');
      setPhase('error');
      return;
    }

    const initialAnswers = {};
    data.data.submission.answers.forEach((a) => { initialAnswers[a.questionId] = a.answer; });

    setExam(data.data.exam);
    setAnswers(initialAnswers);
    deadlineRef.current = new Date(data.data.deadline);
    setRemainingSeconds(Math.max(0, Math.floor((deadlineRef.current - new Date()) / 1000)));
    setPhase('active');
  };

  useEffect(() => {
    if (!selectedChildId) return;
    setPhase('intro');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChildId]);

  const handleSubmit = useCallback(async (autoSubmitted = false) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setPhase('submitting');

    // Flush any answer not yet confirmed saved.
    await Promise.all([...dirtyRef.current].map((qid) => saveAnswer(qid, answers[qid] || '')));

    await apiCall(`/student/${selectedChildId}/exams/${examId}/submit`, {
      method: 'POST',
      body: JSON.stringify({ autoSubmitted })
    });

    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    navigate(`/portal/exams/${examId}/result`, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, selectedChildId, examId]);

  // Countdown ticker
  useEffect(() => {
    if (phase !== 'active') return;
    const interval = setInterval(() => {
      const secondsLeft = Math.max(0, Math.floor((deadlineRef.current - new Date()) / 1000));
      setRemainingSeconds(secondsLeft);
      if (secondsLeft <= 0) {
        clearInterval(interval);
        handleSubmit(true);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [phase, handleSubmit]);

  // Safety-net autosave every 30s for whatever hasn't confirmed-saved yet.
  useEffect(() => {
    if (phase !== 'active') return;
    const interval = setInterval(() => {
      [...dirtyRef.current].forEach((qid) => saveAnswer(qid, answers[qid] || ''));
    }, 30000);
    return () => clearInterval(interval);
  }, [phase, answers, saveAnswer]);

  // Anti-cheat: tab-switch + fullscreen-exit detection
  useEffect(() => {
    if (phase !== 'active') return;

    const logViolation = async (type, message) => {
      setViolationBanner(message);
      await apiCall(`/student/${selectedChildId}/exams/${examId}/violation`, {
        method: 'POST',
        body: JSON.stringify({ type })
      });
    };

    const onVisibilityChange = () => {
      if (document.hidden) logViolation('tab_switch', 'You switched away from the exam. This has been recorded.');
    };
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) logViolation('fullscreen_exit', 'You exited fullscreen. This has been recorded.');
    };
    const blockEvent = (e) => e.preventDefault();
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ''; };

    document.addEventListener('visibilitychange', onVisibilityChange);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('copy', blockEvent);
    document.addEventListener('paste', blockEvent);
    document.addEventListener('cut', blockEvent);
    document.addEventListener('contextmenu', blockEvent);
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('copy', blockEvent);
      document.removeEventListener('paste', blockEvent);
      document.removeEventListener('cut', blockEvent);
      document.removeEventListener('contextmenu', blockEvent);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, selectedChildId, examId]);

  const setAnswer = (questionId, value) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    dirtyRef.current.add(questionId);
    saveAnswer(questionId, value);
  };

  if (!selectedChildId || phase === 'loading') {
    return (
      <div className="exam-shell">
        <div className="dashboard-loading"><SVGIcon name="loader" size="48" className="spinning" /></div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="exam-shell">
        <div className="exam-intro-card">
          <SVGIcon name="alert-circle" size="40" />
          <p>{error}</p>
          <button className="btn btn-primary" onClick={() => navigate('/portal/exams')}>Back to Exams</button>
        </div>
      </div>
    );
  }

  if (phase === 'intro') {
    return (
      <div className="exam-shell">
        <div className="exam-intro-card">
          <SVGIcon name="clock" size="40" />
          <h1>Ready to begin?</h1>
          <p className="text-secondary">
            This exam runs in fullscreen. Switching tabs, exiting fullscreen, or copy/paste will be recorded.
            Once started, the timer cannot be paused.
          </p>
          <button className="btn btn-primary" onClick={beginExam}>Begin Exam</button>
        </div>
      </div>
    );
  }

  if (phase === 'submitting') {
    return (
      <div className="exam-shell">
        <div className="dashboard-loading">
          <SVGIcon name="loader" size="48" className="spinning" />
          <p>Submitting your exam...</p>
        </div>
      </div>
    );
  }

  const question = exam.questions[currentIndex];
  const answeredCount = exam.questions.filter((q) => (answers[q._id] || '').trim() !== '').length;
  const isLowTime = remainingSeconds <= 60;

  return (
    <div className="exam-shell">
      <header className="exam-topbar">
        <div>
          <strong>{exam.title}</strong>
          <span className="text-secondary text-sm"> · {answeredCount}/{exam.questions.length} answered</span>
        </div>
        <div className={`exam-timer ${isLowTime ? 'exam-timer-low' : ''}`}>
          <SVGIcon name="clock" size="18" /> {formatTime(remainingSeconds)}
        </div>
      </header>

      {violationBanner && (
        <div className="exam-violation-banner">
          <SVGIcon name="alert-circle" size="16" /> {violationBanner}
        </div>
      )}

      <div className="exam-body">
        <aside className="exam-palette">
          {exam.questions.map((q, i) => (
            <button
              key={q._id}
              className={`exam-palette-item ${i === currentIndex ? 'active' : ''} ${(answers[q._id] || '').trim() ? 'answered' : ''}`}
              onClick={() => setCurrentIndex(i)}
            >
              {i + 1}
            </button>
          ))}
        </aside>

        <main className="exam-question-panel">
          <div className="exam-question-meta">Question {currentIndex + 1} of {exam.questions.length} · {question.marks} mark{question.marks === 1 ? '' : 's'}</div>
          <p className="exam-question-text">{question.questionText}</p>

          {question.type === 'mcq' ? (
            <div className="exam-options">
              {question.options.map((option) => (
                <label key={option} className="exam-option">
                  <input
                    type="radio"
                    name={question._id}
                    checked={answers[question._id] === option}
                    onChange={() => setAnswer(question._id, option)}
                  />
                  {option}
                </label>
              ))}
            </div>
          ) : (
            <textarea
              className="exam-textarea"
              rows={question.type === 'essay' ? 10 : 4}
              value={answers[question._id] || ''}
              onChange={(e) => setAnswer(question._id, e.target.value)}
              placeholder="Type your answer..."
            />
          )}

          <div className="exam-nav-buttons">
            <button className="btn btn-outline" disabled={currentIndex === 0} onClick={() => setCurrentIndex((i) => i - 1)}>Previous</button>
            {currentIndex < exam.questions.length - 1 ? (
              <button className="btn btn-outline" onClick={() => setCurrentIndex((i) => i + 1)}>Next</button>
            ) : (
              <button className="btn btn-primary" onClick={() => { if (window.confirm('Submit your exam? You cannot change your answers after this.')) handleSubmit(false); }}>
                Submit Exam
              </button>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default ExamTake;

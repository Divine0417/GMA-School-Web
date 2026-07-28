import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSelectedChild } from '../../contexts/SelectedChildContext';
import { useAuth } from '../../contexts/AuthContext';
import SVGIcon from '../../components/icons/SVGIcon';

const TYPES = ['all', 'document', 'video', 'link'];
const TYPE_ICON = { document: 'file-text', video: 'video', link: 'external-link' };
const TYPE_LABEL = { document: 'Document', video: 'Video', link: 'Link' };

const Resources = () => {
  const { apiCall } = useAuth();
  const { selectedChildId } = useSelectedChild();
  const [resources, setResources] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [type, setType] = useState('all');
  const [subject, setSubject] = useState('all');
  const requestIdRef = useRef(0);

  const fetchResources = async () => {
    if (!selectedChildId) return;
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError('');
    const { data } = await apiCall(`/student/${selectedChildId}/resources?type=${type}`);
    if (requestId !== requestIdRef.current) return;
    if (data.success) {
      setResources(data.data);
    } else {
      setError(data.message || 'Failed to load resources');
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchResources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChildId, type]);

  const subjects = useMemo(
    () => ['all', ...new Set(resources.map((r) => r.subject).filter(Boolean))],
    [resources]
  );

  const visibleResources = subject === 'all' ? resources : resources.filter((r) => r.subject === subject);

  const openResource = (resource) => {
    const url = resource.type === 'document' ? resource.fileUrl : resource.externalUrl;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (!selectedChildId) {
    return (
      <div className="dashboard">
        <div className="card">
          <div className="card-body">
            <p>Select a student to view learning resources.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div className="welcome-section">
          <h1>Learning Resources</h1>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', marginBottom: 'var(--space-5)' }}>
        <div className="form-group" style={{ maxWidth: 200, marginBottom: 0 }}>
          <select className="form-input" value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((t) => (
              <option key={t} value={t}>{t === 'all' ? 'All types' : TYPE_LABEL[t]}</option>
            ))}
          </select>
        </div>
        <div className="form-group" style={{ maxWidth: 200, marginBottom: 0 }}>
          <select className="form-input" value={subject} onChange={(e) => setSubject(e.target.value)}>
            {subjects.map((s) => (
              <option key={s} value={s}>{s === 'all' ? 'All subjects' : s}</option>
            ))}
          </select>
        </div>
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
          <p>Loading resources...</p>
        </div>
      ) : visibleResources.length === 0 ? (
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center' }}>
            <SVGIcon name="bookOpen" size="48" />
            <p>No learning resources available yet.</p>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            {visibleResources.map((resource) => (
              <button
                key={resource._id}
                onClick={() => openResource(resource)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 'var(--space-3)',
                  padding: 'var(--space-4) var(--space-5)',
                  background: 'none',
                  border: 'none',
                  borderBottom: '1px solid var(--color-border-light)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  font: 'inherit'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  <SVGIcon name={TYPE_ICON[resource.type]} size="20" />
                  <div>
                    <strong>{resource.title}</strong>
                    <div className="text-secondary" style={{ fontSize: 'var(--text-sm)' }}>
                      {TYPE_LABEL[resource.type]}{resource.subject ? ` · ${resource.subject}` : ''}
                    </div>
                    {resource.description && (
                      <div className="text-secondary" style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-1)' }}>
                        {resource.description}
                      </div>
                    )}
                  </div>
                </div>
                <SVGIcon name={resource.type === 'document' ? 'download' : 'external-link'} size="18" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Resources;

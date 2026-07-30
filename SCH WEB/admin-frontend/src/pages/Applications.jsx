import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Icon from '../components/Icon';

const STATUSES = ['pending', 'under_review', 'approved', 'rejected', 'waitlisted'];

const formatDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const formatDateTime = (d) => new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const emptyFeeForm = { amount: '', paid: false };
const emptyInterviewForm = { date: '', time: '', location: '', notes: '', attended: false };

const Applications = () => {
  const { apiCall } = useAuth();
  const [applications, setApplications] = useState([]);
  const [pagination, setPagination] = useState({ current: 1, total: 1 });
  const [statusFilter, setStatusFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [conditionsText, setConditionsText] = useState('');
  const [feeForm, setFeeForm] = useState(emptyFeeForm);
  const [isSavingFee, setIsSavingFee] = useState(false);
  const [interviewForm, setInterviewForm] = useState(emptyInterviewForm);
  const [isSavingInterview, setIsSavingInterview] = useState(false);

  const fetchApplications = async (page = 1) => {
    setIsLoading(true);
    const query = new URLSearchParams({ page, limit: 20, ...(statusFilter && { status: statusFilter }) });
    const { data } = await apiCall(`/admin/applications?${query}`);
    if (data.success) {
      setApplications(data.data.applications);
      setPagination(data.data.pagination);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchApplications(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const handleStatusChange = async (applicationId, status, statusRemarks = '', statusConditions = '') => {
    setUpdatingId(applicationId);
    const conditions = statusConditions.split(',').map((c) => c.trim()).filter(Boolean);
    const { data } = await apiCall(`/admin/applications/${applicationId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, ...(statusRemarks && { remarks: statusRemarks }), conditions })
    });
    if (data.success) {
      setApplications((prev) => prev.map((app) => (app._id === applicationId ? data.data : app)));
      if (selected?._id === applicationId) setSelected(data.data);
      setRemarks('');
      setConditionsText('');
    }
    setUpdatingId(null);
  };

  const handleFeeUpdate = async (e) => {
    e.preventDefault();
    setIsSavingFee(true);
    const { data } = await apiCall(`/admin/applications/${selected._id}/fee`, {
      method: 'PATCH',
      body: JSON.stringify({ amount: feeForm.amount ? Number(feeForm.amount) : undefined, paid: feeForm.paid })
    });
    if (data.success) {
      setApplications((prev) => prev.map((app) => (app._id === selected._id ? data.data : app)));
      setSelected(data.data);
    }
    setIsSavingFee(false);
  };

  const handleInterviewUpdate = async (e) => {
    e.preventDefault();
    setIsSavingInterview(true);
    const { data } = await apiCall(`/admin/applications/${selected._id}/interview`, {
      method: 'PATCH',
      body: JSON.stringify(interviewForm)
    });
    if (data.success) {
      setApplications((prev) => prev.map((app) => (app._id === selected._id ? data.data : app)));
      setSelected(data.data);
    }
    setIsSavingInterview(false);
  };

  const fullName = (app) => [app.applicantName.firstName, app.applicantName.middleName, app.applicantName.lastName].filter(Boolean).join(' ');

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Applications</h1>
          <p className="text-secondary">{pagination.totalRecords || 0} total applications</p>
        </div>
      </div>

      <div className="filter-bar">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="empty-state"><Icon name="loader" size={24} className="spinning" /></div>
      ) : applications.length === 0 ? (
        <div className="empty-state">No applications found.</div>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Application #</th>
                <th>Student</th>
                <th>Division / Class</th>
                <th>Father</th>
                <th>Submitted</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {applications.map((app) => (
                <tr key={app._id}>
                  <td data-label="Application #">{app.applicationNumber}</td>
                  <td data-label="Student">{fullName(app)}</td>
                  <td data-label="Division / Class">{app.divisionApplied} / {app.classApplied}</td>
                  <td data-label="Father">{app.parentInfo.father.name}<br /><span className="text-secondary text-sm">{app.parentInfo.father.phone}</span></td>
                  <td data-label="Submitted">{formatDate(app.createdAt)}</td>
                  <td data-label="Status">
                    <select
                      value={app.status}
                      disabled={updatingId === app._id}
                      onChange={(e) => handleStatusChange(app._id, e.target.value)}
                      className={`badge badge-${app.status}`}
                      style={{ border: 'none', cursor: 'pointer' }}
                    >
                      {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                    </select>
                  </td>
                  <td>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => {
                        setSelected(app);
                        setRemarks(app.admissionDecision?.remarks || '');
                        setConditionsText((app.admissionDecision?.conditions || []).join(', '));
                        setFeeForm({ amount: app.applicationFee?.amount ?? '', paid: app.applicationFee?.paid || false });
                        setInterviewForm({
                          date: app.interviewSchedule?.date?.slice(0, 10) || '',
                          time: app.interviewSchedule?.time || '',
                          location: app.interviewSchedule?.location || '',
                          notes: app.interviewSchedule?.notes || '',
                          attended: app.interviewSchedule?.attended || false
                        });
                      }}
                    >View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination.total > 1 && (
        <div className="pagination-bar">
          <button className="btn btn-outline btn-sm" disabled={pagination.current <= 1} onClick={() => fetchApplications(pagination.current - 1)}>Previous</button>
          <span className="text-sm">Page {pagination.current} of {pagination.total}</span>
          <button className="btn btn-outline btn-sm" disabled={pagination.current >= pagination.total} onClick={() => fetchApplications(pagination.current + 1)}>Next</button>
        </div>
      )}

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{fullName(selected)}</h2>
              <button className="modal-close-btn" onClick={() => setSelected(null)}><Icon name="close" size={22} /></button>
            </div>

            {(() => {
              const passportPhoto = selected.documents?.find((d) => d.type === 'passport_photo');
              const otherDocuments = selected.documents?.filter((d) => d.type !== 'passport_photo') || [];
              const { father, mother, guardian } = selected.parentInfo;
              const med = selected.medicalInfo || {};
              const hasMedicalInfo = med.bloodGroup || med.genotype || med.allergies?.length > 0 || med.medications?.length > 0 || med.disabilities || med.doctorName || med.doctorPhone;
              const prevSchool = selected.previousSchool;
              const hasPrevSchool = prevSchool && (prevSchool.name || prevSchool.address || prevSchool.lastClass || prevSchool.reasonForLeaving);

              return (
                <>
                  {passportPhoto && (
                    <div style={{ marginBottom: 'var(--space-5)' }}>
                      <img
                        src={passportPhoto.fileUrl}
                        alt={`${fullName(selected)} passport photo`}
                        style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}
                      />
                    </div>
                  )}

                  <dl className="detail-grid">
                    <div><dt>Application #</dt><dd>{selected.applicationNumber}</dd></div>
                    <div><dt>Status</dt><dd className={`badge badge-${selected.status}`}>{selected.status.replace('_', ' ')}</dd></div>
                    <div><dt>Division</dt><dd>{selected.divisionApplied}</dd></div>
                    <div><dt>Class</dt><dd>{selected.classApplied}</dd></div>
                    <div><dt>Session</dt><dd>{selected.sessionApplied}</dd></div>
                    <div><dt>Date of Birth</dt><dd>{formatDate(selected.dateOfBirth)}</dd></div>
                    <div><dt>Gender</dt><dd>{selected.gender}</dd></div>
                    <div><dt>Submitted</dt><dd>{formatDate(selected.createdAt)}</dd></div>

                    <div className="detail-grid-full">
                      <dt>Father</dt>
                      <dd>
                        {father.name} — {father.phone}{father.email ? ` — ${father.email}` : ' (no email on file)'}
                        {father.occupation && <><br />Occupation: {father.occupation}</>}
                        {father.address && <><br />Address: {father.address}</>}
                      </dd>
                    </div>
                    <div className="detail-grid-full">
                      <dt>Mother</dt>
                      <dd>
                        {mother.name} — {mother.phone}{mother.email ? ` — ${mother.email}` : ''}
                        {mother.occupation && <><br />Occupation: {mother.occupation}</>}
                        {mother.address && <><br />Address: {mother.address}</>}
                      </dd>
                    </div>

                    {guardian?.name && (
                      <div className="detail-grid-full">
                        <dt>Guardian</dt>
                        <dd>
                          {guardian.name}{guardian.relationship ? ` (${guardian.relationship})` : ''}
                          {guardian.phone && ` — ${guardian.phone}`}{guardian.email && ` — ${guardian.email}`}
                          {guardian.address && <><br />Address: {guardian.address}</>}
                        </dd>
                      </div>
                    )}

                    {hasPrevSchool && (
                      <div className="detail-grid-full">
                        <dt>Previous School</dt>
                        <dd>
                          {prevSchool.name}
                          {prevSchool.lastClass && ` — last completed ${prevSchool.lastClass}`}
                          {prevSchool.address && <><br />Address: {prevSchool.address}</>}
                          {prevSchool.reasonForLeaving && <><br />Reason for leaving: {prevSchool.reasonForLeaving}</>}
                        </dd>
                      </div>
                    )}

                    {hasMedicalInfo && (
                      <div className="detail-grid-full">
                        <dt>Medical Information</dt>
                        <dd>
                          {med.bloodGroup && <>Blood Group: {med.bloodGroup}<br /></>}
                          {med.genotype && <>Genotype: {med.genotype}<br /></>}
                          {med.allergies?.length > 0 && <>Allergies: {med.allergies.join(', ')}<br /></>}
                          {med.medications?.length > 0 && <>Medications: {med.medications.join(', ')}<br /></>}
                          {med.disabilities && <>Disabilities/Special Needs: {med.disabilities}<br /></>}
                          {(med.doctorName || med.doctorPhone) && <>Doctor: {med.doctorName}{med.doctorPhone && ` — ${med.doctorPhone}`}</>}
                        </dd>
                      </div>
                    )}

                    {otherDocuments.length > 0 && (
                      <div className="detail-grid-full">
                        <dt>Documents</dt>
                        <dd>
                          {otherDocuments.map((doc) => (
                            <div key={doc.fileUrl}>
                              <a href={doc.fileUrl} target="_blank" rel="noreferrer">{doc.type.replace('_', ' ')} — {doc.fileName}</a>
                            </div>
                          ))}
                        </dd>
                      </div>
                    )}

                    {selected.linkedStudentId && (
                      <div className="detail-grid-full"><dt>Portal Account</dt><dd>A student record and parent portal account have been created for this application.</dd></div>
                    )}

                    {selected.admissionDecision?.decision && (
                      <div className="detail-grid-full">
                        <dt>Decision Record</dt>
                        <dd>
                          {selected.admissionDecision.decision}
                          {selected.admissionDecision.decisionDate && ` on ${formatDateTime(selected.admissionDecision.decisionDate)}`}
                          {selected.admissionDecision.decisionBy && ` by ${selected.admissionDecision.decisionBy.email || selected.admissionDecision.decisionBy.phone}`}
                          {selected.admissionDecision.conditions?.length > 0 && <><br />Conditions: {selected.admissionDecision.conditions.join(', ')}</>}
                        </dd>
                      </div>
                    )}

                    {selected.communicationHistory?.length > 0 && (
                      <div className="detail-grid-full">
                        <dt>Communication History</dt>
                        <dd>
                          {selected.communicationHistory.map((c, i) => (
                            <div key={i} style={{ marginBottom: 'var(--space-2)' }}>
                              [{formatDateTime(c.sentAt)}] {c.type.toUpperCase()} — {c.subject || 'No subject'}: {c.message}
                              {c.sentBy && ` (sent by ${c.sentBy.email || c.sentBy.phone})`}
                            </div>
                          ))}
                        </dd>
                      </div>
                    )}
                  </dl>
                </>
              );
            })()}

            <div className="form-group">
              <label>Remarks (optional, saved with the next decision)</label>
              <textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Conditions (comma-separated, optional, saved with the next decision)</label>
              <input type="text" value={conditionsText} onChange={(e) => setConditionsText(e.target.value)} placeholder="e.g. Submit birth certificate, Pass entrance test" />
            </div>

            <div className="filter-bar">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  className={`btn btn-sm ${selected.status === s ? 'btn-primary' : 'btn-outline'}`}
                  disabled={updatingId === selected._id}
                  onClick={() => handleStatusChange(selected._id, s, remarks, conditionsText)}
                >
                  {s.replace('_', ' ')}
                </button>
              ))}
            </div>

            <h4 style={{ margin: 'var(--space-5) 0 var(--space-3)' }}>Application Fee</h4>
            <form onSubmit={handleFeeUpdate}>
              <div className="form-row">
                <div className="form-group">
                  <label>Amount (₦)</label>
                  <input type="number" min="0" value={feeForm.amount} onChange={(e) => setFeeForm({ ...feeForm, amount: e.target.value })} />
                </div>
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontWeight: 400, marginTop: 'var(--space-5)' }}>
                    <input type="checkbox" style={{ width: 'auto' }} checked={feeForm.paid} onChange={(e) => setFeeForm({ ...feeForm, paid: e.target.checked })} />
                    Marked as paid
                  </label>
                </div>
              </div>
              <button type="submit" className="btn btn-outline btn-sm" disabled={isSavingFee}>
                {isSavingFee ? <Icon name="loader" size={14} className="spinning" /> : 'Save Fee Status'}
              </button>
            </form>

            <h4 style={{ margin: 'var(--space-5) 0 var(--space-3)' }}>Admission Interview</h4>
            <form onSubmit={handleInterviewUpdate}>
              <div className="form-row">
                <div className="form-group">
                  <label>Date</label>
                  <input type="date" value={interviewForm.date} onChange={(e) => setInterviewForm({ ...interviewForm, date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Time</label>
                  <input type="text" placeholder="e.g. 10:00 AM" value={interviewForm.time} onChange={(e) => setInterviewForm({ ...interviewForm, time: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label>Location</label>
                <input type="text" value={interviewForm.location} onChange={(e) => setInterviewForm({ ...interviewForm, location: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Notes</label>
                <textarea rows={2} value={interviewForm.notes} onChange={(e) => setInterviewForm({ ...interviewForm, notes: e.target.value })} />
              </div>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontWeight: 400 }}>
                  <input type="checkbox" style={{ width: 'auto' }} checked={interviewForm.attended} onChange={(e) => setInterviewForm({ ...interviewForm, attended: e.target.checked })} />
                  Applicant attended
                </label>
              </div>
              <button type="submit" className="btn btn-outline btn-sm" disabled={isSavingInterview}>
                {isSavingInterview ? <Icon name="loader" size={14} className="spinning" /> : 'Save Interview Schedule'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Applications;

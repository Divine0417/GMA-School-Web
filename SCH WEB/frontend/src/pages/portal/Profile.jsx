import React, { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import SVGIcon from '../../components/icons/SVGIcon';
import PasswordField from '../../components/PasswordField';

const roleLabel = { student: 'Student', parent: 'Parent', staff: 'Staff', admin: 'Admin' };
const staffTypeLabel = { class_teacher: 'Class Teacher', subject_teacher: 'Subject Teacher', bursar: 'Bursar' };

const NOTIF_OPTIONS = [
  { key: 'emailNotices', label: 'Email me about new notices' },
  { key: 'smsNotices', label: 'Text me about new notices' },
  { key: 'emailBills', label: 'Email me about bills & payments' },
  { key: 'smsBills', label: 'Text me about bills & payments' }
];

const initials = (name = '') =>
  name.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0]?.toUpperCase()).join('') || '👤';

// A rough, friendly device label from a user-agent string — good enough for
// "where did I sign in from" without pulling in a UA-parsing dependency.
const deviceLabel = (ua = '') => {
  if (!ua) return 'Unknown device';
  const os = /Windows/i.test(ua) ? 'Windows'
    : /Android/i.test(ua) ? 'Android'
    : /iPhone|iPad|iOS/i.test(ua) ? 'iOS'
    : /Mac OS X|Macintosh/i.test(ua) ? 'macOS'
    : /Linux/i.test(ua) ? 'Linux' : 'device';
  const browser = /Edg/i.test(ua) ? 'Edge'
    : /Chrome/i.test(ua) ? 'Chrome'
    : /Firefox/i.test(ua) ? 'Firefox'
    : /Safari/i.test(ua) ? 'Safari' : 'browser';
  return `${browser} on ${os}`;
};

const Profile = () => {
  const { user, apiCall, updateUser, logout, token, API_BASE_URL } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const isStaffAdmin = user?.role === 'staff' || user?.role === 'admin';
  const isStaff = user?.role === 'staff';
  const isStudentOrParent = user?.role === 'student' || user?.role === 'parent';

  // --- Contact details ---
  const [contact, setContact] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || ''
  });
  const [contactMsg, setContactMsg] = useState({ error: '', success: '' });
  const [savingContact, setSavingContact] = useState(false);

  // --- Notification preferences ---
  const [prefs, setPrefs] = useState({
    emailNotices: user?.notificationPrefs?.emailNotices ?? true,
    smsNotices: user?.notificationPrefs?.smsNotices ?? false,
    emailBills: user?.notificationPrefs?.emailBills ?? true,
    smsBills: user?.notificationPrefs?.smsBills ?? false
  });
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsMsg, setPrefsMsg] = useState('');

  // --- Avatar ---
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState('');

  // --- Password ---
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwMsg, setPwMsg] = useState({ error: '', success: '' });
  const [changingPw, setChangingPw] = useState(false);

  const loginIdentifier = user?.student?.regNumber || user?.email || user?.phone;
  const avatarUrl = user?.student?.photoUrl || user?.avatarUrl;
  const displayName = user?.student?.fullName || user?.name || loginIdentifier;

  const handleAvatarPick = () => fileInputRef.current?.click();

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarError('');
    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const res = await fetch(`${API_BASE_URL}/auth/profile/avatar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      if (data.success) updateUser({ avatarUrl: data.avatarUrl });
      else setAvatarError(data.message || 'Upload failed');
    } catch {
      setAvatarError('Upload failed. Please try again.');
    } finally {
      setUploadingAvatar(false);
      e.target.value = '';
    }
  };

  const handleContactSubmit = async (e) => {
    e.preventDefault();
    setContactMsg({ error: '', success: '' });
    setSavingContact(true);
    const payload = { email: contact.email, phone: contact.phone };
    if (isStaffAdmin) payload.name = contact.name;
    const { data } = await apiCall('/auth/profile', { method: 'PATCH', body: JSON.stringify(payload) });
    if (data.success) {
      updateUser(data.user);
      setContactMsg({ error: '', success: 'Profile updated.' });
    } else {
      setContactMsg({ error: data.message || data.errors?.[0]?.msg || 'Failed to update profile', success: '' });
    }
    setSavingContact(false);
  };

  const handleTogglePref = async (key) => {
    const previous = prefs;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setSavingPrefs(true);
    setPrefsMsg('');
    const { data } = await apiCall('/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify({ notificationPrefs: next })
    });
    if (data.success) {
      updateUser({ notificationPrefs: data.user.notificationPrefs });
      setPrefsMsg('Preferences saved.');
    } else {
      setPrefs(previous); // revert on failure
      setPrefsMsg('Could not save preferences.');
    }
    setSavingPrefs(false);
  };

  const handlePasswordChange = (e) => {
    setPasswords({ ...passwords, [e.target.name]: e.target.value });
    if (pwMsg.error || pwMsg.success) setPwMsg({ error: '', success: '' });
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (passwords.newPassword !== passwords.confirmPassword) {
      setPwMsg({ error: 'New passwords do not match', success: '' });
      return;
    }
    setChangingPw(true);
    const { data } = await apiCall('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword: passwords.currentPassword, newPassword: passwords.newPassword })
    });
    if (data.success) {
      setPwMsg({ error: '', success: 'Password changed successfully.' });
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } else {
      setPwMsg({ error: data.message || data.errors?.[0]?.msg || 'Failed to change password', success: '' });
    }
    setChangingPw(false);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div className="welcome-section">
          <h1>Profile</h1>
        </div>
      </div>

      {/* Identity + avatar */}
      <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="card-body">
          <div className="profile-avatar-wrap">
            <div className="profile-avatar">
              {avatarUrl ? <img src={avatarUrl} alt={displayName} /> : <span>{initials(displayName)}</span>}
            </div>
            <div>
              <h2 style={{ marginBottom: 'var(--space-1)' }}>{displayName}</h2>
              <p className="text-secondary text-sm" style={{ marginBottom: 'var(--space-3)' }}>
                {roleLabel[user?.role] || user?.role}
                {user?.staffType ? ` · ${staffTypeLabel[user.staffType] || user.staffType}` : ''}
              </p>
              {/* Students' photos are managed by the school; everyone else can set their own */}
              {!user?.student && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    style={{ display: 'none' }}
                    onChange={handleAvatarChange}
                  />
                  <button type="button" className="btn btn-outline btn-sm" onClick={handleAvatarPick} disabled={uploadingAvatar}>
                    {uploadingAvatar
                      ? <><SVGIcon name="loader" size="16" className="spinning" /> Uploading…</>
                      : (avatarUrl ? 'Change photo' : 'Add photo')}
                  </button>
                </>
              )}
              {avatarError && <p className="text-sm" style={{ color: 'var(--color-error, #DC2626)', marginTop: 'var(--space-2)' }}>{avatarError}</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Account details (editable for contact fields) */}
      <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="card-body">
          <h3 style={{ marginBottom: 'var(--space-4)' }}>Account Details</h3>

          {contactMsg.error && (
            <div className="error-message" style={{ marginBottom: 'var(--space-4)' }}>
              <SVGIcon name="alert-circle" size="20" /><span>{contactMsg.error}</span>
            </div>
          )}
          {contactMsg.success && (
            <div className="success-message" style={{ marginBottom: 'var(--space-4)' }}>
              <SVGIcon name="checkCircle" size="20" /><span>{contactMsg.success}</span>
            </div>
          )}

          <form onSubmit={handleContactSubmit}>
            {isStaffAdmin && (
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={contact.name}
                  onChange={(e) => setContact({ ...contact, name: e.target.value })}
                  placeholder="e.g. Mrs. Ada Okoro"
                />
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                type="email"
                className="form-input"
                value={contact.email}
                onChange={(e) => setContact({ ...contact, email: e.target.value })}
                placeholder="you@example.com"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Phone</label>
              <input
                type="text"
                className="form-input"
                value={contact.phone}
                onChange={(e) => setContact({ ...contact, phone: e.target.value })}
                placeholder="e.g. 0803 000 0000"
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={savingContact}>
              {savingContact ? <><SVGIcon name="loader" size="18" className="spinning" /> Saving…</> : 'Save Changes'}
            </button>
          </form>

          {/* Read-only context that the user can't change here */}
          <div style={{ marginTop: 'var(--space-5)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--color-border-light)' }}>
            <p><strong>Login ID:</strong> {loginIdentifier}</p>
            {isStaff && user?.division && (
              <p>
                <strong>Assigned to:</strong>{' '}
                <span style={{ textTransform: 'capitalize' }}>{user.division}</span>
                {user?.classes?.length ? ` — ${user.classes.join(', ')}` : ' (all classes)'}
              </p>
            )}
            {user?.student && (
              <>
                <p><strong>Class:</strong> {user.student.class} ({user.student.division})</p>
                <p><strong>Session:</strong> {user.student.session}</p>
              </>
            )}
            {user?.children?.length > 0 && (
              <>
                <p style={{ marginTop: 'var(--space-3)' }}><strong>Children:</strong></p>
                <ul style={{ paddingLeft: 'var(--space-6)' }}>
                  {user.children.map((child) => (
                    <li key={child.id}>{child.fullName} — {child.regNumber} ({child.class}, {child.division})</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Quick links for students & parents */}
      {isStudentOrParent && (
        <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
          <div className="card-body">
            <h3 style={{ marginBottom: 'var(--space-4)' }}>Quick Links</h3>
            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <Link to="/portal/report-cards" className="btn btn-outline btn-sm"><SVGIcon name="file-text" size="16" /> Report Cards</Link>
              {user?.role !== 'student' && (
                <Link to="/portal/bills" className="btn btn-outline btn-sm"><SVGIcon name="credit-card" size="16" /> Bills & Payments</Link>
              )}
              <Link to="/portal/notices" className="btn btn-outline btn-sm"><SVGIcon name="bell" size="16" /> Notices</Link>
            </div>
          </div>
        </div>
      )}

      {/* Notification preferences */}
      <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="card-body">
          <h3 style={{ marginBottom: 'var(--space-1)' }}>Notification Preferences</h3>
          <p className="text-secondary text-sm" style={{ marginBottom: 'var(--space-4)' }}>
            Choose how you'd like the school to reach you.
          </p>
          {NOTIF_OPTIONS.map((opt) => (
            <div className="pref-row" key={opt.key}>
              <span>{opt.label}</span>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={prefs[opt.key]}
                  onChange={() => handleTogglePref(opt.key)}
                  disabled={savingPrefs}
                />
                <span className="switch-slider" />
              </label>
            </div>
          ))}
          {prefsMsg && <p className="text-secondary text-sm" style={{ marginTop: 'var(--space-3)' }}>{prefsMsg}</p>}
        </div>
      </div>

      {/* Security */}
      <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="card-body">
          <h3 style={{ marginBottom: 'var(--space-4)' }}>Security</h3>

          {user?.lastLogin && (
            <p className="text-secondary text-sm" style={{ marginBottom: 'var(--space-4)' }}>
              <SVGIcon name="clock" size="14" /> Last sign-in: {new Date(user.lastLogin).toLocaleString('en-GB')}
            </p>
          )}

          {pwMsg.error && (
            <div className="error-message" style={{ marginBottom: 'var(--space-4)' }}>
              <SVGIcon name="alert-circle" size="20" /><span>{pwMsg.error}</span>
            </div>
          )}
          {pwMsg.success && (
            <div className="success-message" style={{ marginBottom: 'var(--space-4)' }}>
              <SVGIcon name="checkCircle" size="20" /><span>{pwMsg.success}</span>
            </div>
          )}

          <form onSubmit={handlePasswordSubmit}>
            <div className="form-group">
              <label className="form-label">Current Password</label>
              <PasswordField icon={false} name="currentPassword" className="form-input" value={passwords.currentPassword} onChange={handlePasswordChange} required />
            </div>
            <div className="form-group">
              <label className="form-label">New Password</label>
              <PasswordField icon={false} name="newPassword" className="form-input" value={passwords.newPassword} onChange={handlePasswordChange} minLength={6} required />
            </div>
            <div className="form-group">
              <label className="form-label">Confirm New Password</label>
              <PasswordField icon={false} name="confirmPassword" className="form-input" value={passwords.confirmPassword} onChange={handlePasswordChange} minLength={6} required />
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <button type="submit" className="btn btn-primary" disabled={changingPw}>
                {changingPw ? <><SVGIcon name="loader" size="18" className="spinning" /> Changing…</> : 'Change Password'}
              </button>
              <button type="button" className="btn btn-outline" onClick={handleLogout}>
                <SVGIcon name="log-out" size="18" /> Log out of this device
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Account activity */}
      {user?.loginHistory?.length > 0 && (
        <div className="card">
          <div className="card-body">
            <h3 style={{ marginBottom: 'var(--space-1)' }}>Recent Activity</h3>
            <p className="text-secondary text-sm" style={{ marginBottom: 'var(--space-4)' }}>
              Your last {user.loginHistory.length} sign-in{user.loginHistory.length > 1 ? 's' : ''}. If you don't recognise one, change your password.
            </p>
            {user.loginHistory.map((entry, i) => (
              <div className="activity-item" key={i}>
                <SVGIcon name="monitor" size="18" />
                <div>
                  <div><strong>{deviceLabel(entry.userAgent)}</strong>{i === 0 ? ' · current session' : ''}</div>
                  <div className="text-secondary text-sm">
                    {new Date(entry.at).toLocaleString('en-GB')}{entry.ip ? ` · ${entry.ip}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;

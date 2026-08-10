import { useState } from 'react';
import Avatar from './Avatar';
import { api } from './lib/api';

export default function AccountPage({ user, onUserUpdate, onLogout, summary }) {
  const [name, setName] = useState(user.name);
  const [savingName, setSavingName] = useState(false);
  const [nameMessage, setNameMessage] = useState(null);

  const [shuffling, setShuffling] = useState(false);

  const [deleteStage, setDeleteStage] = useState('idle'); // idle | confirm | sent
  const [deleteMessage, setDeleteMessage] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');

  const nameChanged = name.trim() !== user.name && name.trim().length >= 2;

  async function saveName(event) {
    event.preventDefault();
    if (!nameChanged) return;

    setSavingName(true);
    setNameMessage(null);
    try {
      const data = await api.updateProfile({ name: name.trim() });
      onUserUpdate(data.user);
      setNameMessage({ kind: 'success', text: 'Name updated.' });
    } catch (err) {
      setNameMessage({ kind: 'error', text: err.message });
    } finally {
      setSavingName(false);
    }
  }

  async function shuffleAvatar() {
    setShuffling(true);
    try {
      const data = await api.shuffleAvatar();
      onUserUpdate(data.user);
    } catch {
      // Cosmetic only; leave the current avatar in place.
    } finally {
      setShuffling(false);
    }
  }

  async function requestDeletion() {
    setDeleting(true);
    setDeleteMessage(null);
    try {
      const data = await api.requestDeletion(deleteReason.trim() || undefined);
      setDeleteStage('sent');
      setDeleteMessage({
        kind: data.emailDelivered ? 'success' : 'warn',
        text: data.emailDelivered
          ? data.message
          : `${data.message} (Email delivery is not configured on this server, so the request was recorded and written to the server log.)`,
      });
    } catch (err) {
      setDeleteMessage({ kind: 'error', text: err.message });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="ls-shell ls-page ls-view">
      <div className="ls-page-head">
        <div className="ls-section-label">Account settings</div>
        <h1>Your account</h1>
        <p className="ls-page-lead">
          Manage your profile, review your learning, and control your data.
        </p>
      </div>

      {/* Identity summary */}
      <div className="ls-account-hero">
        <Avatar user={user} size={72} />
        <div className="ls-account-hero-copy">
          <strong>{user.name}</strong>
          <span>{user.email}</span>
          <span className="ls-role-pill">{user.role}</span>
        </div>
        <button
          className="ls-button ls-button-outline ls-button-small"
          onClick={shuffleAvatar}
          disabled={shuffling}
        >
          {shuffling ? 'Shuffling…' : 'New avatar'}
        </button>
      </div>

      {summary && (
        <div className="ls-facts ls-account-facts">
          <div className="ls-fact">
            <strong>{summary.courses}</strong>
            <small>Courses</small>
          </div>
          <div className="ls-fact">
            <strong>{summary.inProgress}</strong>
            <small>In progress</small>
          </div>
          <div className="ls-fact">
            <strong>{summary.completed}</strong>
            <small>Completed</small>
          </div>
          <div className="ls-fact">
            <strong>{summary.lessonsCompleted}</strong>
            <small>Lessons done</small>
          </div>
        </div>
      )}

      {/* Profile */}
      <div className="ls-settings-card">
        <div className="ls-settings-head">
          <h2>Profile</h2>
          <p>Your display name appears on your account and in support requests.</p>
        </div>

        <form className="ls-settings-body" onSubmit={saveName}>
          <label className="ls-field">
            <span>Display name</span>
            <input
              className="ls-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              minLength={2}
              required
            />
          </label>

          <label className="ls-field">
            <span>Email address</span>
            <input className="ls-input" value={user.email} disabled readOnly />
            <small className="ls-field-hint">
              Email cannot be changed. It identifies your account and receives
              security confirmations.
            </small>
          </label>

          {nameMessage && (
            <div className={nameMessage.kind === 'error' ? 'ls-alert' : 'ls-notice-inline'}>
              {nameMessage.text}
            </div>
          )}

          <div className="ls-settings-actions">
            <button
              className="ls-button ls-button-blue"
              type="submit"
              disabled={!nameChanged || savingName}
            >
              {savingName ? 'Saving…' : 'Save changes'}
            </button>
            {nameChanged && (
              <button
                type="button"
                className="ls-button ls-button-outline"
                onClick={() => setName(user.name)}
              >
                Reset
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Session */}
      <div className="ls-settings-card">
        <div className="ls-settings-head">
          <h2>Session</h2>
          <p>Signing out clears your access token from this browser.</p>
        </div>
        <div className="ls-settings-body">
          <div className="ls-settings-actions">
            <button className="ls-button ls-button-outline" onClick={onLogout}>
              Sign out
            </button>
          </div>
        </div>
      </div>

      {/* Danger zone */}
      <div className="ls-settings-card is-danger">
        <div className="ls-settings-head">
          <h2>Delete account</h2>
          <p>
            Send us a request and we will permanently remove your profile,
            enrollments and course progress, then email you to confirm. Your
            account stays active until then.
          </p>
        </div>

        <div className="ls-settings-body">
          {deleteMessage && (
            <div
              className={
                deleteMessage.kind === 'error'
                  ? 'ls-alert'
                  : deleteMessage.kind === 'warn'
                    ? 'ls-notice-inline is-warn'
                    : 'ls-notice-inline'
              }
            >
              {deleteMessage.text}
            </div>
          )}

          {deleteStage === 'idle' && (
            <div className="ls-settings-actions">
              <button className="ls-button ls-button-danger" onClick={() => setDeleteStage('confirm')}>
                Delete my account
              </button>
            </div>
          )}

          {deleteStage === 'confirm' && (
            <div className="ls-danger-confirm">
              <p>
                We will send a deletion request for <strong>{user.email}</strong> to
                our support team. You will get a confirmation email once your data
                has been removed.
              </p>

              <label className="ls-field">
                <span>Reason (optional)</span>
                <textarea
                  className="ls-input ls-textarea"
                  value={deleteReason}
                  onChange={(event) => setDeleteReason(event.target.value)}
                  placeholder="Anything you would like us to know before you go"
                  maxLength={500}
                  rows={3}
                />
              </label>

              <div className="ls-settings-actions">
                <button
                  className="ls-button ls-button-danger"
                  onClick={requestDeletion}
                  disabled={deleting}
                >
                  {deleting ? 'Sending…' : 'Send deletion request'}
                </button>
                <button
                  className="ls-button ls-button-outline"
                  onClick={() => setDeleteStage('idle')}
                  disabled={deleting}
                >
                  Keep my account
                </button>
              </div>
            </div>
          )}

          {deleteStage === 'sent' && (
            <div className="ls-settings-actions">
              <button className="ls-button ls-button-outline" onClick={() => setDeleteStage('idle')}>
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

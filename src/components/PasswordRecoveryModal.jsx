import { useState } from 'react';
import Modal from './Modal.jsx';

// Shown after the user follows a password-reset email link. Supabase signs
// them in with a recovery session; this lets them actually set a new password.
export default function PasswordRecoveryModal({ auth, onClose }) {
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (password !== confirm) {
            setError('Passwords do not match.');
            return;
        }
        setLoading(true);
        const result = await auth.updatePassword(password);
        setLoading(false);
        if (result.success) onClose();
        else setError(result.error);
    };

    return (
        <Modal title="Set a New Password" titleId="recovery-modal-title" onClose={onClose}>
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label className="form-label" htmlFor="recovery-password">New password</label>
                    <input
                        id="recovery-password"
                        type="password"
                        className="form-input"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="new-password"
                        minLength={8}
                        required
                    />
                </div>
                <div className="form-group">
                    <label className="form-label" htmlFor="recovery-confirm">Confirm password</label>
                    <input
                        id="recovery-confirm"
                        type="password"
                        className="form-input"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        autoComplete="new-password"
                        minLength={8}
                        required
                    />
                </div>
                {error && <div className="form-error" role="alert">{error}</div>}
                <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
                    {loading ? 'Saving...' : 'Save Password'}
                </button>
            </form>
        </Modal>
    );
}

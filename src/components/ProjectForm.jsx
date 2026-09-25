import { useState } from 'react';
import { LIMITS } from '../config.js';
import { codePoints, validateProjectForm } from '../lib/validation.js';

// Shared by "Submit Project" and "Edit project". `onSubmit(values)` does the
// database write and resolves to an error message, or '' on success.
// `idPrefix` keeps input ids unique when both forms are on screen at once.
export default function ProjectForm({ initialValues, idPrefix, submitLabel, submittingLabel, onSubmit, onCancel, autoFocus = false }) {
    const [form, setForm] = useState(initialValues);
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });
    const id = (field) => `${idPrefix}-${field}`;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        const validation = validateProjectForm(form);
        if (validation) {
            setError(validation);
            return;
        }
        setSubmitting(true);
        const message = await onSubmit(form);
        setSubmitting(false);
        if (message) setError(message);
    };

    return (
        <form onSubmit={handleSubmit}>
            {error && <div className="form-error" role="alert">{error}</div>}
            <div className="form-group">
                <label className="form-label" htmlFor={id('title')}>Project Title</label>
                {/* autoFocus only for the edit form: it replaces the Edit button the user just pressed. */}
                <input id={id('title')} type="text" className="form-input" value={form.title} autoFocus={autoFocus}
                    onChange={update('title')} minLength={LIMITS.titleMin} maxLength={LIMITS.titleMax} required />
            </div>
            <div className="form-group">
                <label className="form-label" htmlFor={id('description')}>Description</label>
                <textarea id={id('description')} className="form-textarea" value={form.description}
                    onChange={update('description')} maxLength={LIMITS.descriptionMax} required />
                <div className="form-hint">{codePoints(form.description)}/{LIMITS.descriptionMax}</div>
            </div>
            <div className="form-group">
                <label className="form-label" htmlFor={id('tech')}>Tech Stack (comma-separated)</label>
                <input id={id('tech')} type="text" className="form-input" placeholder="e.g., JavaScript, React, Node.js"
                    value={form.tech_stack} onChange={update('tech_stack')} required />
            </div>
            <div className="form-group">
                <label className="form-label" htmlFor={id('github')}>GitHub URL (optional)</label>
                <input id={id('github')} type="url" className="form-input" placeholder="https://github.com/username/repo"
                    value={form.github_url} onChange={update('github_url')} />
            </div>
            <div className="form-group">
                <label className="form-label" htmlFor={id('demo')}>Demo URL (optional)</label>
                <input id={id('demo')} type="url" className="form-input" placeholder="https://demo.example.com"
                    value={form.demo_url} onChange={update('demo_url')} />
            </div>
            <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                    {submitting ? submittingLabel : submitLabel}
                </button>
                {onCancel && (
                    <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={submitting}>
                        Cancel
                    </button>
                )}
            </div>
        </form>
    );
}

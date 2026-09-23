import { useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

// Accessible modal shell: closes on Escape and overlay click, traps Tab focus,
// restores focus to the opener on close.
export default function Modal({ title, titleId, onClose, children, maxWidth }) {
    const dialogRef = useRef(null);

    useEffect(() => {
        const opener = document.activeElement;
        const dialog = dialogRef.current;
        dialog?.querySelector(FOCUSABLE)?.focus();

        const onKey = (e) => {
            if (e.key === 'Escape') {
                onClose();
                return;
            }
            if (e.key !== 'Tab' || !dialog) return;
            const items = [...dialog.querySelectorAll(FOCUSABLE)];
            if (items.length === 0) return;
            const first = items[0];
            const last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', onKey);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = prevOverflow;
            if (opener instanceof HTMLElement) opener.focus();
        };
    }, [onClose]);

    return (
        <div className="modal-overlay" onClick={onClose} role="presentation">
            <div
                ref={dialogRef}
                className="modal"
                style={maxWidth ? { maxWidth } : undefined}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
            >
                <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
                {title && <h2 className="modal-title" id={titleId}>{title}</h2>}
                {children}
            </div>
        </div>
    );
}

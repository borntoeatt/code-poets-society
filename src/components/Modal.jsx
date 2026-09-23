import { useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

// Modals can stack (e.g. the auth modal opened from inside a project modal).
// A module-level stack keeps body scroll-locking and keyboard handling
// correct regardless of mount/unmount order: only the topmost dialog reacts
// to Escape/Tab, and the scroll lock is released when the last one closes.
const openDialogs = [];

// Accessible modal shell: closes on Escape and overlay click, traps Tab focus,
// restores focus to the opener on close.
export default function Modal({ title, titleId, onClose, children, maxWidth }) {
    const dialogRef = useRef(null);
    // Latest onClose in a ref so the setup effect runs exactly once per mount.
    // Re-running it on every parent re-render (e.g. an auth token refresh)
    // would yank focus away from whatever the user is typing in.
    const onCloseRef = useRef(onClose);
    useEffect(() => {
        onCloseRef.current = onClose;
    });
    // A click only counts as "outside" when the press started outside too;
    // otherwise drag-selecting text out of a textarea would close the modal.
    const pressedOnOverlay = useRef(false);

    useEffect(() => {
        const opener = document.activeElement;
        const dialog = dialogRef.current;
        openDialogs.push(dialog);
        if (openDialogs.length === 1) document.body.style.overflow = 'hidden';
        dialog?.querySelector(FOCUSABLE)?.focus();

        const onKey = (e) => {
            if (openDialogs[openDialogs.length - 1] !== dialog) return;
            if (e.key === 'Escape') {
                onCloseRef.current();
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
        return () => {
            document.removeEventListener('keydown', onKey);
            const i = openDialogs.indexOf(dialog);
            if (i !== -1) openDialogs.splice(i, 1);
            if (openDialogs.length === 0) document.body.style.overflow = '';
            const active = document.activeElement;
            const focusInsideAnotherDialog = openDialogs.some((d) => d?.contains(active));
            if (opener instanceof HTMLElement && opener.isConnected && !focusInsideAnotherDialog) {
                opener.focus();
            }
        };
    }, []);

    return (
        <div
            className="modal-overlay"
            role="presentation"
            onMouseDown={(e) => {
                pressedOnOverlay.current = e.target === e.currentTarget;
            }}
            onClick={(e) => {
                if (pressedOnOverlay.current && e.target === e.currentTarget) onCloseRef.current();
                pressedOnOverlay.current = false;
            }}
        >
            <div
                ref={dialogRef}
                className="modal"
                style={maxWidth ? { maxWidth } : undefined}
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

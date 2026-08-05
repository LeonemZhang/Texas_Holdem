import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ModalAction {
  readonly label: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly className?: string;
}

export interface ModalDialogProps {
  readonly title: string;
  readonly children: ReactNode;
  readonly confirmAction: ModalAction;
  readonly cancelLabel?: string;
  readonly secondaryAction?: ModalAction;
  readonly onCancel: () => void;
  readonly role?: 'dialog' | 'alertdialog';
}

export function ModalDialog({
  title,
  children,
  confirmAction,
  cancelLabel = '取消',
  secondaryAction,
  onCancel,
  role = 'dialog',
}: ModalDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        onCancelRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [
        ...(dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? []),
      ];
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      restoreFocusRef.current?.focus();
    };
  }, []);

  return createPortal(
    <div className="modal-backdrop">
      <div
        ref={dialogRef}
        className="modal-dialog"
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header>
          <h2 id={titleId}>{title}</h2>
        </header>
        <div className="modal-dialog__content">{children}</div>
        <footer className="modal-dialog__actions">
          {secondaryAction ? (
            <button
              className={`modal-dialog__secondary ${secondaryAction.className ?? 'button button--secondary'}`}
              type="button"
              disabled={secondaryAction.disabled}
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.label}
            </button>
          ) : null}
          <span className="modal-dialog__spacer" aria-hidden="true" />
          <button
            ref={cancelRef}
            className="button button--secondary modal-dialog__cancel"
            type="button"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            className={`modal-dialog__confirm ${confirmAction.className ?? 'button button--primary'}`}
            type="button"
            disabled={confirmAction.disabled}
            onClick={confirmAction.onClick}
          >
            {confirmAction.label}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(
    (element) =>
      !element.hasAttribute("disabled") &&
      element.getAttribute("aria-hidden") !== "true" &&
      element.offsetParent !== null,
  );
}

function isTopmostModal(dialogElement: HTMLElement): boolean {
  const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
  if (dialogs.length === 0) {
    return true;
  }
  return dialogs[dialogs.length - 1] === dialogElement;
}

export interface AccessibleDialogProps {
  open: boolean;
  onClose: () => void;
  ariaLabelledBy?: string;
  ariaLabel?: string;
  closeOnEscape?: boolean;
  closeOnBackdropClick?: boolean;
  zIndexClassName?: string;
  overlayClassName?: string;
  contentClassName?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}

/**
 * Reusable accessible modal dialog with uniform backdrop, `.mc-modal-enter`
 * animation, focus trapping, initial focus placement, focus return on close,
 * Escape handling, and optional backdrop dismissal.
 */
export function AccessibleDialog({
  open,
  onClose,
  ariaLabelledBy,
  ariaLabel,
  closeOnEscape = true,
  closeOnBackdropClick = true,
  zIndexClassName = "z-50",
  overlayClassName = "p-4",
  contentClassName = "w-full max-w-lg rounded-xl border border-border bg-card p-6 text-card-foreground shadow-2xl shadow-black/60",
  initialFocusRef,
  children,
}: AccessibleDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const dialogElement = dialogRef.current;
    if (!dialogElement) {
      return;
    }

    previousActiveElementRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const focusTarget =
      initialFocusRef?.current ??
      getFocusableElements(dialogElement)[0] ??
      dialogElement;

    const rafId = window.requestAnimationFrame(() => {
      if (focusTarget.isConnected) {
        focusTarget.focus({ preventScroll: true });
      }
    });

    function handleKeyDown(event: KeyboardEvent) {
      const currentDialog = dialogRef.current;
      if (!currentDialog || !isTopmostModal(currentDialog)) {
        return;
      }

      if (event.key === "Escape") {
        if (closeOnEscape) {
          event.preventDefault();
          event.stopPropagation();
          onCloseRef.current();
        }
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusable = getFocusableElements(currentDialog);
      if (focusable.length === 0) {
        event.preventDefault();
        currentDialog.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !currentDialog.contains(active)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (active === last || !currentDialog.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(rafId);
      document.removeEventListener("keydown", handleKeyDown);

      const previousElement = previousActiveElementRef.current;
      if (previousElement && previousElement.isConnected) {
        previousElement.focus({ preventScroll: true });
      }
    };
  }, [open, closeOnEscape, initialFocusRef]);

  if (!open) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={ariaLabelledBy}
      aria-label={ariaLabel}
      ref={dialogRef}
      tabIndex={-1}
      onClick={(event) => {
        if (closeOnBackdropClick && event.target === event.currentTarget) {
          onClose();
        }
      }}
      className={`fixed inset-0 ${zIndexClassName} flex items-center justify-center bg-black/70 backdrop-blur-xs ${overlayClassName}`.trim()}
    >
      <div className={`mc-modal-enter ${contentClassName}`.trim()}>
        {children}
      </div>
    </div>
  );
}

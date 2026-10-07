import { useEffect, useId, useRef, type ReactNode } from "react";
import clsx from "clsx";
import { X } from "lucide-react";

export type DialogSize = "sm" | "md" | "lg" | "xl";
export type DialogSide = "center" | "right" | "bottom";

export type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Subtitle under the title; named to the dialog via aria-describedby. */
  description?: ReactNode;
  /** Primary actions, right-aligned. */
  footer?: ReactNode;
  /**
   * `center` is a modal; `right` is a side drawer and `bottom` a mobile sheet.
   * One component serves all three so the escape/backdrop/scroll behaviour is
   * written once and never forked into a second, subtly different overlay.
   */
  side?: DialogSide;
  size?: DialogSize;
  /** Hide the close affordance (for a dialog that must be answered). */
  dismissible?: boolean;
  className?: string;
  children?: ReactNode;
};

const SIZE_CLASSES: Record<DialogSize, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
};

const SIDE_PANEL: Record<DialogSide, string> = {
  center: "m-auto max-h-[calc(100dvh-2rem)] rounded-xl",
  right: "ml-auto h-dvh w-full rounded-none sm:w-[28rem] sm:rounded-l-xl",
  bottom: "mt-auto w-full rounded-t-xl",
};

const SIDE_DIALOG: Record<DialogSide, string> = {
  center: "items-center",
  right: "items-stretch",
  bottom: "items-end",
};

/**
 * The overlay every confirmation and detail sheet uses.
 *
 * The accessible contract is met in markup (role, aria-modal, title linkage) and
 * the interactive parts — Escape to dismiss, click-outside, body-scroll lock,
 * initial focus — run in effects so they behave in a real browser. This suite
 * renders to a static string, so only the markup those effects rely on is
 * asserted; the key handling and scroll lock are not exercised here.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  footer,
  side = "center",
  size = "md",
  dismissible = true,
  className,
  children,
}: DialogProps) {
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const descriptionId = `${baseId}-desc`;
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && dismissible) onClose();
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, dismissible, onClose]);

  if (!open) return null;

  return (
    <div
      // Clicking the backdrop (not the panel) closes; the panel stops propagation
      // so interacting with its contents never dismisses the dialog.
      onMouseDown={(event) => {
        if (dismissible && event.target === event.currentTarget) onClose();
      }}
      className={clsx(
        "fixed inset-0 z-50 flex justify-center bg-ink/40 px-4",
        SIDE_DIALOG[side],
      )}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description !== undefined ? descriptionId : undefined}
        tabIndex={-1}
        className={clsx(
          "flex w-full flex-col bg-surface shadow-raised outline-none",
          "max-w-full",
          side === "center" && SIZE_CLASSES[size],
          SIDE_PANEL[side],
          className,
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 id={titleId} className="truncate text-base font-semibold text-ink">
              {title}
            </h2>
            {description !== undefined && (
              <p id={descriptionId} className="mt-0.5 text-xs leading-relaxed text-muted">
                {description}
              </p>
            )}
          </div>
          {dismissible && (
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="-mr-1 flex size-9 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-sunken hover:text-ink"
            >
              <X className="size-5" aria-hidden />
            </button>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>

        {footer !== undefined && (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-4 py-3 sm:px-5">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

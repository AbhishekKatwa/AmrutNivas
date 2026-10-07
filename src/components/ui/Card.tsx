import { type ReactNode } from "react";
import clsx from "clsx";

export type CardProps = {
  /** Rendered as the card's h2/h3 heading level is chosen by the page, so it is a label, not markup. */
  title?: ReactNode;
  description?: ReactNode;
  /** Right-aligned actions in the header row (a button, a menu). */
  actions?: ReactNode;
  footer?: ReactNode;
  /** Set false when the card contains its own full-bleed table. */
  padded?: boolean;
  className?: string;
  children?: ReactNode;
};

/**
 * Surface + hairline border + one soft shadow. That is the whole recipe; a card
 * that needs more is a layering problem, not a styling problem.
 */
export function Card({
  title,
  description,
  actions,
  footer,
  padded = true,
  className,
  children,
}: CardProps) {
  const hasHeader = title !== undefined || description !== undefined || actions !== undefined;
  return (
    <section
      className={clsx(
        "rounded-lg border border-line bg-surface shadow-soft",
        className,
      )}
    >
      {hasHeader && (
        <header className="flex items-start justify-between gap-4 border-b border-line px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {title !== undefined && (
              <h3 className="truncate text-sm font-semibold text-ink">{title}</h3>
            )}
            {description !== undefined && (
              <p className="mt-0.5 text-xs leading-relaxed text-muted">{description}</p>
            )}
          </div>
          {actions !== undefined && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={clsx(padded && "px-4 py-4 sm:px-5")}>{children}</div>
      {footer !== undefined && (
        <footer className="border-t border-line px-4 py-3 text-xs text-muted sm:px-5">{footer}</footer>
      )}
    </section>
  );
}

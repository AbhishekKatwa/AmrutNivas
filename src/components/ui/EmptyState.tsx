import { type ReactNode } from "react";
import clsx from "clsx";

export type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  /**
   * What is missing and why. "No data" on its own is never acceptable: the user
   * cannot tell an empty tenant from a broken query.
   */
  description: string;
  action?: ReactNode;
  className?: string;
};

/**
 * The honest empty state. Used wherever a list, table or figure has nothing
 * behind it yet — never a zero, a dash or a skeleton standing in for a number.
 */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={clsx(
        "flex flex-col items-start gap-3 rounded-md border border-dashed border-line-strong",
        "bg-surface-sunken px-4 py-6 sm:px-6",
        className,
      )}
    >
      {icon !== undefined && <div className="text-muted [&_svg]:size-5">{icon}</div>}
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="mt-1 max-w-prose text-xs leading-relaxed text-muted">{description}</p>
      </div>
      {action !== undefined && <div className="pt-1">{action}</div>}
    </div>
  );
}

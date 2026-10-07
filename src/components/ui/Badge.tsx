import { type ReactNode } from "react";
import clsx from "clsx";

export type BadgeTone = "neutral" | "muted" | "brand" | "warning" | "danger" | "success";

export type BadgeProps = {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
};

/**
 * Status text at label scale. Tone carries meaning, so neutral is the default —
 * a screen where every badge is coloured communicates nothing.
 */
const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-surface-sunken text-muted border-line",
  // Terminal/retired reads flatter than neutral: no fill, so it recedes on the page.
  muted: "bg-surface text-muted border-line",
  brand: "bg-brand-50 text-brand-700 border-brand-100",
  warning: "bg-warning-soft text-warning border-[#eddcb4]",
  danger: "bg-danger-soft text-danger border-[#f2d4d1]",
  success: "bg-success-soft text-success border-[#cfe4d6]",
};

export function Badge({ tone = "neutral", className, children }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-sm border px-2 py-0.5",
        "text-[11px] font-medium leading-5 whitespace-nowrap",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

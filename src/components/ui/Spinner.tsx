import { type ReactNode } from "react";
import clsx from "clsx";

export type SpinnerProps = {
  size?: "sm" | "md" | "lg";
  /** Accessible name for the loading state; defaults to "Loading". */
  label?: string;
  /**
   * Render as a decorative ring with no live region. Used when the spinner sits
   * inside a parent that already announces the wait (e.g. `LoadingBlock`), so the
   * state is announced once rather than twice.
   */
  decorative?: boolean;
  className?: string;
};

const SPINNER_SIZE: Record<NonNullable<SpinnerProps["size"]>, string> = {
  sm: "size-4 border-2",
  md: "size-6 border-2",
  lg: "size-8 border-[3px]",
};

/**
 * The single spinner. A ring, not an image, so it inherits the brand colour and
 * respects `prefers-reduced-motion` (the base layer disables its animation). On its
 * own it is a live status, so a screen reader says "Loading" rather than silently
 * sitting on an empty region; with `decorative` it is just the visual ring.
 */
export function Spinner({ size = "md", label = "Loading", decorative = false, className }: SpinnerProps) {
  return (
    <span
      role={decorative ? undefined : "status"}
      aria-live={decorative ? undefined : "polite"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : label}
      className={clsx(
        "inline-block shrink-0 animate-spin rounded-full",
        "border-brand-100 border-t-brand-600",
        SPINNER_SIZE[size],
        className,
      )}
    />
  );
}

/** A single pulsing placeholder block. Decorative — the live region lives on `LoadingBlock`. */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={clsx("block animate-pulse rounded-md bg-surface-sunken", className)} />;
}

export type LoadingBlockProps = {
  /** A message shown under the spinner. Omit for a pure skeleton. */
  label?: ReactNode;
  /** Number of skeleton rows to draw when `label` is absent. */
  rows?: number;
  className?: string;
};

/**
 * A loading state for a whole region — a table body, a detail panel — as either a
 * centred spinner (when a message accompanies it) or a stack of skeleton lines.
 * The wrapper carries the live region so the wait is announced once, not per bar.
 */
export function LoadingBlock({ label, rows = 4, className }: LoadingBlockProps) {
  if (label !== undefined) {
    return (
      <div
        role="status"
        aria-live="polite"
        className={clsx("flex flex-col items-center justify-center gap-3 py-8 text-sm text-muted", className)}
      >
        <Spinner decorative />
        <span>{label}</span>
      </div>
    );
  }

  return (
    <div role="status" aria-live="polite" aria-label="Loading" className={clsx("flex flex-col gap-3", className)}>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-5 w-full" />
      ))}
      {/* The bare element has no text, so the accessible name is supplied above. */}
    </div>
  );
}

import { type ButtonHTMLAttributes, type ReactNode } from "react";
import clsx from "clsx";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  /** Leading lucide icon element; spacing is handled here, not at the call site. */
  icon?: ReactNode;
  block?: boolean;
};

/**
 * The only button in the system. Filled primary is used once per view; danger is
 * reserved for destructive, usually irreversible actions.
 *
 * `md` is 44px tall so the default button is already a valid touch target on a
 * phone; `sm` is a 36px dense-table affordance and must not be used for primary
 * mobile actions.
 */
const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-white border border-brand-700 hover:bg-brand-700 active:bg-brand-900",
  secondary:
    "bg-surface text-ink border border-line-strong hover:bg-brand-50 hover:border-brand-100",
  ghost:
    "bg-transparent text-brand-700 border border-transparent hover:bg-brand-50",
  danger:
    "bg-danger text-white border border-danger hover:bg-[#8d201a] active:bg-[#7a1b16]",
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "h-9 px-3 text-sm gap-1.5",
  md: "h-11 px-4 text-sm gap-2",
  lg: "h-12 px-5 text-base gap-2",
};

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  block = false,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center rounded-md font-medium",
        "transition-colors select-none",
        "disabled:pointer-events-none disabled:opacity-45",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        block && "w-full",
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

import { useId, type ReactNode } from "react";
import clsx from "clsx";
import { useFieldContext } from "./Field";

export type SwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
};

/**
 * A real `role="switch"` toggle for a binary access decision (e.g. "all properties").
 *
 * It is a `<button>` because a switch is a control that flips, not a checkbox form
 * field; `aria-checked` carries the state and the native keyboard behaviour of a
 * button (Space/Enter to toggle) comes for free. The label is bound by `id` +
 * `htmlFor` so the whole row is one accessible target.
 */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  id,
  className,
}: SwitchProps) {
  const field = useFieldContext();
  const autoId = useId();
  const controlId = id ?? field?.controlId ?? autoId;

  return (
    <div className={clsx("flex items-start justify-between gap-4", className)}>
      <label htmlFor={controlId} className="min-w-0 cursor-pointer select-none">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description !== undefined && (
          <span className="mt-0.5 block text-xs leading-relaxed text-muted">{description}</span>
        )}
      </label>
      <button
        type="button"
        id={controlId}
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx(
          "relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border",
          "transition-colors outline-none",
          checked ? "border-brand-700 bg-brand-600" : "border-line-strong bg-surface-sunken",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <span
          aria-hidden
          className={clsx(
            "inline-block size-4 rounded-full bg-surface shadow-soft transition-transform",
            checked ? "translate-x-6" : "translate-x-1",
          )}
        />
      </button>
    </div>
  );
}

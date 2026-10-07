import { useId, type ReactNode } from "react";
import clsx from "clsx";
import { useFieldContext } from "./Field";

export type CheckboxProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  /** Passed through so a native form can group selections by name/value. */
  name?: string;
  value?: string;
  id?: string;
  className?: string;
};

/**
 * A native checkbox for the multi-select access screens (pick properties, pick
 * outlets). Deliberately a real `<input type="checkbox">` rather than a styled
 * div: it participates in form semantics, is announced by every screen reader
 * without extra ARIA, and its keyboard behaviour needs no code. `accent-brand-600`
 * tints the box to the brand without a hand-built checkbox.
 */
export function Checkbox({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  name,
  value,
  id,
  className,
}: CheckboxProps) {
  const field = useFieldContext();
  const autoId = useId();
  const controlId = id ?? field?.controlId ?? autoId;

  const input = (
    <input
      type="checkbox"
      id={controlId}
      name={name}
      value={value}
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
      className={clsx(
        "mt-0.5 size-4 shrink-0 cursor-pointer rounded-sm border-line-strong accent-brand-600",
        disabled && "cursor-not-allowed opacity-50",
      )}
    />
  );

  if (label === undefined && description === undefined) {
    return <span className={clsx("inline-flex", className)}>{input}</span>;
  }

  return (
    <label
      htmlFor={controlId}
      className={clsx(
        "flex cursor-pointer items-start gap-3 select-none",
        disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      {input}
      <span className="min-w-0">
        {label !== undefined && (
          <span className="block text-sm font-medium text-ink">{label}</span>
        )}
        {description !== undefined && (
          <span className="mt-0.5 block text-xs leading-relaxed text-muted">{description}</span>
        )}
      </span>
    </label>
  );
}

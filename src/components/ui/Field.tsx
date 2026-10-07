import { createContext, useContext, useId, type ReactNode } from "react";
import clsx from "clsx";

/**
 * The wiring a control inherits from the `Field` that wraps it.
 *
 * A form control must agree with its label and its description on the same ids,
 * and the two live in different components. Rather than make every call site pass
 * the id twice (and get one of them wrong), `Field` publishes the linkage here and
 * `TextInput` / `Textarea` / `SelectInput` read it. A control used on its own, with
 * no `Field` around it, simply falls back to the props it was given.
 */
export type FieldContextValue = {
  controlId: string;
  /** Space-separated ids of the hint and error elements, or undefined. */
  describedBy?: string;
  invalid: boolean;
  required: boolean;
};

const FieldContext = createContext<FieldContextValue | null>(null);

/** Internal: the control side of the link. Not part of the public surface. */
export function useFieldContext(): FieldContextValue | null {
  return useContext(FieldContext);
}

export type FieldProps = {
  /**
   * The control's DOM id, shared with the label's `htmlFor`. When omitted a stable
   * id is generated so a lone `Field` is still correctly linked — but screens that
   * assert on an id (or route focus to one) should pass it explicitly.
   */
  id?: string;
  label: ReactNode;
  /** Secondary help shown under the control and named to assistive tech. */
  hint?: ReactNode;
  /** Validation message; its presence marks the field invalid. */
  error?: ReactNode;
  /** Marks the field required with a symbol plus text, never colour alone. */
  required?: boolean;
  /** Label for the required marker; kept terse so it can be reworded per locale. */
  requiredMarker?: ReactNode;
  /** Visually hide the label while keeping it for assistive tech (icon-only rows). */
  hideLabel?: boolean;
  className?: string;
  children: ReactNode;
};

/**
 * The label + control + hint + error wrapper every admin form is built from.
 *
 * Accessibility is the whole point of this component, not an afterthought: the
 * label is linked by `for`/`id`, the hint and the error are both named to the
 * control through one `aria-describedby`, and the error is announced through a
 * live region so a message that appears after a keystroke is actually read out.
 */
export function Field({
  id,
  label,
  hint,
  error,
  required = false,
  requiredMarker = "required",
  hideLabel = false,
  className,
  children,
}: FieldProps) {
  const autoId = useId();
  const controlId = id ?? autoId;
  const hintId = hint !== undefined ? `${controlId}-hint` : undefined;
  const errorId = error !== undefined ? `${controlId}-error` : undefined;
  const describedBy =
    [hintId, errorId].filter((part): part is string => part !== undefined).join(" ") || undefined;

  return (
    <FieldContext.Provider
      value={{ controlId, describedBy, invalid: error !== undefined, required }}
    >
      <div className={clsx("flex flex-col gap-1.5", className)}>
        <label
          htmlFor={controlId}
          className={clsx(
            "text-[13px] font-medium text-ink",
            hideLabel && "sr-only",
          )}
        >
          {label}
          {required && (
            <span className="ml-1.5 font-normal text-muted">
              {/* A symbol, not a colour, so it survives colour-blindness and
                  greyscale; the word is there for assistive tech only. */}
              <span aria-hidden="true">*</span>
              <span className="sr-only">{requiredMarker}</span>
            </span>
          )}
        </label>

        {children}

        {hint !== undefined && (
          <p id={hintId} className="text-xs leading-relaxed text-muted">
            {hint}
          </p>
        )}
        {error !== undefined && (
          <p id={errorId} role="status" aria-live="polite" className="text-xs leading-relaxed text-danger">
            {error}
          </p>
        )}
      </div>
    </FieldContext.Provider>
  );
}

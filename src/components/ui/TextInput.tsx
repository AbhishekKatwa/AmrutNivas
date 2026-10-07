import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import clsx from "clsx";
import { useFieldContext } from "./Field";

export type TextInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  /** A lucide element at the left of the field; spacing is owned here. */
  leadingIcon?: ReactNode;
  /** A node at the right — typically a clear or reveal button. */
  trailing?: ReactNode;
  /** Static text pinned after the value: a slug suffix, a unit, a code root. */
  suffix?: ReactNode;
  /** Forces the invalid look; otherwise inherited from the wrapping `Field`. */
  invalid?: boolean;
  size?: "sm" | "md";
};

/**
 * The single-line text control. The chrome (border, focus ring, invalid state)
 * lives on the wrapper so an icon or suffix sits inside the same bordered field;
 * the `<input>` itself is bare. `id` and `aria-describedby` are inherited from a
 * parent `Field` when not passed directly, so a control can never be wired to the
 * wrong label.
 */
export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { leadingIcon, trailing, suffix, invalid, size = "md", className, id, ...rest },
  ref,
) {
  const field = useFieldContext();
  const resolvedId = id ?? field?.controlId;
  const describedBy = rest["aria-describedby"] ?? field?.describedBy;
  const isInvalid = invalid ?? field?.invalid ?? false;

  return (
    <div
      className={clsx(
        "flex items-stretch overflow-hidden rounded-md border bg-surface transition-colors",
        "border-line hover:border-line-strong focus-within:border-brand-500",
        isInvalid && "border-danger focus-within:border-danger",
        rest.disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      {leadingIcon !== undefined && (
        <span className="flex shrink-0 items-center pl-3 text-muted [&_svg]:size-4">
          {leadingIcon}
        </span>
      )}
      <input
        ref={ref}
        id={resolvedId}
        aria-describedby={describedBy}
        aria-invalid={isInvalid || undefined}
        className={clsx(
          "min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-muted",
          "outline-none disabled:cursor-not-allowed",
          size === "sm" ? "h-9" : "h-11",
          leadingIcon === undefined ? "pl-3.5" : "pl-2",
          trailing === undefined && suffix === undefined ? "pr-3.5" : "pr-1.5",
        )}
        {...rest}
      />
      {suffix !== undefined && (
        <span className="flex shrink-0 items-center border-l border-line bg-surface-sunken px-3 text-sm text-muted">
          {suffix}
        </span>
      )}
      {trailing !== undefined && (
        <span className="flex shrink-0 items-center pr-1.5 text-muted [&_svg]:size-4">
          {trailing}
        </span>
      )}
    </div>
  );
});

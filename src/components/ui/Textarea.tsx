import { forwardRef, type TextareaHTMLAttributes } from "react";
import clsx from "clsx";
import { useFieldContext } from "./Field";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  /** Forces the invalid look; otherwise inherited from the wrapping `Field`. */
  invalid?: boolean;
};

/**
 * The multiline control, sharing `TextInput`'s border/focus/invalid language so a
 * form reads as one system. Ids and `aria-describedby` are inherited from `Field`.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, className, id, ...rest },
  ref,
) {
  const field = useFieldContext();
  const resolvedId = id ?? field?.controlId;
  const describedBy = rest["aria-describedby"] ?? field?.describedBy;
  const isInvalid = invalid ?? field?.invalid ?? false;

  return (
    <textarea
      ref={ref}
      id={resolvedId}
      aria-describedby={describedBy}
      aria-invalid={isInvalid || undefined}
      className={clsx(
        "min-h-[5rem] w-full resize-y rounded-md border bg-surface px-3.5 py-2.5 text-sm",
        "text-ink placeholder:text-muted transition-colors",
        "border-line hover:border-line-strong focus:border-brand-500",
        isInvalid && "border-danger focus:border-danger",
        rest.disabled && "cursor-not-allowed opacity-60",
        className,
      )}
      {...rest}
    />
  );
});

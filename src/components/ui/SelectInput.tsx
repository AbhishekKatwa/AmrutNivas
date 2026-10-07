import {
  useId,
  type ChangeEvent,
  type SelectHTMLAttributes,
} from "react";
import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import { useFieldContext } from "./Field";

export type SelectOption<T extends string> = {
  value: T;
  label: string;
  /** Optional helper surfaced as the option's tooltip. */
  description?: string;
  /** When present, the option is grouped under this label in the list. */
  group?: string;
};

export type SelectInputProps<T extends string> = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "onChange" | "value"
> & {
  /**
   * The values to render — supplied by the caller from a `const` array in
   * `domain/identity`. A picker never carries its own copy of the taxonomy, which
   * is exactly how the donor project's property-type list drifted and a write
   * failed at the database door.
   */
  options: readonly SelectOption<T>[];
  value?: T | "";
  onChange?: (value: T) => void;
  /** Placeholder option (empty value) shown before a choice is made. */
  placeholder?: string;
  /** Forces the invalid look; otherwise inherited from the wrapping `Field`. */
  invalid?: boolean;
};

/**
 * The one select in the system. A native `<select>` is deliberately chosen over a
 * custom listbox: it is keyboard- and screen-reader-correct with no focus
 * management of our own, and it is styled here to the token language so it looks
 * like every other control. `onChange` hands back the option's typed `value`, never
 * a raw string, so a caller can only ever receive a value it offered.
 */
export function SelectInput<T extends string>({
  options,
  value,
  onChange,
  placeholder,
  invalid,
  className,
  id,
  ...rest
}: SelectInputProps<T>) {
  const field = useFieldContext();
  const autoId = useId();
  const resolvedId = id ?? field?.controlId ?? autoId;
  const describedBy = rest["aria-describedby"] ?? field?.describedBy;
  const isInvalid = invalid ?? field?.invalid ?? false;

  const grouped = options.some((option) => option.group !== undefined);

  const handle = (event: ChangeEvent<HTMLSelectElement>): void => {
    const chosen = options.find((option) => option.value === event.target.value);
    if (chosen !== undefined) onChange?.(chosen.value);
  };

  const renderOption = (option: SelectOption<T>) => (
    <option
      key={option.value}
      value={option.value}
      title={option.description}
      // A value that is the current selection must still render; an empty value is
      // reserved for the placeholder, so a real option is never blank.
      disabled={option.value === ""}
    >
      {option.label}
    </option>
  );

  return (
    <div className="relative">
      <select
        id={resolvedId}
        aria-describedby={describedBy}
        aria-invalid={isInvalid || undefined}
        value={value}
        onChange={handle}
        className={clsx(
          "h-11 w-full appearance-none rounded-md border bg-surface pl-3.5 pr-10 text-sm",
          "text-ink transition-colors",
          "border-line hover:border-line-strong focus:border-brand-500",
          value === "" && "text-muted",
          isInvalid && "border-danger focus:border-danger",
          rest.disabled && "cursor-not-allowed opacity-60",
          className,
        )}
        {...rest}
      >
        {placeholder !== undefined && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {grouped
          ? options.map((option) =>
              option.group === undefined ? (
                renderOption(option)
              ) : (
                <optgroup key={`${option.group}-${option.value}`} label={option.group}>
                  {renderOption(option)}
                </optgroup>
              ),
            )
          : options.map(renderOption)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
    </div>
  );
}

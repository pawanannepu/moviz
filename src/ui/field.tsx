import { useId } from "react";
import { Input } from "@/ui/primitives/input";
import { Label } from "@/ui/primitives/label";

type FieldProps = Omit<React.ComponentProps<typeof Input>, "id"> & {
  label: string;
  /** Help text shown under the input. */
  hint?: string;
  /** Error text. When set, the input is marked invalid. */
  error?: string;
  /** Optional id. One is generated when left out. */
  id?: string;
};

/**
 * A labelled input. It generates the ids, links the hint and the error to the
 * input with `aria-describedby` (hint first, then error), and sets
 * `aria-invalid` while there is an error (spec 0004, AC-6).
 */
export function Field({ label, hint, error, id, ...inputProps }: FieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;

  const describedBy =
    [
      hint ? hintId : null,
      error ? errorId : null,
      inputProps["aria-describedby"],
    ]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={inputId}>{label}</Label>
      <Input
        {...inputProps}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      {hint ? (
        <p id={hintId} className="type-small">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-destructive text-sm leading-snug">
          {error}
        </p>
      ) : null}
    </div>
  );
}

"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Field } from "@/ui/field";
import { Button } from "@/ui/primitives/button";

type PasswordFieldProps = Omit<React.ComponentProps<typeof Field>, "type"> & {
  /** `new-password` on sign up and reset, `current-password` on sign in. */
  autoComplete: "new-password" | "current-password";
};

/**
 * A password input with a show password toggle (spec 0005, AC-10). The toggle
 * keeps one label and reports its state with `aria-pressed`.
 */
export function PasswordField(props: PasswordFieldProps) {
  const [shown, setShown] = useState(false);

  return (
    <div className="flex flex-col gap-1">
      <Field
        {...props}
        type={shown ? "text" : "password"}
        autoCapitalize="none"
        spellCheck={false}
      />
      <Button
        type="button"
        variant="ghost"
        aria-pressed={shown}
        onClick={() => setShown((value) => !value)}
        className="self-start"
      >
        {shown ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        Show password
      </Button>
    </div>
  );
}

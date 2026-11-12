"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { SIGN_IN_PATH } from "@/auth/paths";
import { Button } from "@/ui/primitives/button";
import { type SetCountryResult, setCountryAction } from "./actions";
import {
  CANCEL_LABEL,
  CHANGE_COUNTRY_LABEL,
  CHOOSE_COUNTRY_OPTION,
  CHOOSE_FIRST,
  COUNTRY_SELECT_LABEL,
  SAVE_ERROR,
  SAVE_LABEL,
  SESSION_ENDED,
  SIGN_IN_AGAIN_LABEL,
} from "./constants";
import type { CountryOption } from "./regions";

type CountryPickerProps = {
  /** The country now in use, or null when there is none (the picker stays open). */
  current: string | null;
  /** Every choosable country with its name, sorted. Built on the server. */
  options: CountryOption[];
  /** Where focus goes once the page shows the saved country (AC-6). */
  focusTargetId: string;
  /** Replaceable for the `/design` page. Defaults to `setCountryAction`. */
  save?: (input: { country: string }) => Promise<SetCountryResult>;
};

type Status = "idle" | "error" | "choose_first" | "session_ended";

/**
 * The "Change country" disclosure (spec 0013, AC-6, AC-10). Pressing it shows
 * a labelled native select and Save. Saving stores the country as the user's
 * own choice, refreshes the page so the section shows that country, and then
 * moves focus to `focusTargetId`. Escape or Cancel closes it and returns focus
 * to "Change country". With no country yet it is open from the start and has
 * no Cancel. Also used by the account page (spec 0014).
 */
export function CountryPicker({
  current,
  options,
  focusTargetId,
  save = setCountryAction,
}: CountryPickerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const selectId = useId();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(current ?? "");
  const [status, setStatus] = useState<Status>("idle");
  const [pending, startTransition] = useTransition();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const focusAfterRefresh = useRef(false);
  const focusSelectOnOpen = useRef(false);

  const isOpen = open || current === null;

  // Once the refresh after a save settles, focus the saved country's line.
  useEffect(() => {
    if (pending || !focusAfterRefresh.current) return;
    focusAfterRefresh.current = false;
    document.getElementById(focusTargetId)?.focus();
  }, [pending, focusTargetId]);

  useEffect(() => {
    if (!isOpen || !focusSelectOnOpen.current) return;
    focusSelectOnOpen.current = false;
    selectRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    setSelected(current ?? "");
  }, [current]);

  function close() {
    setOpen(false);
    setStatus("idle");
    setSelected(current ?? "");
    window.requestAnimationFrame(() => toggleRef.current?.focus());
  }

  function submit() {
    if (pending) return;
    if (selected === "") {
      setStatus("choose_first");
      return;
    }
    setStatus("idle");
    startTransition(async () => {
      const result = await save({ country: selected });
      if (!result.ok) {
        setStatus(
          result.error.code === "unauthenticated" ? "session_ended" : "error",
        );
        return;
      }
      focusAfterRefresh.current = true;
      setOpen(false);
      startTransition(() => router.refresh());
    });
  }

  if (!isOpen) {
    return (
      <Button
        ref={toggleRef}
        type="button"
        variant="secondary"
        aria-expanded={false}
        onClick={() => {
          focusSelectOnOpen.current = true;
          setOpen(true);
        }}
      >
        {CHANGE_COUNTRY_LABEL}
      </Button>
    );
  }

  const signInHref = `${SIGN_IN_PATH}?returnTo=${encodeURIComponent(pathname)}`;

  return (
    <form
      data-slot="country-picker"
      aria-busy={pending}
      className="flex flex-col items-start gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && current !== null) {
          event.preventDefault();
          close();
        }
      }}
    >
      <div className="flex w-full flex-wrap items-end gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <label htmlFor={selectId} className="type-small">
            {COUNTRY_SELECT_LABEL}
          </label>
          <select
            ref={selectRef}
            id={selectId}
            className="min-h-11 max-w-full rounded-control border border-input bg-card px-3 text-foreground"
            value={selected}
            onChange={(event) => {
              setSelected(event.currentTarget.value);
              if (status === "choose_first") setStatus("idle");
            }}
          >
            {current === null ? (
              <option value="">{CHOOSE_COUNTRY_OPTION}</option>
            ) : null}
            {options.map((option) => (
              <option key={option.code} value={option.code}>
                {option.name}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" aria-disabled={pending || undefined}>
          {SAVE_LABEL}
        </Button>
        {current !== null ? (
          <Button type="button" variant="ghost" onClick={close}>
            {CANCEL_LABEL}
          </Button>
        ) : null}
      </div>
      {status === "error" || status === "choose_first" ? (
        <p role="alert" className="type-small text-destructive">
          {status === "error" ? SAVE_ERROR : CHOOSE_FIRST}
        </p>
      ) : null}
      {status === "session_ended" ? (
        <p role="alert" className="type-small">
          {SESSION_ENDED}{" "}
          <Link
            href={signInHref}
            className="inline-flex min-h-11 items-center underline"
          >
            {SIGN_IN_AGAIN_LABEL}
          </Link>
        </p>
      ) : null}
    </form>
  );
}

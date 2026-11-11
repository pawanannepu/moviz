"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useRef } from "react";
import { SIGN_IN_PATH } from "@/auth/paths";
import { FileField } from "@/ui/file-field";
import { Button } from "@/ui/primitives/button";
import { ErrorState } from "@/ui/states/error-state";
import { IMPORT_PATH } from "./constants";
import {
  FILE_FIELD_HINT,
  FILE_FIELD_LABEL,
  IMPORT_ERROR_TITLES,
  type ImportErrorCode,
  importErrorBody,
  importedAnnouncement,
  SUBMIT_LABEL,
  SUBMIT_WORKING_LABEL,
  WORKING_STATUS,
} from "./messages";

/** Where the form is: waiting, sending, done, or refused. */
export type ImportFormStatus =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "success"; matched: number; total: number }
  | { kind: "error"; code: ImportErrorCode; resetAt?: Date };

type ImportFormViewProps = {
  status: ImportFormStatus;
  /** Called with the chosen file, or null when none is chosen. Ignored while `working`. */
  onSubmit: (file: File | null) => void;
  /** Called by "Try again" on an error. The view moves focus back to the file field. */
  onDismissError: () => void;
  /** Move focus to the alert when an error appears. Only the `/design` page turns it off. */
  focusAlert?: boolean;
};

const SIGN_IN_AGAIN = `${SIGN_IN_PATH}?returnTo=${encodeURIComponent(IMPORT_PATH)}`;

/**
 * The upload form and its status (spec 0009, AC-3, AC-14). It shows no logic of
 * its own, so the `/design` page can render every state. The status line is a
 * live region that is always mounted, so "Importing" and "Imported 120 of 480
 * ratings" are announced. An error is an alert; focus moves to it when it
 * appears, and "Try again" returns focus to the file field. While `working` the
 * button uses `aria-disabled`, not `disabled`, so focus stays where it was.
 */
export function ImportFormView({
  status,
  onSubmit,
  onDismissError,
  focusAlert = true,
}: ImportFormViewProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const working = status.kind === "working";

  useEffect(() => {
    if (status.kind === "error" && focusAlert) alertRef.current?.focus();
    // A finished import clears the picker, so a second press cannot re send the file.
    if (status.kind === "success" && fileRef.current) {
      fileRef.current.value = "";
    }
  }, [status, focusAlert]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (working) return;
    onSubmit(fileRef.current?.files?.[0] ?? null);
  }

  function dismiss() {
    onDismissError();
    fileRef.current?.focus();
  }

  const statusText =
    status.kind === "working"
      ? WORKING_STATUS
      : status.kind === "success"
        ? importedAnnouncement(status.matched, status.total)
        : "";

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <FileField
          ref={fileRef}
          label={FILE_FIELD_LABEL}
          hint={FILE_FIELD_HINT}
          accept=".csv,text/csv"
          name="file"
        />
        <div>
          <Button
            type="submit"
            aria-disabled={working || undefined}
            aria-busy={working || undefined}
            className="aria-disabled:cursor-default aria-disabled:opacity-50"
          >
            {working ? SUBMIT_WORKING_LABEL : SUBMIT_LABEL}
          </Button>
        </div>
      </form>
      <p role="status" className="min-h-0 text-muted-foreground">
        {statusText}
      </p>
      {status.kind === "error" ? (
        <div ref={alertRef} tabIndex={-1} className="flex flex-col gap-3">
          <ErrorState
            title={IMPORT_ERROR_TITLES[status.code]}
            body={importErrorBody(status.code, status.resetAt)}
            onRetry={dismiss}
          />
          {status.code === "unauthenticated" ? (
            <div>
              <Button asChild variant="secondary">
                <Link href={SIGN_IN_AGAIN}>Sign in</Link>
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

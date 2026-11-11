"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { IMPORT_API_PATH } from "./constants";
import { type ImportFormStatus, ImportFormView } from "./import-form-view";
import { parseImportAnswer } from "./parse-response";

/**
 * The upload form (spec 0009). It posts the chosen file as `FormData` to the
 * import endpoint with `fetch`, because the request can run for up to a minute
 * and a plain form post would leave a frozen page and no announced status. On
 * success it refreshes the page, so the saved result is the one thing shown
 * (and a reload looks the same). Nothing about the file or the ratings is kept
 * here, logged or sent anywhere else.
 */
export function ImportForm() {
  const router = useRouter();
  const [status, setStatus] = useState<ImportFormStatus>({ kind: "idle" });
  const [, startTransition] = useTransition();

  async function submit(file: File | null) {
    if (status.kind === "working") return;
    if (!file) return setStatus({ kind: "error", code: "no_file" });
    setStatus({ kind: "working" });

    const body = new FormData();
    body.set("file", file);
    let answer: ReturnType<typeof parseImportAnswer>;
    try {
      const response = await fetch(IMPORT_API_PATH, { method: "POST", body });
      const json: unknown = await response.json().catch(() => null);
      answer = parseImportAnswer(response.status, json);
    } catch {
      answer = { kind: "error", code: "db_unavailable" };
    }

    if (answer.kind === "error") {
      return setStatus({
        kind: "error",
        code: answer.code,
        ...(answer.resetAt ? { resetAt: answer.resetAt } : {}),
      });
    }
    setStatus({
      kind: "success",
      matched: answer.matched,
      total: answer.total,
    });
    startTransition(() => router.refresh());
  }

  return (
    <ImportFormView
      status={status}
      onSubmit={submit}
      onDismissError={() => setStatus({ kind: "idle" })}
    />
  );
}

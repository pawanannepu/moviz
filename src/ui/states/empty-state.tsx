import Link from "next/link";
import { Button } from "@/ui/primitives/button";

type EmptyStateProps = {
  title: string;
  body: string;
  /** Heading level when the empty message sits inside a named section. */
  titleAs?: "h2" | "h3";
  /** The next step, as a link. */
  action?: { href: string; label: string };
};

/**
 * Shown when a list has nothing to show yet. It names the next action instead
 * of just saying "nothing here" (spec 0004, AC-14).
 */
export function EmptyState({
  title,
  body,
  action,
  titleAs: Title = "h2",
}: EmptyStateProps) {
  return (
    <section
      data-slot="empty-state"
      className="flex flex-col items-start gap-4 rounded-sheet bg-card p-8"
    >
      <Title className="type-section">{title}</Title>
      <p className="max-w-[62ch] text-muted-foreground">{body}</p>
      {action ? (
        <Button asChild>
          <Link href={action.href}>{action.label}</Link>
        </Button>
      ) : null}
    </section>
  );
}

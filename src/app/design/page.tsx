import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ErrorStateDemo } from "@/ui/design/error-state-demo";
import { isDesignPageHidden } from "@/ui/design/is-design-page-hidden";
import { ToastDemo } from "@/ui/design/toast-demo";
import { Field } from "@/ui/field";
import { Button } from "@/ui/primitives/button";
import { EmptyState } from "@/ui/states/empty-state";
import { LoadingState } from "@/ui/states/loading-state";

export const metadata: Metadata = {
  title: "Design system · Moviz",
  robots: { index: false, follow: false },
};

const COLORS = [
  {
    name: "Pit",
    role: "Page background",
    swatch: "bg-pit",
    text: "text-screen",
  },
  {
    name: "Curtain",
    role: "Raised surfaces",
    swatch: "bg-curtain",
    text: "text-screen",
  },
  {
    name: "Screen",
    role: "Main text and focus ring",
    swatch: "bg-screen",
    text: "text-pit",
  },
  { name: "Dust", role: "Secondary text", swatch: "bg-dust", text: "text-pit" },
  {
    name: "Subtitle",
    role: "Reasons and the next step",
    swatch: "bg-subtitle",
    text: "text-pit",
  },
  { name: "Exit", role: "Errors only", swatch: "bg-exit", text: "text-pit" },
  {
    name: "Edge",
    role: "Borders of controls",
    swatch: "bg-edge",
    text: "text-pit",
  },
] as const;

function Section({
  id,
  title,
  note,
  children,
}: {
  id: string;
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-6 border-t border-card pt-12"
    >
      <div className="flex flex-col gap-2">
        <h2 id={`${id}-title`} className="type-section">
          {title}
        </h2>
        {note ? <p className="type-small max-w-[62ch]">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * The review page: every token and component in every state. Hidden when
 * `VERCEL_ENV` is `production` (spec 0004, AC-17). Rendered per request, so a
 * build never needs the environment.
 */
export default async function DesignPage() {
  await connection();
  const { env } = await import("@/env");
  if (isDesignPageHidden(env.VERCEL_ENV)) notFound();

  return (
    <div className="page-container flex flex-col gap-12 pt-8 pb-16">
      <header className="flex flex-col gap-4">
        <h1 className="type-headline">The subtitle line</h1>
        <p className="max-w-[62ch] text-lg text-muted-foreground">
          Every Moviz token and component, in every state. This page is for
          review and is hidden in production.
        </p>
      </header>

      <Section
        id="color"
        title="Color"
        note="Seven colors, dark only. Yellow marks a reason or the next step. Red marks an error."
      >
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
          {COLORS.map((color) => (
            <li
              key={color.name}
              className="flex flex-col gap-2 rounded-sheet border border-border p-2"
            >
              <div
                className={`${color.swatch} ${color.text} flex aspect-square items-end rounded-poster p-2 font-medium`}
              >
                {color.name}
              </div>
              <p className="type-small">{color.role}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="type"
        title="Type"
        note="Archivo for the wordmark and headlines, Atkinson Hyperlegible Next for the rest."
      >
        <div className="flex flex-col gap-6">
          <p className="type-wordmark">Moviz</p>
          <p className="type-headline">Picks that say why.</p>
          <p className="type-section">Section title</p>
          <p className="type-title">Movie title</p>
          <p className="max-w-[62ch]">
            Body text. Swipe a few movies you know. Every pick Moviz makes comes
            with its reason.
          </p>
          <p className="type-reason">Because you rated Heat highly.</p>
          <p className="type-small">Small text for meta lines and hints.</p>
        </div>
      </Section>

      <Section
        id="buttons"
        title="Buttons"
        note="Four variants, three sizes. Every size is at least 44px high."
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="large">Large</Button>
            <Button>Default</Button>
            <Button size="icon" variant="secondary" aria-label="Icon button">
              +
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled>Primary disabled</Button>
            <Button variant="secondary" disabled>
              Secondary disabled
            </Button>
          </div>
        </div>
      </Section>

      <Section
        id="fields"
        title="Fields"
        note="A label, an input, and optional hint and error text linked with aria-describedby."
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <Field
            label="Email"
            name="email-default"
            type="email"
            placeholder="you@example.com"
          />
          <Field
            label="Email with a hint"
            name="email-hint"
            type="email"
            hint="We only use it to sign you in."
          />
          <Field
            label="Email with an error"
            name="email-error"
            type="email"
            defaultValue="not an email"
            error="Enter an email like you@example.com."
          />
          <Field
            label="Email disabled"
            name="email-disabled"
            type="email"
            disabled
            defaultValue="you@example.com"
          />
        </div>
      </Section>

      <Section id="states" title="States" note="Empty, error and loading.">
        <div className="flex flex-col gap-6">
          <EmptyState
            title="No picks yet"
            body="Swipe a few movies and your first picks show up here."
            action={{ href: "/", label: "Start swiping" }}
          />
          <ErrorStateDemo />
          <LoadingState label="Loading your picks" />
        </div>
      </Section>

      <Section
        id="toasts"
        title="Toasts"
        note="Bottom center, with a close button."
      >
        <ToastDemo />
      </Section>
    </div>
  );
}

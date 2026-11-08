/**
 * "Skip to content": the first focusable element on every page (spec 0004,
 * AC-5). Hidden until it has focus. It moves focus to `main` in the root layout.
 */
export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only rounded-control bg-primary px-4 py-3 font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50"
    >
      Skip to content
    </a>
  );
}

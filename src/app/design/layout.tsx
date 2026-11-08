import { SiteHeader } from "@/ui/site-header";

const DESIGN_LINKS = [
  { href: "/", label: "Home" },
  { href: "/design", label: "Design" },
] as const;

/** The review page is the first user of `SiteHeader`, so it shows it here. */
export default function DesignLayout({ children }: LayoutProps<"/design">) {
  return (
    <>
      <SiteHeader links={DESIGN_LINKS} />
      {children}
    </>
  );
}

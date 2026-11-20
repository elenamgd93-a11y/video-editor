import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { ThemePreferenceRadio } from "@/client/components/ThemePreferenceMenuItems";

/**
 * The frame every page sits in: a bar with the way back to the Gateway and
 * the theme pick, then one scrolling column. The document itself doesn't
 * scroll (src/client/styles/app.css); the column does. A page starts with a
 * `PageHeader`. An app with more than one page puts its tabs or links in
 * `nav`.
 */
export function AppShell({
  nav = <AppNav />,
  wide = false,
  children,
}: {
  nav?: ReactNode;
  /** The editors use the whole width. */
  wide?: boolean;
  children: ReactNode;
}) {
  // From the root route's loader (src/serverFunctions/gateway.ts).
  const gatewayUrl = useRouterState({
    select: (state) => {
      const root = state.matches[0]?.loaderData;
      return root && "gatewayUrl" in root ? root.gatewayUrl : null;
    },
  });
  return (
    <div className="flex h-dvh flex-col">
      <header className="shrink-0 border-b border-border">
        <div
          className={`${wide ? WIDE : COLUMN} flex h-12 items-center justify-between gap-3`}
        >
          <div className="flex min-w-0 items-center gap-4">
            {gatewayUrl ? (
              <a
                href={gatewayUrl}
                className="inline-flex shrink-0 items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronLeft className="size-4" aria-hidden />
                All apps
              </a>
            ) : null}
            {nav}
          </div>
          <ThemePreferenceRadio />
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <main
          className={`${wide ? WIDE : COLUMN} space-y-8 pt-8 pb-24 md:pt-10`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

/** The app's pages, in the bar. */
function AppNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const links = [
    { to: "/", label: "Projects" },
    { to: "/media", label: "Library" },
    { to: "/templates", label: "Templates" },
    { to: "/voiceover", label: "Voiceover" },
  ] as const;
  return (
    <nav className="flex min-w-0 items-center gap-1 overflow-x-auto">
      {links.map((link) => {
        const active =
          link.to === "/"
            ? pathname === "/" || pathname.startsWith("/projects")
            : pathname.startsWith(link.to) ||
              (link.to === "/media" && pathname.startsWith("/photos"));
        return (
          <Link
            key={link.to}
            to={link.to}
            className={`shrink-0 rounded-md px-2 py-1 text-sm transition-colors ${active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** The column the bar and the page share. */
const COLUMN = "mx-auto w-full max-w-5xl px-4 md:px-10";
const WIDE = "mx-auto w-full max-w-screen-2xl px-4 md:px-6";

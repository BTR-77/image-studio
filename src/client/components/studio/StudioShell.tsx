import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AppShell } from "@/client/components/AppShell";

const LINK =
  "text-sm text-muted-foreground transition-colors hover:text-foreground data-[status=active]:font-medium data-[status=active]:text-foreground";

/** The app's frame: the AppShell with the app's own pages beside "All apps". */
export function StudioShell({ children }: { children: ReactNode }) {
  const isAdmin = useRouterState({
    select: (state) => {
      const root = state.matches[0]?.loaderData;
      return Boolean(root && "isAdmin" in root && root.isAdmin);
    },
  });
  return (
    <AppShell
      nav={
        <nav className="flex min-w-0 items-center gap-4 overflow-x-auto">
          <Link to="/" className={LINK} activeOptions={{ exact: true }}>
            Create
          </Link>
          <Link to="/edit" className={LINK}>
            Edit
          </Link>
          <Link to="/history" className={LINK}>
            History
          </Link>
          {isAdmin ? (
            <Link to="/settings" className={LINK}>
              Settings
            </Link>
          ) : null}
        </nav>
      }
    >
      {children}
    </AppShell>
  );
}

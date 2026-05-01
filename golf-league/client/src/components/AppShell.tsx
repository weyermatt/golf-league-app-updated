import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { Logo } from "./Logo";
import {
  LayoutDashboard, CalendarDays, Users, UserCircle, Settings, Shield,
  PlusCircle, LogOut, LogIn, Sun, Moon, Menu, X, Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";

interface NavItem {
  href: string;
  label: string;
  icon: any;
  show: (role: string | null) => boolean;
}

const NAV: NavItem[] = [
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy, show: () => true },
  { href: "/schedule", label: "Schedule", icon: CalendarDays, show: () => true },
  { href: "/players", label: "Players", icon: Users, show: () => true },
  { href: "/my-team", label: "My Team", icon: UserCircle, show: (r) => r === "member" || r === "admin" },
  { href: "/scores/new", label: "Enter Scores", icon: PlusCircle, show: (r) => r === "member" || r === "admin" },
  { href: "/admin", label: "Admin", icon: Shield, show: (r) => r === "admin" },
  { href: "/settings", label: "Settings", icon: Settings, show: (r) => r != null },
];

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth();
  const [location] = useLocation();
  const role = user?.role ?? null;
  return (
    <nav className="flex flex-col gap-1 p-3">
      {NAV.filter(n => n.show(role)).map(n => {
        const active = location === n.href || (n.href !== "/" && location.startsWith(n.href));
        const Icon = n.icon;
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={onNavigate}
            data-testid={`link-nav-${n.label.toLowerCase().replace(/\s+/g, "-")}`}
            className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors hover-elevate ${
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                : "text-sidebar-foreground"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span>{n.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { mode, toggle } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <div className="px-5 py-5 flex items-center gap-2 border-b border-sidebar-border">
          <span className="text-sidebar-primary"><Logo className="h-7 w-7" /></span>
          <div>
            <div className="font-bold tracking-tight text-base">Golf League</div>
            <div className="text-[11px] text-sidebar-foreground/60 -mt-0.5">2-Man Team</div>
          </div>
        </div>
        <NavList />
        <div className="mt-auto p-3 border-t border-sidebar-border space-y-2">
          {user && (
            <div className="px-3 py-2 text-xs text-sidebar-foreground/70">
              <div className="text-sidebar-foreground font-medium">{user.username}</div>
              <div className="capitalize">{user.role}</div>
            </div>
          )}
          {!user && (
            <Link href="/" data-testid="link-sign-in" className="flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-semibold bg-sidebar-primary text-sidebar-primary-foreground hover-elevate">
              <LogIn className="h-4 w-4" /> Sign in
            </Link>
          )}
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 justify-start text-sidebar-foreground hover-elevate"
              onClick={toggle}
              data-testid="button-toggle-theme"
            >
              {mode === "light" ? <Moon className="h-4 w-4 mr-2" /> : <Sun className="h-4 w-4 mr-2" />}
              {mode === "light" ? "Dark" : "Light"}
            </Button>
            {user && (
              <Button
                variant="ghost"
                size="sm"
                className="text-sidebar-foreground hover-elevate"
                onClick={logout}
                data-testid="button-logout"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between bg-sidebar text-sidebar-foreground border-b border-sidebar-border px-4 h-14">
        <div className="flex items-center gap-2">
          <span className="text-sidebar-primary"><Logo className="h-6 w-6" /></span>
          <span className="font-bold">Golf League</span>
        </div>
        <Button variant="ghost" size="icon" className="text-sidebar-foreground hover-elevate" onClick={() => setOpen(true)} data-testid="button-open-menu">
          <Menu className="h-5 w-5" />
        </Button>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 p-0 bg-sidebar text-sidebar-foreground border-sidebar-border">
          <div className="px-5 py-5 flex items-center justify-between border-b border-sidebar-border">
            <div className="flex items-center gap-2">
              <span className="text-sidebar-primary"><Logo className="h-6 w-6" /></span>
              <span className="font-bold">Golf League</span>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)} className="text-sidebar-foreground" data-testid="button-close-menu">
              <X className="h-5 w-5" />
            </Button>
          </div>
          <NavList onNavigate={() => setOpen(false)} />
          <div className="mt-4 p-3 border-t border-sidebar-border space-y-2">
            {user && <div className="px-3 text-xs"><div className="font-medium">{user.username}</div><div className="capitalize text-sidebar-foreground/60">{user.role}</div></div>}
            {!user && (
              <Link href="/" onClick={() => setOpen(false)} data-testid="link-sign-in-mobile" className="flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-semibold bg-sidebar-primary text-sidebar-primary-foreground hover-elevate">
                <LogIn className="h-4 w-4" /> Sign in
              </Link>
            )}
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="flex-1 justify-start text-sidebar-foreground hover-elevate" onClick={toggle}>
                {mode === "light" ? <Moon className="h-4 w-4 mr-2" /> : <Sun className="h-4 w-4 mr-2" />}
                {mode === "light" ? "Dark" : "Light"}
              </Button>
              {user && (
                <Button variant="ghost" size="sm" className="text-sidebar-foreground hover-elevate" onClick={logout}>
                  <LogOut className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <main className="flex-1 min-w-0 pt-14 md:pt-0">
        <div className="px-4 md:px-8 py-6 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}

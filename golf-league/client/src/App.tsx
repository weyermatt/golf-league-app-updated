import { Switch, Route, Router, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { AppShell } from "@/components/AppShell";
import NotFound from "@/pages/not-found";
import Login from "@/pages/Login";
import Leaderboard from "@/pages/Leaderboard";
import Schedule from "@/pages/Schedule";
import WeekDetail from "@/pages/WeekDetail";
import MyTeam from "@/pages/MyTeam";
import ScoreEntry from "@/pages/ScoreEntry";
import MatchupScore from "@/pages/MatchupScore";
import Players from "@/pages/Players";
import Admin from "@/pages/Admin";
import SettingsPage from "@/pages/Settings";
import { useEffect } from "react";

function Protected({ children, requireRole }: { children: any; requireRole?: "admin" | "member" }) {
  const { user, loading, guestViewing } = useAuth();
  const [, navigate] = useLocation();
  useEffect(() => {
    if (loading) return;
    if (!user) navigate("/");
    else if (requireRole === "admin" && user.role !== "admin") navigate("/leaderboard");
  }, [user, loading, requireRole]);
  if (loading) return <div className="p-8 text-sm text-muted-foreground">Loading...</div>;
  if (!user) return null;
  return children;
}

function PublicOrAuth({ children }: { children: any }) {
  // Guests allowed if guestViewing is enabled
  const { user, loading, guestViewing } = useAuth();
  const [, navigate] = useLocation();
  useEffect(() => {
    if (loading) return;
    if (!user && !guestViewing) navigate("/");
  }, [user, loading, guestViewing]);
  if (loading) return <div className="p-8 text-sm text-muted-foreground">Loading...</div>;
  if (!user && !guestViewing) return null;
  return children;
}

function Routes() {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading...</div>;
  return (
    <Switch>
      <Route path="/" component={Login} />
      <Route path="/leaderboard">{() => <PublicOrAuth><AppShell><Leaderboard /></AppShell></PublicOrAuth>}</Route>
      <Route path="/schedule">{() => <PublicOrAuth><AppShell><Schedule /></AppShell></PublicOrAuth>}</Route>
      <Route path="/weeks/:id">{() => <PublicOrAuth><AppShell><WeekDetail /></AppShell></PublicOrAuth>}</Route>
      <Route path="/players">{() => <PublicOrAuth><AppShell><Players /></AppShell></PublicOrAuth>}</Route>
      <Route path="/my-team">{() => <Protected><AppShell><MyTeam /></AppShell></Protected>}</Route>
      <Route path="/scores/new">{() => <Protected><AppShell><ScoreEntry /></AppShell></Protected>}</Route>
      <Route path="/matchups/:id/score">{() => <Protected><AppShell><MatchupScore /></AppShell></Protected>}</Route>
      <Route path="/admin">{() => <Protected requireRole="admin"><AppShell><Admin /></AppShell></Protected>}</Route>
      <Route path="/settings">{() => <Protected><AppShell><SettingsPage /></AppShell></Protected>}</Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <AuthProvider>
            <Toaster />
            <Router hook={useHashLocation}>
              <Routes />
            </Router>
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;

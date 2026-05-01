import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Logo } from "@/components/Logo";
import { Trophy } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { signIn, guestViewing } = useAuth();
  const [, navigate] = useLocation();

  // Forgot password / recovery
  const [recoverOpen, setRecoverOpen] = useState(false);
  const [recUsername, setRecUsername] = useState("");
  const [recCode, setRecCode] = useState("");
  const [recPw, setRecPw] = useState("");
  const [recPw2, setRecPw2] = useState("");
  const [recError, setRecError] = useState<string | null>(null);
  const [recOk, setRecOk] = useState<string | null>(null);
  const [recLoading, setRecLoading] = useState(false);

  const submitRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecError(null);
    setRecOk(null);
    if (recPw !== recPw2) {
      setRecError("Passwords don't match");
      return;
    }
    if (recPw.length < 6) {
      setRecError("Password must be at least 6 characters");
      return;
    }
    setRecLoading(true);
    try {
      await apiRequest("POST", "/api/auth/recover", {
        recoveryCode: recCode,
        username: recUsername,
        newPassword: recPw,
      });
      setRecOk("Password reset. You can now sign in with your new password.");
      setRecCode(""); setRecPw(""); setRecPw2("");
    } catch (err: any) {
      setRecError(err?.message?.replace(/^\d+:\s*/, "") || "Recovery failed");
    } finally {
      setRecLoading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn(username.trim(), password, remember);
      navigate("/leaderboard");
    } catch (err: any) {
      setError(err?.message?.replace(/^\d+:\s*/, "") || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="text-primary mb-3"><Logo className="h-12 w-12" /></div>
          <h1 className="text-xl font-bold tracking-tight">Golf League</h1>
          <p className="text-sm text-muted-foreground mt-1">2-Man Team Scoring</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sign in</CardTitle>
            <CardDescription>Enter your league credentials</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                  data-testid="input-username"
                />
                <div className="text-[11px] text-muted-foreground mt-1">Username is not case-sensitive.</div>
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  data-testid="input-password"
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="remember"
                  checked={remember}
                  onCheckedChange={(v) => setRemember(v === true)}
                  data-testid="checkbox-remember"
                />
                <Label htmlFor="remember" className="text-sm font-normal cursor-pointer">
                  Remember me on this device
                </Label>
              </div>
              {error && (
                <div className="text-sm text-destructive bg-destructive/10 p-2 rounded" data-testid="text-login-error">
                  {error}
                </div>
              )}
              <Button type="submit" className="w-full" disabled={loading} data-testid="button-login">
                {loading ? "Signing in..." : "Sign in"}
              </Button>
              <div className="text-center">
                <button
                  type="button"
                  className="text-sm text-primary hover:underline"
                  onClick={() => { setRecoverOpen(true); setRecError(null); setRecOk(null); }}
                  data-testid="button-forgot-password"
                >
                  Forgot password?
                </button>
              </div>
            </form>

            <Dialog open={recoverOpen} onOpenChange={setRecoverOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Reset password</DialogTitle>
                  <DialogDescription>
                    League members: ask the admin to reset your password from Admin → Users. Admins who are locked out can reset using the recovery code.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={submitRecover} className="space-y-3">
                  <div>
                    <Label htmlFor="rec-user">Username</Label>
                    <Input id="rec-user" value={recUsername} onChange={e => setRecUsername(e.target.value)} required data-testid="input-recover-username" />
                  </div>
                  <div>
                    <Label htmlFor="rec-code">Recovery code</Label>
                    <Input id="rec-code" value={recCode} onChange={e => setRecCode(e.target.value)} required data-testid="input-recover-code" />
                  </div>
                  <div>
                    <Label htmlFor="rec-pw">New password</Label>
                    <Input id="rec-pw" type="password" value={recPw} onChange={e => setRecPw(e.target.value)} required data-testid="input-recover-pw" />
                  </div>
                  <div>
                    <Label htmlFor="rec-pw2">Confirm new password</Label>
                    <Input id="rec-pw2" type="password" value={recPw2} onChange={e => setRecPw2(e.target.value)} required data-testid="input-recover-pw2" />
                  </div>
                  {recError && <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">{recError}</div>}
                  {recOk && <div className="text-sm text-green-700 bg-green-100 dark:text-green-300 dark:bg-green-900/30 p-2 rounded">{recOk}</div>}
                  <DialogFooter>
                    <Button type="submit" disabled={recLoading} data-testid="button-submit-recover">
                      {recLoading ? "Resetting..." : "Reset password"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>



            {guestViewing && (
              <div className="mt-4 text-center">
                <button
                  type="button"
                  className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                  onClick={() => navigate("/leaderboard")}
                  data-testid="button-guest-view"
                >
                  <Trophy className="h-3.5 w-3.5" /> View leaderboard as guest
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

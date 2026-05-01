import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function SettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await apiRequest("POST", "/api/auth/change-password", { currentPassword: cur, newPassword: next });
      toast({ title: "Password updated" });
      setCur(""); setNext(""); setConfirm("");
    } catch (e: any) {
      toast({ title: "Update failed", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!user) return <div className="text-sm text-muted-foreground">Log in.</div>;

  return (
    <div>
      <PageHeader title="Settings" description="Account and preferences" />

      <Card className="max-w-md">
        <CardHeader><CardTitle className="text-base">Change Password</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            <div>
              <Label>Current password</Label>
              <Input type="password" value={cur} onChange={e => setCur(e.target.value)} required data-testid="input-current-password" />
            </div>
            <div>
              <Label>New password</Label>
              <Input type="password" value={next} onChange={e => setNext(e.target.value)} required minLength={6} data-testid="input-new-password" />
            </div>
            <div>
              <Label>Confirm new password</Label>
              <Input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required data-testid="input-confirm-password" />
            </div>
            <Button type="submit" disabled={saving} data-testid="button-save-password">{saving ? "Saving..." : "Update password"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

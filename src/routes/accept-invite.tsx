import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { dashboardPathForRole, primaryRole, useAuth, type AppRole } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/accept-invite")({
  component: AcceptInvitePage,
});

function AcceptInvitePage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const restoreInviteSession = async () => {
      const params = new URLSearchParams(window.location.search);
      const tokenHash = params.get("token_hash");
      const type = params.get("type");

      if (tokenHash && (type === "invite" || type === "recovery")) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        if (error) setError(error.message);
      }

      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (user) {
        setEmail(user.email ?? null);
        setFullName((user.user_metadata?.full_name as string | undefined) ?? "");
      }
      setReady(true);
    };

    restoreInviteSession();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({
      password,
      data: { full_name: fullName || null },
    });
    setLoading(false);
    if (error) return setError(error.message);
    await refresh();
    const { data: userData } = await supabase.auth.getUser();
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user?.id ?? "");
    const nextRole = primaryRole((data ?? []).map((row) => row.role) as AppRole[]);
    navigate({ to: dashboardPathForRole(nextRole) as "/" });
  };

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!email) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invite link invalid or expired</CardTitle>
            <CardDescription>
              Ask the school admin to send you a fresh invitation.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="font-serif">Set your password</CardTitle>
          <CardDescription>
            Welcome to Santa Ana Calm Waters Academy. Finish setting up your account for{" "}
            <span className="font-medium text-foreground">{email}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Full name</Label>
              <Input
                id="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your full name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw">New password</Label>
              <Input
                id="pw"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cpw">Confirm password</Label>
              <Input
                id="cpw"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Saving…" : "Activate account"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

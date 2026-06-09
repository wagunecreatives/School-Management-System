import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, primaryRole, dashboardPathForRole, type AppRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/admin/users")({
  component: AdminUsersPage,
});

interface ProfileRow {
  id: string;
  full_name: string | null;
  email: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

type InviteRole = "teacher" | "accountant" | "parent";

interface Credentials {
  email: string;
  password: string;
  mode: "created" | "reset";
  full_name?: string | null;
}

function AdminUsersPage() {
  const { roles, user } = useAuth();
  const role = primaryRole(roles);
  const qc = useQueryClient();

  const [pendingRole, setPendingRole] = useState<Record<string, AppRole>>({});

  // Create-user form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<InviteRole>("teacher");
  const [invitePassword, setInvitePassword] = useState("");

  // Credentials dialog (shown after create / reset)
  const [credentials, setCredentials] = useState<Credentials | null>(null);

  // Edit-email dialog
  const [editing, setEditing] = useState<ProfileRow | null>(null);
  const [editingEmail, setEditingEmail] = useState("");

  // Delete confirm dialog
  const [deleting, setDeleting] = useState<ProfileRow | null>(null);


  const { data: profiles, isLoading } = useQuery({
    queryKey: ["admin-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, status, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ProfileRow[];
    },
  });

  const { data: rolesMap } = useQuery({
    queryKey: ["admin-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, role");
      if (error) throw error;
      const map: Record<string, AppRole[]> = {};
      for (const r of data as { user_id: string; role: AppRole }[]) {
        (map[r.user_id] ||= []).push(r.role);
      }
      return map;
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" }) => {
      const { error } = await supabase.from("profiles").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["admin-profiles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assignRole = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: AppRole }) => {
      await supabase.from("user_roles").delete().eq("user_id", userId);
      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role: newRole });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Role assigned");
      qc.invalidateQueries({ queryKey: ["admin-roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createUser = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: {
          email: inviteEmail.trim().toLowerCase(),
          full_name: inviteName.trim() || null,
          role: inviteRole,
          password: invitePassword.trim() || undefined,
        },
      });
      if (error) throw error;
      const payload = data as {
        error?: string;
        email?: string;
        password?: string;
        mode?: "created" | "reset";
      };
      if (payload?.error) throw new Error(payload.error);
      if (!payload?.email || !payload?.password) throw new Error("No credentials returned");
      return {
        email: payload.email,
        password: payload.password,
        mode: payload.mode ?? "created",
        full_name: inviteName.trim() || null,
      } as Credentials;
    },
    onSuccess: (creds) => {
      toast.success(creds.mode === "created" ? "Account created" : "Account updated");
      setCredentials(creds);
      setInviteEmail("");
      setInviteName("");
      setInvitePassword("");
      qc.invalidateQueries({ queryKey: ["admin-profiles"] });
      qc.invalidateQueries({ queryKey: ["admin-roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetPassword = useMutation({
    mutationFn: async ({
      email,
      userId,
      fullName,
    }: {
      email: string;
      userId: string;
      fullName: string | null;
    }) => {
      const userRoles = rolesMap?.[userId] ?? [];
      const r = userRoles[0];
      const targetRole: InviteRole = (["teacher", "accountant", "parent"] as const).includes(
        r as InviteRole,
      )
        ? (r as InviteRole)
        : "parent";
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: {
          email: email.trim().toLowerCase(),
          role: targetRole,
          full_name: fullName,
        },
      });
      if (error) throw error;
      const payload = data as {
        error?: string;
        email?: string;
        password?: string;
        mode?: "created" | "reset";
      };
      if (payload?.error) throw new Error(payload.error);
      if (!payload?.email || !payload?.password) throw new Error("No credentials returned");
      return {
        email: payload.email,
        password: payload.password,
        mode: payload.mode ?? "reset",
        full_name: fullName,
      } as Credentials;
    },
    onSuccess: (creds) => {
      toast.success("Temporary password issued");
      setCredentials(creds);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateEmail = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const { data, error } = await supabase.functions.invoke("admin-update-user", {
        body: { user_id: editing.id, email: editingEmail.trim().toLowerCase() },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
    },
    onSuccess: () => {
      toast.success("Email updated");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["admin-profiles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (role !== "admin") return <Navigate to={dashboardPathForRole(role)} />;

  const credentialsMessage = credentials
    ? `Hi ${credentials.full_name ?? ""},\n\nYour Santa Ana CWA portal account is ready.\n\nEmail: ${credentials.email}\nTemporary password: ${credentials.password}\n\nSign in here: ${window.location.origin}/login\nYou will be asked to set a new password on first sign in.`.trim()
    : "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold text-foreground">Users</h1>
        <p className="text-sm text-muted-foreground">
          Create accounts for teachers, accountants and parents. Share the temporary password —
          they will be forced to change it on first sign in.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif">Create a user</CardTitle>
          <CardDescription>
            Leave the password blank to generate a secure one automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3 md:grid-cols-2 lg:grid-cols-[1fr_1fr_160px_200px_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              if (!inviteEmail) return;
              createUser.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="iemail">Email</Label>
              <Input
                id="iemail"
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="person@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="iname">Full name (optional)</Label>
              <Input
                id="iname"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="Jane Doe"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as InviteRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="teacher">Teacher</SelectItem>
                  <SelectItem value="accountant">Accountant</SelectItem>
                  <SelectItem value="parent">Parent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ipw">Temp password (optional)</Label>
              <Input
                id="ipw"
                value={invitePassword}
                onChange={(e) => setInvitePassword(e.target.value)}
                placeholder="auto-generated"
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={createUser.isPending} className="w-full md:w-auto">
                {createUser.isPending ? "Creating…" : "Create account"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            )}
            {profiles?.map((p) => {
              const userRoles = rolesMap?.[p.id] ?? [];
              const currentRole = userRoles[0];
              return (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.full_name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    <button
                      type="button"
                      className="hover:text-foreground hover:underline"
                      onClick={() => {
                        setEditing(p);
                        setEditingEmail(p.email ?? "");
                      }}
                      title="Edit email"
                    >
                      {p.email}
                    </button>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        p.status === "approved"
                          ? "default"
                          : p.status === "rejected"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {p.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={pendingRole[p.id] ?? currentRole ?? ""}
                      onValueChange={(v) =>
                        setPendingRole((s) => ({ ...s, [p.id]: v as AppRole }))
                      }
                    >
                      <SelectTrigger className="w-36">
                        <SelectValue placeholder="Choose role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="teacher">Teacher</SelectItem>
                        <SelectItem value="accountant">Accountant</SelectItem>
                        <SelectItem value="parent">Parent</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="space-x-2 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!pendingRole[p.id] || pendingRole[p.id] === currentRole}
                      onClick={() =>
                        assignRole.mutate({ userId: p.id, newRole: pendingRole[p.id] })
                      }
                    >
                      Save role
                    </Button>
                    {p.email && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={resetPassword.isPending}
                        onClick={() =>
                          resetPassword.mutate({
                            email: p.email!,
                            userId: p.id,
                            fullName: p.full_name,
                          })
                        }
                      >
                        Reset password
                      </Button>
                    )}
                    {p.status !== "approved" && (
                      <Button
                        size="sm"
                        onClick={() => setStatus.mutate({ id: p.id, status: "approved" })}
                      >
                        Approve
                      </Button>
                    )}
                    {p.status !== "rejected" && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setStatus.mutate({ id: p.id, status: "rejected" })}
                      >
                        Reject
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Credentials dialog */}
      <Dialog open={!!credentials} onOpenChange={(o) => !o && setCredentials(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {credentials?.mode === "created" ? "Account created" : "Temporary password issued"}
            </DialogTitle>
            <DialogDescription>
              Share these credentials with the user via WhatsApp, SMS, or a printed slip. They will
              be asked to set their own password on first sign in.
            </DialogDescription>
          </DialogHeader>
          {credentials && (
            <div className="space-y-3">
              <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Email</span>
                  <span className="font-mono">{credentials.email}</span>
                </div>
                <div className="mt-2 flex justify-between gap-3">
                  <span className="text-muted-foreground">Temporary password</span>
                  <span className="font-mono font-semibold">{credentials.password}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await navigator.clipboard.writeText(
                      `${credentials.email} / ${credentials.password}`,
                    );
                    toast.success("Copied email & password");
                  }}
                >
                  Copy email + password
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await navigator.clipboard.writeText(credentialsMessage);
                    toast.success("Welcome message copied");
                  }}
                >
                  Copy welcome message
                </Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setCredentials(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit email</DialogTitle>
            <DialogDescription>
              Update the login email for {editing?.full_name ?? editing?.email}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="newemail">Email</Label>
            <Input
              id="newemail"
              type="email"
              value={editingEmail}
              onChange={(e) => setEditingEmail(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => updateEmail.mutate()}
              disabled={updateEmail.isPending || !editingEmail}
            >
              {updateEmail.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

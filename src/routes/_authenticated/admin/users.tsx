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

const stablePreviewOrigin = "https://id-preview--f2dabbb8-33eb-4322-9432-e691fdfbc4f6.lovable.app";

function inviteRedirectUrl() {
  const origin = window.location.origin.includes("lovableproject.com")
    ? stablePreviewOrigin
    : window.location.origin;

  return `${origin}/accept-invite`;
}

function AdminUsersPage() {
  const { roles } = useAuth();
  const role = primaryRole(roles);
  const qc = useQueryClient();
  const [pendingRole, setPendingRole] = useState<Record<string, AppRole>>({});

  // Invite form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<InviteRole>("teacher");

  // Edit-email dialog
  const [editing, setEditing] = useState<ProfileRow | null>(null);
  const [editingEmail, setEditingEmail] = useState("");

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

  const inviteUser = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: {
          email: inviteEmail.trim().toLowerCase(),
          full_name: inviteName.trim() || null,
          role: inviteRole,
          redirect_to: inviteRedirectUrl(),
        },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
    },
    onSuccess: () => {
      toast.success(`Invitation sent to ${inviteEmail}`);
      setInviteEmail("");
      setInviteName("");
      qc.invalidateQueries({ queryKey: ["admin-profiles"] });
      qc.invalidateQueries({ queryKey: ["admin-roles"] });
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold text-foreground">Users</h1>
        <p className="text-sm text-muted-foreground">
          Invite teachers, accountants, and parents — they set their own password from the email link.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif">Invite a user</CardTitle>
          <CardDescription>
            Enter just an email and the role. We'll email a secure link for them to activate the account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3 md:grid-cols-[1fr_1fr_180px_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              if (!inviteEmail) return;
              inviteUser.mutate();
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
            <div className="flex items-end">
              <Button type="submit" disabled={inviteUser.isPending} className="w-full md:w-auto">
                {inviteUser.isPending ? "Sending…" : "Send invite"}
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

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
import { Badge } from "@/components/ui/badge";
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

function AdminUsersPage() {
  const { roles } = useAuth();
  const role = primaryRole(roles);
  const qc = useQueryClient();
  const [pendingRole, setPendingRole] = useState<Record<string, AppRole>>({});

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
      // remove existing roles, then insert new (single role per user)
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

  if (role !== "admin") return <Navigate to={dashboardPathForRole(role)} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold text-foreground">User approvals</h1>
        <p className="text-sm text-muted-foreground">
          Approve new accounts and assign their roles.
        </p>
      </div>

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
                  <TableCell className="text-muted-foreground">{p.email}</TableCell>
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
    </div>
  );
}

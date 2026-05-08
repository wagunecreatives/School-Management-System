import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, primaryRole, dashboardPathForRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/students")({
  component: AdminStudentsPage,
});

function AdminStudentsPage() {
  const { roles } = useAuth();
  const role = primaryRole(roles);
  const qc = useQueryClient();

  const [fullName, setFullName] = useState("");
  const [admissionNo, setAdmissionNo] = useState("");
  const [classId, setClassId] = useState("");
  const [parentId, setParentId] = useState("");

  const { data: classes } = useQuery({
    queryKey: ["classes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("classes").select("id, name").order("name");
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
  });

  const { data: parents } = useQuery({
    queryKey: ["parent-profiles"],
    queryFn: async () => {
      const { data: roleRows, error: roleErr } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "parent");
      if (roleErr) throw roleErr;
      const ids = (roleRows ?? []).map((r) => r.user_id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, status")
        .in("id", ids)
        .eq("status", "approved");
      if (error) throw error;
      return data as { id: string; full_name: string | null; email: string | null; status: string }[];
    },
  });

  const { data: students } = useQuery({
    queryKey: ["students"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, full_name, admission_no, class_id, parent_id, classes(name), profiles:parent_id(full_name, email)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Array<{
        id: string;
        full_name: string;
        admission_no: string | null;
        class_id: string | null;
        parent_id: string;
        classes: { name: string } | null;
        profiles: { full_name: string | null; email: string | null } | null;
      }>;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("students").insert({
        full_name: fullName,
        admission_no: admissionNo || null,
        class_id: classId || null,
        parent_id: parentId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Student added");
      setFullName("");
      setAdmissionNo("");
      setClassId("");
      setParentId("");
      qc.invalidateQueries({ queryKey: ["students"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("students").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Student removed");
      qc.invalidateQueries({ queryKey: ["students"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (role !== "admin") return <Navigate to={dashboardPathForRole(role)} />;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!fullName || !parentId) {
      toast.error("Name and parent are required");
      return;
    }
    create.mutate();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold text-foreground">Students</h1>
        <p className="text-sm text-muted-foreground">
          Add students and link each one to a parent.
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="grid gap-4 rounded-xl border border-border bg-card p-6 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div className="space-y-2">
          <Label>Full name</Label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label>Admission no</Label>
          <Input value={admissionNo} onChange={(e) => setAdmissionNo(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Class</Label>
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger>
              <SelectValue placeholder="Select class" />
            </SelectTrigger>
            <SelectContent>
              {classes?.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Parent</Label>
          <Select value={parentId} onValueChange={setParentId}>
            <SelectTrigger>
              <SelectValue placeholder="Select parent" />
            </SelectTrigger>
            <SelectContent>
              {parents?.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.full_name ?? p.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Adding..." : "Add student"}
          </Button>
        </div>
      </form>

      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Admission</TableHead>
              <TableHead>Class</TableHead>
              <TableHead>Parent</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {students?.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.full_name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {s.admission_no ?? "—"}
                </TableCell>
                <TableCell>{s.classes?.name ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">
                  {s.profiles?.full_name ?? s.profiles?.email ?? "—"}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => remove.mutate(s.id)}
                  >
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {students?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No students yet
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

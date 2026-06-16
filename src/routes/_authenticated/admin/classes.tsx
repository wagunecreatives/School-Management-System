import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth, primaryRole, dashboardPathForRole, type AppRole } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";

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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/admin/classes")({
  component: AdminClassesPage,
});

type ClassRow = {
  id: string;
  name: string;
  created_at?: string;
};

type InsertClassInput = {
  name: string;
};

const DEFAULT_GRADES = [
  "Grade 1",
  "Grade 2",
  "Grade 3",
  "Grade 4",
  "Grade 5",
  "Grade 6",
  "Grade 7",
  "Grade 8",
  "Grade 9",
];

function AdminClassesPage() {
  const { roles } = useAuth();
  const role = primaryRole(roles);
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);

  const [toDelete, setToDelete] = useState<ClassRow | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [seedOpen, setSeedOpen] = useState(false);

  const isAdmin = role === "admin";
  useEffect(() => {
    if (!isAdmin) setSeedOpen(false);
  }, [isAdmin]);

  const { data: classes, isLoading } = useQuery({
    queryKey: ["classes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name, created_at")
        .order("name");
      if (error) throw error;
      return data as ClassRow[];
    },
    enabled: isAdmin,
  });

  const create = useMutation({
    mutationFn: async (payload: InsertClassInput) => {
      const n = payload.name.trim();
      if (!n) throw new Error("Class name is required");
      const { error } = await supabase.from("classes").insert({ name: n });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Class created");
      setName("");
      qc.invalidateQueries({ queryKey: ["classes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("classes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Class deleted");
      setToDelete(null);
      setDeleteOpen(false);
      qc.invalidateQueries({ queryKey: ["classes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const seedGrades = useMutation({
    mutationFn: async () => {
      setBulkLoading(true);

      const existingNames = new Set(
        (classes ?? []).map((c) => c.name.trim().toLowerCase())
      );

      const toInsert = DEFAULT_GRADES.filter(
        (g) => !existingNames.has(g.trim().toLowerCase())
      );

      if (toInsert.length === 0) return;

      const payload: InsertClassInput[] = toInsert.map((n) => ({ name: n }));

      const { error } = await supabase.from("classes").insert(payload);
      if (error) throw error;
    },

    onSuccess: () => {
      toast.success("Grades added");
      qc.invalidateQueries({ queryKey: ["classes"] });
      setBulkLoading(false);
      setSeedOpen(false);
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setBulkLoading(false);
    },
  });

  if (!isAdmin) return <Navigate to={dashboardPathForRole(role)} />;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate({ name });
  };

  const missingGrades = useMemo(() => {
    const existing = new Set((classes ?? []).map((c) => c.name.trim().toLowerCase()));
    return DEFAULT_GRADES.filter((g) => !existing.has(g.trim().toLowerCase()));
  }, [classes]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold text-foreground">Classes</h1>
        <p className="text-sm text-muted-foreground">
          Manage grades/classes used when adding students.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <form
          onSubmit={onSubmit}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_auto] items-end"
        >
          <div className="space-y-2">
            <Label>Class name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grade 10" />
          </div>
          <Button type="submit" disabled={create.isPending} className="w-full sm:w-auto">
            {create.isPending ? "Creating…" : "Add class"}
          </Button>
        </form>

        <div className="mt-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Quick add: default grades (1–9)</p>
            <p className="text-xs text-muted-foreground">
              {missingGrades.length === 0
                ? "All grades already exist."
                : `Missing: ${missingGrades.join(", ")}`}
            </p>
          </div>
          <Button variant="outline" disabled={bulkLoading} onClick={() => setSeedOpen(true)}>
            {bulkLoading ? "Adding…" : "Add Grade 1-9"}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={2} className="text-center text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            )}
            {!isLoading && (classes?.length ?? 0) === 0 && (
              <TableRow>
                <TableCell colSpan={2} className="text-center text-muted-foreground">
                  No classes yet
                </TableCell>
              </TableRow>
            )}
            {(classes ?? []).map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      setToDelete(c);
                      setDeleteOpen(true);
                    }}
                  >
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={seedOpen} onOpenChange={setSeedOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Grades 1-9</DialogTitle>
            <DialogDescription>
              This will insert missing grade/class rows into <span className="font-mono">public.classes</span>.
              Existing grades are not duplicated.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSeedOpen(false)} disabled={bulkLoading}>
              Cancel
            </Button>
            <Button onClick={() => seedGrades.mutate()} disabled={bulkLoading}>
              {bulkLoading ? "Adding…" : "Add grades"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete class?</DialogTitle>
            <DialogDescription>
              This will delete <span className="font-medium">{toDelete?.name}</span>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={remove.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!toDelete || remove.isPending}
              onClick={() => toDelete && remove.mutate(toDelete.id)}
            >
              {remove.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


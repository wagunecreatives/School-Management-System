import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { dashboardPathForRole, primaryRole, useAuth } from "@/lib/auth";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { Download } from "lucide-react";

export const Route = createFileRoute(
  "/_authenticated/parent/students/$studentId/assignments",
)({
  component: ParentStudentAssignmentsPage,
});

type StudentRow = {
  id: string;
  parent_id: string | null;
  class_id: string | null;
  classes?: { name: string } | null;
  full_name: string;
};

type AssignmentRow = {
  id: string;
  title: string;
  instructions: string;
  due_date: string | null;
  marks: number | null;
  attachment_url: string | null;
  status: string | null;
  created_at: string | null;
};

type SubmissionRow = {
  assignment_id: string;
  status: string;
  attachment_url: string | null;
};

function ParentStudentAssignmentsPage() {
  const { roles, user } = useAuth();
  const role = primaryRole(roles);
  const { studentId } = Route.useParams();

  const safeStudentId: string = studentId ?? "";

  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(
    null,
  );

  const { data: student, isLoading: studentLoading } = useQuery({
    queryKey: ["parent-student", safeStudentId],
    enabled: !!user && !!safeStudentId,

    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id,parent_id,class_id,classes(name),full_name")
        .eq("id", safeStudentId)
        .maybeSingle();
      if (error) throw error;
      return data as StudentRow | null;
    },
  });

  const classId = student?.class_id ?? null;
  const safeClassId: string = classId ?? "";

  const { data: assignments, isLoading: assignmentsLoading } = useQuery({
    queryKey: ["parent-assignments", safeStudentId, classId],
    enabled: !!user && !!safeStudentId && !!classId,

    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignments")
        .select(
          "id,title,instructions,due_date,marks,attachment_url,status,created_at",
        )
        .eq("class_id", safeClassId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as AssignmentRow[];
    },
  });

  // Some generated Supabase types may not include assignment_submissions yet.
  // Use `any` to avoid TS compile failures while still using the runtime API.
  const { data: submissions } = useQuery({
    queryKey: ["parent-submissions", safeStudentId],
    enabled: !!user && !!safeStudentId,
    retry: false,

    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("assignment_submissions")
        .select("assignment_id,status,attachment_url")
        .eq("student_id", safeStudentId);

      if (error) throw error;
      return (data ?? []) as SubmissionRow[];
    },
  });

  const submissionsByAssignmentId = useMemo(() => {
    const m = new Map<string, SubmissionRow>();
    for (const s of submissions ?? []) m.set(s.assignment_id, s);
    return m;
  }, [submissions]);

  const selectedAssignment = useMemo(() => {
    const list = assignments ?? [];
    if (selectedAssignmentId) {
      return list.find((a) => a.id === selectedAssignmentId) ?? null;
    }
    return list[0] ?? null;
  }, [assignments, selectedAssignmentId]);

  const selectedSubmission = selectedAssignment
    ? submissionsByAssignmentId.get(selectedAssignment.id) ?? null
    : null;

  if (role !== "parent") return <Navigate to={dashboardPathForRole(role)} />;

  if (studentLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (!student || student.parent_id !== user?.id) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Not found</CardTitle>
          <CardDescription>
            This student is not linked to your account.{" "}
            <Link to="/parent/dashboard" className="text-primary underline">
              Back to dashboard
            </Link>
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <Link
            to="/parent/dashboard"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← Dashboard
          </Link>
          <h1 className="mt-1 font-serif text-2xl font-bold text-foreground">
            Assignments for {student.full_name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {student.classes?.name ?? "Unassigned class"}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="font-serif">Assignments</CardTitle>
            <CardDescription>
              Active assignments are shown as Pending.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead className="text-right">Marks</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignmentsLoading && (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-center text-muted-foreground"
                      >
                        Loading…
                      </TableCell>
                    </TableRow>
                  )}

                  {!assignmentsLoading && (assignments ?? []).length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-center text-muted-foreground"
                      >
                        No assignments yet
                      </TableCell>
                    </TableRow>
                  )}

                  {!assignmentsLoading &&
                    (assignments ?? []).map((a) => {
                      const status = (a.status ?? "active").toLowerCase();
                      const isDone = status === "done";
                      const isSelected = a.id === selectedAssignment?.id;

                      return (
                        <TableRow
                          key={a.id}
                          className={isSelected ? "bg-accent/50" : undefined}
                          onClick={() => setSelectedAssignmentId(a.id)}
                          style={{ cursor: "pointer" }}
                        >
                          <TableCell className="font-medium">{a.title}</TableCell>
                          <TableCell>
                            {a.due_date
                              ? new Date(a.due_date).toLocaleDateString()
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {a.marks ?? "—"}
                          </TableCell>
                          <TableCell>
                            <span
                              className={
                                isDone
                                  ? "text-emerald-600 font-medium"
                                  : "text-muted-foreground font-medium"
                              }
                            >
                              {isDone ? "Done" : "Pending"}
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-serif">Assignment details</CardTitle>
            <CardDescription>
              Instructions and attachment downloads.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedAssignment ? (
              <p className="text-sm text-muted-foreground">
                Select an assignment.
              </p>
            ) : (
              <>
                <div>
                  <p className="font-semibold">{selectedAssignment.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Status:{" "}
                    {selectedSubmission?.status === "done" ? "Done" : "Pending"}
                  </p>
                </div>

                <div className="space-y-1 text-sm">
                  <p>
                    <span className="text-muted-foreground">Due date:</span>{" "}
                    {selectedAssignment.due_date
                      ? new Date(selectedAssignment.due_date).toLocaleDateString()
                      : "—"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Marks:</span>{" "}
                    {selectedAssignment.marks ?? "—"}
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Instructions</p>
                  <p className="whitespace-pre-wrap rounded-md bg-secondary/20 p-3 text-sm">
                    {selectedAssignment.instructions}
                  </p>
                </div>

                <div className="flex gap-2 flex-wrap">
                  {selectedAssignment.attachment_url ? (
                    <a
                      className="inline-flex items-center gap-2 text-primary hover:underline"
                      href={selectedAssignment.attachment_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Download className="h-4 w-4" /> Teacher attachment
                    </a>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      No teacher attachment
                    </span>
                  )}

                  {selectedSubmission?.attachment_url ? (
                    <a
                      className="inline-flex items-center gap-2 text-primary hover:underline"
                      href={selectedSubmission.attachment_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Download className="h-4 w-4" /> Submitted paper
                    </a>
                  ) : null}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


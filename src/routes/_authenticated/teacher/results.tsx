import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, primaryRole, dashboardPathForRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

export const Route = createFileRoute("/_authenticated/teacher/results")({
  component: TeacherResultsPage,
});

function gradeFor(score: number): string {
  if (score >= 75) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  if (score >= 40) return "D";
  return "F";
}

function TeacherResultsPage() {
  const { roles, user } = useAuth();
  const role = primaryRole(roles);
  const qc = useQueryClient();

  const [studentId, setStudentId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [term, setTerm] = useState("First Term");
  const [score, setScore] = useState("");
  const [remarks, setRemarks] = useState("");

  const { data: students } = useQuery({
    queryKey: ["t-students"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, full_name, classes(name)")
        .order("full_name");
      if (error) throw error;
      return data as { id: string; full_name: string; classes: { name: string } | null }[];
    },
  });

  const { data: subjects } = useQuery({
    queryKey: ["subjects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subjects").select("id, name").order("name");
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
  });

  const { data: results } = useQuery({
    queryKey: ["t-results", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("results")
        .select("id, term, score, grade, remarks, students(full_name), subjects(name)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as Array<{
        id: string;
        term: string;
        score: number;
        grade: string | null;
        remarks: string | null;
        students: { full_name: string } | null;
        subjects: { name: string } | null;
      }>;
    },
  });

  const submit = useMutation({
    mutationFn: async () => {
      const num = Number(score);
      const { error } = await supabase.from("results").upsert(
        {
          student_id: studentId,
          subject_id: subjectId,
          term,
          score: num,
          grade: gradeFor(num),
          remarks: remarks || null,
          teacher_id: user?.id,
        },
        { onConflict: "student_id,subject_id,term" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Result saved");
      setScore("");
      setRemarks("");
      qc.invalidateQueries({ queryKey: ["t-results"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (role !== "teacher") return <Navigate to={dashboardPathForRole(role)} />;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const num = Number(score);
    if (!studentId || !subjectId || isNaN(num) || num < 0 || num > 100) {
      toast.error("Pick student, subject, and a valid score (0-100)");
      return;
    }
    submit.mutate();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold text-foreground">Enter results</h1>
        <p className="text-sm text-muted-foreground">
          Add or update a student's score for a subject and term.
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="grid gap-4 rounded-xl border border-border bg-card p-6 sm:grid-cols-2 lg:grid-cols-3"
      >
        <div className="space-y-2">
          <Label>Student</Label>
          <Select value={studentId} onValueChange={setStudentId}>
            <SelectTrigger>
              <SelectValue placeholder="Select student" />
            </SelectTrigger>
            <SelectContent>
              {students?.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.full_name} {s.classes?.name ? `(${s.classes.name})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Subject</Label>
          <Select value={subjectId} onValueChange={setSubjectId}>
            <SelectTrigger>
              <SelectValue placeholder="Select subject" />
            </SelectTrigger>
            <SelectContent>
              {subjects?.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Term</Label>
          <Select value={term} onValueChange={setTerm}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="First Term">First Term</SelectItem>
              <SelectItem value="Second Term">Second Term</SelectItem>
              <SelectItem value="Third Term">Third Term</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Score (0-100)</Label>
          <Input
            type="number"
            min={0}
            max={100}
            value={score}
            onChange={(e) => setScore(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>Remarks</Label>
          <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <Button type="submit" disabled={submit.isPending}>
            {submit.isPending ? "Saving..." : "Save result"}
          </Button>
        </div>
      </form>

      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Term</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Grade</TableHead>
              <TableHead>Remarks</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results?.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.students?.full_name}</TableCell>
                <TableCell>{r.subjects?.name}</TableCell>
                <TableCell>{r.term}</TableCell>
                <TableCell>{r.score}</TableCell>
                <TableCell>{r.grade}</TableCell>
                <TableCell className="text-muted-foreground">{r.remarks ?? "—"}</TableCell>
              </TableRow>
            ))}
            {results?.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No results yet
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

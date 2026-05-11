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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

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

const norm = (s: string) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

type UploadRow = {
  row: number;
  student: string;
  subject: string;
  term: string;
  score: number | string;
  status: "ok" | "skipped";
  reason?: string;
};

function TeacherResultsPage() {
  const { roles, user } = useAuth();
  const role = primaryRole(roles);
  const qc = useQueryClient();

  const [studentId, setStudentId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [term, setTerm] = useState("First Term");
  const [score, setScore] = useState("");
  const [remarks, setRemarks] = useState("");

  const [uploadTerm, setUploadTerm] = useState("First Term");
  const [uploading, setUploading] = useState(false);
  const [uploadReport, setUploadReport] = useState<UploadRow[]>([]);

  const { data: students } = useQuery({
    queryKey: ["t-students"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, full_name, admission_no, classes(name)")
        .order("full_name");
      if (error) throw error;
      return data as {
        id: string;
        full_name: string;
        admission_no: string | null;
        classes: { name: string } | null;
      }[];
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

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["admission_no", "full_name", "subject", "term", "score", "remarks"],
      ["ADM001", "Jane Doe", "Mathematics", "First Term", 85, "Excellent"],
      ["", "John Smith", "English", "First Term", 72, ""],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Results");
    XLSX.writeFile(wb, "results-template.xlsx");
  };

  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!students || !subjects) {
      toast.error("Still loading students/subjects, try again in a second");
      return;
    }
    setUploading(true);
    setUploadReport([]);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

      const studentByAdm = new Map(
        students.filter((s) => s.admission_no).map((s) => [norm(s.admission_no!), s]),
      );
      const studentByName = new Map(students.map((s) => [norm(s.full_name), s]));
      const subjectByName = new Map(subjects.map((s) => [norm(s.name), s]));

      const report: UploadRow[] = [];
      const toUpsert: {
        student_id: string;
        subject_id: string;
        term: string;
        score: number;
        grade: string;
        remarks: string | null;
        teacher_id: string | undefined;
      }[] = [];

      // Collect new subject names to auto-create
      const newSubjects = new Set<string>();
      for (const r of rows) {
        const subjName = String(r.subject ?? "").trim();
        if (subjName && !subjectByName.has(norm(subjName))) newSubjects.add(subjName);
      }
      if (newSubjects.size > 0) {
        const { data: created, error } = await supabase
          .from("subjects")
          .insert([...newSubjects].map((name) => ({ name })))
          .select("id, name");
        if (error) throw error;
        for (const s of created ?? []) subjectByName.set(norm(s.name), s);
      }

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const adm = norm(String(r.admission_no ?? ""));
        const name = norm(String(r.full_name ?? ""));
        const subjName = String(r.subject ?? "").trim();
        const rowTerm = String(r.term ?? "").trim() || uploadTerm;
        const scoreNum = Number(r.score);
        const remarksVal = String(r.remarks ?? "").trim() || null;

        const student = (adm && studentByAdm.get(adm)) || (name && studentByName.get(name));
        const subject = subjectByName.get(norm(subjName));

        const base: UploadRow = {
          row: i + 2,
          student: String(r.full_name ?? r.admission_no ?? "?"),
          subject: subjName,
          term: rowTerm,
          score: r.score as number | string,
          status: "skipped",
        };

        if (!student) {
          report.push({ ...base, reason: "Student not found" });
          continue;
        }
        if (!subject) {
          report.push({ ...base, reason: "Subject missing" });
          continue;
        }
        if (isNaN(scoreNum) || scoreNum < 0 || scoreNum > 100) {
          report.push({ ...base, reason: "Invalid score" });
          continue;
        }

        toUpsert.push({
          student_id: student.id,
          subject_id: subject.id,
          term: rowTerm,
          score: scoreNum,
          grade: gradeFor(scoreNum),
          remarks: remarksVal,
          teacher_id: user?.id,
        });
        report.push({ ...base, status: "ok" });
      }

      if (toUpsert.length > 0) {
        const { error } = await supabase
          .from("results")
          .upsert(toUpsert, { onConflict: "student_id,subject_id,term" });
        if (error) throw error;
      }

      setUploadReport(report);
      const ok = report.filter((r) => r.status === "ok").length;
      toast.success(`Saved ${ok} result(s), ${report.length - ok} skipped`);
      qc.invalidateQueries({ queryKey: ["t-results"] });
      qc.invalidateQueries({ queryKey: ["subjects"] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold text-foreground">Results</h1>
        <p className="text-sm text-muted-foreground">
          Enter scores one by one or upload an Excel sheet for an entire class.
        </p>
      </div>

      <Tabs defaultValue="single">
        <TabsList>
          <TabsTrigger value="single">Single entry</TabsTrigger>
          <TabsTrigger value="upload">Bulk upload</TabsTrigger>
          <TabsTrigger value="recent">Recent results</TabsTrigger>
        </TabsList>

        <TabsContent value="single">
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
        </TabsContent>

        <TabsContent value="upload">
          <Card>
            <CardHeader>
              <CardTitle className="font-serif">Upload results from Excel</CardTitle>
              <CardDescription>
                Columns: <code>admission_no</code>, <code>full_name</code>, <code>subject</code>,{" "}
                <code>term</code>, <code>score</code>, <code>remarks</code>. Students are matched
                by admission number first, then by name. New subjects are created automatically.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-2">
                  <Label>Default term (used if row has none)</Label>
                  <Select value={uploadTerm} onValueChange={setUploadTerm}>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="First Term">First Term</SelectItem>
                      <SelectItem value="Second Term">Second Term</SelectItem>
                      <SelectItem value="Third Term">Third Term</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="button" variant="outline" onClick={downloadTemplate}>
                  Download template
                </Button>
                <div className="space-y-2">
                  <Label htmlFor="file">Excel file</Label>
                  <Input
                    id="file"
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleUpload}
                    disabled={uploading}
                  />
                </div>
              </div>

              {uploadReport.length > 0 && (
                <div className="rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Row</TableHead>
                        <TableHead>Student</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>Term</TableHead>
                        <TableHead>Score</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {uploadReport.map((r, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{r.row}</TableCell>
                          <TableCell>{r.student}</TableCell>
                          <TableCell>{r.subject}</TableCell>
                          <TableCell>{r.term}</TableCell>
                          <TableCell>{String(r.score)}</TableCell>
                          <TableCell
                            className={
                              r.status === "ok"
                                ? "text-emerald-600"
                                : "text-destructive"
                            }
                          >
                            {r.status === "ok" ? "Saved" : `Skipped — ${r.reason}`}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recent">
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
        </TabsContent>
      </Tabs>
    </div>
  );
}

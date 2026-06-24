import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth, primaryRole, dashboardPathForRole } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/teacher/assignments")({
  component: TeacherAssignmentsPage,
});

type ClassRow = { id: string; name: string };
type SubjectRow = { id: string; name: string };
type AssignmentRow = {
  id: string;
  title: string;
  instructions: string;
  due_date: string | null;
  marks: number | null;
  attachment_url: string | null;
  status: string | null;
  created_at: string | null;
  subjects?: { name: string } | null;
  classes?: { name: string } | null;
};

function TeacherAssignmentsPage() {
  const { roles, user } = useAuth();
  const role = primaryRole(roles);
  const qc = useQueryClient();

  const [title, setTitle] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [classId, setClassId] = useState("");
  const [instructions, setInstructions] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [marks, setMarks] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: classes } = useQuery({
    queryKey: ["classes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data as ClassRow[];
    },
  });

  const { data: subjects } = useQuery({
    queryKey: ["subjects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data as SubjectRow[];
    },
  });

  const { data: assignments } = useQuery({
    queryKey: ["teacher-assignments", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignments")
        .select(
          `id,title,instructions,due_date,marks,attachment_url,status,created_at,\
          subjects(name),\
          classes(name)`
        )
        .eq("teacher_id", user!.id)

        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as AssignmentRow[];
    },
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (!subjectId && subjects && subjects.length > 0) setSubjectId(subjects[0].id);
    if (!classId && classes && classes.length > 0) setClassId(classes[0].id);
  }, [subjects, classes, subjectId, classId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const {
      data: { user: authUser },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !authUser?.id) {
      toast.error("Not authenticated");
      return;
    }


    const nTitle = title.trim();
    const nInstructions = instructions.trim();
    const nMarks = marks === "" ? null : Number(marks);

    if (!nTitle) return toast.error("Title is required");
    if (!nInstructions) return toast.error("Instructions are required");
    if (!subjectId) return toast.error("Subject is required");
    if (!classId) return toast.error("Class is required");

    if (nMarks !== null && (Number.isNaN(nMarks) || nMarks < 0)) {
      return toast.error("Marks must be a positive number");
    }

    setIsSubmitting(true);
    try {
      let attachmentUrl: string | null = null;

      if (file) {
        // Upload to Supabase storage bucket (default bucket name expected: "attachments")
        // If you have a different bucket, update the bucket name below.
        const bucket = "attachments";
        const ext = (file.name.split(".").pop() ?? "pdf").toLowerCase();
        const path = `assignments/${authUser.id}/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;


        const { error: upErr } = await supabase.storage
          .from(bucket)
          .upload(path, file, { cacheControl: "3600", upsert: false });

        if (upErr) throw upErr;

        const { data: publicUrlData } = supabase.storage
          .from(bucket)
          .getPublicUrl(path);

        // For a public bucket, getPublicUrl returns the correct /storage/v1/object/public/... URL
        attachmentUrl = publicUrlData.publicUrl;
      }

      const dueDateTs = dueDate ? new Date(dueDate).toISOString() : null;

      const payload = {
        title: nTitle,
        instructions: nInstructions,
        subject_id: subjectId || null,
        class_id: classId || null,
        teacher_id: authUser.id, // Must be exactly authUser.id == auth.uid() in RLS
        due_date: dueDateTs,
        marks: nMarks,
        attachment_url: attachmentUrl,
        status: "active",
      };

      const { data, error: insErr } = await supabase
        .from("assignments")
        .insert(payload)
        .select()
        .single();

      if (insErr) {
        console.error("Insert failed:", insErr);
        throw insErr;
      }

      console.log("Inserted row:", data);
      toast.success("Assignment created");
      setTitle("");
      setInstructions("");
      setDueDate("");
      setMarks("");
      setFile(null);

      qc.invalidateQueries({ queryKey: ["teacher-assignments", user?.id] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (role !== "teacher") return <Navigate to={dashboardPathForRole(role)} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold text-foreground">Assignments</h1>
        <p className="text-sm text-muted-foreground">
          Create and publish class assignments. Attach homework files (e.g. PDFs).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif">Create assignment</CardTitle>
          <CardDescription>Saved immediately when you click Create Assignment.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSubmit}
            className="grid gap-4 rounded-xl border border-border bg-card p-6 sm:grid-cols-2 lg:grid-cols-3"
          >
            <div className="space-y-2 sm:col-span-2 lg:col-span-3">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Mathematics Homework 3" />
            </div>

            <div className="space-y-2">
              <Label>Subject</Label>
              <Select value={subjectId} onValueChange={setSubjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select subject" />
                </SelectTrigger>
                <SelectContent>
                  {(subjects ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Class</Label>
              <Select value={classId} onValueChange={setClassId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent>
                  {(classes ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 sm:col-span-2 lg:col-span-3">
              <Label>Instructions</Label>
              <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={3} placeholder="Solve Questions 1-10" />
            </div>

            <div className="space-y-2">
              <Label>Due Date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Marks</Label>
              <Input type="number" min={0} value={marks} onChange={(e) => setMarks(e.target.value)} placeholder="20" />
            </div>

            <div className="space-y-2 sm:col-span-2 lg:col-span-3">
              <Label htmlFor="attachment">Attachment</Label>
              <Input
                id="attachment"
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e: ChangeEvent<HTMLInputElement>) => setFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">Optional. Stored in Supabase Storage and saved as attachment_url.</p>
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Creating…" : "Create Assignment"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif">Recent assignments</CardTitle>
          <CardDescription>Last 20 created assignments for your account.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Marks</TableHead>
                  <TableHead>Attachment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(assignments ?? []).map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.title}</TableCell>
                    <TableCell>{a.classes?.name ?? "—"}</TableCell>
                    <TableCell>{a.subjects?.name ?? "—"}</TableCell>
                    <TableCell>{a.due_date ? new Date(a.due_date).toLocaleDateString() : "—"}</TableCell>
                    <TableCell className="text-right">{a.marks ?? "—"}</TableCell>
                    <TableCell>
                      {a.attachment_url ? (
                        <a
                          className="text-primary hover:underline"
                          href={a.attachment_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View
                        </a>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {(assignments ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No assignments yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


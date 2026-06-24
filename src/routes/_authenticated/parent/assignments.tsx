import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, primaryRole, dashboardPathForRole } from "@/lib/auth";
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

export const Route = createFileRoute("/_authenticated/parent/assignments")({
  component: ParentAssignmentsPage,
});

type ParentChild = {
  id: string;
  full_name: string;
  class_id: string | null;
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
  class_id: string | null;
};

function ParentAssignmentsPage() {
  const { roles, user } = useAuth();
  const role = primaryRole(roles);

  const { data: children, isLoading: loadingChildren } = useQuery({
    queryKey: ["parent-children", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, full_name, class_id")
        .eq("parent_id", user!.id);
      if (error) throw error;
      return data as ParentChild[];
    },
  });

  const { data: assignments, isLoading: loadingAssignments } = useQuery({
    queryKey: ["parent-assignments", user?.id, children?.length],
    enabled: !!user && (children?.length ?? 0) > 0,
    queryFn: async () => {
      const classIds = (children ?? [])
        .map((c) => c.class_id)
        .filter(Boolean) as string[];

      console.log("[parent/assignments] children:", children);
      console.log("[parent/assignments] classIds:", classIds);


      const { data, error } = await supabase
        .from("assignments")
        .select(
          "id,title,instructions,due_date,marks,attachment_url,status,created_at,class_id,classes(name)"
        )
        .in("class_id", classIds)
        .order("created_at", { ascending: false })
        .limit(50);


      if (error) throw error;

      console.log("[parent/assignments] assignments data:", data);

      return data as Array<
        AssignmentRow & { classes?: { name: string } | null }
      >;

    },
  });

  if (role !== "parent") return <Navigate to={dashboardPathForRole(role)} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold text-foreground">
          Assignments
        </h1>
        <p className="text-sm text-muted-foreground">
          Homework and class assignments available to your children.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif">Upcoming / active</CardTitle>
          <CardDescription>
            Showing the latest assignments that match your children’s classes.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {loadingChildren && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!loadingChildren && (children?.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">
              No children linked yet. The school admin will add them to your account.
            </p>
          )}

          {!loadingChildren && (children?.length ?? 0) > 0 && (
            <div className="rounded-lg border border-border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead className="text-right">Marks</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Attachment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingAssignments && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        Loading…
                      </TableCell>
                    </TableRow>
                  )}

                  {!loadingAssignments && (assignments ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No assignments found.
                      </TableCell>
                    </TableRow>
                  )}

                  {!loadingAssignments &&
                    (assignments ?? []).map((a) => {
                      const due = a.due_date
                        ? new Date(a.due_date).toLocaleDateString()
                        : "—";
                      const status = (a.status ?? "active").toLowerCase();
                      const badgeText = status === "active" ? "Pending" : a.status ?? "—";

                      return (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium">
                            {a.title}
                            <div className="text-xs text-muted-foreground">
                              {a['classes']?.name ? `Class: ${a['classes']?.name}` : ""}
                            </div>
                          </TableCell>
                          <TableCell>{due}</TableCell>
                          <TableCell className="text-right">
                            {a.marks ?? "—"}
                          </TableCell>
                          <TableCell className="capitalize">{badgeText}</TableCell>
                          <TableCell>
                            {a.attachment_url ? (
                              <a
                                className="text-primary hover:underline"
                                href={a.attachment_url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Download
                              </a>
                            ) : (
                              "—"
                            )}
                            <div className="mt-1 text-xs">
                              <Link
                                to="/parent/students/$studentId/assignments"
                                params={{
                                  studentId: children?.[0]?.id ?? "",
                                }}
                                className="text-muted-foreground hover:text-foreground underline"
                              >
                                View details
                              </Link>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


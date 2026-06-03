// Admin-only: invite a user by email and pre-assign their role.
// User clicks the link in the email and sets their own password.
// If the user already exists, we send a password-reset email instead so
// they can still complete account setup via the same /accept-invite page.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Role = "teacher" | "accountant" | "parent";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ error: "Missing auth" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

    const { data: isAdmin, error: roleErr } = await userClient.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (roleErr || !isAdmin) return json({ error: "Forbidden" }, 403);

    const body = await req.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const role = String(body.role ?? "") as Role;
    const fullName = body.full_name ? String(body.full_name) : null;
    const redirectTo = body.redirect_to ? String(body.redirect_to) : undefined;

    if (!email || !["teacher", "accountant", "parent"].includes(role)) {
      return json({ error: "Invalid email or role" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1) Try to invite a brand-new user. inviteUserByEmail both creates the
    //    user AND sends an invite email via the project's SMTP.
    const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { invited_role: role, full_name: fullName },
      redirectTo,
    });

    if (!inviteErr) {
      // Also generate a recovery link as a manual fallback in case SMTP isn't
      // configured / the default Supabase SMTP silently drops external recipients.
      const { data: linkData } = await admin.auth.admin.generateLink({
        type: "invite",
        email,
        options: { redirectTo, data: { invited_role: role, full_name: fullName } },
      });
      return json({
        ok: true,
        mode: "invited",
        user_id: invited.user?.id,
        action_link: linkData?.properties?.action_link ?? null,
      });
    }

    const msg = (inviteErr.message ?? "").toLowerCase();
    const alreadyExists =
      msg.includes("already") || msg.includes("registered") || msg.includes("exists");

    if (!alreadyExists) {
      console.error("inviteUserByEmail failed:", inviteErr.message);
      return json({ error: inviteErr.message }, 400);
    }

    // 2) User exists → look them up, ensure their role/profile, then send a recovery link.
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (listErr) return json({ error: listErr.message }, 400);

    const existing = list.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (!existing) return json({ error: "User exists but could not be located" }, 400);

    // Make sure profile is approved and role is assigned.
    await admin
      .from("profiles")
      .update({ status: "approved", full_name: fullName ?? undefined })
      .eq("id", existing.id);

    await admin.from("user_roles").delete().eq("user_id", existing.id);
    await admin.from("user_roles").insert({ user_id: existing.id, role });

    // generateLink(recovery) returns the action_link AND triggers the SMTP
    // delivery on Supabase's side. We surface the link so the admin can copy
    // and share it manually if the email never lands (e.g. default SMTP).
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });
    if (linkErr) {
      console.error("generateLink(recovery) failed:", linkErr.message);
      return json({ error: linkErr.message }, 400);
    }

    return json({
      ok: true,
      mode: "reset",
      user_id: existing.id,
      action_link: linkData?.properties?.action_link ?? null,
    });
  } catch (e) {
    console.error("invite-user error:", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
  });
}

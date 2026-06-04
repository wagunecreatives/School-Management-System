// Admin-only: create a user account with a temporary password, OR reset an
// existing user's password to a new temporary one. The admin then shares the
// credentials manually (WhatsApp / SMS / printed slip). On first login the
// app forces the user to change their password.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Role = "teacher" | "accountant" | "parent";

function generatePassword(len = 12) {
  // readable, no ambiguous chars
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
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
    const providedPassword = body.password ? String(body.password) : "";
    const password =
      providedPassword && providedPassword.length >= 8 ? providedPassword : generatePassword(12);

    if (!email || !["teacher", "accountant", "parent"].includes(role)) {
      return json({ error: "Invalid email or role" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1) Try to create the user with email pre-confirmed and a temp password.
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        invited_role: role,
        full_name: fullName,
        must_change_password: true,
      },
    });

    if (!createErr && created.user) {
      // Profile is auto-created by handle_new_user trigger.
      // Make sure status + role are right (trigger already does this for invited_role).
      await admin
        .from("profiles")
        .update({ status: "approved", full_name: fullName ?? undefined })
        .eq("id", created.user.id);
      await admin.from("user_roles").delete().eq("user_id", created.user.id);
      await admin.from("user_roles").insert({ user_id: created.user.id, role });

      return json({
        ok: true,
        mode: "created",
        user_id: created.user.id,
        email,
        password,
      });
    }

    const msg = (createErr?.message ?? "").toLowerCase();
    const alreadyExists =
      msg.includes("already") || msg.includes("registered") || msg.includes("exists");
    if (!alreadyExists) {
      console.error("createUser failed:", createErr?.message);
      return json({ error: createErr?.message ?? "Failed to create user" }, 400);
    }

    // 2) User exists -> locate, reset password, reassign role, force change.
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (listErr) return json({ error: listErr.message }, 400);

    const existing = list.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (!existing) return json({ error: "User exists but could not be located" }, 400);

    const { error: upErr } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: {
        ...(existing.user_metadata ?? {}),
        invited_role: role,
        full_name: fullName ?? existing.user_metadata?.full_name ?? null,
        must_change_password: true,
      },
    });
    if (upErr) return json({ error: upErr.message }, 400);

    await admin
      .from("profiles")
      .update({ status: "approved", full_name: fullName ?? undefined })
      .eq("id", existing.id);
    await admin.from("user_roles").delete().eq("user_id", existing.id);
    await admin.from("user_roles").insert({ user_id: existing.id, role });

    return json({
      ok: true,
      mode: "reset",
      user_id: existing.id,
      email,
      password,
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

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "teacher" | "accountant" | "parent";
export type UserStatus = "pending" | "approved" | "rejected";

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  status: UserStatus;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: AppRole[];
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function loadProfileAndRoles(userId: string) {
  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, status").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
  ]);
  return {
    profile: (profile as Profile | null) ?? null,
    roles: (roleRows ?? []).map((r: { role: AppRole }) => r.role),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  const hydrate = async (s: Session | null) => {
    setSession(s);
    if (s?.user) {
      const { profile, roles } = await loadProfileAndRoles(s.user.id);
      setProfile(profile);
      setRoles(roles);
    } else {
      setProfile(null);
      setRoles([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      // defer DB calls to avoid deadlock
      setSession(s);
      if (s?.user) {
        setTimeout(() => {
          loadProfileAndRoles(s.user.id).then(({ profile, roles }) => {
            setProfile(profile);
            setRoles(roles);
          });
        }, 0);
      } else {
        setProfile(null);
        setRoles([]);
      }
    });
    supabase.auth.getSession().then(({ data }) => hydrate(data.session));
    return () => sub.subscription.unsubscribe();
  }, []);

  const refresh = async () => {
    if (session?.user) {
      const { profile, roles } = await loadProfileAndRoles(session.user.id);
      setProfile(profile);
      setRoles(roles);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        session,
        profile,
        roles,
        loading,
        refresh,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function primaryRole(roles: AppRole[]): AppRole | null {
  const order: AppRole[] = ["admin", "teacher", "accountant", "parent"];
  for (const r of order) if (roles.includes(r)) return r;
  return null;
}

export function dashboardPathForRole(role: AppRole | null): string {
  switch (role) {
    case "admin":
      return "/admin/users";
    case "teacher":
      return "/teacher/results";
    case "accountant":
      return "/accountant/fees";
    case "parent":
      return "/parent/dashboard";
    default:
      return "/pending";
  }
}

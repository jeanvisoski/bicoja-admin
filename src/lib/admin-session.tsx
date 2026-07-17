import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

type AdminSessionValue = {
  session: Session | null;
  isAdmin: boolean;
  loading: boolean;
};

const AdminSessionContext = createContext<AdminSessionValue>({
  session: null,
  isAdmin: false,
  loading: true,
});

async function fetchIsAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .single();
  if (error) return false;
  return !!data?.is_admin;
}

export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) setIsAdmin(await fetchIsAdmin(data.session.user.id));
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      setIsAdmin(newSession ? await fetchIsAdmin(newSession.user.id) : false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <AdminSessionContext.Provider value={{ session, isAdmin, loading }}>
      {children}
    </AdminSessionContext.Provider>
  );
}

export function useAdminSession() {
  return useContext(AdminSessionContext);
}

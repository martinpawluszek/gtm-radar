import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { gtmSupabase } from "./gtmSupabase";

type AuthState = {
  loading: boolean;
  session: Session | null;
};

const Ctx = createContext<AuthState>({ loading: true, session: null });

export function GtmAuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ loading: true, session: null });

  useEffect(() => {
    let mounted = true;
    gtmSupabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setState({ loading: false, session: data.session });
    });
    const { data: sub } = gtmSupabase.auth.onAuthStateChange((_event, session) => {
      setState({ loading: false, session });
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export function useGtmAuth() {
  return useContext(Ctx);
}

// Returns the current gtmSupabase access token, or "" if signed out.
// Server functions that need to scope by user should be passed this.
export async function getGtmAccessToken(): Promise<string> {
  const { data } = await gtmSupabase.auth.getSession();
  return data.session?.access_token ?? "";
}

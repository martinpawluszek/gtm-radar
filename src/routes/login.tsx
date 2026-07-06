import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { gtmSupabase } from "@/lib/gtmSupabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — GTM Intelligence" }] }),
  component: LoginPage,
});

const MONO = "var(--font-mono)";

function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await gtmSupabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        // Auth state change → AppShell redirects to /.
      } else {
        const { data, error } = await gtmSupabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        if (!data.session) {
          setInfo("Check your email to confirm your account, then sign in.");
          setMode("signin");
        }
        // If session is returned immediately, AppShell redirects.
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "#0A0A0F" }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 380,
          background: "#111118",
          border: "1px solid #1E1E2E",
          borderRadius: 6,
          padding: 28,
        }}
      >
        <div className="flex items-center gap-2 mb-6">
          <span
            className="inline-block rounded-full"
            style={{ width: 8, height: 8, background: "#00D4FF" }}
          />
          <span
            style={{
              color: "#00D4FF",
              fontFamily: MONO,
              fontWeight: 700,
              fontSize: 15,
              letterSpacing: "0.02em",
            }}
          >
            GTM Intel
          </span>
        </div>

        <h1
          style={{
            color: "#F0F0FF",
            fontFamily: MONO,
            fontSize: 18,
            fontWeight: 600,
            marginBottom: 4,
          }}
        >
          {mode === "signin" ? "Sign in" : "Create account"}
        </h1>
        <p style={{ color: "#8B8B9E", fontSize: 12, marginBottom: 20 }}>
          {mode === "signin"
            ? "Access your workspace."
            : "New here? Set up your account."}
        </p>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <div>
            <label
              style={{
                display: "block",
                color: "#F0F0FF",
                fontSize: 12,
                marginBottom: 6,
              }}
            >
              Email
            </label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              style={{ background: "#0A0A0F", border: "1px solid #1E1E2E", color: "#F0F0FF" }}
            />
          </div>
          <div>
            <label
              style={{
                display: "block",
                color: "#F0F0FF",
                fontSize: 12,
                marginBottom: 6,
              }}
            >
              Password
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
              minLength={6}
              style={{ background: "#0A0A0F", border: "1px solid #1E1E2E", color: "#F0F0FF" }}
            />
          </div>

          {error && (
            <div
              style={{
                color: "#EF4444",
                fontSize: 12,
                fontFamily: MONO,
                border: "1px solid rgba(239,68,68,0.35)",
                background: "rgba(239,68,68,0.08)",
                borderRadius: 4,
                padding: "6px 8px",
              }}
            >
              {error}
            </div>
          )}
          {info && (
            <div
              style={{
                color: "#10B981",
                fontSize: 12,
                fontFamily: MONO,
                border: "1px solid rgba(16,185,129,0.35)",
                background: "rgba(16,185,129,0.08)",
                borderRadius: 4,
                padding: "6px 8px",
              }}
            >
              {info}
            </div>
          )}

          <Button
            type="submit"
            disabled={busy}
            style={{ background: "#00D4FF", color: "#0A0A0F", marginTop: 4 }}
          >
            {busy
              ? mode === "signin"
                ? "Signing in…"
                : "Creating account…"
              : mode === "signin"
                ? "Sign in"
                : "Create account"}
          </Button>
        </form>

        <div style={{ marginTop: 16, fontSize: 12, color: "#8B8B9E" }}>
          {mode === "signin" ? (
            <>
              No account?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  setError(null);
                  setInfo(null);
                }}
                style={{ color: "#00D4FF", fontFamily: MONO }}
              >
                Create one
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setError(null);
                  setInfo(null);
                }}
                style={{ color: "#00D4FF", fontFamily: MONO }}
              >
                Sign in
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

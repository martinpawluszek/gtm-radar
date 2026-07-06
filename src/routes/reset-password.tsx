import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { gtmSupabase } from "@/lib/gtmSupabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Reset password — GTM Intelligence" }] }),
  component: ResetPasswordPage,
});

const MONO = "var(--font-mono)";

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [checked, setChecked] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let mounted = true;

    // The recovery event may already have fired by the time we mount.
    gtmSupabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) setReady(true);
      setChecked(true);
    });

    const { data: sub } = gtmSupabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) {
        setReady(true);
        setChecked(true);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await gtmSupabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      setTimeout(() => navigate({ to: "/", replace: true }), 1500);
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
          Set new password
        </h1>
        <p style={{ color: "#8B8B9E", fontSize: 12, marginBottom: 20 }}>
          Choose a new password for your account.
        </p>

        {!checked && (
          <div style={{ color: "#8B8B9E", fontSize: 12, fontFamily: MONO }}>Loading…</div>
        )}

        {checked && !ready && (
          <div style={{ color: "#8B8B9E", fontSize: 12 }}>
            <div
              style={{
                color: "#EF4444",
                fontSize: 12,
                fontFamily: MONO,
                border: "1px solid rgba(239,68,68,0.35)",
                background: "rgba(239,68,68,0.08)",
                borderRadius: 4,
                padding: "6px 8px",
                marginBottom: 12,
              }}
            >
              This link is invalid or has expired.
            </div>
            <Link to="/login" style={{ color: "#00D4FF", fontFamily: MONO }}>
              Request a new one from the sign-in page →
            </Link>
          </div>
        )}

        {ready && !done && (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <div>
              <label
                style={{ display: "block", color: "#F0F0FF", fontSize: 12, marginBottom: 6 }}
              >
                New password
              </label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
                minLength={8}
                style={{ background: "#0A0A0F", border: "1px solid #1E1E2E", color: "#F0F0FF" }}
              />
              <div style={{ color: "#8B8B9E", fontSize: 11, marginTop: 4, fontFamily: MONO }}>
                At least 8 characters.
              </div>
            </div>
            <div>
              <label
                style={{ display: "block", color: "#F0F0FF", fontSize: 12, marginBottom: 6 }}
              >
                Confirm password
              </label>
              <Input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
                minLength={8}
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

            <Button
              type="submit"
              disabled={busy}
              style={{ background: "#00D4FF", color: "#0A0A0F", marginTop: 4 }}
            >
              {busy ? "Updating…" : "Update password"}
            </Button>
          </form>
        )}

        {done && (
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
            Password updated. Redirecting…
          </div>
        )}
      </div>
    </main>
  );
}

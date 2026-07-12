import { useState } from "react";
import { Info } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { gtmSupabase } from "@/lib/gtmSupabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — GTM Intelligence" }] }),
  component: LoginPage,
});

const MONO = "var(--font-mono)";

type Mode = "signin" | "signup" | "forgot";

function LoginPage() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [showSignupMessage, setShowSignupMessage] = useState(false);

  function switchMode(next: Mode, keepEmail = true) {
    setMode(next);
    setShowSignupMessage(false);
    setError(null);
    setInfo(null);
    if (!keepEmail) setEmail("");
    setPassword("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (mode === "forgot") {
      if (!email.trim()) {
        setError("Email is required.");
        return;
      }
      setBusy(true);
      try {
        await gtmSupabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: window.location.origin + "/reset-password",
        });
        setInfo("If an account exists for that email, a reset link has been sent.");
      } catch (err) {
        // Still show non-revealing message; log for debugging.
        console.error(err);
        setInfo("If an account exists for that email, a reset link has been sent.");
      } finally {
        setBusy(false);
      }
      return;
    }

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
      } else {
        const { data, error } = await gtmSupabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        if (!data.session) {
          // Supabase anti-enumeration: if the email is already registered+confirmed,
          // signUp returns success with a user whose `identities` array is empty.
          // A genuine new signup has at least one identity.
          const identities = data.user?.identities;
          if (Array.isArray(identities) && identities.length === 0) {
            setError(
              "An account with this email already exists. Try signing in, or use 'Forgot password' if you don't remember it.",
            );
            setMode("signin");
            setPassword("");
          } else {
            setInfo("Check your email to confirm your account, then sign in.");
            setMode("signin");
          }
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const title =
    mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Reset password";
  const subtitle =
    mode === "signin"
      ? "Access your workspace."
      : mode === "signup"
        ? "New here? Set up your account."
        : "We'll email you a link to reset your password.";

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
          {title}
        </h1>
        <p style={{ color: "#8B8B9E", fontSize: 12, marginBottom: 20 }}>{subtitle}</p>

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

          {mode !== "forgot" && (
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
                minLength={mode === "signup" ? 8 : 6}
                style={{ background: "#0A0A0F", border: "1px solid #1E1E2E", color: "#F0F0FF" }}
              />
              {mode === "signup" && (
                <div style={{ color: "#8B8B9E", fontSize: 11, marginTop: 4, fontFamily: MONO }}>
                  At least 8 characters.
                </div>
              )}
            </div>
          )}

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
                : mode === "signup"
                  ? "Creating account…"
                  : "Sending…"
              : mode === "signin"
                ? "Sign in"
                : mode === "signup"
                  ? "Create account"
                  : "Send reset link"}
          </Button>

          {mode === "signin" && (
            <button
              type="button"
              onClick={() => switchMode("forgot")}
              style={{
                color: "#00D4FF",
                fontFamily: MONO,
                fontSize: 12,
                textAlign: "left",
                marginTop: 2,
              }}
            >
              Forgot password?
            </button>
          )}
        </form>

        <div style={{ marginTop: 16, fontSize: 12, color: "#8B8B9E" }}>
          {mode === "signin" && (
            <>
              {!showSignupMessage ? (
                <>
                  No account?{" "}
                  <button
                    type="button"
                    onClick={() => setShowSignupMessage(true)}
                    style={{ color: "#8B8B9E", fontFamily: MONO, cursor: "default" }}
                  >
                    Create one
                  </button>
                </>
              ) : (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    color: "#00D4FF",
                    fontFamily: MONO,
                  }}
                >
                  <Info size={14} />
                  Signups are coming soon — check back later.
                </div>
              )}
            </>
          )}
          {mode === "signup" && (
            <>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => switchMode("signin")}
                style={{ color: "#00D4FF", fontFamily: MONO }}
              >
                Sign in
              </button>
            </>
          )}
          {mode === "forgot" && (
            <>
              Remembered it?{" "}
              <button
                type="button"
                onClick={() => switchMode("signin")}
                style={{ color: "#00D4FF", fontFamily: MONO }}
              >
                Back to sign in
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

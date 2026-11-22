"use client";

import { useEffect, useRef, useState } from "react";

type Step = "email" | "code";

export function LoginForm({ domain }: { domain: string }) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const fullEmail = () => {
    const v = email.trim().toLowerCase();
    return v.includes("@") ? v : `${v}@${domain}`;
  };

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    setError("");
    const address = fullEmail();
    if (!address.endsWith(`@${domain}`)) {
      setError(`Use your @${domain} work email.`);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: address }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error);
        if (data.retryAfter) {
          setCooldown(data.retryAfter);
          if (step === "email") setStep("code");
        }
        return;
      }
      setEmail(address);
      setStep("code");
      setDigits(Array(6).fill(""));
      setCooldown(60);
      setTimeout(() => inputs.current[0]?.focus(), 50);
    } catch {
      setError("Network problem. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(code: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: fullEmail(), code }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error);
        setDigits(Array(6).fill(""));
        setTimeout(() => inputs.current[0]?.focus(), 50);
        return;
      }
      window.location.href = "/portal";
    } catch {
      setError("Network problem. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function setDigit(index: number, value: string) {
    const clean = value.replace(/\D/g, "");
    const next = [...digits];
    if (clean.length > 1) {
      // pasted or autofilled the whole code
      clean.slice(0, 6).split("").forEach((ch, i) => (next[i] = ch));
      setDigits(next);
      const filled = next.join("");
      if (filled.length === 6) verify(filled);
      else inputs.current[Math.min(clean.length, 5)]?.focus();
      return;
    }
    next[index] = clean;
    setDigits(next);
    if (clean && index < 5) inputs.current[index + 1]?.focus();
    const code = next.join("");
    if (code.length === 6) verify(code);
  }

  if (step === "email") {
    return (
      <form onSubmit={sendCode}>
        <p className="eyebrow mb-3">Employee access</p>
        <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Sign in to KeyStone</h2>
        <p className="mt-3 text-muted">Enter your work email and we&apos;ll send you a 6-digit code. No password needed.</p>

        <label className="label mt-8" htmlFor="email">Work email</label>
        <div className="flex items-stretch rounded-xl border border-line bg-soft focus-within:border-accent focus-within:bg-white focus-within:ring-4 focus-within:ring-accent/15 transition">
          <input
            id="email"
            type="text"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your.name"
            className="min-w-0 flex-1 bg-transparent px-3.5 py-3.5 text-[15px] outline-none"
          />
          {!email.includes("@") && (
            <span className="flex items-center pr-3.5 text-[15px] text-muted select-none">@{domain}</span>
          )}
        </div>

        {error && <p className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-semibold text-red-700" role="alert">{error}</p>}

        <button type="submit" className="btn-primary mt-6 w-full py-3.5 text-base" disabled={busy || !email.trim()}>
          {busy ? "Sending code…" : "Send sign-in code"}
        </button>
        <p className="mt-6 text-center text-sm text-muted">
          Only accounts created by a KeyStone admin can sign in.
        </p>
      </form>
    );
  }

  return (
    <div>
      <p className="eyebrow mb-3">Check your email</p>
      <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Enter your code</h2>
      <p className="mt-3 text-muted">
        If <strong className="text-ink">{fullEmail()}</strong> has a KeyStone account, a 6-digit code is on its way. It expires in 10 minutes.
      </p>

      <div className="mt-8 flex justify-between gap-2 sm:gap-3" onPaste={(e) => { e.preventDefault(); setDigit(0, e.clipboardData.getData("text")); }}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => { inputs.current[i] = el; }}
            value={d}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            aria-label={`Digit ${i + 1}`}
            maxLength={i === 0 ? 6 : 1}
            disabled={busy}
            onChange={(e) => setDigit(i, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !digits[i] && i > 0) inputs.current[i - 1]?.focus();
            }}
            className="h-14 w-full min-w-0 rounded-xl border border-line bg-soft text-center font-display text-2xl font-bold text-ink outline-none transition focus:border-accent focus:bg-white focus:ring-4 focus:ring-accent/15 sm:h-16"
          />
        ))}
      </div>

      {error && <p className="mt-4 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-semibold text-red-700" role="alert">{error}</p>}
      {busy && <p className="mt-4 text-sm font-semibold text-muted">Checking…</p>}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 text-sm">
        <button type="button" className="font-semibold text-muted hover:text-ink" onClick={() => { setStep("email"); setError(""); }}>
          ← Use a different email
        </button>
        <button type="button" className="font-bold text-accent disabled:text-muted" disabled={cooldown > 0 || busy} onClick={() => sendCode()}>
          {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
        </button>
      </div>
    </div>
  );
}

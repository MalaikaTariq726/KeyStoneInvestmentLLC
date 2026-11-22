import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";
import { Logo, LogoMark } from "@/components/Logo";

export const metadata: Metadata = { title: "Sign in" };

// Always points at the newest published desktop release.
const RELEASES = "https://github.com/MalaikaTariq726/KeyStoneInvestmentApp-releases/releases/latest";

export default function LoginPage() {
  const domain = (process.env.ALLOWED_EMAIL_DOMAIN || "keystoneinvestmentllc.com").replace(/^@/, "");
  return (
    <main className="min-h-dvh grid lg:grid-cols-2 bg-white">
      {/* Brand panel */}
      <section className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-ink p-12 text-white">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-accent/30 blur-3xl" />
        <div className="absolute -bottom-32 -left-24 h-[28rem] w-[28rem] rounded-full bg-primary/60 blur-3xl" />
        <a href="/" className="relative" aria-label="Key Stone Investment website">
          <Logo light />
        </a>
        <div className="relative max-w-md">
          <LogoMark className="mb-8 h-16 w-24" />
          <h1 className="font-display text-5xl font-extrabold leading-[1.05] tracking-tight">
            Employee <span className="text-accent">Access</span>
          </h1>
          <p className="mt-5 text-lg text-white/70">
            Submit claims from site, follow approvals, and keep projects and expenses up to date from any device.
          </p>
        </div>
        <p className="relative text-sm text-white/40">© {new Date().getFullYear()} Key Stone Investment LLC</p>
      </section>

      {/* Form */}
      <section className="relative flex flex-col items-center justify-center px-5 py-16 sm:px-10">
        <div className="absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-[#fff1ea] to-transparent lg:hidden" />
        <a href="/" className="absolute left-5 top-5 z-10 flex items-center gap-1.5 text-sm font-bold text-muted hover:text-ink sm:left-10 sm:top-8">
          <span aria-hidden="true">←</span> Back to website
        </a>
        <div className="relative w-full max-w-md">
          <a href="/" className="mb-10 mt-4 inline-block lg:hidden" aria-label="Key Stone Investment website">
            <Logo />
          </a>
          <LoginForm domain={domain} />
          <div className="mt-10 border-t border-line pt-6 text-center text-sm text-muted">
            Prefer the Windows app?{" "}
            <a className="font-bold text-primary hover:text-accent" href={`${RELEASES}/download/KeyStoneInvestmentApp-win-Setup.exe`}>Download</a>
            {" · "}
            <a className="font-bold text-primary hover:text-accent" href={`${RELEASES}/download/KeyStoneInvestmentApp-win-Portable.zip`}>Portable (.zip)</a>
          </div>
        </div>
      </section>
    </main>
  );
}

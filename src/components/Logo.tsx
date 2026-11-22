export function LogoMark({ className = "h-8 w-12" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 62" className={className} aria-hidden="true">
      <path d="M12 58 A38 38 0 0 1 88 58" fill="none" stroke="#2B3990" strokeWidth="15" strokeDasharray="22.2 2.4" />
      <path d="M40 8 H60 L57 30 H43 Z" fill="#F15A24" />
    </svg>
  );
}

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="leading-none">
        <span className="block font-display text-[16px] font-extrabold tracking-tight text-accent">KEYSTONE</span>
        <span className={`mt-0.5 block text-[11px] font-bold ${light ? "text-white/70" : "text-primary"}`}>Investment LLC</span>
      </span>
    </span>
  );
}

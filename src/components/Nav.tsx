"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./Icon";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

function isActive(pathname: string, href: string) {
  return href === "/portal" ? pathname === "/portal" : pathname === href || pathname.startsWith(`${href}/`);
}

export function SideNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1" aria-label="Main">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[15px] font-semibold transition ${
              active ? "bg-ink text-white shadow-card" : "text-muted hover:bg-soft hover:text-ink"
            }`}
          >
            <Icon name={item.icon} className={`h-5 w-5 ${active ? "text-accent" : ""}`} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/90 backdrop-blur-lg lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Main"
    >
      <div className="mx-auto flex max-w-xl">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          const isNew = item.icon === "plus";
          return (
            <Link key={item.href} href={item.href} className="flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-bold">
              {isNew ? (
                <span className="-mt-6 grid h-12 w-12 place-items-center rounded-2xl text-white shadow-glow" style={{ background: "linear-gradient(120deg,#f15a24,#ff7b47)" }}>
                  <Icon name="plus" className="h-6 w-6" strokeWidth={2.4} />
                </span>
              ) : (
                <span className={`grid h-8 w-12 place-items-center rounded-full transition ${active ? "bg-ink text-white" : "text-muted"}`}>
                  <Icon name={item.icon} className="h-5 w-5" />
                </span>
              )}
              <span className={active ? "text-ink" : "text-muted"}>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

import Link from "next/link";
import { LogoutButton } from "@/components/admin/widgets";

export const metadata = { title: "Study admin" };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const nav = [
    ["/admin", "Participants"],
    ["/admin/monitor", "Live monitor"],
    ["/admin/export", "Export"],
    ["/preview?category=Home%20%26%20Office", "Shop preview"],
  ];
  return (
    <div className="min-h-screen bg-[#f5f6f8] text-[#1c2430]">
      <header className="border-b border-[#dfe3e8] bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3">
          <span className="font-bold">Study admin</span>
          <nav className="flex gap-1">
            {nav.map(([href, label]) => (
              <Link key={href} href={href!} className="rounded-md px-3 py-1.5 text-sm font-medium text-[#566070] hover:bg-[#f0f2f5] hover:text-[#1c2430]">
                {label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto">
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
    </div>
  );
}

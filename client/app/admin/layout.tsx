"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import AdminBottomNav from "@/components/admin/AdminBottomNav";
import { BRAND_NAME } from "@/lib/brand";

interface AdminUserSession {
  id: string;
  name: string;
  email: string;
  role: string;
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [admin, setAdmin] = useState<AdminUserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isLoginPage = pathname === "/admin/login";

  useEffect(() => {
    if (isLoginPage) {
      setIsLoading(false);
      return;
    }

    async function checkAuth() {
      try {
        const res = await fetch("http://localhost:4000/api/admin/auth/me", {
          credentials: "include",
        });

        if (!res.ok) {
          router.replace("/admin/login");
          return;
        }

        const data = await res.json();
        if (data.authenticated && data.admin) {
          setAdmin(data.admin);
        } else {
          router.replace("/admin/login");
        }
      } catch (err) {
        // If server is unreachable or network error, redirect to login
        router.replace("/admin/login");
      } finally {
        setIsLoading(false);
      }
    }

    checkAuth();
  }, [pathname, isLoginPage, router]);

  // For /admin/login, don't show admin chrome
  if (isLoginPage) {
    return <>{children}</>;
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="w-10 h-10 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        <p className="mt-3 text-xs font-semibold text-gray-500">
          Loading {BRAND_NAME} Admin...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col">
      {/* Desktop Sidebar (>=1024px) */}
      <AdminSidebar
        adminName={admin?.name || "Founder"}
        adminRole={admin?.role || "Owner"}
      />

      {/* Main Content Area */}
      <div className="lg:pl-64 flex flex-col flex-1 min-w-0">
        {/* Mobile Top Header (<1024px) */}
        <header className="lg:hidden sticky top-0 z-20 h-14 bg-white/95 backdrop-blur-md border-b border-gray-200 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-black text-xs">
              {BRAND_NAME[0]}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-sm text-heading">{BRAND_NAME}</span>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                Admin
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Pilot Active
            </span>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 pb-20 lg:pb-8">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation (<1024px) */}
      <AdminBottomNav
        adminName={admin?.name || "Founder"}
        adminRole={admin?.role || "Owner"}
      />
    </div>
  );
}


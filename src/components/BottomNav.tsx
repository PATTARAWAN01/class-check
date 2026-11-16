"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, ClipboardCheck, ShieldCheck, UserCheck } from "lucide-react";

export default function BottomNav() {
  const pathname = usePathname();

  const navItems = [
    {
      href: "/",
      label: "สถิติ",
      icon: BarChart3,
    },
    {
      href: "/check",
      label: "เช็คสอน",
      icon: ClipboardCheck,
      isPrimary: true,
    },
    {
      href: "/admin",
      label: "แอดมิน",
      icon: ShieldCheck,
    },
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-lg px-2 py-1.5 no-print safe-area-pb">
      <div className="grid grid-cols-3 gap-1 max-w-md mx-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          if (item.isPrimary) {
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all relative ${
                  isActive
                    ? "text-sky-600 font-bold"
                    : "text-slate-600 hover:text-sky-600 font-medium"
                }`}
              >
                <div
                  className={`w-10 h-10 -mt-4 rounded-full flex items-center justify-center shadow-md transition-transform ${
                    isActive
                      ? "bg-gradient-to-tr from-sky-600 to-indigo-600 text-white scale-110 shadow-sky-500/30 ring-2 ring-white"
                      : "bg-sky-600 text-white shadow-sky-600/20"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-[11px] mt-1 tracking-tight">{item.label}</span>
              </Link>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition-all ${
                isActive
                  ? "text-sky-600 font-bold bg-sky-50/80"
                  : "text-slate-500 hover:text-slate-900 font-medium hover:bg-slate-50"
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? "text-sky-600 scale-110" : "text-slate-400"}`} />
              <span className="text-[11px] mt-1 tracking-tight">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

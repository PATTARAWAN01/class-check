"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ClipboardCheck,
  ShieldCheck,
  UserCheck,
  Menu,
  X,
  Cloud,
  Database,
} from "lucide-react";
import { getActiveTerm, getSchoolProfile } from "@/lib/storage";
import { isFirebaseConfigured } from "@/lib/firebase";
import { AcademicTerm, SchoolProfile } from "@/types";

export default function Navbar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTerm, setActiveTermState] = useState<AcademicTerm | null>(null);
  const [profile, setProfile] = useState<SchoolProfile | null>(null);

  useEffect(() => {
    async function load() {
      const term = await getActiveTerm();
      const prof = await getSchoolProfile();
      setActiveTermState(term);
      setProfile(prof);
    }
    load();
  }, [pathname]);

  const navLinks = [
    {
      href: "/",
      label: "หน้าสถิติ",
      icon: BarChart3,
      badge: "สาธารณะ",
    },
    {
      href: "/check",
      label: "เช็คเวลาสอน",
      icon: ClipboardCheck,
      badge: "นักเรียน",
    },
    {
      href: "/admin",
      label: "จัดการระบบ",
      icon: ShieldCheck,
      badge: "แอดมิน",
    },
  ];

  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm no-print">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Logo & School Name */}
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-3 group">
              <div
                style={{ width: "44px", height: "44px", minWidth: "44px" }}
                className="w-11 h-11 rounded-xl bg-white flex items-center justify-center p-0.5 border border-slate-200 shadow-sm group-hover:scale-105 transition-transform overflow-hidden"
              >
                <img
                  src="/LOGO-N.png"
                  alt="ตราโรงเรียนหนองวัวซอพิทยาคม"
                  width={44}
                  height={44}
                  style={{ width: "44px", height: "44px", maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-slate-800 text-lg leading-tight group-hover:text-sky-600 transition-colors">
                  Class Check
                </span>
                <span className="text-xs text-slate-500 line-clamp-1">
                  {profile?.schoolName || "โรงเรียนหนองวัวซอพิทยาคม"}
                </span>
              </div>
            </Link>

            {/* Term Badge */}
            {activeTerm && (
              <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                ภาคเรียน {activeTerm.term}/{activeTerm.year}
              </span>
            )}
          </div>

          {/* Desktop Navigation Links */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? "bg-sky-50 text-sky-700 font-semibold"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 ${
                      isActive ? "text-sky-600" : "text-slate-400"
                    }`}
                  />
                  <span>{link.label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded ${
                      isActive
                        ? "bg-sky-200/60 text-sky-800"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {link.badge}
                  </span>
                </Link>
              );
            })}

            {/* Database / Cloud Status Badge */}
            <div className="ml-3 pl-3 border-l border-slate-200">
              {isFirebaseConfigured ? (
                <div
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-amber-50 text-amber-800 border border-amber-200"
                  title="เชื่อมต่อ Google Firebase Firestore แล้ว"
                >
                  <Cloud className="w-3.5 h-3.5 text-amber-600" />
                  <span className="font-medium">Firebase Live</span>
                </div>
              ) : (
                <div
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-slate-100 text-slate-700 border border-slate-200"
                  title="ใช้งานในโหมด Local/Demo (ใส่ Firebase Config ใน .env.local เพื่อต่อคลาวด์)"
                >
                  <Database className="w-3.5 h-3.5 text-slate-500" />
                  <span className="font-medium">Local/Demo Mode</span>
                </div>
              )}
            </div>
          </div>

          {/* Mobile Menu Button */}
          <div className="flex md:hidden items-center gap-2">
            {activeTerm && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                {activeTerm.term}/{activeTerm.year}
              </span>
            )}
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 focus:outline-none"
            >
              {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {isOpen && (
        <div className="md:hidden border-t border-slate-100 bg-white px-4 pt-2 pb-4 space-y-1 shadow-lg">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsOpen(false)}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium ${
                  isActive
                    ? "bg-sky-50 text-sky-700 font-semibold"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon
                    className={`w-4 h-4 ${
                      isActive ? "text-sky-600" : "text-slate-400"
                    }`}
                  />
                  <span>{link.label}</span>
                </div>
                <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                  {link.badge}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </nav>
  );
}

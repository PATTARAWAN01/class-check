import type { Metadata, Viewport } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import PwaInstallPrompt from "@/components/PwaInstallPrompt";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#0284c7",
};

export const metadata: Metadata = {
  title: "ระบบบันทึกการสอนของครูผู้สอน - โรงเรียนหนองวัวซอพิทยาคม",
  description: "ระบบบันทึกการสอนของครูผู้สอน โรงเรียนหนองวัวซอพิทยาคม โดยนักเรียน พร้อมหน้าสถิติสาธารณะและส่งออกรายงาน",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon-280.png",
    apple: "/favicon-280.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "บันทึกการสอน",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-touch-fullscreen" content="yes" />
      </head>
      <body className="min-h-screen flex flex-col bg-slate-50 text-slate-800 antialiased pb-20 md:pb-0">
        <Navbar />
        <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 print:p-0 print:m-0 print:max-w-none print:w-full">
          {children}
        </main>
        <BottomNav />
        <PwaInstallPrompt />
        <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500 no-print">
          <div className="max-w-7xl mx-auto px-4">
            <p className="font-medium text-slate-600">
              ระบบบันทึกการสอนของครูผู้สอน &bull; โรงเรียนหนองวัวซอพิทยาคม
            </p>
            <p className="mt-1 text-slate-400">
              Created and Developed by Pattarawan Suwanvapee
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}

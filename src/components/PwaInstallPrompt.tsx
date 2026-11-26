"use client";

import React, { useState, useEffect } from "react";
import { Download, X, Smartphone, Share, PlusSquare } from "lucide-react";

export default function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if running in standalone mode (already installed as PWA)
    const isRunningStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;

    if (isRunningStandalone) {
      setIsStandalone(true);
      return;
    }

    // Check if dismissed recently (within 5 days)
    const dismissedTime = localStorage.getItem("class_check_pwa_dismissed");
    if (dismissedTime) {
      const daysSinceDismiss =
        (Date.now() - parseInt(dismissedTime, 10)) / (1000 * 60 * 60 * 24);
      if (daysSinceDismiss < 5) {
        return;
      }
    }

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    // Listen for beforeinstallprompt event (Android / Chromium)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // For iOS, if not standalone and not dismissed, show install button after 2 seconds
    if (isIosDevice && !isRunningStandalone) {
      const timer = setTimeout(() => {
        setShowPrompt(true);
      }, 2000);
      return () => clearTimeout(timer);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSGuide(true);
      return;
    }

    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setShowPrompt(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    localStorage.setItem("class_check_pwa_dismissed", Date.now().toString());
    setShowPrompt(false);
  };

  if (isStandalone || !showPrompt) return null;

  return (
    <>
      {/* PWA Floating Install Bar for Mobile */}
      <div className="fixed bottom-20 md:bottom-6 left-3 right-3 sm:left-auto sm:right-6 sm:max-w-md z-40 bg-white/95 backdrop-blur-md rounded-2xl border border-sky-200 shadow-xl p-3.5 no-print animate-in slide-in-from-bottom-5 duration-300">
        <div className="flex items-center gap-3">
          <div
            style={{ width: "44px", height: "44px", minWidth: "44px" }}
            className="w-11 h-11 rounded-xl bg-sky-50 border border-sky-100 p-1 flex items-center justify-center shrink-0 shadow-xs"
          >
            <img
              src="/LOGO-N.png"
              alt="ระบบบันทึกการสอนของครูผู้สอน"
              width={44}
              height={44}
              style={{ width: "44px", height: "44px", maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
              className="w-full h-full object-contain"
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-slate-800 text-sm truncate">
                ติดตั้งระบบบันทึกการสอนของครูผู้สอน
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-100 text-sky-700">
                PWA
              </span>
            </div>
            <p className="text-xs text-slate-500 truncate">
              เปิดใช้งานเสมือนแอปบนมือถือ สะดวก รวดเร็ว
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleInstallClick}
              className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>ติดตั้ง</span>
            </button>
            <button
              onClick={handleDismiss}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              title="ปิดการแจ้งเตือน"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* iOS Safari Installation Guide Modal */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-slate-800 font-bold">
                <Smartphone className="w-5 h-5 text-sky-600" />
                <span>วิธีติดตั้งบน iPhone / iPad</span>
              </div>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs sm:text-sm text-slate-600">
              <div className="flex items-start gap-3 p-3 bg-sky-50 rounded-2xl border border-sky-100">
                <div className="w-7 h-7 rounded-xl bg-sky-600 text-white font-bold flex items-center justify-center shrink-0 text-xs">
                  1
                </div>
                <div>
                  <span className="font-semibold text-slate-800 block">
                    แตะที่ปุ่มแชร์ (Share)
                  </span>
                  <span>
                    กดไอคอน <Share className="w-3.5 h-3.5 inline mx-1 text-sky-600" /> ที่แถบด้านล่างของ Safari
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-sky-50 rounded-2xl border border-sky-100">
                <div className="w-7 h-7 rounded-xl bg-sky-600 text-white font-bold flex items-center justify-center shrink-0 text-xs">
                  2
                </div>
                <div>
                  <span className="font-semibold text-slate-800 block">
                    เลือก &quot;เพิ่มไปยังหน้าจอโฮม&quot;
                  </span>
                  <span>
                    เลื่อนลงมาแล้วเลือก <PlusSquare className="w-3.5 h-3.5 inline mx-1 text-sky-600" /> Add to Home Screen
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                setShowIOSGuide(false);
                handleDismiss();
              }}
              className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-sm transition-all"
            >
              เข้าใจแล้ว
            </button>
          </div>
        </div>
      )}
    </>
  );
}

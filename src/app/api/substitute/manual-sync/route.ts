import { NextRequest, NextResponse } from "next/server";
import { syncNongwuasoSubstitutes } from "@/lib/nongwuasoSubSync";
import { getThaiDateString } from "@/lib/dateUtils";

export const dynamic = "force-dynamic";

// Secret key to prevent unauthorized access
// Set CRON_SECRET env var in Vercel dashboard
const CRON_SECRET = process.env.CRON_SECRET || "";

/**
 * Lightweight dedicated endpoint for external cron services (cron-job.org etc.)
 * Accepts ?secret=xxx for minimal auth check
 * Usage: GET https://nwsp-class-check.vercel.app/api/substitute/manual-sync?secret=YOUR_SECRET
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get("secret") || "";
    const dateParam = searchParams.get("date") || getThaiDateString();

    // If CRON_SECRET is set, validate it
    if (CRON_SECRET && secret !== CRON_SECRET) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const result = await syncNongwuasoSubstitutes(dateParam);
    return NextResponse.json(result, {
      status: result.success ? 200 : 500,
    });
  } catch (error: any) {
    console.error("GET /api/substitute/manual-sync error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Internal server error during sync",
        error: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}

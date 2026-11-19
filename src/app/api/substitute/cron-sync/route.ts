import { NextRequest, NextResponse } from "next/server";
import { syncNongwuasoSubstitutes } from "@/lib/nongwuasoSubSync";
import { getThaiDateString } from "@/lib/dateUtils";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date") || getThaiDateString();

    const result = await syncNongwuasoSubstitutes(dateParam);
    return NextResponse.json(result, {
      status: result.success ? 200 : 500,
    });
  } catch (error: any) {
    console.error("GET /api/substitute/cron-sync error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Internal server error during auto-sync",
        error: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    let dateParam = "";
    try {
      const body = await request.json();
      dateParam = body?.date || "";
    } catch {
      // no body, fallback to query param or today
    }

    if (!dateParam) {
      const { searchParams } = new URL(request.url);
      dateParam = searchParams.get("date") || getThaiDateString();
    }

    const result = await syncNongwuasoSubstitutes(dateParam);
    return NextResponse.json(result, {
      status: result.success ? 200 : 500,
    });
  } catch (error: any) {
    console.error("POST /api/substitute/cron-sync error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Internal server error during auto-sync",
        error: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { processOcrBuffer } from "@/lib/ocrService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "ไม่พบไฟล์รายงาน กรุณาเลือกไฟล์ PDF หรือรูปภาพ" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await processOcrBuffer(buffer);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("API OCR Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "เกิดข้อผิดพลาดในการอ่านเอกสาร OCR: " + (error?.message || String(error)),
      },
      { status: 500 }
    );
  }
}

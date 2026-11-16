import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import fs from "fs/promises";
import path from "path";
import os from "os";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let tempFilePath: string | null = null;
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

    // Write to a temporary file
    const ext = path.extname(file.name) || ".pdf";
    const tempFileName = `ocr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
    tempFilePath = path.join(os.tmpdir(), tempFileName);
    await fs.writeFile(tempFilePath, buffer);

    const scriptPath = path.resolve(process.cwd(), "src/scripts/runOcr.js");

    // Execute runOcr.js in child process
    const ocrOutput = await new Promise<string>((resolve, reject) => {
      execFile(
        "node",
        [scriptPath, tempFilePath!],
        { maxBuffer: 10 * 1024 * 1024, timeout: 60000 },
        (error, stdout, stderr) => {
          if (error) {
            console.error("OCR execution error:", error, stderr);
            return reject(new Error(stderr || error.message));
          }
          resolve(stdout);
        }
      );
    });

    const parsedResult = JSON.parse(ocrOutput.trim());
    return NextResponse.json(parsedResult);
  } catch (error: any) {
    console.error("API OCR Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "เกิดข้อผิดพลาดในการอ่านเอกสาร OCR: " + (error?.message || String(error)),
      },
      { status: 500 }
    );
  } finally {
    if (tempFilePath) {
      try {
        await fs.unlink(tempFilePath);
      } catch {
        // ignore cleanup error
      }
    }
  }
}

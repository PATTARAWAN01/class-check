# Class Check - ระบบเช็คเวลาเข้าสอนของครู

เว็บแอพพลิเคชันสำหรับโรงเรียนเพื่อให้นักเรียน (หัวหน้าห้อง) บันทึกและตรวจสอบการเข้าสอนของครูในแต่ละคาบเรียน พร้อมหน้าสถิติสาธารณะแบบ Real-time และระบบหลังบ้านสำหรับฝ่ายวิชาการ/แอดมิน จัดการข้อมูลแบบหลายภาคเรียนและหลายปีการศึกษา พร้อมระบบดาวน์โหลดเทมเพลต นำเข้าไฟล์ Excel และออกรายงานทางการเป็น PDF

---

## 🌟 ฟังก์ชันเด่นของระบบ

1. **หน้าสถิติสาธารณะ (Public Live Dashboard):**
   * ข้อมูลสาธารณะเข้าดูได้ทันที ไม่ต้องล็อกอิน
   * KPI สรุปภาพรวม: จำนวนคาบสอน, % เข้าสอนตรงเวลา, % เข้าสอนสาย (>10 นาที), % ไม่เข้าสอน (ลากิจ/ลาป่วย/ไปราชการ/อื่นๆ)
   * กรองข้อมูลได้ทั้ง: วันนี้, สัปดาห์นี้, เดือนนี้, ทั้งภาคเรียน
   * ตารางสรุปรายครู พร้อมปุ่มเจาะลึกดูประวัติรายคาบ (Drill-down Modal)
   * ส่งออกข้อมูลสรุปเป็น Excel ได้ทันที

2. **หน้าเช็คเวลาสอนสำหรับนักเรียน (Student Check-in):**
   * ล็อกอินรายห้องเรียนด้วย **รหัสห้อง + รหัส PIN** ป้องกันการเช็คชื่อข้ามห้อง
   * บันทึกชื่อหรือเลขที่ของผู้ส่ง เพื่อความรับผิดชอบและความโปร่งใส
   * **Smart Auto-suggest:** ตรวจจับวันและเวลาปัจจุบัน เทียบกับตารางสอนของห้องนั้น และดึงคาบเรียน รหัสวิชา และชื่อครูขึ้นมาให้อัตโนมัติทันที
   * สามารถแก้ไขชื่อครู/วิชาได้เองกรณีมีครูสอนแทนหรือสลับคาบ
   * รองรับวิชา **คาบคู่ (2 คาบติดกัน)** โดยคำนวณภาระงานเป็น 2 คาบในระบบสถิติ
   * บังคับตอบครบทุกคำถามก่อนส่ง และตรวจเช็คประวัติที่ห้องตัวเองบันทึกแล้วในวันนั้น

3. **หน้าหลังบ้านสำหรับแอดมิน / ฝ่ายวิชาการ (Admin Panel):**
   * **ออกรายงานทางการ (Official PDF):** จัดหน้าฟอร์มเอกสารราชการ/โรงเรียน มีตราสัญลักษณ์ สรุปสถิติ รายละเอียดรายคาบ และช่องลงนามฝ่ายวิชาการกับผู้อำนวยการโรงเรียน (สั่งพิมพ์หรือ Save as PDF ได้ทันที)
   * **ระบบตารางสอน (Timetable):** ดาวน์โหลดเทมเพลต Excel $\rightarrow$ กรอกข้อมูล $\rightarrow$ อัปโหลดโยนเข้าสู่ระบบเมื่อขึ้นเทอมใหม่
   * **ระบบครู & รายวิชา:** ดาวน์โหลดเทมเพลต Excel นำเข้ารายชื่อครูและรายวิชา
   * **จัดการห้องเรียน & PIN:** เพิ่มห้องเรียน (ม.1/1 - ม.6/x) และเปลี่ยนรหัสผ่าน PIN ประจำห้อง
   * **กำหนดช่วงเวลาคาบเรียน (Period Times):** ตั้งเวลาเริ่ม-สิ้นสุดของคาบ 1-8 ได้อย่างยืดหยุ่น
   * **รองรับหลายภาคเรียน & ปีการศึกษา:** เก็บข้อมูลย้อนหลังได้ไม่จำกัด

---

## 🚀 การติดตั้งและรันในเครื่อง (Local Development)

```bash
# 1. ติดตั้ง Packages
npm install

# 2. เริ่มต้นรันเซิร์ฟเวอร์
npm run dev
```

เปิดเบราว์เซอร์ไปที่ `http://localhost:3000`

---

## 🔑 บัญชีและรหัสผ่านเริ่มต้นสำหรับทดสอบ (Demo)

* **แอดมิน (Admin Portal):**
  * Username: `admin`
  * Password: `admin123`
* **ห้องเรียน (Student Check-in PIN):**
  * ม.1/1 รหัส PIN: `1111`
  * ม.1/2 รหัส PIN: `1122`
  * ม.2/1 รหัส PIN: `2211`
  * (สามารถแก้ไขหรือเพิ่มห้องได้ในหน้าแอดมิน)

---

## ☁️ การเชื่อมต่อ Google Firebase Firestore

ระบบมีโหมด **Local/Demo Mode** มาในตัว ซึ่งใช้งานและทดสอบฟังก์ชันทั้งหมดได้ทันทีแม้ยังไม่ได้ต่อ Firebase

เมื่อพร้อมนำขึ้นระบบจริง:
1. เข้าไปที่ [Firebase Console](https://console.firebase.google.com) แล้วกดสร้างโปรเจกต์ใหม่
2. ไปที่ **Firestore Database** $\rightarrow$ กด Create Database (เลือกโหมด Test หรือกำหนด Rules ให้อ่าน/เขียนได้)
3. ไปที่ **Project Settings** $\rightarrow$ ที่ส่วน **Your apps** กดสร้าง Web App
4. คัดลอกค่า Config มาใส่ในไฟล์ `.env.local`:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abcdef
```

---

## 🌐 การ Deploy ขึ้น Cloudflare Pages

1. นำโค้ดขึ้น GitHub Repository
2. เข้าสู่ [Cloudflare Dashboard](https://dash.cloudflare.com) $\rightarrow$ ไปที่ **Workers & Pages**
3. กด **Create application** $\rightarrow$ เลือกแท็บ **Pages** $\rightarrow$ **Connect to Git**
4. เลือก Repository ของคุณ แล้วกำหนดค่า Build Settings:
   * **Framework preset:** `Next.js`
   * **Build command:** `npx @cloudflare/next-on-pages` หรือ `npm run build`
   * **Output directory:** `.vercel/output/static` หรือ `.next`
5. ใส่ Environment Variables (`NEXT_PUBLIC_FIREBASE_*`) ในหน้า Settings ของ Cloudflare Pages
6. กด **Save and Deploy** เว็บไซต์จะออนไลน์ทั่วโลกพร้อม SSL ฟรีทันที

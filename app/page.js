import Link from 'next/link';

export default function HomePage() {
  return (
    <main style={{ fontFamily: 'sans-serif', padding: '2rem', textAlign: 'center' }}>
      <h1>ผีน้อย เน็ตคาเฟ่</h1>
      <p>ระบบสั่งอาหารและจับเวลาคิดเงิน</p>

      <nav style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '2rem' }}>
        <Link href="/generate-qr">ไปหน้า Generate QR</Link>
        <Link href="/kitchen">ไปหน้า Kitchen</Link>
      </nav>
    </main>
  );
}

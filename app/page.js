import Link from 'next/link';

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <h1
        style={{
          fontSize: '2.5rem',
          margin: 0,
          background: 'linear-gradient(135deg, #00d9ff 0%, #a855f7 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}
      >
        ผีน้อย เน็ตคาเฟ่
      </h1>
      <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', fontSize: '1.1rem' }}>
        ระบบสั่งอาหารและจับเวลาคิดเงิน
      </p>

      <nav style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '2.5rem' }}>
        <Link
          href="/generate-qr"
          className="btn-glow"
          style={{
            display: 'inline-block',
            padding: '0.9rem 1.6rem',
            borderRadius: 10,
            textDecoration: 'none',
            fontSize: '1.1rem',
          }}
        >
          ไปหน้า Generate QR
        </Link>
        <Link
          href="/kitchen"
          className="card"
          style={{
            display: 'inline-block',
            padding: '0.9rem 1.6rem',
            borderRadius: 10,
            textDecoration: 'none',
            fontSize: '1.1rem',
            color: 'var(--text-primary)',
          }}
        >
          ไปหน้า Kitchen
        </Link>
      </nav>
    </main>
  );
}

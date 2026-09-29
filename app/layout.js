export const metadata = {
  title: 'ผีน้อย เน็ตคาเฟ่',
  description: 'ระบบสั่งอาหารและจับเวลาคิดเงินร้านเน็ตคาเฟ่',
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}

'use client';

import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

function computeTimeCost(createdAt, rate) {
  const minutesUsed = (Date.now() - new Date(createdAt).getTime()) / 60000;
  const units = Math.max(1, Math.ceil(minutesUsed / 15));
  const timeCost = units * (rate / 4);
  return { minutesUsed: Math.floor(minutesUsed), units, timeCost };
}

export default function GenerateQrPage() {
  const [seatNumber, setSeatNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // session ที่เปิดค้างอยู่แล้ว (ต้องปิดก่อน)
  const [existingSession, setExistingSession] = useState(null); // { id, rate_per_hour, created_at }

  // กล่องยืนยันปิดเวลาเดิม
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmInfo, setConfirmInfo] = useState(null); // { minutesUsed, timeCost }
  const [closing, setClosing] = useState(false);

  // ผลลัพธ์ QR เมื่อเปิดเครื่องสำเร็จ
  const [qrResult, setQrResult] = useState(null); // { seatNumber, url }
  const [copied, setCopied] = useState(false);

  const resetAll = () => {
    setSeatNumber('');
    setExistingSession(null);
    setShowConfirm(false);
    setConfirmInfo(null);
    setQrResult(null);
    setErrorMsg('');
    setCopied(false);
  };

  const handleOpenMachine = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    if (!seatNumber) return;

    setLoading(true);
    try {
      // 1) เช็คว่ามี session เปิดค้างอยู่ที่เครื่องนี้หรือไม่
      const { data: openSession, error: selectError } = await supabase
        .from('sessions')
        .select('id, rate_per_hour, created_at')
        .eq('seat_number', seatNumber)
        .eq('status', 'open')
        .maybeSingle();

      if (selectError) throw selectError;

      if (openSession) {
        setExistingSession(openSession);
        setQrResult(null);
        setLoading(false);
        return;
      }

      // 2) ไม่มี session เปิดค้าง -> สร้างใหม่
      const { data: newSession, error: insertError } = await supabase
        .from('sessions')
        .insert({ seat_number: seatNumber, status: 'open' })
        .select()
        .single();

      if (insertError) throw insertError;

      const fullUrl = `${window.location.origin}/order/${seatNumber}`;
      setQrResult({ seatNumber, url: fullUrl });
      setExistingSession(null);
    } catch (err) {
      setErrorMsg('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenConfirm = () => {
    if (!existingSession) return;
    const { minutesUsed, timeCost } = computeTimeCost(
      existingSession.created_at,
      existingSession.rate_per_hour
    );
    setConfirmInfo({ minutesUsed, timeCost });
    setShowConfirm(true);
  };

  const handleCancelConfirm = () => {
    setShowConfirm(false);
    setConfirmInfo(null);
  };

  const handleConfirmClose = async () => {
    if (!existingSession) return;
    setClosing(true);
    setErrorMsg('');
    try {
      // ดึงออเดอร์ทั้งหมดของ session นี้ มาคิดค่าอาหาร
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('items')
        .eq('session_id', existingSession.id);

      if (ordersError) throw ordersError;

      const foodCost = (orders || []).reduce((sum, order) => {
        const items = order.items || [];
        const orderSum = items.reduce(
          (s, item) => s + Number(item.price) * Number(item.quantity),
          0
        );
        return sum + orderSum;
      }, 0);

      const { timeCost } = computeTimeCost(
        existingSession.created_at,
        existingSession.rate_per_hour
      );
      const totalAmount = timeCost + foodCost;

      // update เฉพาะเมื่อยังเป็น 'open' อยู่ กันกดซ้ำซ้อน
      const { data: updated, error: updateError } = await supabase
        .from('sessions')
        .update({
          status: 'closed',
          closed_at: new Date().toISOString(),
          total_amount: totalAmount,
        })
        .eq('id', existingSession.id)
        .eq('status', 'open')
        .select();

      if (updateError) throw updateError;

      if (!updated || updated.length === 0) {
        throw new Error('เวลาเดิมถูกปิดไปแล้ว (อาจกดซ้ำ) กรุณาลองเปิดเครื่องใหม่อีกครั้ง');
      }

      // ปิดสำเร็จ -> กลับไปที่ฟอร์มเดิม (เลขเครื่องยังอยู่)
      setShowConfirm(false);
      setConfirmInfo(null);
      setExistingSession(null);
    } catch (err) {
      setErrorMsg('ปิดเวลาเดิมไม่สำเร็จ: ' + err.message);
    } finally {
      setClosing(false);
    }
  };

  const handleCopyLink = async () => {
    if (!qrResult) return;
    try {
      await navigator.clipboard.writeText(qrResult.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setErrorMsg('คัดลอกลิงก์ไม่สำเร็จ กรุณาคัดลอกด้วยตนเอง');
    }
  };

  return (
    <main
      style={{
        fontFamily: 'sans-serif',
        padding: '2rem',
        maxWidth: 480,
        margin: '0 auto',
      }}
    >
      <h1 style={{ fontSize: '2rem', marginBottom: '1.5rem' }}>เปิดเครื่อง</h1>

      {errorMsg && (
        <div
          style={{
            background: '#fee2e2',
            border: '2px solid #dc2626',
            color: '#991b1b',
            borderRadius: 8,
            padding: '1rem',
            marginBottom: '1rem',
            fontSize: '1.1rem',
          }}
        >
          {errorMsg}
        </div>
      )}

      {/* ฟอร์มกรอกเลขเครื่อง */}
      {!qrResult && (
        <form onSubmit={handleOpenMachine} style={{ marginBottom: '1.5rem' }}>
          <label
            htmlFor="seatNumber"
            style={{ display: 'block', fontSize: '1.3rem', marginBottom: '0.5rem' }}
          >
            เลขเครื่อง
          </label>
          <input
            id="seatNumber"
            type="number"
            inputMode="numeric"
            value={seatNumber}
            onChange={(e) => {
              setSeatNumber(e.target.value);
              setExistingSession(null);
              setErrorMsg('');
            }}
            required
            style={{
              width: '100%',
              fontSize: '2rem',
              padding: '0.75rem',
              borderRadius: 8,
              border: '2px solid #ccc',
              marginBottom: '1rem',
              boxSizing: 'border-box',
            }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              fontSize: '1.5rem',
              padding: '1rem',
              borderRadius: 8,
              border: 'none',
              background: loading ? '#93c5fd' : '#2563eb',
              color: '#fff',
              fontWeight: 'bold',
              cursor: loading ? 'default' : 'pointer',
            }}
          >
            {loading ? 'กำลังตรวจสอบ...' : 'เปิดเครื่อง'}
          </button>
        </form>
      )}

      {/* กล่องเตือน: มี session เปิดค้างอยู่ */}
      {existingSession && !qrResult && (
        <div
          style={{
            background: '#ffedd5',
            border: '3px solid #ea580c',
            borderRadius: 10,
            padding: '1.25rem',
            marginBottom: '1rem',
          }}
        >
          <p style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#9a3412', margin: 0 }}>
            เครื่องนี้มีลูกค้าใช้งานอยู่ กรุณาปิดเวลาเดิมก่อน
          </p>
          <button
            onClick={handleOpenConfirm}
            style={{
              marginTop: '1rem',
              width: '100%',
              fontSize: '1.3rem',
              padding: '0.9rem',
              borderRadius: 8,
              border: 'none',
              background: '#ea580c',
              color: '#fff',
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
          >
            ปิดเวลาเดิม
          </button>
        </div>
      )}

      {/* กล่องยืนยันปิดเวลาเดิม */}
      {showConfirm && confirmInfo && (
        <div
          style={{
            background: '#fee2e2',
            border: '3px solid #dc2626',
            borderRadius: 10,
            padding: '1.25rem',
            marginBottom: '1rem',
          }}
        >
          <p style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#991b1b', margin: '0 0 0.75rem' }}>
            ยืนยันปิดเวลาเดิม
          </p>
          <p style={{ fontSize: '1.2rem', margin: '0.25rem 0' }}>เครื่อง {seatNumber}</p>
          <p style={{ fontSize: '1.2rem', margin: '0.25rem 0' }}>
            ใช้มาแล้ว {confirmInfo.minutesUsed} นาที
          </p>
          <p style={{ fontSize: '1.2rem', margin: '0.25rem 0 1rem' }}>
            ค่าเวลาเบื้องต้น {confirmInfo.timeCost.toFixed(2)} บาท
          </p>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={handleCancelConfirm}
              disabled={closing}
              style={{
                flex: 1,
                fontSize: '1.1rem',
                padding: '0.8rem',
                borderRadius: 8,
                border: '2px solid #999',
                background: '#fff',
                cursor: closing ? 'default' : 'pointer',
              }}
            >
              ยกเลิก
            </button>
            <button
              onClick={handleConfirmClose}
              disabled={closing}
              style={{
                flex: 1,
                fontSize: '1.1rem',
                padding: '0.8rem',
                borderRadius: 8,
                border: 'none',
                background: closing ? '#fca5a5' : '#dc2626',
                color: '#fff',
                fontWeight: 'bold',
                cursor: closing ? 'default' : 'pointer',
              }}
            >
              {closing ? 'กำลังปิด...' : 'ยืนยันปิดเวลาเดิม'}
            </button>
          </div>
        </div>
      )}

      {/* ผลลัพธ์: QR code เมื่อเปิดเครื่องสำเร็จ */}
      {qrResult && (
        <div style={{ textAlign: 'center' }}>
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
              qrResult.url
            )}`}
            alt={`QR code เครื่อง ${qrResult.seatNumber}`}
            width={300}
            height={300}
            style={{ maxWidth: '100%', height: 'auto', marginBottom: '1rem' }}
          />
          <p style={{ fontSize: '1.4rem', fontWeight: 'bold', margin: '0 0 0.5rem' }}>
            เครื่อง {qrResult.seatNumber} · เริ่มจับเวลาแล้ว
          </p>
          <p
            style={{
              fontSize: '1rem',
              wordBreak: 'break-all',
              color: '#2563eb',
              margin: '0 0 0.75rem',
            }}
          >
            {qrResult.url}
          </p>
          <button
            onClick={handleCopyLink}
            style={{
              fontSize: '0.95rem',
              padding: '0.5rem 1rem',
              borderRadius: 6,
              border: '1px solid #999',
              background: '#f3f4f6',
              cursor: 'pointer',
              marginBottom: '1.5rem',
            }}
          >
            {copied ? 'คัดลอกแล้ว ✓' : 'คัดลอกลิงก์'}
          </button>

          <button
            onClick={resetAll}
            style={{
              width: '100%',
              fontSize: '1.3rem',
              padding: '0.9rem',
              borderRadius: 8,
              border: 'none',
              background: '#2563eb',
              color: '#fff',
              fontWeight: 'bold',
              cursor: 'pointer',
              marginBottom: '1rem',
            }}
          >
            เปิดเครื่องอื่น
          </button>

          <p style={{ fontSize: '0.85rem', color: '#666' }}>
            ลิงก์/QR ของแต่ละเครื่องเหมือนเดิมทุกรอบ พิมพ์ติดไว้ที่เครื่องถาวรได้เลย
          </p>
        </div>
      )}
    </main>
  );
}


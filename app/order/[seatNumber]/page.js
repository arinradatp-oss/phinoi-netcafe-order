'use client';

import { use, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';

const MAX_CART_LINES = 10;
const MAX_LINE_QTY = 5;

function computeBilling(createdAt, ratePerHour, now = Date.now()) {
  const minutesUsed = (now - new Date(createdAt).getTime()) / 60000;
  const units = Math.max(1, Math.ceil(minutesUsed / 15));
  const timeCost = units * (ratePerHour / 4);
  const wholeMinutes = Math.max(0, Math.floor(minutesUsed));
  const hours = Math.floor(wholeMinutes / 60);
  const minutes = wholeMinutes % 60;
  return { hours, minutes, timeCost };
}

export default function OrderPage({ params }) {
  const { seatNumber } = use(params);

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [session, setSession] = useState(null); // { id, rate_per_hour, created_at }
  const [errorMsg, setErrorMsg] = useState('');

  const [categories, setCategories] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [activeCategoryId, setActiveCategoryId] = useState(null);
  const [qtyDraft, setQtyDraft] = useState({}); // { [itemId]: chosenQty }

  const [cart, setCart] = useState([]); // [{ key, name, price, quantity }]
  const [sending, setSending] = useState(false);
  const [orderSentMsg, setOrderSentMsg] = useState('');

  const [now, setNow] = useState(Date.now());

  const [showBillModal, setShowBillModal] = useState(false);
  const [billInfo, setBillInfo] = useState(null); // { hours, minutes, timeCost, foodCost, total }
  const [billLoading, setBillLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const [closedInfo, setClosedInfo] = useState(null); // { total }

  // โหลด session + เมนู ตอนเข้าหน้า
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setErrorMsg('');
      try {
        const { data: sessionRow, error: sessionError } = await supabase
          .from('sessions')
          .select('id, rate_per_hour, created_at')
          .eq('seat_number', seatNumber)
          .eq('status', 'open')
          .maybeSingle();

        if (sessionError) throw sessionError;

        if (!sessionRow) {
          if (!cancelled) setNotFound(true);
          return;
        }

        if (!cancelled) setSession(sessionRow);

        const [{ data: cats, error: catError }, { data: items, error: itemError }] =
          await Promise.all([
            supabase.from('menu_categories').select('id, name, sort_order').order('sort_order'),
            supabase.from('menu_items').select('id, category_id, name, price'),
          ]);

        if (catError) throw catError;
        if (itemError) throw itemError;

        if (!cancelled) {
          setCategories(cats || []);
          setMenuItems(items || []);
          if (cats && cats.length > 0) setActiveCategoryId(cats[0].id);
        }
      } catch (err) {
        if (!cancelled) setErrorMsg('โหลดข้อมูลไม่สำเร็จ: ' + err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [seatNumber]);

  // อัปเดตตัวจับเวลาทุก 30 วินาที
  useEffect(() => {
    if (!session) return;
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, [session]);

  const billing = useMemo(() => {
    if (!session) return null;
    return computeBilling(session.created_at, session.rate_per_hour, now);
  }, [session, now]);

  const cartTotal = useMemo(
    () => cart.reduce((sum, line) => sum + line.price * line.quantity, 0),
    [cart]
  );
  const cartCount = useMemo(
    () => cart.reduce((sum, line) => sum + line.quantity, 0),
    [cart]
  );

  const itemsInActiveCategory = menuItems.filter(
    (item) => item.category_id === activeCategoryId
  );

  const getDraftQty = (itemId) => qtyDraft[itemId] || 1;

  const changeDraftQty = (itemId, delta) => {
    setQtyDraft((prev) => {
      const current = prev[itemId] || 1;
      const next = Math.min(MAX_LINE_QTY, Math.max(1, current + delta));
      return { ...prev, [itemId]: next };
    });
  };

  const addToCart = (item) => {
    if (closedInfo) return;
    const quantity = getDraftQty(item.id);

    setCart((prev) => {
      const existingIndex = prev.findIndex(
        (line) => line.name === item.name && line.price === item.price
      );
      if (existingIndex >= 0) {
        const updated = [...prev];
        const newQty = Math.min(MAX_LINE_QTY * 2, updated[existingIndex].quantity + quantity);
        updated[existingIndex] = { ...updated[existingIndex], quantity: newQty };
        return updated;
      }
      if (prev.length >= MAX_CART_LINES) {
        setErrorMsg(`ตะกร้าเต็มแล้ว (สูงสุด ${MAX_CART_LINES} รายการต่อการส่ง 1 ครั้ง)`);
        return prev;
      }
      return [...prev, { key: `${item.id}-${Date.now()}`, name: item.name, price: item.price, quantity }];
    });
    setQtyDraft((prev) => ({ ...prev, [item.id]: 1 }));
  };

  const removeCartLine = (key) => {
    setCart((prev) => prev.filter((line) => line.key !== key));
  };

  const handleSendOrder = async () => {
    if (cart.length === 0 || !session) return;
    setSending(true);
    setErrorMsg('');
    setOrderSentMsg('');
    try {
      const itemsPayload = cart.map(({ name, price, quantity }) => ({ name, price, quantity }));

      const { error: insertError } = await supabase.from('orders').insert({
        session_id: session.id,
        seat_number: seatNumber,
        items: itemsPayload,
        status: 'received',
      });

      if (insertError) throw insertError;

      setCart([]);
      setOrderSentMsg('ส่งออเดอร์แล้ว พนักงานจะนำไปส่งที่เครื่อง');
      setTimeout(() => setOrderSentMsg(''), 4000);
    } catch (err) {
      setErrorMsg('ส่งออเดอร์ไม่สำเร็จ: ' + err.message);
    } finally {
      setSending(false);
    }
  };

  const handleOpenBill = async () => {
    if (!session) return;
    setBillLoading(true);
    setErrorMsg('');
    try {
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('items')
        .eq('session_id', session.id);

      if (ordersError) throw ordersError;

      const foodCost = (orders || []).reduce((sum, order) => {
        const items = order.items || [];
        return sum + items.reduce((s, it) => s + Number(it.price) * Number(it.quantity), 0);
      }, 0);

      const { hours, minutes, timeCost } = computeBilling(
        session.created_at,
        session.rate_per_hour,
        Date.now()
      );

      setBillInfo({ hours, minutes, timeCost, foodCost, total: timeCost + foodCost });
      setShowBillModal(true);
    } catch (err) {
      setErrorMsg('ดึงข้อมูลบิลไม่สำเร็จ: ' + err.message);
    } finally {
      setBillLoading(false);
    }
  };

  const handleConfirmBill = async () => {
    if (!session || !billInfo) return;
    setConfirming(true);
    setErrorMsg('');
    try {
      const { data: updated, error: updateError } = await supabase
        .from('sessions')
        .update({
          status: 'closed',
          closed_at: new Date().toISOString(),
          total_amount: billInfo.total,
        })
        .eq('id', session.id)
        .eq('status', 'open')
        .select();

      if (updateError) throw updateError;

      if (!updated || updated.length === 0) {
        throw new Error('เวลานี้ถูกปิดไปแล้ว กรุณาแจ้งพนักงาน');
      }

      setShowBillModal(false);
      setClosedInfo({ total: billInfo.total });
    } catch (err) {
      setErrorMsg('ปิดบิลไม่สำเร็จ: ' + err.message);
    } finally {
      setConfirming(false);
    }
  };

  // ---------- Render states ----------

  if (loading) {
    return (
      <main style={fullScreenCenterStyle}>
        <p style={{ fontSize: '1.3rem' }}>กำลังโหลด...</p>
      </main>
    );
  }

  if (notFound) {
    return (
      <main style={fullScreenCenterStyle}>
        <p style={{ fontSize: '1.5rem', textAlign: 'center', padding: '0 1.5rem' }}>
          เครื่องนี้ยังไม่ได้เริ่มจับเวลา กรุณาแจ้งพนักงาน
        </p>
      </main>
    );
  }

  if (closedInfo) {
    return (
      <main style={fullScreenCenterStyle}>
        <p style={{ fontSize: '1.5rem', textAlign: 'center', padding: '0 1.5rem' }}>
          ขอบคุณที่ใช้บริการ กรุณาชำระเงินที่เคาน์เตอร์
          <br />
          <strong style={{ fontSize: '2rem' }}>ยอดรวม {closedInfo.total.toFixed(2)} บาท</strong>
        </p>
      </main>
    );
  }

  return (
    <main style={{ fontFamily: 'sans-serif', paddingBottom: cart.length > 0 ? '6.5rem' : '1rem' }}>
      {/* แถบบน: เลขเครื่อง + เวลา + ปุ่มเรียกเก็บเงิน */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          background: '#111827',
          color: '#fff',
          padding: '0.9rem 1rem',
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '1.3rem', fontWeight: 'bold' }}>เครื่อง {seatNumber}</span>
          <button
            onClick={handleOpenBill}
            disabled={billLoading}
            style={{
              fontSize: '0.95rem',
              padding: '0.5rem 0.9rem',
              borderRadius: 6,
              border: 'none',
              background: '#dc2626',
              color: '#fff',
              fontWeight: 'bold',
              cursor: billLoading ? 'default' : 'pointer',
            }}
          >
            {billLoading ? '...' : 'เรียกเก็บเงิน'}
          </button>
        </div>
        {billing && (
          <p style={{ margin: '0.4rem 0 0', fontSize: '0.95rem', color: '#d1d5db' }}>
            ใช้งานมาแล้ว {billing.hours} ชม. {billing.minutes} นาที · ค่าเวลาตอนนี้{' '}
            {billing.timeCost.toFixed(2)} บาท
          </p>
        )}
      </div>

      {errorMsg && (
        <div
          style={{
            margin: '0.75rem 1rem',
            background: '#fee2e2',
            border: '2px solid #dc2626',
            color: '#991b1b',
            borderRadius: 8,
            padding: '0.75rem 1rem',
            fontSize: '1rem',
          }}
        >
          {errorMsg}
        </div>
      )}

      {orderSentMsg && (
        <div
          style={{
            margin: '0.75rem 1rem',
            background: '#dcfce7',
            border: '2px solid #16a34a',
            color: '#166534',
            borderRadius: 8,
            padding: '0.75rem 1rem',
            fontSize: '1.05rem',
            fontWeight: 'bold',
            textAlign: 'center',
          }}
        >
          {orderSentMsg}
        </div>
      )}

      {/* แท็บหมวดหมู่ */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          overflowX: 'auto',
          padding: '0.75rem 1rem',
          borderBottom: '1px solid #e5e7eb',
        }}
      >
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategoryId(cat.id)}
            style={{
              flexShrink: 0,
              fontSize: '1.05rem',
              padding: '0.6rem 1.1rem',
              borderRadius: 999,
              border: activeCategoryId === cat.id ? 'none' : '1px solid #d1d5db',
              background: activeCategoryId === cat.id ? '#2563eb' : '#fff',
              color: activeCategoryId === cat.id ? '#fff' : '#111827',
              fontWeight: activeCategoryId === cat.id ? 'bold' : 'normal',
              cursor: 'pointer',
            }}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* รายการเมนู */}
      <div style={{ padding: '0.5rem 1rem' }}>
        {itemsInActiveCategory.length === 0 && (
          <p style={{ color: '#6b7280', textAlign: 'center', marginTop: '2rem' }}>
            ไม่มีเมนูในหมวดนี้
          </p>
        )}
        {itemsInActiveCategory.map((item) => (
          <div
            key={item.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1rem 0',
              borderBottom: '1px solid #f0f0f0',
            }}
          >
            <div>
              <p style={{ fontSize: '1.15rem', fontWeight: 'bold', margin: 0 }}>{item.name}</p>
              <p style={{ fontSize: '1rem', color: '#6b7280', margin: '0.2rem 0 0' }}>
                {Number(item.price).toFixed(2)} บาท
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button
                onClick={() => changeDraftQty(item.id, -1)}
                style={qtyBtnStyle}
                aria-label="ลดจำนวน"
              >
                −
              </button>
              <span style={{ fontSize: '1.1rem', width: '1.5rem', textAlign: 'center' }}>
                {getDraftQty(item.id)}
              </span>
              <button
                onClick={() => changeDraftQty(item.id, 1)}
                style={qtyBtnStyle}
                aria-label="เพิ่มจำนวน"
              >
                +
              </button>
              <button
                onClick={() => addToCart(item)}
                style={{
                  marginLeft: '0.4rem',
                  fontSize: '1.4rem',
                  width: '2.75rem',
                  height: '2.75rem',
                  borderRadius: '50%',
                  border: 'none',
                  background: '#2563eb',
                  color: '#fff',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                }}
                aria-label={`เพิ่ม ${item.name} ลงตะกร้า`}
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ตะกร้าลอยด้านล่าง */}
      {cart.length > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            background: '#111827',
            color: '#fff',
            padding: '0.9rem 1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            boxShadow: '0 -2px 10px rgba(0,0,0,0.2)',
          }}
        >
          <div style={{ fontSize: '1.05rem' }}>
            <strong>{cartCount} รายการ</strong> · {cartTotal.toFixed(2)} บาท
          </div>
          <button
            onClick={handleSendOrder}
            disabled={sending}
            style={{
              fontSize: '1.15rem',
              padding: '0.8rem 1.4rem',
              borderRadius: 8,
              border: 'none',
              background: sending ? '#93c5fd' : '#16a34a',
              color: '#fff',
              fontWeight: 'bold',
              cursor: sending ? 'default' : 'pointer',
            }}
          >
            {sending ? 'กำลังส่ง...' : 'ส่งออเดอร์'}
          </button>
        </div>
      )}

      {/* รายการในตะกร้า (ให้ลบได้) แสดงเหนือแถบตะกร้าเมื่อมีรายการ */}
      {cart.length > 0 && (
        <div style={{ padding: '0 1rem 6rem' }}>
          <p style={{ fontSize: '1rem', color: '#6b7280', marginTop: '1.5rem' }}>ในตะกร้า:</p>
          {cart.map((line) => (
            <div
              key={line.key}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.4rem 0',
              }}
            >
              <span style={{ fontSize: '1rem' }}>
                {line.name} × {line.quantity}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '1rem' }}>
                  {(line.price * line.quantity).toFixed(2)} บาท
                </span>
                <button
                  onClick={() => removeCartLine(line.key)}
                  style={{
                    fontSize: '0.9rem',
                    color: '#dc2626',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  ลบ
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* กล่องยืนยันเรียกเก็บเงิน */}
      {showBillModal && billInfo && (
        <div style={modalOverlayStyle}>
          <div style={modalBoxStyle}>
            <p style={{ fontSize: '1.4rem', fontWeight: 'bold', margin: '0 0 1rem' }}>
              ยืนยันเรียกเก็บเงิน
            </p>
            <p style={modalLineStyle}>
              เวลาที่ใช้: {billInfo.hours} ชม. {billInfo.minutes} นาที
            </p>
            <p style={modalLineStyle}>ค่าเวลา: {billInfo.timeCost.toFixed(2)} บาท</p>
            <p style={modalLineStyle}>ค่าอาหาร: {billInfo.foodCost.toFixed(2)} บาท</p>
            <p style={{ ...modalLineStyle, fontWeight: 'bold', fontSize: '1.2rem' }}>
              ยอดรวม: {billInfo.total.toFixed(2)} บาท
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
              <button
                onClick={() => setShowBillModal(false)}
                disabled={confirming}
                style={{
                  flex: 1,
                  fontSize: '1.1rem',
                  padding: '0.8rem',
                  borderRadius: 8,
                  border: '2px solid #999',
                  background: '#fff',
                  cursor: confirming ? 'default' : 'pointer',
                }}
              >
                ยกเลิก
              </button>
              <button
                onClick={handleConfirmBill}
                disabled={confirming}
                style={{
                  flex: 1,
                  fontSize: '1.1rem',
                  padding: '0.8rem',
                  borderRadius: 8,
                  border: 'none',
                  background: confirming ? '#fca5a5' : '#dc2626',
                  color: '#fff',
                  fontWeight: 'bold',
                  cursor: confirming ? 'default' : 'pointer',
                }}
              >
                {confirming ? 'กำลังปิด...' : 'ยืนยัน'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

const fullScreenCenterStyle = {
  fontFamily: 'sans-serif',
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const qtyBtnStyle = {
  width: '2rem',
  height: '2rem',
  fontSize: '1.1rem',
  borderRadius: 6,
  border: '1px solid #d1d5db',
  background: '#f9fafb',
  cursor: 'pointer',
};

const modalOverlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1rem',
  zIndex: 50,
};

const modalBoxStyle = {
  background: '#fff',
  borderRadius: 12,
  padding: '1.5rem',
  width: '100%',
  maxWidth: 380,
  border: '3px solid #dc2626',
};

const modalLineStyle = {
  fontSize: '1.05rem',
  margin: '0.35rem 0',
};

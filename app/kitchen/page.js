'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

function formatTime(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

function sortByCreatedAtAsc(list) {
  return [...list].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

export default function KitchenPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [pendingIds, setPendingIds] = useState({}); // { [orderId]: true } กันกดซ้ำระหว่างรอ update

  // โหลดออเดอร์เริ่มต้น
  useEffect(() => {
    let cancelled = false;

    async function loadInitial() {
      setLoading(true);
      setErrorMsg('');
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('id, session_id, seat_number, items, status, created_at')
          .in('status', ['received', 'cooking'])
          .order('created_at', { ascending: true });

        if (error) throw error;
        if (!cancelled) setOrders(data || []);
      } catch (err) {
        if (!cancelled) setErrorMsg('โหลดออเดอร์ไม่สำเร็จ: ' + err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadInitial();
    return () => {
      cancelled = true;
    };
  }, []);

  // ฟัง Realtime: INSERT และ UPDATE บนตาราง orders
  useEffect(() => {
    const channel = supabase
      .channel('kitchen-orders')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (payload) => {
          const row = payload.new;
          if (row.status !== 'received' && row.status !== 'cooking') return;
          setOrders((prev) => {
            if (prev.some((o) => o.id === row.id)) return prev;
            return sortByCreatedAtAsc([...prev, row]);
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        (payload) => {
          const row = payload.new;
          setOrders((prev) => {
            if (row.status === 'served') {
              return prev.filter((o) => o.id !== row.id);
            }
            if (row.status === 'received' || row.status === 'cooking') {
              const exists = prev.some((o) => o.id === row.id);
              const next = exists
                ? prev.map((o) => (o.id === row.id ? row : o))
                : [...prev, row];
              return sortByCreatedAtAsc(next);
            }
            return prev.filter((o) => o.id !== row.id);
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const updateStatus = async (orderId, newStatus) => {
    setPendingIds((prev) => ({ ...prev, [orderId]: true }));
    setErrorMsg('');
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', orderId);

      if (error) throw error;

      if (newStatus === 'served') {
        setOrders((prev) => prev.filter((o) => o.id !== orderId));
      } else {
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o))
        );
      }
    } catch (err) {
      setErrorMsg('อัปเดตสถานะไม่สำเร็จ: ' + err.message);
    } finally {
      setPendingIds((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
    }
  };

  return (
    <main style={{ fontFamily: 'sans-serif', padding: '1.25rem', minHeight: '100vh', background: '#f3f4f6' }}>
      <h1 style={{ fontSize: '1.8rem', margin: '0 0 1rem' }}>จอครัว / เคาน์เตอร์</h1>

      {errorMsg && (
        <div
          style={{
            background: '#fee2e2',
            border: '2px solid #dc2626',
            color: '#991b1b',
            borderRadius: 8,
            padding: '0.75rem 1rem',
            marginBottom: '1rem',
            fontSize: '1rem',
          }}
        >
          {errorMsg}
        </div>
      )}

      {loading && <p style={{ fontSize: '1.2rem' }}>กำลังโหลด...</p>}

      {!loading && orders.length === 0 && (
        <p style={{ fontSize: '1.3rem', color: '#6b7280', marginTop: '2rem' }}>
          ยังไม่มีออเดอร์ค้างอยู่
        </p>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: '1rem',
        }}
      >
        {orders.map((order) => {
          const isCooking = order.status === 'cooking';
          const isPending = !!pendingIds[order.id];
          const items = order.items || [];

          return (
            <div
              key={order.id}
              style={{
                background: isCooking ? '#fef3c7' : '#ffffff',
                border: isCooking ? '3px solid #f59e0b' : '3px solid #d1d5db',
                borderRadius: 12,
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.6rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: '2rem', fontWeight: 'bold' }}>
                  เครื่อง {order.seat_number}
                </span>
                <span style={{ fontSize: '1rem', color: '#6b7280' }}>
                  {formatTime(order.created_at)}
                </span>
              </div>

              <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '1.15rem' }}>
                {items.map((item, idx) => (
                  <li key={idx}>
                    {item.name} × {item.quantity}
                  </li>
                ))}
              </ul>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                {!isCooking && (
                  <button
                    onClick={() => updateStatus(order.id, 'cooking')}
                    disabled={isPending}
                    style={{
                      flex: 1,
                      fontSize: '1.1rem',
                      padding: '0.75rem',
                      borderRadius: 8,
                      border: 'none',
                      background: isPending ? '#fcd34d' : '#f59e0b',
                      color: '#fff',
                      fontWeight: 'bold',
                      cursor: isPending ? 'default' : 'pointer',
                    }}
                  >
                    เริ่มทำ
                  </button>
                )}
                <button
                  onClick={() => updateStatus(order.id, 'served')}
                  disabled={isPending}
                  style={{
                    flex: 1,
                    fontSize: '1.1rem',
                    padding: '0.75rem',
                    borderRadius: 8,
                    border: 'none',
                    background: isPending ? '#86efac' : '#16a34a',
                    color: '#fff',
                    fontWeight: 'bold',
                    cursor: isPending ? 'default' : 'pointer',
                  }}
                >
                  ส่งถึงเครื่องแล้ว
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}

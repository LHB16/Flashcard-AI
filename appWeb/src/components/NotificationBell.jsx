import React, { useState, useEffect, useRef } from 'react';
import { Bell } from 'lucide-react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

export default function NotificationBell({ userLoggedIn, userEmail, onOpenImportModal }) {
  const [showNotif, setShowNotif] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const notifRef = useRef(null);

  // Poll notifications
  useEffect(() => {
    if (!userLoggedIn || !userEmail) {
      setNotifications([]);
      return;
    }

    const fetchNotifications = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/share/notifications?email=${encodeURIComponent(userEmail)}`);
        if (res.ok) {
          const data = await res.json();
          setNotifications(data.notifications || []);
        }
      } catch (err) {
        console.error('Failed to fetch notifications:', err);
      }
    };

    fetchNotifications();
    const intervalId = setInterval(fetchNotifications, 60000); // Poll mỗi 60 giây
    return () => clearInterval(intervalId);
  }, [userLoggedIn, userEmail]);

  // Click outside close
  useEffect(() => {
    function handleClickOutside(event) {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setShowNotif(false);
      }
    }
    if (showNotif) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showNotif]);

  // Handle Mark as Read when opening the dropdown
  useEffect(() => {
    if (showNotif && userEmail) {
      const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
      if (unreadIds.length > 0) {
        fetch(`${BACKEND_URL}/share/notifications/read`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: unreadIds })
        }).then(res => {
          if (res.ok) {
            setNotifications(prev => prev.map(n => unreadIds.includes(n.id) ? { ...n, is_read: true } : n));
          }
        }).catch(err => console.error('Failed to mark notifications read:', err));
      }
    }
  }, [showNotif, notifications, userEmail]);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const handleReceiveDeck = (deck_id) => {
    setShowNotif(false);
    if (onOpenImportModal) {
      onOpenImportModal(deck_id);
    }
  };

  const getRelativeTime = (isoString) => {
    const diff = Math.floor((new Date() - new Date(isoString)) / 1000);
    if (diff < 60) return `${diff} giây trước`;
    const mins = Math.floor(diff / 60);
    if (mins < 60) return `${mins} phút trước`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} giờ trước`;
    return `${Math.floor(hours / 24)} ngày trước`;
  };

  return (
    <div className="relative" ref={notifRef} style={{ position: 'relative' }}>
      <button 
        className="btn btn-glass btn-icon" 
        onClick={() => setShowNotif(!showNotif)}
        title="Notifications"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: '-4px', right: '-4px',
            background: 'var(--danger)', color: 'white',
            borderRadius: '50%', width: '16px', height: '16px',
            fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 'bold', border: '2px solid var(--bg)'
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {showNotif && (
        <div className="glass-panel animate-fade-in notification-dropdown" style={{
          position: 'absolute', top: 'calc(100% + 10px)', right: 0,
          width: '320px', maxHeight: '400px', display: 'flex', flexDirection: 'column',
          zIndex: 9999, overflow: 'hidden', overscrollBehavior: 'contain',
          background: 'var(--glass-bg)', backdropFilter: 'blur(16px)'
        }}>
          {/* Header */}
          <div style={{ padding: '1rem', borderBottom: '1px solid var(--glass-border)' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Thông báo</h3>
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                Không có thông báo nào
              </div>
            ) : (
              notifications.map(notif => {
                const { sender_email, deck_name, deck_id } = notif.payload || {};
                return (
                  <div 
                    key={notif.id}
                    style={{
                      padding: '1rem',
                      borderBottom: '1px solid var(--glass-border)',
                      background: notif.is_read ? 'transparent' : 'rgba(79, 70, 229, 0.05)',
                      display: 'flex',
                      gap: '0.75rem',
                      alignItems: 'flex-start',
                      transition: 'background 0.2s',
                    }}
                  >
                    <div style={{ fontSize: '1.5rem', flexShrink: 0, filter: notif.is_read ? 'grayscale(40%)' : 'none' }}>
                      🔔
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: '0 0 0.4rem', fontSize: '0.9rem', color: 'var(--text-main)', lineHeight: '1.4' }}>
                        <strong style={{ color: 'var(--primary)' }}>{sender_email}</strong> đã chia sẻ deck <strong style={{ color: 'var(--text-main)' }}>"{deck_name}"</strong> với bạn
                      </p>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{getRelativeTime(notif.created_at)}</span>
                        <button 
                          onClick={() => handleReceiveDeck(deck_id)}
                          className="btn btn-primary"
                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', borderRadius: '6px' }}
                        >
                          Nhận deck
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}


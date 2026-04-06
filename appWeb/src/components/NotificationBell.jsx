import React, { useState, useEffect, useRef } from 'react';
import { Bell, Check, ExternalLink } from 'lucide-react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

export default function NotificationBell({ userLoggedIn, userEmail, onOpenImportModal }) {
  const [showNotif, setShowNotif] = useState(false);
  const [readSysNotifs, setReadSysNotifs] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('read_notifications')) || [];
    } catch {
      return [];
    }
  });
  const [notifications, setNotifications] = useState([]);
  const notifRef = useRef(null);

  // Poll notifications
  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        let combined = [];

        // 1. Fetch system notifications
        const sysRes = await fetch(`${BACKEND_URL}/notifications`);
        if (sysRes.ok) {
          const sysData = await sysRes.json();
          const formattedSys = (Array.isArray(sysData) ? sysData : []).map(n => ({
            ...n,
            _type: 'system',
            _date: new Date(n.date).getTime()
          }));
          combined = [...combined, ...formattedSys];
        }

        // 2. Fetch user shared deck notifications
        if (userLoggedIn && userEmail) {
          const res = await fetch(`${BACKEND_URL}/share/notifications?email=${encodeURIComponent(userEmail)}`);
          if (res.ok) {
            const data = await res.json();
            const formattedUser = (data.notifications || []).map(n => ({
              ...n,
              _type: 'deck_shared',
              _date: new Date(n.created_at).getTime()
            }));
            combined = [...combined, ...formattedUser];
          }
        }

        combined.sort((a, b) => b._date - a._date);
        setNotifications(combined);
      } catch (err) {
        console.error('Failed to fetch notifications:', err);
      }
    };

    fetchNotifications();
    const intervalId = setInterval(fetchNotifications, 60000);
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
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showNotif]);

  // Handle Mark as Read when opening the dropdown (Only for user DB notifications)
  useEffect(() => {
    if (showNotif && userEmail) {
      const dbUnreadIds = notifications
        .filter(n => n._type === 'deck_shared' && !n.is_read)
        .map(n => n.id);
        
      if (dbUnreadIds.length > 0) {
        fetch(`${BACKEND_URL}/share/notifications/read`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: dbUnreadIds })
        }).then(res => {
          if (res.ok) {
            setNotifications(prev => prev.map(n => 
              dbUnreadIds.includes(n.id) ? { ...n, is_read: true } : n
            ));
          }
        }).catch(err => console.error('Failed to mark notifications read:', err));
      }
    }
  }, [showNotif, notifications, userEmail]);

  const markSysAsRead = (id) => {
    if (!readSysNotifs.includes(id)) {
      const updated = [...readSysNotifs, id];
      setReadSysNotifs(updated);
      localStorage.setItem('read_notifications', JSON.stringify(updated));
    }
  };

  const markAllSysAsRead = () => {
    const sysIds = notifications.filter(n => n._type === 'system').map(n => n.id);
    setReadSysNotifs(sysIds);
    localStorage.setItem('read_notifications', JSON.stringify(sysIds));
  };

  const unreadCount = notifications.filter(n => {
    if (n._type === 'system') return !readSysNotifs.includes(n.id);
    return !n.is_read;
  }).length;

  const handleSysNotificationClick = (notif) => {
    markSysAsRead(notif.id);
    if (notif.link) {
      window.open(notif.link, '_blank');
      setShowNotif(false);
    }
  };

  const handleReceiveDeck = (deck_id) => {
    setShowNotif(false);
    if (onOpenImportModal) {
      onOpenImportModal(deck_id);
    }
  };

  const getRelativeTime = (ts) => {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return `${diff} seconds ago`;
    const mins = Math.floor(diff / 60);
    if (mins < 60) return `${mins} mins ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hours ago`;
    return `${Math.floor(hours / 24)} days ago`;
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
          overscrollBehavior: 'contain',
          backdropFilter: 'blur(16px)'
        }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderBottom: '1px solid var(--glass-border)' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Notifications</h3>
            {notifications.some(n => n._type === 'system' && !readSysNotifs.includes(n.id)) && (
              <button 
                onClick={markAllSysAsRead}
                style={{ background: 'transparent', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <Check size={14} /> Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                No notifications
              </div>
            ) : (
              notifications.map(notif => {
                if (notif._type === 'system') {
                  const isRead = readSysNotifs.includes(notif.id);
                  return (
                    <div 
                      key={notif.id}
                      onClick={() => handleSysNotificationClick(notif)}
                      style={{
                        padding: '1rem',
                        borderBottom: '1px solid var(--glass-border)',
                        cursor: notif.link ? 'pointer' : 'default',
                        background: isRead ? 'transparent' : 'rgba(79, 70, 229, 0.05)',
                        display: 'flex',
                        gap: '0.75rem',
                        alignItems: 'flex-start',
                        transition: 'background 0.2s',
                      }}
                      onMouseEnter={(e) => {
                         if (notif.link) e.currentTarget.style.background = isRead ? 'rgba(0,0,0,0.02)' : 'rgba(79, 70, 229, 0.1)';
                      }}
                      onMouseLeave={(e) => {
                         if (notif.link) e.currentTarget.style.background = isRead ? 'transparent' : 'rgba(79, 70, 229, 0.05)';
                      }}
                    >
                      {notif.icon && (
                        <div style={{ fontSize: '1.5rem', flexShrink: 0, filter: isRead ? 'grayscale(40%)' : 'none' }}>
                          {notif.icon}
                        </div>
                      )}
                      <div>
                        <h4 style={{ margin: '0 0 0.2rem', fontSize: '0.95rem', color: isRead ? 'var(--text-main)' : 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          {notif.title}
                          {!isRead && <span style={{ width: '6px', height: '6px', background: 'var(--danger)', borderRadius: '50%', display: 'inline-block' }}></span>}
                        </h4>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                          {notif.desc}
                        </p>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.4rem' }}>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{getRelativeTime(notif._date)}</span>
                          {notif.link && (
                             <span style={{ fontSize: '0.75rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '2px' }}>
                               Read more <ExternalLink size={12} />
                             </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                }

                // Shared Deck user notification
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
                      📦
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: '0 0 0.4rem', fontSize: '0.9rem', color: 'var(--text-main)', lineHeight: '1.4' }}>
                        <strong style={{ color: 'var(--primary)' }}>{sender_email}</strong> shared deck <strong style={{ color: 'var(--text-main)' }}>"{deck_name}"</strong> with you
                      </p>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{getRelativeTime(notif._date)}</span>
                        <button 
                          onClick={() => handleReceiveDeck(deck_id)}
                          className="btn btn-primary"
                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', borderRadius: '6px' }}
                        >
                          Import Deck
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


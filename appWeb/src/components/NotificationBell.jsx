import React, { useState, useEffect, useRef } from 'react';
import { Bell, Check, ExternalLink } from 'lucide-react';

const NOTIFICATIONS = [
  {
    id: 'notif_aiscan_v1',
    date: '2026-03-31',
    icon: '✨',
    title: 'New: AI Scan Feature',
    desc: 'Upload a folder of images to auto-generate flashcard decks using Gemini AI.'
  },
  {
    id: 'notif_quiz_nav_v1',
    date: '2026-03-30',
    icon: '🧭',
    title: 'New: Quiz Navigation',
    desc: 'Use ← → buttons to review previous answers or skip questions in Quiz Mode.'
  },
  {
    id: 'notif_pin_sort_v1',
    date: '2026-03-29',
    icon: '📌',
    title: 'New: Pin & Sort Decks',
    desc: 'Pin your favorite decks to the top and sort A-Z or Z-A.'
  },
  {
    id: 'notif_progress_v1',
    date: '2026-03-29',
    icon: '☁️',
    title: 'New: Cloud Progress Sync',
    desc: 'Your flashcard progress is now synced to the cloud via Supabase.'
  },
  {
    id: 'notif_guide_v1',
    date: '2026-03-28',
    icon: '📖',
    title: 'User Guide Available',
    desc: 'Check out the full guide to get started. Click here to view.',
    link: '/guide.html'
  }
];

export default function NotificationBell() {
  const [showNotif, setShowNotif] = useState(false);
  const [readNotifs, setReadNotifs] = useState([]);
  const notifRef = useRef(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('read_notifications');
      if (stored) {
        setReadNotifs(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Error loading read notifications:', e);
    }
  }, []);

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

  const markAsRead = (id) => {
    if (!readNotifs.includes(id)) {
      const updated = [...readNotifs, id];
      setReadNotifs(updated);
      localStorage.setItem('read_notifications', JSON.stringify(updated));
    }
  };

  const handleNotificationClick = (notif) => {
    markAsRead(notif.id);
    if (notif.link) {
      window.open(notif.link, '_blank');
      setShowNotif(false);
    }
  };

  const markAllAsRead = () => {
    const allIds = NOTIFICATIONS.map(n => n.id);
    setReadNotifs(allIds);
    localStorage.setItem('read_notifications', JSON.stringify(allIds));
  };

  const unreadCount = NOTIFICATIONS.filter(n => !readNotifs.includes(n.id)).length;

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
            {unreadCount}
          </span>
        )}
      </button>

      {showNotif && (
        <div className="glass-panel animate-fade-in notification-dropdown">
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderBottom: '1px solid var(--glass-border)' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Notifications</h3>
            {unreadCount > 0 && (
              <button 
                onClick={markAllAsRead}
                style={{ background: 'transparent', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <Check size={14} /> Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {NOTIFICATIONS.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                No notifications
              </div>
            ) : (
              NOTIFICATIONS.map(notif => {
                const isRead = readNotifs.includes(notif.id);
                return (
                  <div 
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif)}
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
                    <div style={{ fontSize: '1.5rem', flexShrink: 0, filter: isRead ? 'grayscale(40%)' : 'none' }}>
                      {notif.icon}
                    </div>
                    <div>
                      <h4 style={{ margin: '0 0 0.2rem', fontSize: '0.95rem', color: isRead ? 'var(--text-main)' : 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        {notif.title}
                        {!isRead && <span style={{ width: '6px', height: '6px', background: 'var(--danger)', borderRadius: '50%', display: 'inline-block' }}></span>}
                      </h4>
                      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                        {notif.desc}
                      </p>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.4rem' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{notif.date}</span>
                        {notif.link && (
                           <span style={{ fontSize: '0.75rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '2px' }}>
                             Read more <ExternalLink size={12} />
                           </span>
                        )}
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

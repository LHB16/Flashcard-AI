import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Shield, ArrowLeft, Users, Plus, Trash2, Loader2, Key, AlertTriangle, Clock, Globe, Bell, Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ConfirmationModal from './ConfirmationModal';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

const TIMEZONE_OPTIONS = [
  { value: 'auto', label: 'Auto (Local)' },
  { value: 'Asia/Ho_Chi_Minh', label: 'UTC+7 (Việt Nam)' },
  { value: 'Asia/Tokyo', label: 'UTC+9 (Tokyo)' },
  { value: 'America/New_York', label: 'UTC-5 (New York)' },
  { value: 'America/Los_Angeles', label: 'UTC-8 (Los Angeles)' },
  { value: 'Europe/London', label: 'UTC+0 (London)' },
  { value: 'UTC', label: 'UTC' },
];

const NAV_ITEMS = [
  { id: 'users', label: 'User Management', icon: Users },
  { id: 'keys', label: 'Groq API Keys', icon: Key },
  { id: 'notifications', label: 'Notifications', icon: Bell },
];

const AdminDashboard = ({ onBack }) => {
  const { t } = useTranslation();
  const adminEmail = localStorage.getItem('g_email');

  // Define options with translations inside the component
  const timezoneOptions = [
    { value: 'auto', label: t('admin.autoTimezone') },
    { value: 'Asia/Ho_Chi_Minh', label: t('admin.vietnamTimezone') },
    { value: 'Asia/Tokyo', label: t('admin.tokyoTimezone') },
    { value: 'America/New_York', label: t('admin.newYorkTimezone') },
    { value: 'America/Los_Angeles', label: t('admin.losAngelesTimezone') },
    { value: 'Europe/London', label: t('admin.londonTimezone') },
    { value: 'UTC', label: 'UTC' },
  ];

  const navItems = [
    { id: 'users', label: t('admin.userManagement'), icon: Users },
    { id: 'keys', label: t('admin.groqApiKeys'), icon: Key },
    { id: 'notifications', label: t('admin.notifications'), icon: Bell },
  ];
  const [activeTab, setActiveTab] = useState('users');
  const [statusMsg, setStatusMsg] = useState({ text: '', type: '' });
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(true);
  const [timezone, setTimezone] = useState('auto');

  // User management state
  const [users, setUsers] = useState([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  // Key management state
  const [apiKeys, setApiKeys] = useState([]);
  const [newKey, setNewKey] = useState('');
  const [isSavingKeys, setIsSavingKeys] = useState(false);
  const [keysUpdatedAt, setKeysUpdatedAt] = useState(null);
  const [deletingIndex, setDeletingIndex] = useState(null);
  const newKeyInputRef = useRef(null);

  // Confirmation modal state (reuse global pattern)
  const [confirmConfig, setConfirmConfig] = useState({ isOpen: false });
  const closeConfirm = () => setConfirmConfig(prev => ({ ...prev, isOpen: false }));

  // Notifications state
  const [notifications, setNotifications] = useState([]);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  const [isEditingNotification, setIsEditingNotification] = useState(false);
  const [editingNotif, setEditingNotif] = useState(null); // null = add new, object = edit

  // Auto-dismiss status messages
  useEffect(() => {
    if (statusMsg.text && statusMsg.type !== 'loading') {
      const t = setTimeout(() => setStatusMsg({ text: '', type: '' }), 4000);
      return () => clearTimeout(t);
    }
  }, [statusMsg]);

  // Format date with timezone
  const formatDate = useCallback((dateStr) => {
    if (!dateStr) return '—';
    try {
      const opts = {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false,
      };
      if (timezone !== 'auto') {
        opts.timeZone = timezone;
      }
      return new Intl.DateTimeFormat('vi-VN', opts).format(new Date(dateStr));
    } catch {
      return dateStr;
    }
  }, [timezone]);

  // Fetch dashboard data on mount
  useEffect(() => {
    const fetchDashboard = async () => {
      setIsLoadingDashboard(true);
      try {
        const res = await fetch(`${BACKEND_URL}/admin/dashboard`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'x-user-email': adminEmail
          }
        });

        if (!res.ok) {
          if (res.status === 403) throw new Error('Access denied. You are not an admin.');
          throw new Error(`Server error: ${res.status}`);
        }

        const data = await res.json();
        setApiKeys(data.api_keys || []);
        setKeysUpdatedAt(data.keys_updated_at || null);
      } catch (err) {
        console.error('Dashboard fetch error:', err);
        setStatusMsg({ text: err.message || 'Failed to load dashboard data.', type: 'error' });
      } finally {
        setIsLoadingDashboard(false);
      }
    };

    fetchDashboard();
  }, []);

  // Fetch users list
  const fetchUsers = useCallback(async () => {
    setIsLoadingUsers(true);
    try {
      const res = await fetch(`${BACKEND_URL}/admin/users`, {
        headers: { 'x-user-email': adminEmail }
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      setUsers(data.users || []);
    } catch (err) {
      console.error('Fetch users error:', err);
      setStatusMsg({ text: 'Failed to load users list.', type: 'error' });
    } finally {
      setIsLoadingUsers(false);
    }
  }, [adminEmail]);

  // Load users when tab switches to 'users'
  useEffect(() => {
    if (activeTab === 'users' && users.length === 0) {
      fetchUsers();
    }
  }, [activeTab, fetchUsers, users.length]);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    setIsLoadingNotifications(true);
    try {
      const res = await fetch(`${BACKEND_URL}/admin/settings/notifications`, {
        headers: { 'x-user-email': adminEmail }
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      setNotifications(data.notifications || []);
    } catch (err) {
      console.error('Fetch notifications error:', err);
      setStatusMsg({ text: 'Failed to load notifications.', type: 'error' });
    } finally {
      setIsLoadingNotifications(false);
    }
  }, [adminEmail]);

  useEffect(() => {
    if (activeTab === 'notifications' && notifications.length === 0) {
      fetchNotifications();
    }
  }, [activeTab, fetchNotifications, notifications.length]);

  // ── Key Management ──

  const handleAddKey = async () => {
    const trimmed = newKey.trim();
    if (!trimmed) return;
    if (apiKeys.includes(trimmed)) {
      setStatusMsg({ text: 'This key already exists.', type: 'error' });
      return;
    }

    const updatedKeys = [...apiKeys, trimmed];
    setIsSavingKeys(true);
    setStatusMsg({ text: 'Adding key...', type: 'loading' });

    try {
      const res = await fetch(`${BACKEND_URL}/admin/settings/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-email': adminEmail },
        body: JSON.stringify({ keys: updatedKeys })
      });
      if (!res.ok) throw new Error(`Save failed: ${res.status}`);

      setApiKeys(updatedKeys);
      setKeysUpdatedAt(new Date().toISOString());
      setNewKey('');
      setStatusMsg({ text: 'Key added successfully!', type: 'success' });
      if (newKeyInputRef.current) newKeyInputRef.current.focus();
    } catch (err) {
      console.error('Add key error:', err);
      setStatusMsg({ text: err.message || 'Failed to add key.', type: 'error' });
    } finally {
      setIsSavingKeys(false);
    }
  };

  // Open delete confirmation modal using ConfirmationModal
  const openDeleteModal = (index) => {
    setConfirmConfig({
      isOpen: true,
      title: 'Delete API Key?',
      description: `This action will permanently delete API Key #${index + 1} from the server. This cannot be undone.`,
      confirmText: 'Delete',
      type: 'danger',
      icon: Trash2,
      onConfirm: () => confirmDeleteKey(index)
    });
  };

  // Confirm delete — server-side
  const confirmDeleteKey = async (index) => {
    closeConfirm();
    setDeletingIndex(index);
    setStatusMsg({ text: 'Deleting key...', type: 'loading' });

    try {
      const res = await fetch(`${BACKEND_URL}/admin/settings/keys/${index}`, {
        method: 'DELETE',
        headers: { 'x-user-email': adminEmail }
      });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);

      const data = await res.json();
      setApiKeys(data.api_keys || []);
      setKeysUpdatedAt(data.keys_updated_at || new Date().toISOString());
      setStatusMsg({ text: 'Key deleted successfully!', type: 'success' });
    } catch (err) {
      console.error('Delete key error:', err);
      setStatusMsg({ text: err.message || 'Failed to delete key.', type: 'error' });
    } finally {
      setDeletingIndex(null);
    }
  };

  const handleKeyInputKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddKey();
    }
  };

  // Mask API key for display: show first 8 + last 4 chars
  const maskKey = (key) => {
    if (key.length <= 12) return key;
    return `${key.slice(0, 8)}${'•'.repeat(key.length - 12)}${key.slice(-4)}`;
  };

  // ── Loading State ──
  if (isLoadingDashboard) {
    return (
      <div className="admin-dashboard animate-fade-in">
        <div className="admin-loading">
          <Loader2 size={40} className="animate-spin" color="var(--primary)" />
          <h3>Loading Admin Dashboard...</h3>
        </div>
      </div>
    );
  }

  // ── Render Tab Content ──
  const renderUsersTab = () => (
    <div className="admin-tab-content animate-fade-in">
      <div className="admin-content-header">
        <h3>{t('admin.userManagement')}</h3>
        <div className="admin-tz-selector">
          <Globe size={14} />
          <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {timezoneOptions.map(tz => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
        </div>
      </div>

      {isLoadingUsers ? (
        <div className="admin-loading" style={{ padding: '3rem 1rem' }}>
          <Loader2 size={28} className="animate-spin" color="var(--primary)" />
          <span>Loading users...</span>
        </div>
      ) : (
        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Google ID</th>
                <th>Email</th>
                <th>Created At</th>
                <th>Updated At</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="admin-table-empty">No users found.</td>
                </tr>
              ) : (
                users.map((u, idx) => (
                  <tr key={u.google_id}>
                    <td className="admin-table-index">{idx + 1}</td>
                    <td className="admin-table-id">
                      <code>{u.google_id}</code>
                    </td>
                    <td className="admin-table-email">{u.email}</td>
                    <td className="admin-table-date">{formatDate(u.created_at)}</td>
                    <td className="admin-table-date">{formatDate(u.updated_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const renderKeysTab = () => (
    <div className="admin-tab-content animate-fade-in">
      <div className="admin-content-header">
        <h3>{t('admin.groqApiKeys')}</h3>
        {keysUpdatedAt && (
          <div className="admin-keys-updated">
            <Clock size={13} />
            <span>Last updated: {formatDate(keysUpdatedAt)}</span>
          </div>
        )}
      </div>

      {/* Key List */}
      <div className="admin-key-list">
        {apiKeys.length === 0 ? (
          <p className="admin-key-empty">No API keys configured. Add one below.</p>
        ) : (
          apiKeys.map((key, idx) => (
            <div key={idx} className={`admin-key-item ${deletingIndex === idx ? 'admin-key-item--deleting' : ''}`}>
              <span className="admin-key-index">#{idx + 1}</span>
              <code className="admin-key-value">{maskKey(key)}</code>
              <button
                className="admin-key-remove"
                onClick={() => openDeleteModal(idx)}
                title="Delete this key"
                disabled={deletingIndex === idx}
              >
                {deletingIndex === idx ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              </button>
            </div>
          ))
        )}
      </div>

      {/* Add Key Input */}
      <div className="admin-key-add">
        <input
          ref={newKeyInputRef}
          type="text"
          className="admin-key-input"
          placeholder="Enter new Groq API key..."
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          onKeyDown={handleKeyInputKeyDown}
          disabled={isSavingKeys}
        />
        <button
          className="btn btn-glass"
          onClick={handleAddKey}
          disabled={!newKey.trim() || isSavingKeys}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1rem', borderRadius: '10px' }}
        >
          {isSavingKeys ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
          Add
        </button>
      </div>
    </div>
  );

  // ── Notification Management ──
  const handleSaveNotification = async (updatedNotifs) => {
    setIsLoadingNotifications(true);
    setStatusMsg({ text: 'Saving notifications...', type: 'loading' });
    try {
      const res = await fetch(`${BACKEND_URL}/admin/settings/notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-email': adminEmail },
        body: JSON.stringify({ notifications: updatedNotifs })
      });
      if (!res.ok) throw new Error(`Save failed: ${res.status}`);
      setNotifications(updatedNotifs);
      setStatusMsg({ text: t('aiscan.notificationsSaved'), type: 'success' });
    } catch (err) {
      console.error('Save notifications err:', err);
      setStatusMsg({ text: err.message || 'Failed to save notifications', type: 'error' });
    } finally {
      setIsLoadingNotifications(false);
      setIsEditingNotification(false);
      setEditingNotif(null);
    }
  };

  const submitEditNotif = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const newNotif = {
      id: editingNotif?.id || `notif_${Date.now()}`,
      title: formData.get('title'),
      desc: formData.get('desc'),
      date: editingNotif?.date || new Date().toISOString().split('T')[0],
      icon: formData.get('icon'),
      link: formData.get('link'),
    };
    
    let updated;
    if (editingNotif?.id) {
       updated = notifications.map(n => n.id === editingNotif.id ? newNotif : n);
    } else {
       updated = [newNotif, ...notifications];
    }
    handleSaveNotification(updated);
  };

  const openDeleteNotifModal = (id) => {
    setConfirmConfig({
      isOpen: true,
      title: 'Delete Notification?',
      description: 'This action will permanently delete this notification.',
      confirmText: 'Delete',
      type: 'danger',
      icon: Trash2,
      onConfirm: () => {
         const updated = notifications.filter(n => n.id !== id);
         handleSaveNotification(updated);
         closeConfirm();
      }
    });
  };

  const renderNotificationsTab = () => (
    <div className="admin-tab-content animate-fade-in">
      <div className="admin-content-header">
         <h3>{t('admin.notifications')}</h3>
         {!isEditingNotification && (
           <button className="btn btn-primary" onClick={() => { setEditingNotif(null); setIsEditingNotification(true); }} style={{ padding: '0.4rem 1rem', fontSize: '0.85rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
             <Plus size={16} /> Add Notification
           </button>
         )}
      </div>

      {isLoadingNotifications && !isEditingNotification ? (
        <div className="admin-loading" style={{ padding: '3rem 1rem' }}>
          <Loader2 size={28} className="animate-spin" color="var(--primary)" />
          <span>Loading notifications...</span>
        </div>
      ) : isEditingNotification ? (
        <form onSubmit={submitEditNotif} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.5rem', background: 'rgba(0,0,0,0.02)', borderRadius: '12px' }}>
           <div>
             <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', fontWeight: 'bold' }}>Title</label>
             <input type="text" name="title" defaultValue={editingNotif?.title || ''} required style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'transparent', color: 'var(--text-main)' }} />
           </div>
           <div>
             <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', fontWeight: 'bold' }}>Description</label>
             <textarea name="desc" defaultValue={editingNotif?.desc || ''} required style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'transparent', color: 'var(--text-main)', minHeight: '80px', resize: 'vertical' }} />
           </div>
           
           <div>
             <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', fontWeight: 'bold' }}>Icon (Emoji)</label>
             <input type="text" name="icon" defaultValue={editingNotif?.icon || ''} placeholder="Ex: 📖" style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'transparent', color: 'var(--text-main)' }} />
           </div>
           
           <div>
             <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', fontWeight: 'bold' }}>Link (Optional)</label>
             <input type="text" name="link" defaultValue={editingNotif?.link || ''} style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'transparent', color: 'var(--text-main)' }} />
           </div>
           
           <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
             <button type="button" className="btn btn-glass" onClick={() => setIsEditingNotification(false)} style={{ flex: 1, padding: '0.8rem', fontWeight: 'bold' }}>Cancel</button>
             <button type="submit" className="btn btn-primary" style={{ flex: 1, padding: '0.8rem', fontWeight: 'bold' }} disabled={isLoadingNotifications}>{isLoadingNotifications ? t('common.saving') : t('common.save')}</button>
           </div>
        </form>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
           {notifications.length === 0 ? (
             <p className="admin-key-empty">No notifications found.</p>
           ) : (
             notifications.map(n => (
               <div key={n.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                  <div>
                    <h4 style={{ margin: '0 0 0.3rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>{n.icon} {n.title}</h4>
                    <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{n.desc}</p>
                    <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: 'var(--primary)' }}>
                      <span>{n.date}</span>
                      {n.link && <span>🔗 Has Link</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                    <button onClick={() => { setEditingNotif(n); setIsEditingNotification(true); }} className="btn btn-glass btn-icon" style={{ padding: '0.5rem', width: 'auto', height: 'auto', borderRadius: '8px' }}><Pencil size={14} /></button>
                    <button onClick={() => openDeleteNotifModal(n.id)} className="btn btn-glass btn-icon" style={{ padding: '0.5rem', width: 'auto', height: 'auto', borderRadius: '8px', color: 'var(--danger)', borderColor: 'var(--danger)' }}><Trash2 size={14} /></button>
                  </div>
               </div>
             ))
           )}
        </div>
      )}
    </div>
  );

  return (
    <div className="admin-dashboard animate-fade-in">
      {/* Header */}
      <div className="admin-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <button onClick={onBack} className="btn-glass btn-icon" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: 'auto', padding: '0.5rem 1rem', borderRadius: '12px', border: 'none' }}>
            <ArrowLeft size={18} /> Exit Admin
          </button>
          <div className="admin-title-group">
            <Shield size={24} color="var(--primary)" />
            <h2 className="text-gradient" style={{ fontSize: '1.5rem', margin: 0 }}>Admin Dashboard</h2>
          </div>
        </div>
      </div>

      {/* Status Message */}
      {statusMsg.text && (
        <div className={`admin-status admin-status--${statusMsg.type}`}>
          {statusMsg.type === 'loading' && <Loader2 size={16} className="animate-spin" />}
          {statusMsg.type === 'error' && <AlertTriangle size={16} />}
          {statusMsg.text}
        </div>
      )}

      {/* Body: Sidebar + Content */}
      <div className="admin-body">
        {/* Sidebar */}
        <nav className="admin-sidebar glass-panel">
          {navItems.map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`admin-nav-item ${activeTab === item.id ? 'admin-nav-item--active' : ''}`}
                onClick={() => setActiveTab(item.id)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Content Area */}
        <div className="admin-content glass-panel">
          {activeTab === 'users' && renderUsersTab()}
          {activeTab === 'keys' && renderKeysTab()}
          {activeTab === 'notifications' && renderNotificationsTab()}
        </div>
      </div>

      {/* Global Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmConfig.isOpen}
        onClose={closeConfirm}
        onConfirm={confirmConfig.onConfirm}
        title={confirmConfig.title}
        description={confirmConfig.description}
        confirmText={confirmConfig.confirmText}
        type={confirmConfig.type}
        icon={confirmConfig.icon}
      />
    </div>
  );
};

export default AdminDashboard;

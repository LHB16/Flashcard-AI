import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Shield, ArrowLeft, Users, Plus, Trash2, Save, Loader2, Key, AlertTriangle, X, Clock, Globe } from 'lucide-react';

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
];

const AdminDashboard = ({ onBack }) => {
  const adminEmail = localStorage.getItem('g_email');
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
  const [deletingIndex, setDeletingIndex] = useState(null); // index being deleted on server
  const newKeyInputRef = useRef(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalKeyIndex, setModalKeyIndex] = useState(null);

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
  }, [activeTab]);

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

  // Open delete confirmation modal
  const openDeleteModal = (index) => {
    setModalKeyIndex(index);
    setModalOpen(true);
  };

  // Confirm delete — server-side
  const confirmDeleteKey = async () => {
    if (modalKeyIndex === null) return;
    setModalOpen(false);
    setDeletingIndex(modalKeyIndex);
    setStatusMsg({ text: 'Deleting key...', type: 'loading' });

    try {
      const res = await fetch(`${BACKEND_URL}/admin/settings/keys/${modalKeyIndex}`, {
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
      setModalKeyIndex(null);
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
        <h3>User Management</h3>
        <div className="admin-tz-selector">
          <Globe size={14} />
          <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {TIMEZONE_OPTIONS.map(tz => (
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
        <h3>Groq API Keys</h3>
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

  return (
    <div className="admin-dashboard animate-fade-in">
      {/* Header */}
      <div className="admin-header">
        <div className="admin-header-left">
          <button className="btn btn-glass btn-icon" style={{ padding: '0.4rem 0.8rem', borderRadius: '8px' }} onClick={onBack}>
            <ArrowLeft size={18} /> Back
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
          {NAV_ITEMS.map(item => {
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
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {modalOpen && (
        <div className="admin-modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="admin-modal animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <button className="admin-modal-close" onClick={() => setModalOpen(false)}>
              <X size={18} />
            </button>
            <div className="admin-modal-icon">
              <AlertTriangle size={32} color="var(--danger)" />
            </div>
            <h3 className="admin-modal-title">Delete API Key?</h3>
            <p className="admin-modal-desc">
              This action will <strong>permanently delete</strong> API Key <strong>#{modalKeyIndex + 1}</strong> from the server. This cannot be undone.
            </p>
            <div className="admin-modal-actions">
              <button className="btn btn-glass" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={confirmDeleteKey}>
                <Trash2 size={16} /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;

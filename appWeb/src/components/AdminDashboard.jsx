import React, { useState, useEffect, useRef } from 'react';
import { Shield, ArrowLeft, Users, Plus, Trash2, Save, Loader2, Key, AlertTriangle } from 'lucide-react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

const AdminDashboard = ({ onBack }) => {
  const adminEmail = localStorage.getItem('g_email');

  const [stats, setStats] = useState({ total_users: 0 });
  const [apiKeys, setApiKeys] = useState([]);
  const [newKey, setNewKey] = useState('');
  const [statusMsg, setStatusMsg] = useState({ text: '', type: '' }); // type: 'success' | 'error' | 'loading'

  const [isLoadingDashboard, setIsLoadingDashboard] = useState(true);
  const [isSavingKeys, setIsSavingKeys] = useState(false);

  const newKeyInputRef = useRef(null);

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
        setStats({
          total_users: data.total_users || 0
        });
        setApiKeys(data.api_keys || []);
      } catch (err) {
        console.error('Dashboard fetch error:', err);
        setStatusMsg({ text: err.message || 'Failed to load dashboard data.', type: 'error' });
      } finally {
        setIsLoadingDashboard(false);
      }
    };

    fetchDashboard();
  }, []);

  // Add a new API key locally
  const handleAddKey = () => {
    const trimmed = newKey.trim();
    if (!trimmed) return;
    if (apiKeys.includes(trimmed)) {
      setStatusMsg({ text: 'This key already exists.', type: 'error' });
      return;
    }
    setApiKeys(prev => [...prev, trimmed]);
    setNewKey('');
    setStatusMsg({ text: 'Key added locally. Remember to save!', type: 'success' });
    if (newKeyInputRef.current) newKeyInputRef.current.focus();
  };

  // Remove a key locally
  const handleRemoveKey = (index) => {
    if (!window.confirm('🚨 WARNING: Are you sure you want to delete this API Key? You must click the "Save API Keys" button below to apply this change to the system.')) return;
    setApiKeys(prev => prev.filter((_, i) => i !== index));
    setStatusMsg({ text: 'Key removed locally. Remember to save!', type: 'success' });
  };

  // Save keys to backend
  const handleSaveKeys = async () => {
    setIsSavingKeys(true);
    setStatusMsg({ text: 'Saving API keys...', type: 'loading' });

    try {
      const res = await fetch(`${BACKEND_URL}/admin/settings/keys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': adminEmail
        },
        body: JSON.stringify({ keys: apiKeys })
      });

      if (!res.ok) throw new Error(`Save failed: ${res.status}`);

      setStatusMsg({ text: 'API keys saved successfully!', type: 'success' });
    } catch (err) {
      console.error('Save keys error:', err);
      setStatusMsg({ text: err.message || 'Failed to save API keys.', type: 'error' });
    } finally {
      setIsSavingKeys(false);
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
        <span className="admin-email">{adminEmail}</span>
      </div>

      {/* Status Message */}
      {statusMsg.text && (
        <div className={`admin-status admin-status--${statusMsg.type}`}>
          {statusMsg.type === 'loading' && <Loader2 size={16} className="animate-spin" />}
          {statusMsg.type === 'error' && <AlertTriangle size={16} />}
          {statusMsg.text}
        </div>
      )}

      {/* Overview Cards */}
      <div className="admin-overview">
        <div className="admin-stat-card glass-panel">
          <div className="admin-stat-icon" style={{ background: 'rgba(139, 92, 246, 0.15)' }}>
            <Users size={28} color="var(--primary)" />
          </div>
          <div className="admin-stat-info">
            <span className="admin-stat-value">{stats.total_users}</span>
            <span className="admin-stat-label">Total Users</span>
          </div>
        </div>
      </div>

      {/* API Key Management */}
      <div className="admin-section glass-panel">
        <div className="admin-section-header">
          <Key size={20} color="var(--warning)" />
          <h3>Groq API Keys</h3>
        </div>

        {/* Key List */}
        <div className="admin-key-list">
          {apiKeys.length === 0 ? (
            <p className="admin-key-empty">No API keys configured. Add one below.</p>
          ) : (
            apiKeys.map((key, idx) => (
              <div key={idx} className="admin-key-item">
                <span className="admin-key-index">#{idx + 1}</span>
                <code className="admin-key-value">{maskKey(key)}</code>
                <button
                  className="admin-key-remove"
                  onClick={() => handleRemoveKey(idx)}
                  title="Remove this key"
                >
                  <Trash2 size={16} />
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
          />
          <button
            className="btn btn-glass"
            onClick={handleAddKey}
            disabled={!newKey.trim()}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1rem', borderRadius: '10px' }}
          >
            <Plus size={18} /> Add
          </button>
        </div>

        {/* Save Button */}
        <button
          className="btn btn-primary admin-save-btn"
          onClick={handleSaveKeys}
          disabled={isSavingKeys}
        >
          {isSavingKeys ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          Save API Keys
        </button>
      </div>
    </div>
  );
};

export default AdminDashboard;

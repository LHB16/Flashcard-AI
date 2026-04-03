import React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Trash2, LogOut, Save, X, Loader2 } from 'lucide-react';

const ConfirmationModal = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  description, 
  confirmText = "Confirm", 
  cancelText = "Cancel", 
  icon: Icon = AlertTriangle, 
  type = 'warning',
  isLoading = false 
}) => {
  if (!isOpen) return null;

  const getColors = () => {
    switch (type) {
      case 'danger':
        return { 
          bg: 'rgba(239, 68, 68, 0.1)', 
          border: 'rgba(239, 68, 68, 0.2)', 
          icon: '#ef4444', 
          btnBg: '#ef4444',
          panelBorder: 'rgba(239, 68, 68, 0.3)'
        };
      case 'info':
        return { 
          bg: 'rgba(59, 130, 246, 0.1)', 
          border: 'rgba(59, 130, 246, 0.2)', 
          icon: '#3b82f6', 
          btnBg: '#3b82f6',
          panelBorder: 'rgba(59, 130, 246, 0.3)'
        };
      case 'warning':
      default:
        return { 
          bg: 'rgba(251, 191, 36, 0.1)', 
          border: 'rgba(251, 191, 36, 0.2)', 
          icon: '#fbbf24', 
          btnBg: '#fbbf24',
          panelBorder: 'rgba(251, 191, 36, 0.3)'
        };
    }
  };

  const colors = getColors();

  return createPortal(
    <div className="animate-fade-in" style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1.5rem', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)'
    }}>
      <div className="glass-panel scale-in" style={{
        width: '100%', maxWidth: '420px', background: 'var(--card-bg)', 
        borderRadius: '24px', overflow: 'hidden', padding: '2rem',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column',
        border: `1px solid ${colors.panelBorder}`
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
          <div style={{ 
            width: '64px', height: '64px', borderRadius: '50%', 
            background: colors.bg, display: 'flex', alignItems: 'center', 
            justifyContent: 'center', border: `1px solid ${colors.border}` 
          }}>
            <Icon size={32} color={colors.icon} />
          </div>
        </div>
        
        <h2 style={{ fontSize: '1.25rem', textAlign: 'center', margin: '0 0 1rem', color: 'var(--text-main)' }}>{title}</h2>
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.5', margin: '0 0 2rem' }}>
          {description}
        </p>
        
        <div style={{ display: 'flex', gap: '0.8rem' }}>
          <button 
            onClick={onClose}
            disabled={isLoading}
            className="btn btn-glass"
            style={{ flex: 1, padding: '0.8rem', borderRadius: '14px', fontWeight: 'bold' }}
          >
            {cancelText}
          </button>
          <button 
            onClick={onConfirm}
            disabled={isLoading}
            className="btn"
            style={{ 
              flex: 1, padding: '0.8rem', borderRadius: '14px', fontWeight: 'bold', 
              background: colors.btnBg, color: '#fff', border: 'none', 
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              opacity: isLoading ? 0.7 : 1, cursor: isLoading ? 'not-allowed' : 'pointer'
            }}
          >
            {isLoading ? <Loader2 size={18} className="animate-spin" /> : null}
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ConfirmationModal;

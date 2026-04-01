import React from 'react';
import { X, Check, AlertCircle, Loader2 } from 'lucide-react';

/**
 * ApiKeyChip — Displays a single API key as a compact chip
 * Shows masked key, status icon, and delete button
 */
export default function ApiKeyChip({ apiKey, index, status, onRemove }) {
  const masked = apiKey.length >= 12
    ? `${apiKey.slice(0, 4)}••••${apiKey.slice(-4)}`
    : '••••••••';

  const statusIcon = {
    valid: <Check size={14} color="var(--success)" />,
    invalid: <AlertCircle size={14} color="var(--danger)" />,
    testing: <Loader2 size={14} className="animate-spin" color="var(--warning)" />,
    idle: null,
  }[status || 'idle'];

  return (
    <div className="key-chip">
      <span className="key-chip-index">#{index + 1}</span>
      <code className="key-chip-mask">{masked}</code>
      {statusIcon && <span className="key-chip-status">{statusIcon}</span>}
      <button
        className="key-chip-remove"
        onClick={() => onRemove(index)}
        title="Remove key"
      >
        <X size={14} />
      </button>
    </div>
  );
}

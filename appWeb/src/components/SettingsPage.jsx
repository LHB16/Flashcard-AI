import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Settings, Mail, Key, Layers, AlertTriangle, Info, Pencil, Trash2, Plus, RotateCcw, Share2, Loader2, Check, X, Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { loadConfigFromDrive, saveConfigToDrive } from '../services/configService';
import { getValidToken } from '../services/driveSync';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

const SECTIONS = [
  { id: 'general', label: 'settings.general', icon: Languages },
  { id: 'email', label: 'settings.emailNotifications', icon: Mail },
  { id: 'apikeys', label: 'settings.geminiApiKeys', icon: Key },
  { id: 'decks', label: 'settings.myDecks', icon: Layers },
  { id: 'danger', label: 'settings.dangerZone', icon: AlertTriangle, isDanger: true },
];

// ───── Toggle Switch Component ─────
const Toggle = ({ checked, onChange, disabled }) => (
  <label className="toggle-switch">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      disabled={disabled}
    />
    <span className={`toggle-track${disabled ? ' disabled' : ''}`} />
  </label>
);

// ───── Mask API Key ─────
const maskKey = (key) => {
  if (!key || key.length < 8) return key || '';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
};

// ───── Format Date ─────
const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB'); // dd/MM/yyyy
  } catch { return '—'; }
};

function SettingsPage({
  userEmail,
  googleId,
  data,
  driveFileId,
  backendUrl,
  onBack,
  onDataChange,
  onOpenConfirm,
  onShareDeck,
}) {
  const { t, i18n } = useTranslation();
  const [activeSection, setActiveSection] = useState('general');

  // ═══════ Email Section State ═══════
  const [receiveEmailEnabled, setReceiveEmailEnabled] = useState(false);
  const [sendEmailEnabled, setSendEmailEnabled] = useState(true);
  const [emailLoading, setEmailLoading] = useState(true);
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailSaved, setEmailSaved] = useState(false);
  const debounceRef = useRef(null);

  // ═══════ API Keys Section State ═══════
  const [apiKeys, setApiKeys] = useState([]);
  const [configFileId, setConfigFileId] = useState(null);
  const [keysLoading, setKeysLoading] = useState(true);
  const [isAddingKey, setIsAddingKey] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState('');
  const [editingKeyIndex, setEditingKeyIndex] = useState(null);

  // ═══════ Decks Section State ═══════
  const [deckSearch, setDeckSearch] = useState('');
  const [renamingDeckId, setRenamingDeckId] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  // ═══════ Danger Zone State ═══════
  const [showNuclearConfirm, setShowNuclearConfirm] = useState(false);
  const [nuclearConfirmText, setNuclearConfirmText] = useState('');
  const [isNuclearDeleting, setIsNuclearDeleting] = useState(false);

  // ═══════ Toast State ═══════
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);

  const showToast = useCallback((message) => {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2500);
  }, []);

  // ════════════════════════════════════
  // EMAIL SECTION LOGIC
  // ════════════════════════════════════
  useEffect(() => {
    if (activeSection !== 'email') return;
    setEmailLoading(true);
    fetch(`${backendUrl}/settings/email?google_id=${googleId}`)
      .then(r => r.json())
      .then(d => {
        setReceiveEmailEnabled(d.receive_email_enabled !== false);
        setSendEmailEnabled(d.send_email_enabled !== false);
      })
      .catch(err => console.error('Failed to load email settings:', err))
      .finally(() => setEmailLoading(false));
  }, [activeSection, googleId, backendUrl]);

  const handleToggle = useCallback((field, value) => {
    if (field === 'receive_email_enabled') setReceiveEmailEnabled(value);
    else setSendEmailEnabled(value);

    setEmailSaving(true);
    setEmailSaved(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      const payload = {
        google_id: googleId,
        receive_email_enabled: field === 'receive_email_enabled' ? value : receiveEmailEnabled,
        send_email_enabled: field === 'send_email_enabled' ? value : sendEmailEnabled,
      };
      fetch(`${backendUrl}/settings/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(r => r.json())
        .then(() => {
          setEmailSaved(true);
          setTimeout(() => setEmailSaved(false), 2000);
        })
        .catch(err => console.error('Save email settings failed:', err))
        .finally(() => setEmailSaving(false));
    }, 500);
  }, [googleId, backendUrl, receiveEmailEnabled, sendEmailEnabled]);

  // ════════════════════════════════════
  // API KEYS SECTION LOGIC
  // ════════════════════════════════════
  useEffect(() => {
    if (activeSection !== 'apikeys') return;
    setKeysLoading(true);
    loadConfigFromDrive()
      .then(({ fileId, config }) => {
        setConfigFileId(fileId);
        setApiKeys(config.api_keys || []);
      })
      .catch(err => console.error('Failed to load config:', err))
      .finally(() => setKeysLoading(false));
  }, [activeSection]);

  const saveKeys = useCallback(async (newKeys) => {
    setApiKeys(newKeys);
    try {
      const { config } = await loadConfigFromDrive();
      const updatedConfig = { ...config, api_keys: newKeys };
      const newFileId = await saveConfigToDrive(updatedConfig, configFileId);
      setConfigFileId(newFileId);
    } catch (err) {
      console.error('Failed to save keys:', err);
    }
  }, [configFileId]);

  const handleSaveKey = useCallback(() => {
    if (!newKeyValue.trim()) return;
    let updatedKeys;
    if (editingKeyIndex !== null) {
      updatedKeys = [...apiKeys];
      updatedKeys[editingKeyIndex] = newKeyValue.trim();
    } else {
      updatedKeys = [...apiKeys, newKeyValue.trim()];
    }
    saveKeys(updatedKeys);
    setIsAddingKey(false);
    setNewKeyValue('');
    setEditingKeyIndex(null);
    showToast(editingKeyIndex !== null ? t('settings.apiKeysSection.keyUpdated') : t('settings.apiKeysSection.keyAdded'));
  }, [newKeyValue, editingKeyIndex, apiKeys, saveKeys, showToast]);

  const handleEditKey = useCallback((index) => {
    setEditingKeyIndex(index);
    setNewKeyValue(apiKeys[index]);
    setIsAddingKey(true);
  }, [apiKeys]);

  const confirmDeleteKey = useCallback((index) => {
    const config = {
      title: t('settings.apiKeysSection.deleteKeyTitle'),
      description: t('settings.apiKeysSection.deleteKeyDesc', { key: maskKey(apiKeys[index]) }),
      confirmText: t('common.delete'),
      type: 'danger',
      icon: Trash2,
    };
    config.onConfirm = () => {
      const updatedKeys = apiKeys.filter((_, i) => i !== index);
      saveKeys(updatedKeys);
      showToast(t('settings.apiKeysSection.keyDeleted'));
      onOpenConfirm({ ...config, isOpen: false });
    };
    onOpenConfirm(config);
  }, [apiKeys, onOpenConfirm, saveKeys, showToast]);

  // ════════════════════════════════════
  // DECKS SECTION LOGIC
  // ════════════════════════════════════
  const filteredDecks = (data || []).filter(d =>
    (d.name || '').toLowerCase().includes(deckSearch.toLowerCase())
  );

  const startRename = useCallback((deck) => {
    setRenamingDeckId(deck.deck_id);
    setRenameValue(deck.name || '');
  }, []);

  const handleRenameConfirm = useCallback((deck) => {
    if (!renameValue.trim() || renameValue === deck.name) {
      setRenamingDeckId(null);
      return;
    }
    const newData = data.map(d =>
      d.deck_id === deck.deck_id
        ? { ...d, name: renameValue.trim(), updated_at: new Date().toISOString() }
        : d
    );
    onDataChange(newData);
    setRenamingDeckId(null);
    showToast(t('settings.decksSection.renamedTo', { name: renameValue.trim() }));
  }, [renameValue, data, onDataChange, showToast]);

  const confirmResetProgress = useCallback((deck) => {
    const config = {
      title: t('settings.decksSection.resetTitle', { name: deck.name }),
      description: t('settings.decksSection.resetDesc'),
      confirmText: t('settings.decksSection.resetBtn'),
      type: 'warning',
      icon: RotateCcw,
    };
    config.onConfirm = async () => {
      const resetCards = deck.cards.map(c => ({ ...c, status: 0 }));
      const newData = data.map(d =>
        d.deck_id === deck.deck_id ? { ...d, cards: resetCards } : d
      );
      onDataChange(newData);
      try {
        await fetch(`${backendUrl}/progress/deck/on-modified`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ google_id: googleId, deck_id: deck.deck_id, action: 'reset' }),
        });
      } catch (e) { console.error(e); }
      showToast(t('settings.decksSection.progressReset'));
      onOpenConfirm({ ...config, isOpen: false });
    };
    onOpenConfirm(config);
  }, [data, onDataChange, onOpenConfirm, backendUrl, googleId, showToast]);

  const confirmDeleteDeck = useCallback((deck) => {
    const config = {
      title: t('settings.decksSection.deleteTitle', { name: deck.name }),
      description: t('settings.decksSection.deleteDesc', { count: deck.cards.length }),
      confirmText: t('common.delete'),
      type: 'danger',
      icon: Trash2,
    };
    config.onConfirm = () => {
      const newData = data.filter(d => d.deck_id !== deck.deck_id);
      onDataChange(newData);
      showToast(t('settings.decksSection.deckDeleted'));
      onOpenConfirm({ ...config, isOpen: false });
    };
    onOpenConfirm(config);
  }, [data, onDataChange, onOpenConfirm, showToast]);

  const handleShareDeck = useCallback((deck) => {
    if (onShareDeck) {
      onShareDeck(deck);
    } else {
      navigator.clipboard.writeText(deck.deck_id);
      showToast(t('settings.decksSection.copiedDeckId', { name: deck.name }));
    }
  }, [onShareDeck, showToast]);

  // ════════════════════════════════════
  // DANGER ZONE — NUCLEAR DELETE
  // ════════════════════════════════════
  const handleNuclearDelete = useCallback(async () => {
    if (nuclearConfirmText !== 'I know this cannot be undone') return;
    setIsNuclearDeleting(true);

    try {
      // 1. Delete decks.json from Drive (if exists)
      if (driveFileId) {
        const token = await getValidToken();
        await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      }

      // 2. Delete config.json from Drive
      try {
        const configResult = await loadConfigFromDrive();
        if (configResult?.fileId) {
          const token = await getValidToken();
          await fetch(`https://www.googleapis.com/drive/v3/files/${configResult.fileId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          });
        }
      } catch (e) { console.warn('Config delete skipped:', e); }

      // 3. Delete all progress from Supabase
      await fetch(`${backendUrl}/settings/delete-all-data`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ google_id: googleId }),
      });

      // 4. Reset local state
      onDataChange([]);
      onBack();
    } catch (err) {
      console.error('Nuclear delete failed:', err);
    } finally {
      setIsNuclearDeleting(false);
      setShowNuclearConfirm(false);
    }
  }, [nuclearConfirmText, driveFileId, backendUrl, googleId, onDataChange, onBack]);

  // ════════════════════════════════════
  // RENDER SECTION CONTENT
  // ════════════════════════════════════
  const renderContent = () => {
    switch (activeSection) {
      case 'general': return renderGeneralSection();
      case 'email': return renderEmailSection();
      case 'apikeys': return renderApiKeysSection();
      case 'decks': return renderDecksSection();
      case 'danger': return renderDangerSection();
      default: return null;
    }
  };

  // ───── Language Dropdown Component ─────
  const LanguageDropdown = () => {
    const [isOpen, setIsOpen] = useState(false);
    const buttonRef = useRef(null);

    const languages = [
      { code: 'en', name: 'English' },
      { code: 'vi', name: 'Tiếng Việt' }
    ];

    const handleButtonClick = () => {
      setIsOpen(!isOpen);
    };

    // Close dropdown when resizing from mobile to desktop or vice versa
    useEffect(() => {
      const handleResize = () => setIsOpen(false);
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }, []);

    return (
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <button
          ref={buttonRef}
          className="btn btn-glass"
          onClick={handleButtonClick}
          style={{
            padding: '0.6rem 1rem',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.9rem',
            border: '1px solid var(--glass-border)',
            background: 'var(--glass-bg)',
            color: 'var(--text-main)'
          }}
        >
          <Languages size={16} />
          {languages.find(lang => lang.code === i18n.language)?.name || 'Language'}
          <svg
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{
              transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease',
              marginLeft: '0.5rem'
            }}
          >
            <polyline points="4,6 8,10 12,6" />
          </svg>
        </button>

        {isOpen && (
          <>
            <div
              onClick={() => setIsOpen(false)}
              style={{ position: 'fixed', inset: 0, zIndex: 999 }}
            />
            <div
              className="glass-panel scale-in"
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                left: window.innerWidth < 768 ? '0' : 'auto',
                right: window.innerWidth >= 768 ? 0 : 'auto',
                width: '200px',
                zIndex: 1000,
                padding: '0.5rem',
                boxShadow: '0 15px 35px rgba(0,0,0,0.4)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.4rem',
                background: 'var(--card-bg)',
                border: '1px solid var(--glass-border)',
                borderRadius: '12px',
                maxHeight: window.innerWidth < 768 ? '40vh' : 'none',
                overflowY: window.innerWidth < 768 ? 'auto' : 'visible'
              }}
            >
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  className={`btn ${i18n.language === lang.code ? 'btn-primary' : 'btn-glass'}`}
                  style={{
                    justifyContent: 'flex-start',
                    padding: '0.8rem 1rem',
                    border: 'none',
                    width: '100%',
                    fontSize: '0.9rem',
                    gap: '0.8rem',
                    textAlign: 'left'
                  }}
                  onClick={() => {
                    i18n.changeLanguage(lang.code);
                    setIsOpen(false);
                  }}
                >
                  {lang.name}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  };

  // ───── General Section ─────
  const renderGeneralSection = () => (
    <section className="settings-section animate-fade-in">
      <h2>{t('settings.general')}</h2>
      <p className="section-desc">{t('settings.selectLanguage')}</p>

      <div className="setting-row">
        <div className="setting-info">
          <label>{t('settings.language')}</label>
          <p>{t('settings.selectLanguage')}</p>
        </div>
        <LanguageDropdown />
      </div>
    </section>
  );

  // ───── Email Section ─────
  const renderEmailSection = () => (
    <section className="settings-section animate-fade-in">
      <h2>{t('settings.emailSection.title')}</h2>
      <p className="section-desc">
        {t('settings.emailSection.desc')}
      </p>

      {emailLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem' }}>
          <div className="skeleton" style={{ height: '80px', borderRadius: '12px' }} />
          <div className="skeleton" style={{ height: '80px', borderRadius: '12px' }} />
        </div>
      ) : (
        <>
          <div className="setting-row">
            <div className="setting-info">
              <label>{t('settings.emailSection.receiveLabel')}</label>
              <p>{t('settings.emailSection.receiveDesc')}</p>
            </div>
            <Toggle
              checked={receiveEmailEnabled}
              onChange={(val) => handleToggle('receive_email_enabled', val)}
              disabled={emailSaving}
            />
          </div>

          <div className="setting-row">
            <div className="setting-info">
              <label>{t('settings.emailSection.sendLabel')}</label>
              <p>
                {t('settings.emailSection.sendDesc')}
                <br />
                <strong>Note:</strong> {t('settings.emailSection.sendNote')}
              </p>
            </div>
            <Toggle
              checked={sendEmailEnabled}
              onChange={(val) => handleToggle('send_email_enabled', val)}
              disabled={emailSaving}
            />
          </div>

          <div className="settings-status-row">
            {emailSaving && <span className="save-indicator"><Loader2 size={14} className="spin" /> {t('settings.saveStatus.saving')}</span>}
            {emailSaved && <span className="save-indicator saved"><Check size={14} /> {t('settings.saveStatus.saved')}</span>}
          </div>

          <div className="info-box">
            <Info size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span dangerouslySetInnerHTML={{ __html: t('settings.emailSection.infoBox') }} />
          </div>
        </>
      )}
    </section>
  );

  // ───── API Keys Section ─────
  const renderApiKeysSection = () => (
    <section className="settings-section animate-fade-in">
      <h2>{t('settings.apiKeysSection.title')}</h2>
      <p className="section-desc">{t('settings.apiKeysSection.desc')}</p>

      {keysLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1.5rem' }}>
          {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: '48px', borderRadius: '8px' }} />)}
        </div>
      ) : (
        <>
          {apiKeys.length === 0 && !isAddingKey && (
            <p style={{ color: 'var(--text-muted)', marginTop: '1rem', fontStyle: 'italic' }}>{t('settings.apiKeysSection.noKeys')}</p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
            {apiKeys.map((key, index) => (
              <div className="key-row" key={index}>
                <span className="key-chip-mask" style={{ fontFamily: 'monospace', fontSize: '13px' }}>
                  {maskKey(key)}
                </span>
                <div className="key-actions">
                  <button className="settings-icon-btn" onClick={() => handleEditKey(index)} title={t('common.edit')}>
                    <Pencil size={14} />
                  </button>
                  <button className="settings-icon-btn danger" onClick={() => confirmDeleteKey(index)} title={t('common.delete')}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {isAddingKey && (
            <div className="key-form">
              <input
                type="text"
                className="settings-input"
                placeholder={t('settings.apiKeysSection.placeholder')}
                value={newKeyValue}
                onChange={(e) => setNewKeyValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveKey()}
                autoFocus
              />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-primary" onClick={handleSaveKey} disabled={!newKeyValue.trim()} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', borderRadius: '8px' }}>
                  {editingKeyIndex !== null ? t('settings.apiKeysSection.update') : t('settings.apiKeysSection.add')}
                </button>
                <button className="btn btn-glass" onClick={() => { setIsAddingKey(false); setEditingKeyIndex(null); setNewKeyValue(''); }} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', borderRadius: '8px' }}>
                  {t('settings.apiKeysSection.cancel')}
                </button>
              </div>
            </div>
          )}

          {!isAddingKey && (
            <button
              className="settings-add-btn"
              onClick={() => { setIsAddingKey(true); setEditingKeyIndex(null); setNewKeyValue(''); }}
            >
              <Plus size={16} /> {t('settings.apiKeysSection.addKey')}
            </button>
          )}
        </>
      )}
    </section>
  );

  // ───── Decks Section ─────
  const renderDecksSection = () => (
    <section className="settings-section animate-fade-in">
      <h2>{t('settings.decksSection.title')}</h2>
      <p className="section-desc">{t('settings.decksSection.deckCount', { count: (data || []).length })}</p>

      <div style={{ marginTop: '1rem', marginBottom: '1rem' }}>
        <input
          type="text"
          className="settings-input"
          placeholder={t('settings.decksSection.searchPlaceholder')}
          value={deckSearch}
          onChange={(e) => setDeckSearch(e.target.value)}
        />
      </div>

      <div className="decks-table-wrapper">
        <table className="decks-table">
          <thead>
            <tr>
              <th>{t('settings.decksSection.thName')}</th>
              <th>{t('settings.decksSection.thCards')}</th>
              <th>{t('settings.decksSection.thProgress')}</th>
              <th>{t('settings.decksSection.thCreated')}</th>
              <th>{t('settings.decksSection.thActions')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredDecks.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  {deckSearch ? t('settings.decksSection.noMatch') : t('settings.decksSection.noDecks')}
                </td>
              </tr>
            ) : filteredDecks.map(deck => {
              const progress = deck.cards?.length > 0
                ? Math.round(deck.cards.filter(c => c.status === 2).length / deck.cards.length * 100)
                : 0;
              const known = deck.cards?.filter(c => c.status === 2).length || 0;
              const total = deck.cards?.length || 0;

              return (
                <tr key={deck.deck_id}>
                  <td>
                    {renamingDeckId === deck.deck_id ? (
                      <input
                        className="settings-input inline"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => handleRenameConfirm(deck)}
                        onKeyDown={(e) => e.key === 'Enter' && handleRenameConfirm(deck)}
                        autoFocus
                      />
                    ) : (
                      <span className="deck-name-cell">{deck.name}</span>
                    )}
                  </td>
                  <td>{total}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div className="progress-bar-mini">
                        <div style={{ width: `${progress}%` }} />
                      </div>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{progress}% ({known}/{total})</span>
                    </div>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDate(deck.created_at)}</td>
                  <td>
                    <div className="deck-actions">
                      <button className="settings-icon-btn" onClick={() => startRename(deck)} title={t('common.rename')}>
                        <Pencil size={14} />
                      </button>
                      <button className="settings-icon-btn" onClick={() => confirmResetProgress(deck)} title={t('common.reset')}>
                        <RotateCcw size={14} />
                      </button>
                      <button className="settings-icon-btn" onClick={() => handleShareDeck(deck)} title={t('common.share')}>
                        <Share2 size={14} />
                      </button>
                      <button className="settings-icon-btn danger" onClick={() => confirmDeleteDeck(deck)} title={t('common.delete')}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );

  // ───── Danger Section ─────
  const renderDangerSection = () => (
    <section className="settings-section danger-zone animate-fade-in">
      <div className="danger-zone-header">
        <AlertTriangle size={20} color="var(--danger)" />
        <h2 style={{ color: 'var(--danger)' }}>{t('settings.dangerSection.title')}</h2>
      </div>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }} dangerouslySetInnerHTML={{ __html: t('settings.dangerSection.desc') }} />

      <div className="danger-action-row">
        <div style={{ flex: 1 }}>
          <strong style={{ display: 'block', marginBottom: '4px' }}>{t('settings.dangerSection.deleteAllTitle')}</strong>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.5 }}>
            {t('settings.dangerSection.deleteAllDesc')}
          </p>
        </div>
        <button
          className="danger-btn-large"
          onClick={() => { setShowNuclearConfirm(true); setNuclearConfirmText(''); }}
        >
          <Trash2 size={16} /> {t('settings.dangerSection.deleteAllBtn')}
        </button>
      </div>
    </section>
  );

  // ────── NUCLEAR CONFIRM MODAL ──────
  const renderNuclearModal = () => {
    if (!showNuclearConfirm) return null;
    return createPortal(
      <div className="animate-fade-in" style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1.5rem', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)'
      }} onClick={() => setShowNuclearConfirm(false)}>
        <div className="glass-panel scale-in danger-modal" style={{
          width: '100%', maxWidth: '480px', background: 'var(--card-bg)',
          borderRadius: '24px', padding: '2rem',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
          border: '1px solid rgba(239, 68, 68, 0.3)'
        }} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
            <div style={{
              width: '64px', height: '64px', borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.1)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              border: '1px solid rgba(239, 68, 68, 0.2)'
            }}>
              <Trash2 size={28} color="#ef4444" />
            </div>
          </div>
          <h2 style={{ textAlign: 'center', fontSize: '1.25rem', marginBottom: '0.75rem', color: 'var(--text-main)' }}>{t('settings.nuclearModal.title')}</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.5, textAlign: 'center' }}>
            {t('settings.nuclearModal.desc')}
          </p>
          <ul className="nuclear-list">
            <li>{t('settings.nuclearModal.item1')}</li>
            <li>{t('settings.nuclearModal.item2')}</li>
            <li>{t('settings.nuclearModal.item3')}</li>
          </ul>
          <p style={{ textAlign: 'center', color: 'var(--text-main)', fontWeight: 600, marginBottom: '1rem' }}>{t('settings.nuclearModal.cannotUndo')}</p>

          <label style={{ color: 'var(--text-muted)', fontSize: '13px', display: 'block', marginBottom: '4px' }}>
            {t('settings.nuclearModal.typeLabel')}
          </label>
          <code className="nuclear-code">I know this cannot be undone</code>
          <input
            type="text"
            className="nuclear-input"
            value={nuclearConfirmText}
            onChange={(e) => setNuclearConfirmText(e.target.value)}
            placeholder="I know this cannot be undone"
          />

          <div style={{ display: 'flex', gap: '0.8rem', marginTop: '1.5rem' }}>
            <button
              className="btn btn-glass"
              onClick={() => setShowNuclearConfirm(false)}
              style={{ flex: 1, padding: '0.8rem', borderRadius: '14px', fontWeight: 'bold' }}
            >
              {t('settings.nuclearModal.cancel')}
            </button>
            <button
              className="btn"
              disabled={nuclearConfirmText !== 'I know this cannot be undone' || isNuclearDeleting}
              onClick={handleNuclearDelete}
              style={{
                flex: 1, padding: '0.8rem', borderRadius: '14px', fontWeight: 'bold',
                background: '#ef4444', color: '#fff', border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                opacity: (nuclearConfirmText !== 'I know this cannot be undone' || isNuclearDeleting) ? 0.5 : 1,
                cursor: (nuclearConfirmText !== 'I know this cannot be undone' || isNuclearDeleting) ? 'not-allowed' : 'pointer'
              }}
            >
              {isNuclearDeleting ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}
              {t('settings.nuclearModal.deleteEverything')}
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  // ═══════════════════════════════════
  // MAIN RENDER
  // ═══════════════════════════════════
  return (
    <div className="settings-page">
      {/* Header */}
      <div className="settings-header">
        <button className="btn btn-glass btn-icon" onClick={onBack} title={t('common.back')} style={{ borderRadius: '12px', padding: '0.6rem' }}>
          <ArrowLeft size={20} />
        </button>
        <Settings size={22} color="var(--primary)" />
        <h1 className="text-gradient" style={{ fontSize: '1.4rem', margin: 0 }}>{t('settings.title')}</h1>
      </div>

      {/* Body: Sidebar + Content */}
      <div className="settings-body">
        <nav className="settings-sidebar">
          {SECTIONS.map((sec) => (
            <button
              key={sec.id}
              className={`sidebar-item${activeSection === sec.id ? ' active' : ''}${sec.isDanger ? ' danger' : ''}`}
              onClick={() => setActiveSection(sec.id)}
            >
              <sec.icon size={18} />
              <span>{t(sec.label)}</span>
            </button>
          ))}
        </nav>

        <div className="settings-content">
          {renderContent()}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="settings-toast animate-fade-in">
          <Check size={14} />
          {toast}
        </div>
      )}

      {/* Nuclear Modal */}
      {renderNuclearModal()}
    </div>
  );
}

export default SettingsPage;

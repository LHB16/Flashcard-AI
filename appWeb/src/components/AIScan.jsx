import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FolderOpen, Play, Square, Save, KeyRound, Plus, Sparkles, AlertTriangle, CheckCircle2, Loader2, Upload, Info, Settings, Terminal, HelpCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { v4 as uuidv4 } from 'uuid';
import ApiKeyChip from './ApiKeyChip';
import { fetchScanConfig, addScanApiKey, removeScanApiKey, updateScanConfig, validateScanKeys, processBatches } from '../services/geminiService';
import { filterImageFiles, chunk } from '../services/pdfService';
import { imagesToPdf } from '../services/pdfService';
import Skeleton from './Skeleton';


/**
 * AIScan — Main component for AI-powered image scanning
 *
 * Flow: Select folder → Filter images → Create PDF batches → Send to Gemini → Parse cards → Save deck
 *
 * === SECURITY ===
 * API keys are managed entirely by the backend. Frontend only sees masked keys.
 * Config is read/written via backend endpoints that access Google Drive server-side.
 */
export default function AIScan({ userLoggedIn, onScanComplete }) {
  // ─── Config State ───
  const [config, setConfig] = useState(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState(null);
  const [configDirty, setConfigDirty] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [newKeyInput, setNewKeyInput] = useState('');

  // ─── File Selection State ───
  const [imageFiles, setImageFiles] = useState([]);
  const [skippedCount, setSkippedCount] = useState(0);
  const [deckName, setDeckName] = useState('');
  const fileInputRef = useRef(null);

  const { t } = useTranslation();

  // ─── Scan State ───
  const [scanState, setScanState] = useState('idle'); // idle | scanning | done | cancelled
  const [logs, setLogs] = useState([]);
  const [progress, setProgress] = useState({ processed: 0, total: 0 });
  const [batchResults, setBatchResults] = useState([]); // {index, status, cardCount}[]
  const [scannedCards, setScannedCards] = useState([]);
  const [failedBatches, setFailedBatches] = useState([]);
  const abortControllerRef = useRef(null);
  const logContainerRef = useRef(null);

  // ─── PDF Generation State ───
  const [pdfState, setPdfState] = useState(null); // null | 'generating' | 'done'
  const [pdfProgress, setPdfProgress] = useState({ current: 0, total: 0 });

  // ─── Load config from backend on mount ───
  useEffect(() => {
    if (!userLoggedIn) return;
    loadConfig();
  }, [userLoggedIn]);

  // ─── Auto-scroll log ───
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const loadConfig = async () => {
    setConfigLoading(true);
    setConfigError(null);
    try {
      const loadedConfig = await fetchScanConfig();
      setConfig(loadedConfig);
    } catch (err) {
      setConfigError(err.message);
      setConfig({ api_keys: [], batch_size: 30, updated_at: '' });
    }
    setConfigLoading(false);
  };

  const handleSaveConfig = async () => {
    if (!config) return;
    setSavingConfig(true);
    try {
      const result = await updateScanConfig({ batch_size: config.batch_size });
      setConfig(result);
      setConfigDirty(false);
      addLog('✅ Config saved');
    } catch (err) {
      addLog(`❌ Failed to save config: ${err.message}`);
    }
    setSavingConfig(false);
  };

  const handleAddKey = async () => {
    const key = newKeyInput.trim();
    if (!key) return;
    if (!key.startsWith('AIza')) {
      addLog('⚠ Invalid key format — must start with "AIza"');
      return;
    }

    try {
      const result = await addScanApiKey(key);
      setConfig(prev => ({ ...prev, api_keys: result.api_keys }));
      setNewKeyInput('');
      addLog(`✅ Key added: ${result.masked_key}`);
    } catch (err) {
      if (err.message.includes('already exists')) {
        addLog('⚠ Key already exists');
      } else {
        addLog(`❌ Failed to add key: ${err.message}`);
      }
    }
  };

  const handleRemoveKey = async (index) => {
    try {
      const result = await removeScanApiKey(index);
      setConfig(prev => ({ ...prev, api_keys: result.api_keys }));
    } catch (err) {
      addLog(`❌ Failed to remove key: ${err.message}`);
    }
  };

  // ─── File Selection ───
  const handleFolderSelect = (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const { imageFiles: filtered, skippedCount: skipped } = filterImageFiles(files);
    setImageFiles(filtered);
    setSkippedCount(skipped);

    // Auto-fill deck name from folder path
    if (filtered.length > 0 && !deckName) {
      const path = filtered[0].webkitRelativePath || '';
      const folderName = path.split('/')[0] || t('aiscan.scannedDeck');
      setDeckName(folderName);
    }

    // Reset scan state
    setScanState('idle');
    setScannedCards([]);
    setFailedBatches([]);
    setLogs([]);
    setBatchResults([]);
    setProgress({ processed: 0, total: 0 });
    setPdfState(null);
  };

  const addLog = useCallback((msg) => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    setLogs(prev => [...prev, `[${time}] ${msg}`]);
  }, []);

  // ─── Scan Flow ───
  const handleStartScan = async () => {
    if (!config?.api_keys?.length) {
      addLog('❌ No API keys configured. Add keys above first.');
      return;
    }
    if (!imageFiles.length) {
      addLog('❌ No images selected. Choose a folder first.');
      return;
    }

    setScanState('scanning');
    setScannedCards([]);
    setFailedBatches([]);
    setBatchResults([]);
    setLogs([]);

    const batchSize = Math.max(1, Math.min(parseInt(config.batch_size, 10) || 30, 30));
    const batches = chunk(imageFiles, batchSize);
    const totalImages = imageFiles.length;

    addLog(`📁 ${totalImages} images → ${batches.length} batch(es) of up to ${batchSize}`);

    // Phase 0: Validate API Keys (backend handles all keys)
    addLog(`\n── Checking ${config.api_keys.length} API key(s) ──`);
    const { validIndices, maskedKeys, totalKeys } = await validateScanKeys(null, addLog);

    if (validIndices.length === 0) {
      addLog('❌ All API keys are invalid. Scan aborted.');
      setScanState('done');
      return;
    }

    const deadCount = totalKeys - validIndices.length;
    addLog(`\n📊 Key check done: ${validIndices.length}/${totalKeys} alive` + (deadCount ? `, ${deadCount} dead (excluded)` : ''));

    // Phase 1: Generate PDFs
    setPdfState('generating');
    const pdfBatches = [];
    const pageCounts = [];

    for (let i = 0; i < batches.length; i++) {
      if (abortControllerRef.current?.signal.aborted) break;

      addLog(`🔧 Creating PDF for batch ${i + 1}/${batches.length} (${batches[i].length} images)...`);
      setPdfProgress({ current: i, total: batches.length });

      try {
        const { pdfBase64, pageCount } = await imagesToPdf(batches[i]);
        pdfBatches.push(pdfBase64);
        pageCounts.push(pageCount);
        const sizeKb = Math.round((pdfBase64.length * 3) / 4 / 1024);
        addLog(`✔ PDF batch ${i + 1} ready (${pageCount} pages, ${sizeKb}KB)`);
      } catch (err) {
        addLog(`❌ Failed to create PDF for batch ${i + 1}: ${err.message}`);
        pdfBatches.push(null);
        pageCounts.push(batches[i].length);
      }
    }

    setPdfState('done');

    // Remove null batches
    const validPdfIndices = pdfBatches.map((b, i) => b !== null ? i : -1).filter(i => i !== -1);
    const validPdfs = validPdfIndices.map(i => pdfBatches[i]);
    const validPageCounts = validPdfIndices.map(i => pageCounts[i]);
    const validImageBatches = validPdfIndices.map(i => batches[i]);

    if (validPdfs.length === 0) {
      addLog('❌ All PDF batches failed. Cannot proceed.');
      setScanState('done');
      return;
    }

    // Phase 2: Send to Gemini via backend (keys resolved server-side)
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const googleId = localStorage.getItem('g_id');

    setProgress({ processed: 0, total: validPageCounts.reduce((a, b) => a + b, 0) });

    try {
      const { cards, failedBatches: failed } = await processBatches(
        validPdfs,
        validPageCounts,
        googleId,
        validIndices,
        maskedKeys,
        {
          onLog: addLog,
          onProgress: (processed, total) => setProgress({ processed, total }),
          onBatchDone: (idx, count) => {
            setBatchResults(prev => [...prev, { index: idx, status: 'success', cardCount: count }]);
          },
          onBatchError: (idx, error) => {
            setBatchResults(prev => [...prev, { index: idx, status: 'error', error }]);
          },
        },
        controller.signal,
        validImageBatches
      );

      setScannedCards(cards);
      setFailedBatches(failed);
      setScanState(controller.signal.aborted ? 'cancelled' : 'done');
    } catch (err) {
      if (err.name === 'AbortError') {
        setScanState('cancelled');
        addLog(`⏹ ${t('aiscan.scanCancelled')}.`);
      } else {
        addLog(`❌ Fatal error: ${err.message}`);
        setScanState('done');
      }
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleSaveAndSync = () => {
    if (!scannedCards.length) return;

    const newDeck = {
      deck_id: uuidv4(),
      name: deckName || t('aiscan.scannedDeck'),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      source_folder: '',
      description: `Scanned ${scannedCards.length} cards via AI Scan`,
      cards: scannedCards,
    };

    onScanComplete(newDeck);
    addLog(`✅ Deck "${newDeck.name}" saved! ${scannedCards.length} cards synced to Drive.`);
  };

  // ─── Progress calculation ───
  const progressPercent = progress.total > 0
    ? Math.round((progress.processed / progress.total) * 100)
    : 0;

  const canStartScan = imageFiles.length > 0 && config?.api_keys?.length > 0 && scanState !== 'scanning';

  // ─── Render ───
  if (!userLoggedIn) {
    return (
      <div className="scan-container animate-fade-in">
        <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center' }}>
          <AlertTriangle size={48} color="var(--warning)" style={{ marginBottom: '1rem' }} />
          <h3 style={{ marginBottom: '0.5rem' }}>Login Required</h3>
          <p style={{ color: 'var(--text-muted)' }}>
            {t('aiscan.loginToDriveFirst')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="scan-container animate-fade-in">
      <div className="scan-left">
        {/* ─── Section 1: API Keys ─── */}
        <div className="glass-panel scan-section">
          <div className="scan-section-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Settings size={20} color="var(--primary)" />
              <h3>{t('aiscan.configApiKeys')}</h3>
              {configLoading && <Loader2 size={16} className="animate-spin" color="var(--text-muted)" />}
            </div>
            <a href="/guide.html#ai-scan" target="_blank" rel="noreferrer" title={t('aiscan.howToGetFreeApiKey')} style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center', background: 'rgba(79, 70, 229, 0.1)', padding: '6px', borderRadius: '50%', textDecoration: 'none' }}>
              <HelpCircle size={18} />
            </a>
          </div>

          {configError && (
            <div style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
              ⚠ {configError}
            </div>
          )}

          {config && (
            <>
              {/* Existing keys — displayed with masked values from backend */}
              <div className="key-chips-container">
                {config.api_keys.map((maskedKey, i) => (
                  <ApiKeyChip
                    key={i}
                    maskedKey={maskedKey}
                    index={i}
                    status="idle"
                    onRemove={handleRemoveKey}
                  />
                ))}
                {config.api_keys.length === 0 && (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic' }}>
                    {t('aiscan.noApiKeysYet')}
                  </p>
                )}
              </div>

              {/* Add key input */}
              <div className="key-add-row">
                <input
                  type="text"
                  value={newKeyInput}
                  onChange={(e) => setNewKeyInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddKey()}
                  placeholder={t('aiscan.pasteApiKey')}
                  className="key-input"
                />
                <button className="btn btn-glass" onClick={handleAddKey} style={{ flexShrink: 0 }}>
                  <Plus size={16} /> {t('aiscan.add')}
                </button>
              </div>

              {/* Batch Size Config */}
              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--glass-border)' }}>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  {t('aiscan.imagesPerBatch')}
                  <span title={t('aiscan.imagesPerBatchTooltip')} style={{ display: 'inline-flex', cursor: 'help' }}>
                    <Info size={14} color="var(--primary)" />
                  </span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={config.batch_size || ''}
                  onChange={(e) => {
                    let val = parseInt(e.target.value, 10);
                    if (isNaN(val)) val = '';
                    else if (val > 30) val = 30;
                    else if (val < 1) val = 1;
                    setConfig({ ...config, batch_size: val });
                    setConfigDirty(true);
                  }}
                  className="key-input"
                  style={{ width: '100%' }}
                  placeholder={t('aiscan.maxImages')}
                />
              </div>

              {/* Save config button — only for batch_size changes */}
              {configDirty && (
                <button
                  className="btn btn-primary"
                  onClick={handleSaveConfig}
                  disabled={savingConfig}
                  style={{ marginTop: '0.75rem', width: '100%' }}
                >
                  {savingConfig ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                  {t('aiscan.saveKeysToDrive')}
                </button>
              )}
            </>
          )}
        </div>

        {/* ─── Section 2: Folder Selection ─── */}
        <div className="glass-panel scan-section">
          <div className="scan-section-header">
            <FolderOpen size={20} color="var(--primary)" />
            <h3>{t('aiscan.selectImages')}</h3>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className="btn btn-glass"
              onClick={() => fileInputRef.current?.click()}
              style={{ flex: '0 0 auto' }}
            >
              <FolderOpen size={16} /> {t('aiscan.chooseFolder')}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              webkitdirectory=""
              directory=""
              multiple
              onChange={handleFolderSelect}
              style={{ display: 'none' }}
            />

            {imageFiles.length > 0 && (
              <span style={{ color: 'var(--success)', fontWeight: 600, fontSize: '0.9rem' }}>
                ✓ {imageFiles.length} images found
                {skippedCount > 0 && (
                  <span style={{ color: 'var(--warning)', fontWeight: 400, marginLeft: '0.5rem' }}>
                    (skipped {skippedCount} unsupported)
                  </span>
                )}
              </span>
            )}
          </div>

          {imageFiles.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.25rem', display: 'block' }}>
                Deck Name
              </label>
              <input
                type="text"
                value={deckName}
                onChange={(e) => setDeckName(e.target.value)}
                placeholder="Enter deck name"
                className="key-input"
                style={{ width: '100%' }}
              />
            </div>
          )}
        </div>

        {/* ─── Start / Cancel Button ─── */}
        {imageFiles.length > 0 && (
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            {scanState !== 'scanning' ? (
              <button
                className="btn btn-primary"
                onClick={handleStartScan}
                disabled={!canStartScan}
                style={{ flex: 1, padding: '1rem', fontSize: '1.05rem' }}
              >
                <Sparkles size={20} /> {t('aiscan.startAIScan', 'Start AI Scan')}
              </button>
            ) : (
              <button
                className="btn"
                onClick={handleCancel}
                style={{ flex: 1, padding: '1rem', fontSize: '1.05rem', background: 'var(--danger)', color: 'white' }}
              >
                <Square size={18} /> Cancel Scan
              </button>
            )}
          </div>
        )}
      </div>

      <div className="scan-right">
        {/* ─── Placeholder when Idle ─── */}
        {scanState === 'idle' && (
          <div className="glass-panel" style={{ flex: 1, minHeight: '400px', display: 'flex', flexDirection: 'column', padding: '1.5rem', border: '1px dashed var(--glass-border)', background: 'transparent' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.5rem', opacity: 0.5 }}>
              <Terminal size={20} color="var(--text-muted)" />
              <Skeleton width="120px" height="18px" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', opacity: 0.3 }}>
              <Skeleton width="40%" height="14px" />
              <Skeleton width="70%" height="14px" />
              <Skeleton width="55%" height="14px" />
              <Skeleton width="30%" height="14px" />
              <Skeleton width="65%" height="14px" />
            </div>
            <div style={{ marginTop: 'auto', textAlign: 'center', padding: '2rem', opacity: 0.6 }}>
              <Sparkles size={40} color="var(--text-muted)" style={{ marginBottom: '1rem', opacity: 0.3 }} />
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{t('aiscan.logsPlaceholder', 'Select a folder and start AI Scan to see logs here.')}</p>
            </div>
          </div>
        )}


        {/* ─── Section 3: Progress ─── */}
        {(scanState === 'scanning' || scanState === 'done' || scanState === 'cancelled') && (
          <div className="glass-panel scan-section">
            <div className="scan-section-header">
              {scanState === 'scanning' ? (
                <Loader2 size={20} className="animate-spin" color="var(--primary)" />
              ) : (
                <CheckCircle2 size={20} color={scanState === 'done' ? 'var(--success)' : 'var(--warning)'} />
              )}
              <h3>
                {scanState === 'scanning'
                  ? (pdfState === 'generating'
                    ? `Creating PDFs... (${pdfProgress.current + 1}/${pdfProgress.total})`
                    : `Processing batch... ${progressPercent}%`)
                  : scanState === 'done'
                    ? `Done! ${scannedCards.length} cards extracted`
                    : t('aiscan.scanCancelled')}
              </h3>
            </div>

            {/* Progress bar */}
            {progress.total > 0 && (
              <div className="scan-progress-bar">
                <div
                  className="scan-progress-fill"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            )}

            {progress.total > 0 && (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                {progress.processed} / {progress.total} images processed
                {failedBatches.length > 0 && (
                  <span style={{ color: 'var(--danger)', marginLeft: '0.5rem' }}>
                    ({failedBatches.length} batch(es) failed)
                  </span>
                )}
              </p>
            )}

            {/* Log console */}
            <div className="scan-log" style={{ minHeight: '180px' }} ref={logContainerRef}>
              {logs.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <Skeleton width="30%" height="12px" style={{ opacity: 0.2 }} />
                  <Skeleton width="50%" height="12px" style={{ opacity: 0.2 }} />
                </div>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className="scan-log-line">{log}</div>
                ))
              )}
            </div>
          </div>
        )}


        {/* ─── Section 4: Results ─── */}
        {scanState === 'done' && scannedCards.length > 0 && (
          <div className="glass-panel scan-section">
            <div className="scan-section-header">
              <CheckCircle2 size={20} color="var(--success)" />
              <h3>{t('aiscan.results')}</h3>
            </div>

            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <div className="scan-stat">
                <span className="scan-stat-value" style={{ color: 'var(--success)' }}>{scannedCards.length}</span>
                <span className="scan-stat-label">Cards Extracted</span>
              </div>
              <div className="scan-stat">
                <span className="scan-stat-value" style={{ color: 'var(--danger)' }}>{failedBatches.length}</span>
                <span className="scan-stat-label">Failed Batches</span>
              </div>
              <div className="scan-stat">
                <span className="scan-stat-value" style={{ color: 'var(--primary)' }}>{imageFiles.length}</span>
                <span className="scan-stat-label">Total Images</span>
              </div>
            </div>

            <button
              className="btn btn-primary"
              onClick={handleSaveAndSync}
              style={{ width: '100%', padding: '1rem', fontSize: '1.05rem' }}
            >
              <Save size={18} /> Save Deck & Sync to Drive
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

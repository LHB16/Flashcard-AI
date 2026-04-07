import React, { useState } from 'react';
import { UploadCloud, FileJson } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const FileLoader = ({ onDataLoaded }) => {
  const { t } = useTranslation();
  const [error, setError] = useState(null);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const jsonData = JSON.parse(event.target.result);
        if (Array.isArray(jsonData) && jsonData.length > 0 && jsonData[0].cards) {
          onDataLoaded(jsonData, true);
        } else if (jsonData.cards) {
          // In case it's a single deck object rather than an array
          onDataLoaded([jsonData], true);
        } else {
          setError('Invalid file format. Please select a valid desk.json or decks.json file.');
        }
      } catch (err) {
        setError('Cannot read JSON file. Please check again.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', maxWidth: '500px', margin: '0 auto', width: '100%' }}>
      <UploadCloud size={64} style={{ color: 'var(--primary)', margin: '0 auto 1.5rem', display: 'block' }} />
      <h2 style={{ marginBottom: '1rem', fontSize: '1.5rem', fontWeight: 600 }}>{t('common.uploadFileManual')}</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', lineHeight: '1.5' }}>
        Upload your <strong className="text-gradient">desk.json</strong> file to get started.
      </p>
      
      {error && (
        <div style={{ color: 'var(--danger)', marginBottom: '1.5rem', padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px' }}>
          {error}
        </div>
      )}

      <div className="file-upload-wrapper">
        <button className="btn btn-primary" style={{ position: 'relative', width: '100%' }}>
          <FileJson size={20} />
          <span>{t('common.selectJsonFromDevice')}</span>
        </button>
        <input type="file" accept=".json" onChange={handleFileUpload} />
      </div>
    </div>
  );
};

export default FileLoader;

import React from 'react';
import { ArrowLeft, Keyboard, Layers, BrainCircuit } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const ShortcutRow = ({ keys, desc }) => (
  <li style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.8rem' }}>
    <span style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>{desc}</span>
    <div style={{ display: 'flex', gap: '0.4rem' }}>
      {keys.map((k, i) => (
        <span key={i} style={{ 
          background: 'var(--glass-bg)', 
          border: '1px solid var(--glass-border)', 
          padding: '0.3rem 0.6rem', 
          borderRadius: '6px', 
          fontSize: '0.85rem', 
          fontFamily: 'monospace',
          fontWeight: 'bold',
          color: 'var(--text-main)',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          {k}
        </span>
      ))}
    </div>
  </li>
);

const KeyboardShortcuts = ({ onBack }) => {
  const { t } = useTranslation();
  return (
    <div className="animate-fade-in" style={{ width: '100%', maxWidth: '800px', margin: '0 auto', padding: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <button className="btn btn-glass btn-icon" onClick={onBack}>
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-gradient" style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', fontSize: '1.8rem', margin: 0 }}>
          <Keyboard size={28} /> {t('keyboard.shortcuts')}
        </h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
        {/* Flashcard Mode */}
        <div className="glass-panel" style={{ padding: '2rem' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', color: 'var(--primary)', fontSize: '1.3rem' }}>
            <Layers size={24} /> {t('common.flashcardMode')}
          </h3>
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
             <ShortcutRow keys={['Space']} desc={t('keyboard.flipCard')} />
             <ShortcutRow keys={['↑', '↓']} desc={`${t('keyboard.flipCard')} (${t('common.alternative')})`} />
             <ShortcutRow keys={['←']} desc={t('keyboard.markStillLearning')} />
             <ShortcutRow keys={['→']} desc={t('keyboard.markKnown')} />
             <ShortcutRow keys={['R']} desc={`${t('common.undo')} / ${t('common.goBackToPrevCard')}`} />
          </ul>
        </div>

        {/* Quiz Mode */}
        <div className="glass-panel" style={{ padding: '2rem' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', color: 'var(--success)', fontSize: '1.3rem' }}>
            <BrainCircuit size={24} /> {t('common.quizMode')}
          </h3>
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
             <ShortcutRow keys={['Tab']} desc={`${t('keyboard.focusNext')} / ${t('quizmode.submit')}`} />
             <ShortcutRow keys={['Shift', 'Tab']} desc={t('keyboard.focusPrevious')} />
             <ShortcutRow keys={['Space']} desc={`${t('keyboard.selectOption')} / ${t('quizmode.submit')}`} />
             <ShortcutRow keys={['\\']} desc={`${t('keyboard.jumpTo')} ${t('keyboard.firstUnanswered')}`} />
             <ShortcutRow keys={['←', '→']} desc={`${t('common.previous')} / ${t('common.next')}`} />
          </ul>
        </div>
      </div>
    </div>
  );
};

export default KeyboardShortcuts;

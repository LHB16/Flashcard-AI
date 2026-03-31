import React from 'react';

const Footer = () => {
  return (
    <footer style={{
      textAlign: 'center',
      padding: '1.5rem 1rem',
      fontSize: '0.85rem',
      color: 'var(--text-muted)',
      borderTop: '1px solid var(--glass-border)',
      marginTop: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem',
      alignItems: 'center'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <span>Made with ❤️ by</span>
        <a 
          href="https://github.com/LHB16" 
          target="_blank" 
          rel="noopener noreferrer"
          style={{ 
            color: 'var(--primary)', 
            fontWeight: '600', 
            textDecoration: 'none',
            borderBottom: '1px solid transparent',
            transition: 'all 0.3s'
          }}
          onMouseOver={(e) => e.target.style.borderBottom = '1px solid var(--primary)'}
          onMouseOut={(e) => e.target.style.borderBottom = '1px solid transparent'}
        >
          LHB16
        </a>
      </div>
      <a 
        href="/privacy" 
        target="_blank" 
        style={{ 
          color: 'var(--text-muted)',
          textDecoration: 'none',
          opacity: 0.8,
          fontSize: '0.75rem'
        }}
        onMouseOver={(e) => e.target.style.opacity = '1'}
        onMouseOut={(e) => e.target.style.opacity = '0.8'}
      >
        Privacy Policy
      </a>
    </footer>
  );
};

export default Footer;

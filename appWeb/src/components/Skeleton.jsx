import React from 'react';

const Skeleton = ({ width, height, borderRadius = '8px', className = '', style = {} }) => {
  return (
    <div 
      className={`skeleton ${className}`} 
      style={{ 
        width: width || '100%', 
        height: height || '20px', 
        borderRadius,
        ...style 
      }} 
    />
  );
};

export const HomeSkeleton = () => {
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="glass-panel" style={{ padding: '2.5rem', textAlign: 'center', borderColor: 'rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Skeleton width="48px" height="48px" borderRadius="50%" style={{ marginBottom: '1.5rem', opacity: 0.5 }} />
        <Skeleton width="60%" height="24px" style={{ marginBottom: '0.8rem', margin: '0 auto' }} />
        <Skeleton width="80%" height="16px" style={{ margin: '0 auto' }} />
      </div>
      <div style={{ display: 'flex', gap: '1rem', width: '100%' }}>
        <Skeleton height="56px" borderRadius="12px" style={{ flex: 1 }} />
        <Skeleton height="56px" borderRadius="12px" style={{ flex: 1 }} />
      </div>
    </div>
  );
};

export default Skeleton;

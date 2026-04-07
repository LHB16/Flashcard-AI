import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight } from 'lucide-react';
import './Taskbar.css';

export default function Taskbar({ items, isFixed = true }) {
  const [isOpen, setIsOpen] = useState(true);
  const menuRef = useRef(null);
  const [menuWidth, setMenuWidth] = useState(240);

  // Measure actual taskbar width for blob sizing
  useEffect(() => {
    if (!menuRef.current) return;
    const ro = new ResizeObserver((entries) => {
      if (entries[0]) setMenuWidth(entries[0].contentRect.width + 24);
    });
    ro.observe(menuRef.current);
    return () => ro.disconnect();
  }, []);

  const renderItems = () =>
    items.map((item) => (
      <div
        key={item.id}
        className={`task-item ${item.isActive ? 'active' : ''} ${item.disabled ? 'disabled' : ''}`}
        onClick={(e) => {
          if (item.disabled) {
            if (item.onDisabledClick) item.onDisabledClick(e);
            return;
          }
          item.onClick();
        }}
        title={item.title || item.label}
      >
        <div className="task-icon">{item.icon}</div>
        <span className="text">{item.label}</span>
      </div>
    ));

  // Non-fixed: simple inline taskbar (no gooey)
  if (!isFixed) {
    return (
      <div className="animated-taskbar animated-taskbar-inline">
        {renderItems()}
      </div>
    );
  }

  const taskbarContent = (
    <>
      {/* Hidden SVG Gooey Filter */}
      <svg xmlns="http://www.w3.org/2000/svg" style={{ position: 'absolute', width: 0, height: 0 }}>
        <defs>
          <filter id="gooey">
            <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8" result="gooey" />
            <feBlend in="SourceGraphic" in2="gooey" />
          </filter>
        </defs>
      </svg>

      {/* Layer 1: Gooey Blobs (filter applied, NO text) */}
      <div
        className={`gooey-layer ${isOpen ? 'is-open' : ''}`}
        style={{ '--menu-width': `${menuWidth}px` }}
      >
        <div className="blob-btn" />
        <div className="blob-connector" />
        <div className="blob-menu" />
      </div>

      {/* Layer 2: Content (NO filter, has icons/text) */}
      <div className={`gooey-content-layer ${isOpen ? 'is-open' : ''}`}>
        <button
          className="gooey-btn-hitbox"
          onClick={() => setIsOpen((v) => !v)}
          aria-label={isOpen ? 'Hide Taskbar' : 'Show Taskbar'}
        >
          <ChevronRight
            size={16}
            strokeWidth={2.5}
            className={`gooey-hitbox-icon ${isOpen ? 'rotated' : ''}`}
          />
        </button>

        <div className="gooey-menu-items">
          <div className="animated-taskbar" ref={menuRef}>
            {renderItems()}
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(taskbarContent, document.body);
}

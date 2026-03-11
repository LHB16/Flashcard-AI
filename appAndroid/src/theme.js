// src/theme.js — shared design tokens
export const Colors = {
    primary: '#4F46E5',
    primaryLight: '#EEF2FF',
    primaryDark: '#3730A3',
    success: '#10B981',
    danger: '#EF4444',
    warning: '#F59E0B',
    bg: '#F8F9FC',
    surface: '#FFFFFF',
    surface2: '#F1F5F9',
    border: '#E2E8F0',
    text: '#1E293B',
    textDim: '#64748B',
    textLight: '#94A3B8',
};

export const Typography = {
    h1: { fontSize: 24, fontWeight: '700', color: Colors.text },
    h2: { fontSize: 20, fontWeight: '700', color: Colors.text },
    h3: { fontSize: 16, fontWeight: '600', color: Colors.text },
    body: { fontSize: 15, color: Colors.text },
    small: { fontSize: 13, color: Colors.textDim },
    caption: { fontSize: 11, color: Colors.textLight },
};

export const Spacing = {
    xs: 4, sm: 8, md: 16, lg: 24, xl: 32,
};

export const Radius = {
    sm: 8, md: 12, lg: 16, xl: 24, full: 999,
};

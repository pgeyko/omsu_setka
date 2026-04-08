import React from 'react';
import styles from './GlassCard.module.css';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
  onClick?: () => void;
}

export const GlassCard: React.FC<GlassCardProps> = ({ children, className, glow = false, onClick }) => {
  return (
    <div className={`${styles.card} ${glow ? styles.glow : ''} ${className || ''}`} onClick={onClick}>
      {children}
    </div>
  );
};

import React from 'react';
import styles from './GlassInput.module.css';

interface GlassInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
}

export const GlassInput: React.FC<GlassInputProps> = ({ icon, ...props }) => {
  return (
    <div className={styles.container}>
      {icon && <div className={styles.icon}>{icon}</div>}
      <input className={`${styles.input} ${icon ? styles.withIcon : ''}`} {...props} />
    </div>
  );
};

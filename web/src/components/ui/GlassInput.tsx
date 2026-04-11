import React, { forwardRef } from 'react';
import styles from './GlassInput.module.css';

interface GlassInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  loading?: boolean;
}

export const GlassInput = forwardRef<HTMLInputElement, GlassInputProps>(
  ({ icon, loading, ...props }, ref) => {
    return (
      <div className={styles.container}>
        {icon && <div className={styles.icon}>{icon}</div>}
        <input 
          ref={ref}
          className={`${styles.input} ${icon ? styles.withIcon : ''}`} 
          {...props} 
        />
        {loading && (
          <div className={styles.loader}>
            <div className={styles.spinner}></div>
          </div>
        )}
      </div>
    );
  }
);

GlassInput.displayName = 'GlassInput';

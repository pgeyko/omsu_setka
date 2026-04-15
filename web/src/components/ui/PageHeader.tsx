import type { ReactNode } from 'react';
import styles from './PageHeader.module.css';

interface PageHeaderProps {
  title?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  center?: ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  left,
  right,
  center,
  className
}) => (
  <header className={`${styles.header} ${className || ''}`}>
    <nav className={styles.nav}>
      <div className={styles.side}>{left}</div>
      <div className={styles.center}>
        {center || (typeof title === 'string' ? <h1 className={styles.title}>{title}</h1> : title)}
      </div>
      <div className={`${styles.side} ${styles.right}`}>{right}</div>
    </nav>
  </header>
);

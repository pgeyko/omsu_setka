import type { ReactNode } from 'react';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className
}) => (
  <div className={`${styles.emptyState} ${className || ''}`}>
    {icon && <div className={styles.icon}>{icon}</div>}
    <div className={styles.copy}>
      <h3 className={styles.title}>{title}</h3>
      {description && <p className={styles.description}>{description}</p>}
    </div>
    {action && <div className={styles.action}>{action}</div>}
  </div>
);

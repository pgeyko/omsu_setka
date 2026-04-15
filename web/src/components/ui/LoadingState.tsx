import styles from './LoadingState.module.css';

interface LoadingStateProps {
  label: string;
  className?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({ label, className }) => (
  <div className={`${styles.loadingState} ${className || ''}`} role="status" aria-live="polite">
    <span className={styles.spinner} aria-hidden="true" />
    <span>{label}</span>
  </div>
);

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './IconButton.module.css';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  variant?: 'default' | 'plain';
}

export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  variant = 'default',
  className,
  type = 'button',
  ...props
}) => (
  <button
    type={type}
    className={`${styles.button} ${variant === 'plain' ? styles.plain : ''} ${className || ''}`}
    {...props}
  >
    {icon}
  </button>
);

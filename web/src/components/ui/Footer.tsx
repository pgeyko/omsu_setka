import React from 'react';
import { ExternalLink, Code } from 'lucide-react';
import styles from './Footer.module.css';

export const Footer: React.FC = () => {
  return (
    <footer className={styles.footer}>
      <div className={styles.content}>
        <div className={styles.top}>
          <span className={styles.brand}>setka</span>
          <span className={styles.separator}>•</span>
          <span className={styles.copyright}>© {new Date().getFullYear()}</span>
        </div>
        <div style={{ display: 'flex', gap: '20px' }}>
          <a
            href="https://eservice.omsu.ru/schedule/"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.link}
          >
            Оригинальное расписание <ExternalLink size={14} />
          </a>
          <a
            href="https://github.com/pgeyko/omsu_setka"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.link}
          >
            GitHub <Code size={14} />
          </a>
        </div>
      </div>
    </footer>
  );
};


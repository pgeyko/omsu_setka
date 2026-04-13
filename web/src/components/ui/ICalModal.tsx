import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, Copy, Download } from 'lucide-react';
import styles from './ICalModal.module.css';

interface ICalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDownload: () => void;
  onCopyLink: () => void;
  title: string;
}

export const ICalModal: React.FC<ICalModalProps> = ({
  isOpen,
  onClose,
  onDownload,
  onCopyLink,
  title
}) => {
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={styles.modalOverlay} 
          onClick={onClose}
        >
          <motion.div 
            className={styles.modalContent}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            onClick={e => e.stopPropagation()}
          >
            <div className={styles.header}>
              <div className={styles.titleWrapper}>
                <Calendar size={20} className={styles.titleIcon} />
                <h3 className={styles.title}>Экспорт: {title}</h3>
              </div>
              <button className={styles.closeBtn} onClick={onClose}>
                <X size={20} />
              </button>
            </div>
            
            <p className={styles.message}>
              Добавьте расписание в свой личный календарь (Google, Apple, Outlook).
            </p>

            <div className={styles.options}>
              <button className={styles.optionBtn} onClick={onDownload}>
                <div className={styles.optionIcon}><Download size={20} /></div>
                <div className={styles.optionText}>
                  <strong>Скачать .ics файл</strong>
                  <span>Для разового импорта событий</span>
                </div>
              </button>

              <button className={styles.optionBtn} onClick={onCopyLink}>
                <div className={styles.optionIcon}><Copy size={20} /></div>
                <div className={styles.optionText}>
                  <strong>Скопировать ссылку</strong>
                  <span>Для подписки на автообновления</span>
                </div>
              </button>
            </div>

            <div className={styles.helpText}>
              💡 Совет: Для подписки в Google Календаре используйте «Добавить по ссылке» и вставьте скопированный адрес.
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

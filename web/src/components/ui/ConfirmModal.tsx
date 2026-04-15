import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { drawerMotion, drawerTransition, overlayMotion, overlayTransition } from '../../utils/motion';
import styles from './ConfirmModal.module.css';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Да',
  cancelText = 'Отмена',
  onConfirm,
  onCancel,
  isLoading = false
}) => {
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          variants={overlayMotion}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={overlayTransition}
          className={styles.modalOverlay} 
          onClick={onCancel}
        >
          <motion.div 
            className={styles.modalContent}
            variants={drawerMotion}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={drawerTransition}
            onClick={e => e.stopPropagation()}
          >
            <div className={styles.header}>
              <h3 className={styles.title}>{title}</h3>
              <button className={styles.closeBtn} onClick={onCancel} aria-label="Закрыть окно подтверждения">
                <X size={20} />
              </button>
            </div>
            
            <p className={styles.message}>{message}</p>
            
            <div className={styles.footer}>
              <button className={styles.cancelBtn} onClick={onCancel} disabled={isLoading}>
                {cancelText}
              </button>
              <button className={styles.confirmBtn} onClick={onConfirm} disabled={isLoading}>
                {isLoading ? <div className={styles.spinner} /> : confirmText}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

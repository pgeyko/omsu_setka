import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Settings2,
  X,
  Share2, 
  Bell, 
  Layers, 
  LayoutGrid, 
  List, 
  Star,
} from 'lucide-react';
import styles from './FloatingActions.module.css';

interface FloatingActionsProps {
  viewMode: 'day' | 'week';
  setViewMode: (mode: 'day' | 'week') => void;
  isSubscribed: boolean;
  onToggleNotifications: () => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onShowSubgroups?: () => void;
  isSubgroupActive?: boolean;
  onShare: () => void;
  hasNewChanges?: boolean;
}

export const FloatingActions: React.FC<FloatingActionsProps> = ({
  viewMode,
  setViewMode,
  isSubscribed,
  onToggleNotifications,
  isFavorite,
  onToggleFavorite,
  onShowSubgroups,
  isSubgroupActive,
  onShare,
  hasNewChanges
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const actions = [
    { 
      icon: <Share2 size={20} />, 
      label: 'Поделиться', 
      onClick: onShare,
      isActive: false
    },
    { 
      icon: <Bell size={20} fill={isSubscribed ? 'currentColor' : 'none'} />, 
      label: isSubscribed ? 'Уведомления ВКЛ' : 'Уведомления ВЫКЛ', 
      onClick: onToggleNotifications,
      isActive: isSubscribed,
      badge: hasNewChanges
    },
    { 
      icon: viewMode === 'day' ? <LayoutGrid size={20} /> : <List size={20} />, 
      label: viewMode === 'day' ? 'Вид: Неделя' : 'Вид: День', 
      onClick: () => setViewMode(viewMode === 'day' ? 'week' : 'day'),
      isActive: false
    },
    { 
      icon: <Star size={20} fill={isFavorite ? 'currentColor' : 'none'} />, 
      label: isFavorite ? 'В избранном' : 'В избранное', 
      onClick: onToggleFavorite,
      isActive: isFavorite,
      activeColor: '#f59e0b' // Warning/Gold
    },
  ];

  if (onShowSubgroups) {
    actions.splice(2, 0, {
      icon: <Layers size={20} />,
      label: 'Подгруппа',
      onClick: onShowSubgroups,
      isActive: !!isSubgroupActive,
      activeColor: '#10b981' // Green
    });
  }

  return (
    <div className={styles.container}>
      {createPortal(
        <AnimatePresence>
          {isOpen && (
            <>
              <motion.div 
                className={styles.overlay}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsOpen(false)}
              />
              
              <div className={styles.menu}>
                {actions.map((action, index) => (
                  <motion.div
                    key={index}
                    className={styles.actionWrapper}
                    initial={{ opacity: 0, y: 20, scale: 0.8 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 20, scale: 0.8 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <span className={styles.label}>{action.label}</span>
                    <button 
                      className={`${styles.actionBtn} ${action.isActive ? styles.btnActive : ''}`} 
                      onClick={() => {
                        action.onClick();
                        setIsOpen(false);
                      }}
                      style={{ 
                        color: action.isActive ? (action.activeColor || 'var(--text-primary)') : 'var(--text-secondary)',
                        borderColor: action.isActive ? (action.activeColor || 'var(--text-primary)') : undefined
                      }}
                    >
                      {action.icon}
                      {action.badge && <span className={styles.badge} />}
                    </button>
                  </motion.div>
                ))}
              </div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}

      <motion.button
        className={`${styles.mainBtn} ${isOpen ? styles.active : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        whileTap={{ scale: 0.9 }}
      >
        <motion.div
          animate={{ rotate: isOpen ? 90 : 0 }}
          transition={{ type: 'spring', damping: 20 }}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {isOpen ? <X size={24} /> : <Settings2 size={24} />}
        </motion.div>
      </motion.button>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Bell, Clock, Info } from 'lucide-react';
import styles from './NotificationSettingsModal.module.css';

interface NotificationSettings {
  notify_on_change: boolean;
  notify_daily_digest: boolean;
  digest_time: string;
  notify_before_lesson: boolean;
  before_minutes: number;
  timezone?: string;
  fcm_token?: string;
  entity_type?: string;
  entity_id?: number;
}

interface NotificationSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: NotificationSettings) => void;
  onUnsubscribe: () => void;
  initialSettings: NotificationSettings;
  isLoading: boolean;
}

export const NotificationSettingsModal: React.FC<NotificationSettingsModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onUnsubscribe,
  initialSettings,
  isLoading
}) => {
  const defaultSettings: NotificationSettings = {
    notify_on_change: true,
    notify_daily_digest: false,
    digest_time: '19:00',
    notify_before_lesson: false,
    before_minutes: 30
  };

  const [settings, setSettings] = useState<NotificationSettings>(initialSettings || defaultSettings);

  useEffect(() => {
    if (isOpen) {
      setSettings(initialSettings || defaultSettings);
    }
  }, [isOpen, initialSettings]);

  const toggle = (key: keyof NotificationSettings) => {
    setSettings(prev => {
      const state = prev || defaultSettings;
      return { ...state, [key]: !state[key] };
    });
  };

  const update = (key: keyof NotificationSettings, value: any) => {
    setSettings(prev => {
      const state = prev || defaultSettings;
      return { ...state, [key]: value };
    });
  };

  // Safe destructuring or fallback for render
  const safeSettings = settings || defaultSettings;

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
                <Bell size={20} className={styles.titleIcon} />
                <h3 className={styles.title}>Настройка уведомлений</h3>
              </div>
              <button className={styles.closeBtn} onClick={onClose}>
                <X size={20} />
              </button>
            </div>
            
            <div className={styles.scrollable}>
              <div className={styles.section}>
                <div className={styles.settingRow}>
                  <div className={styles.settingInfo}>
                    <div className={styles.settingTitle}>Изменения в расписании</div>
                    <div className={styles.settingDesc}>Уведомления о переносах и отменах</div>
                  </div>
                  <label className={styles.switch}>
                    <input 
                      type="checkbox" 
                      checked={safeSettings.notify_on_change} 
                      onChange={() => toggle('notify_on_change')}
                    />
                    <span className={styles.slider}></span>
                  </label>
                </div>
              </div>

              <div className={styles.divider} />

              <div className={styles.section}>
                <div className={styles.settingRow}>
                  <div className={styles.settingInfo}>
                    <div className={styles.settingTitle}>Вечерний дайджест</div>
                    <div className={styles.settingDesc}>Сводка занятий на завтра</div>
                  </div>
                  <label className={styles.switch}>
                    <input 
                      type="checkbox" 
                      checked={safeSettings.notify_daily_digest} 
                      onChange={() => toggle('notify_daily_digest')}
                    />
                    <span className={styles.slider}></span>
                  </label>
                </div>

                {safeSettings.notify_daily_digest && (
                  <div className={styles.subSetting}>
                    <Clock size={16} />
                    <span>Время отправки:</span>
                    <input 
                      type="time" 
                      className={styles.timeInput}
                      value={safeSettings.digest_time}
                      onChange={(e) => update('digest_time', e.target.value)}
                    />
                  </div>
                )}
              </div>

              <div className={styles.divider} />

              <div className={styles.section}>
                <div className={styles.settingRow}>
                  <div className={styles.settingInfo}>
                    <div className={styles.settingTitle}>Напоминания о парах</div>
                    <div className={styles.settingDesc}>Перед началом каждого занятия</div>
                  </div>
                  <label className={styles.switch}>
                    <input 
                      type="checkbox" 
                      checked={safeSettings.notify_before_lesson} 
                      onChange={() => toggle('notify_before_lesson')}
                    />
                    <span className={styles.slider}></span>
                  </label>
                </div>

                {safeSettings.notify_before_lesson && (
                  <div className={styles.subSetting}>
                    <Clock size={16} />
                    <span>За</span>
                    <input 
                      type="number" 
                      min="5" 
                      max="120"
                      step="5"
                      className={styles.numberInput}
                      value={safeSettings.before_minutes}
                      onChange={(e) => update('before_minutes', parseInt(e.target.value))}
                    />
                    <span>минут</span>
                  </div>
                )}
              </div>

              <div className={styles.infoBox}>
                <Info size={16} />
                <p>Все уведомления приходят в часовом поясе Омска (UTC+6).</p>
              </div>
            </div>

            <div className={styles.footer}>
              <button 
                className={styles.saveBtn} 
                onClick={() => onSave(safeSettings)}
                disabled={isLoading}
              >
                {isLoading ? <div className={styles.spinner} /> : 'Сохранить'}
              </button>
              <button 
                className={styles.unsubscribeBtn}
                onClick={onUnsubscribe}
                disabled={isLoading}
              >
                Отключить уведомления
              </button>
              <button className={styles.cancelBtn} onClick={onClose}>
                Отмена
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

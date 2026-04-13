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
  const [settings, setSettings] = useState<NotificationSettings>(initialSettings);

  useEffect(() => {
    if (isOpen) {
      setSettings(initialSettings);
    }
  }, [isOpen, initialSettings]);

  const toggle = (key: keyof NotificationSettings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const update = (key: keyof NotificationSettings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

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
                      checked={settings.notify_on_change} 
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
                      checked={settings.notify_daily_digest} 
                      onChange={() => toggle('notify_daily_digest')}
                    />
                    <span className={styles.slider}></span>
                  </label>
                </div>

                {settings.notify_daily_digest && (
                  <div className={styles.subSetting}>
                    <Clock size={16} />
                    <span>Время отправки:</span>
                    <input 
                      type="time" 
                      className={styles.timeInput}
                      value={settings.digest_time}
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
                      checked={settings.notify_before_lesson} 
                      onChange={() => toggle('notify_before_lesson')}
                    />
                    <span className={styles.slider}></span>
                  </label>
                </div>

                {settings.notify_before_lesson && (
                  <div className={styles.subSetting}>
                    <Clock size={16} />
                    <span>За</span>
                    <input 
                      type="number" 
                      min="5" 
                      max="120"
                      step="5"
                      className={styles.numberInput}
                      value={settings.before_minutes}
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
                onClick={() => onSave(settings)}
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

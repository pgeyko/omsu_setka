import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Bell, 
  School,
  User,
  MapPin,
  Settings,
  Menu
} from 'lucide-react';
import { GlassCard } from '../components/ui/GlassCard';
import { useSubscriptionsStore } from '../store/useSubscriptions';
import { useSidebarStore } from '../store/useSidebar';
import { NotificationSettingsModal } from '../components/ui/NotificationSettingsModal';
import { getNotificationSettings, updateNotificationSettings, unsubscribeFromNotifications } from '../api/client';
import type { NotificationSettings } from '../api/client';
import { Toast } from '../components/ui/Toast';
import styles from './SettingsPage.module.css';

const defaultNotificationSettings: NotificationSettings = {
  notify_on_change: true,
  notify_daily_digest: false,
  digest_time: '19:00',
  subgroup: ''
};

export const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { subscriptions, removeSubscription, getToken } = useSubscriptionsStore();
  const { open: openSidebar } = useSidebarStore();
  
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [activeSubscription, setActiveSubscription] = useState<{id: number, type: string, name: string} | null>(null);
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings | null>(null);
  const [isSettingsLoading, setIsSettingsLoading] = useState(false);
  
  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);

  const handleOpenSubscription = async (sub: {id: number, type: string, name: string}) => {
    const token = getToken(sub.id, sub.type);
    if (!token) {
      setToastMessage('Отсутствует токен подписки');
      setShowToast(true);
      return;
    }

    setActiveSubscription(sub);
    setIsSettingsLoading(true);
    setIsSettingsModalOpen(true);
    
    try {
      const settings = await getNotificationSettings(token, sub.type, sub.id);
      setNotificationSettings(settings);
    } catch {
      setToastMessage('Ошибка при загрузке настроек');
      setShowToast(true);
      setIsSettingsModalOpen(false);
    } finally {
      setIsSettingsLoading(false);
    }
  };

  const handleSaveSettings = async (settings: NotificationSettings) => {
    if (!activeSubscription) return;
    setIsSettingsLoading(true);
    try {
      await updateNotificationSettings(settings);
      setToastMessage('Настройки сохранены');
      setShowToast(true);
      setIsSettingsModalOpen(false);
    } catch (error) {
      console.error('Failed to save settings:', error);
      setToastMessage('Не удалось сохранить настройки');
      setShowToast(true);
    } finally {
      setIsSettingsLoading(false);
    }
  };

  const handleUnsubscribe = async (token: string, type: string, id: number) => {
    setIsSettingsLoading(true);
    try {
      await unsubscribeFromNotifications(token, type, id);
      removeSubscription(id, type);
      localStorage.removeItem(`fcm_token_${type}_${id}`);
      
      setToastMessage('Подписка отменена');
      setShowToast(true);
      setIsSettingsModalOpen(false);
    } catch (error) {
      console.error('Unsubscribe error:', error);
      setToastMessage('Ошибка при отписке');
      setShowToast(true);
    } finally {
      setIsSettingsLoading(false);
    }
  };

  const handleUnsubscribeProxy = () => {
    if (activeSubscription) {
      const token = getToken(activeSubscription.id, activeSubscription.type);
      if (token) {
        handleUnsubscribe(token, activeSubscription.type, activeSubscription.id);
      }
    }
  };

  const renderIcon = (type: string) => {
    switch (type) {
      case 'group': return <School size={20} />;
      case 'tutor': return <User size={20} />;
      case 'auditory': return <MapPin size={20} />;
      default: return <Bell size={20} />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'group': return 'Группа';
      case 'tutor': return 'Преподаватель';
      case 'auditory': return 'Аудитория';
      default: return 'Объект';
    }
  };

  return (
    <div className="app-container animate-fade-in">
      <Toast message={toastMessage} isVisible={showToast} onClose={() => setShowToast(false)} />
      
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button onClick={() => navigate(-1)} className={styles.backBtn}>
              <ArrowLeft size={24} />
            </button>
            <h1 className={styles.title}>Настройки</h1>
          </div>
          <button
            className={`${styles.backBtn} mobile-only`}
            onClick={openSidebar}
            aria-label="Открыть меню"
          >
            <Menu size={24} />
          </button>
        </div>
      </header>

      <main className={styles.content}>
        
        {/* Notifications Section */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Bell size={20} className={styles.sectionIcon} />
            Уведомления
          </h2>
          
          <div className={styles.subList}>
            {subscriptions.length === 0 ? (
              <GlassCard className={styles.emptyCard}>
                <div className={styles.emptyState}>
                  <Bell size={32} style={{ opacity: 0.3 }} />
                  <p>У вас пока нет активных подписок. Вы можете подписаться на изменения в расписании на странице группы или преподавателя.</p>
                </div>
              </GlassCard>
            ) : (
              subscriptions.map(sub => (
                <GlassCard 
                  key={`${sub.type}-${sub.id}`}
                  className={styles.subCard}
                  onClick={() => handleOpenSubscription(sub)}
                >
                  <div className={styles.subInfo}>
                    <div className={styles.subIcon}>
                      {renderIcon(sub.type)}
                    </div>
                    <div className={styles.subDetails}>
                      <span className={styles.subName}>{sub.name}</span>
                      <span className={styles.subType}>{getTypeLabel(sub.type)}</span>
                    </div>
                  </div>
                  <div className={styles.subAction}>
                    <Settings size={20} />
                  </div>
                </GlassCard>
              ))
            )}
          </div>
        </section>

      </main>

      <NotificationSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        onSave={handleSaveSettings}
        onUnsubscribe={handleUnsubscribeProxy}
        initialSettings={notificationSettings || defaultNotificationSettings}
        isLoading={isSettingsLoading}
      />
    </div>
  );
};

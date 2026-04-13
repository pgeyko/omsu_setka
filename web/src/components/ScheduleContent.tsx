import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { ArrowLeft, MapPin, User, Clock, X, Menu, Search } from 'lucide-react';
import { GlassCard } from '../components/ui/GlassCard';
import { 
  fetchSchedule, 
  TIME_SLOTS, 
  subscribeToNotifications, 
  unsubscribeFromNotifications, 
  fetchChanges, 
  getICalUrl,
  getNotificationSettings,
  updateNotificationSettings
} from '../api/client';
import { requestForToken, onMessageListener } from '../utils/firebase';
import type { Day, Lesson } from '../api/client';
import { useFavoritesStore } from '../store/useFavorites';
import { useSidebarStore } from '../store/useSidebar';
import { Toast } from '../components/ui/Toast';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { FloatingActions } from '../components/ui/FloatingActions';
import { CustomDatePicker } from '../components/ui/CustomDatePicker';
import { ICalModal } from '../components/ui/ICalModal';
import { NotificationSettingsModal } from '../components/ui/NotificationSettingsModal';
import styles from '../pages/ScheduleView.module.css';

const parseDate = (dateStr: string) => {
  const [d, m, y] = dateStr.split('.').map(Number);
  return new Date(y, m - 1, d);
};

const getMonday = (d: Date) => {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(date.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
};

const getDefaultDate = () => {
  const now = new Date();
  const day = now.getDay(); // 0 - Sun, 1 - Mon ... 6 - Sat
  const hour = now.getHours();

  const defaultDate = new Date(now);

  // 1. Sunday -> Tomorrow (Monday)
  if (day === 0) {
    defaultDate.setDate(now.getDate() + 1);
  } 
  // 2. Saturday evening (>= 18:00) -> Monday (+2 days)
  else if (day === 6 && hour >= 18) {
    defaultDate.setDate(now.getDate() + 2);
  }
  // 3. Weekday evening (>= 18:00) -> Tomorrow
  else if (hour >= 18) {
    defaultDate.setDate(now.getDate() + 1);
  }

  return defaultDate;
};

const formatWeekRange = (monday: Date) => {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  if (monday.getMonth() === sunday.getMonth()) {
    return `${monday.getDate()} – ${sunday.getDate()} ${monday.toLocaleDateString('ru-RU', { month: 'long' })}`;
  }
  return `${monday.getDate()} ${monday.toLocaleDateString('ru-RU', { month: 'short' })} – ${sunday.getDate()} ${monday.toLocaleDateString('ru-RU', { month: 'short' })}`;
};

interface ScheduleContentProps {
  entityType: string;
  entityID: number;
  initialName?: string;
  showBackButton?: boolean;
}

export const ScheduleContent: React.FC<ScheduleContentProps> = ({ 
  entityType, 
  entityID, 
  initialName = '',
  showBackButton = true
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  // Helper
  const parseYYYYMMDD = (str: string | null) => {
    if (!str) return null;
    const [y, m, d] = str.split('-').map(Number);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
    return new Date(y, m - 1, d);
  };

  const [searchParams, setSearchParams] = useSearchParams();
  const weekParam = searchParams.get('week');

  // State
  const [schedule, setSchedule] = useState<Day[]>([]); // holds only the active week
  const [loading, setLoading] = useState(true);
  const [activeDayIdx, setActiveDayIdx] = useState(0);
  const [dateFilter, setDateFilter] = useState('');
  
  const [activeWeekStart, setActiveWeekStart] = useState<Date>(() => {
    const fromURL = parseYYYYMMDD(weekParam);
    if (fromURL) return getMonday(fromURL);
    return getMonday(getDefaultDate());
  });

  const [selectedGroup, setSelectedGroup] = useState<Lesson[] | null>(null);
  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');
  const [showSubgroupDrawer, setShowSubgroupDrawer] = useState(false);
  const [isConfirmLoading, setIsConfirmLoading] = useState(false);
  const [isICalModalOpen, setIsICalModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isSettingsLoading, setIsSettingsLoading] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState({
    notify_on_change: true,
    notify_daily_digest: false,
    digest_time: '19:00',
    notify_before_lesson: false,
    before_minutes: 30
  });

  // Confirm Modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  // Favorites Store
  const { addFavorite, removeFavorite, isFavorite, subgroup, setSubgroup, pinnedEntity, pinEntity, unpinEntity } = useFavoritesStore();

  // Sidebar Store
  const { open: openSidebar } = useSidebarStore();

  // Notifications state
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [hasNewChanges, setHasNewChanges] = useState(false);

  useEffect(() => {
    const savedToken = localStorage.getItem(`fcm_token_${entityType}_${entityID}`);
    if (savedToken) {
      setIsSubscribed(true);
    }
  }, [entityType, entityID]);

  useEffect(() => {
    if (entityID > 0) {
      fetchChanges(entityType, entityID).then(changes => {
        if (changes && changes.length > 0) {
          setHasNewChanges(true);
        }
      }).catch(console.error);
    }
  }, [entityType, entityID]);

  useEffect(() => {
    onMessageListener().then((payload: any) => {
      setToastMessage(`Уведомление: ${payload.notification.title}`);
      setShowToast(true);
    }).catch(err => console.log('failed: ', err));
  }, []);

  const toggleNotifications = async () => {
    const storageKey = `fcm_token_${entityType}_${entityID}`;
    if (isSubscribed) {
      handleOpenSettings();
    } else {
      setConfirmModal({
        isOpen: true,
        title: 'Включить уведомления?',
        message: 'Мы будем присылать push-уведомления, если в расписании этой группы произойдут изменения.',
        onConfirm: async () => {
          setIsConfirmLoading(true);
          try {
            const token = await requestForToken();
            if (token) {
              await subscribeToNotifications(token, entityType, entityID);
              localStorage.setItem(storageKey, token);
              setIsSubscribed(true);
              setToastMessage('Уведомления включены!');
            } else {
              setToastMessage('Не удалось получить разрешение на уведомления');
            }
            setShowToast(true);
            setConfirmModal(prev => ({ ...prev, isOpen: false }));
          } catch {
            setToastMessage('Ошибка при подписке');
            setShowToast(true);
          } finally {
            setIsConfirmLoading(false);
          }
        }
      });
    }
  };

  const handleExportICal = () => {
    setIsICalModalOpen(true);
  };

  const handleDownloadICal = () => {
    const url = getICalUrl(entityType, entityID);
    window.location.href = url;
    setIsICalModalOpen(false);
    setToastMessage('Загрузка началась');
    setShowToast(true);
  };

  const handleCopyICalLink = () => {
    const url = getICalUrl(entityType, entityID);
    const webcalUrl = url.replace(/^https?:\/\//, 'webcal://');
    navigator.clipboard.writeText(webcalUrl);
    setIsICalModalOpen(false);
    setToastMessage('Ссылка скопирована!');
    setShowToast(true);
  };

  const handleOpenSettings = async () => {
    const token = localStorage.getItem(`fcm_token_${entityType}_${entityID}`);
    if (!token) return;
    
    setIsSettingsLoading(true);
    setIsSettingsModalOpen(true);
    try {
      const settings = await getNotificationSettings(token, entityType, entityID);
      setNotificationSettings(settings);
    } catch {
      setToastMessage('Ошибка при загрузке настроек');
      setShowToast(true);
    } finally {
      setIsSettingsLoading(false);
    }
  };

  const handleSaveSettings = async (settings: any) => {
    setIsSettingsLoading(true);
    try {
      await updateNotificationSettings({
        ...settings,
        fcm_token: localStorage.getItem(`fcm_token_${entityType}_${entityID}`),
        entity_type: entityType,
        entity_id: entityID
      });
      setToastMessage('Настройки сохранены');
      setShowToast(true);
      setIsSettingsModalOpen(false);
    } catch {
      setToastMessage('Ошибка при сохранении');
      setShowToast(true);
    } finally {
      setIsSettingsLoading(false);
    }
  };

  const handleUnsubscribe = async () => {
    const storageKey = `fcm_token_${entityType}_${entityID}`;
    setIsConfirmLoading(true);
    try {
      const token = localStorage.getItem(storageKey);
      if (token) {
        await unsubscribeFromNotifications(token, entityType, entityID);
        localStorage.removeItem(storageKey);
      }
      setIsSubscribed(false);
      setIsSettingsModalOpen(false);
      setToastMessage('Уведомления отключены');
      setShowToast(true);
    } catch {
      setToastMessage('Ошибка при отключении');
      setShowToast(true);
    } finally {
      setIsConfirmLoading(false);
    }
  };

  const [detectedSubgroups, setDetectedSubgroups] = useState<string[]>([]);

  const getSubgroupFromText = (text: string | undefined) => {
    if (!text) return null;
    const slashMatch = text.match(/\/(\d+)$/);
    if (slashMatch) return slashMatch[1];
    const wordMatch = text.match(/(\d+)\s*(?:подгруппа|подгр|п\/г)/i);
    if (wordMatch) return wordMatch[1];
    return null;
  };

  useEffect(() => {
    if (schedule.length > 0 && entityType === 'group') {
      const subs = new Set<string>();
      schedule.forEach(day => {
        day.lessons.forEach(lesson => {
          const s1 = getSubgroupFromText(lesson.subgroupName);
          const s2 = getSubgroupFromText(lesson.group);
          if (s1) subs.add(s1);
          if (s2) subs.add(s2);
        });
      });
      setDetectedSubgroups(Array.from(subs).sort());
    }
  }, [schedule, entityType]);

  const handleBack = () => {
    if (location.key === 'default') {
      navigate('/');
    } else {
      navigate(-1);
    }
  };

  const isLessonForSubgroup = (lesson: Lesson) => {
    if (!subgroup || entityType !== 'group') return true;
    const lessonSubgroup = getSubgroupFromText(lesson.subgroupName) || getSubgroupFromText(lesson.group);
    if (lessonSubgroup) {
      return lessonSubgroup === subgroup;
    }
    return true;
  };

  const getHighlightClass = (type: string) => {
    if (type.includes('Экзамен')) return styles.examHighlight;
    if (type.includes('Консультация')) return styles.consultHighlight;
    if (type.includes('Зачет')) return styles.testHighlight;
    return '';
  };

  const getTypeColorClass = (type: string) => {
    if (type.includes('Лаб')) return styles.labHighlightText;
    if (type.includes('Прак')) return styles.pracHighlightText;
    return '';
  };

  useEffect(() => {
    if (selectedGroup) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [selectedGroup]);

  const prefixes: Record<string, string> = {
    'group': 'Группа',
    'tutor': 'Преподаватель',
    'auditory': 'Аудитория'
  };
  const [entityName, setEntityName] = useState(initialName || (prefixes[entityType] ? `${prefixes[entityType]}: ID ${entityID}` : `ID ${entityID}`));
  const favorite = isFavorite(entityID, entityType);

  const [refreshing, setRefreshing] = useState(false);
  const [startY, setStartY] = useState(0);
  const [pullDistance, setPullDistance] = useState(0);

  const [paginationMeta, setPaginationMeta] = useState({ hasPrev: false, hasNext: false });

  const loadData = React.useCallback(async (isRefresh = false, targetWeekStart?: Date) => {
    const weekToFetch = targetWeekStart || activeWeekStart;
    const weekStartStr = weekToFetch.toISOString().split('T')[0];

    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    
    try {
      const resp = await fetchSchedule(entityType, entityID, weekStartStr);
      const data = resp.data;
      const sortedData = [...data].sort((a, b) => parseDate(a.day).getTime() - parseDate(b.day).getTime());
      
      setSchedule(sortedData);
      setPaginationMeta({ hasPrev: resp.has_prev, hasNext: resp.has_next });

      if (!initialName && sortedData.length > 0) {
        // ... (preserving logic for entityName detection)
        for (const day of sortedData) {
          let found = false;
          for (const lesson of day.lessons) {
            if (entityType === 'group' && lesson.group) {
              const cleanName = lesson.group.replace(/^(Группа|Преподаватель|Аудитория):\s*/gi, '');
              setEntityName(`${prefixes[entityType] || ''}: ${cleanName}`);
              found = true;
              break;
            }
            if (entityType === 'tutor' && lesson.teacher) {
              const cleanName = lesson.teacher.replace(/^(Группа|Преподаватель|Аудитория):\s*/gi, '');
              setEntityName(`${prefixes[entityType] || ''}: ${cleanName}`);
              found = true;
              break;
            }
          }
          if (found) break;
        }
      }

      // Prefetch next week
      if (resp.has_next) {
        const nextMonday = new Date(weekToFetch);
        nextMonday.setDate(weekToFetch.getDate() + 7);
        fetchSchedule(entityType, entityID, nextMonday.toISOString().split('T')[0]).catch(() => {});
      }

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [entityType, entityID, initialName, activeWeekStart]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY <= 0) setStartY(e.touches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (startY > 0) {
      const distance = e.touches[0].clientY - startY;
      if (distance > 0) setPullDistance(Math.min(distance, 80));
    }
  };

  const handleTouchEnd = () => {
    if (pullDistance >= 60) loadData(true);
    setStartY(0);
    setPullDistance(0);
  };

  useEffect(() => {
    let weekStart = activeWeekStart;
    if (dateFilter) {
      weekStart = getMonday(new Date(dateFilter));
      setActiveWeekStart(weekStart);
      setSearchParams({ week: weekStart.toISOString().split('T')[0] });
    }
    
    if (dateFilter) {
      const filterDate = new Date(dateFilter);
      const idx = schedule.findIndex(d => parseDate(d.day).toDateString() === filterDate.toDateString());
      setActiveDayIdx(idx !== -1 ? idx : 0);
    } else {
      const defaultDate = getDefaultDate();
      const idx = schedule.findIndex(d => parseDate(d.day).toDateString() === defaultDate.toDateString());
      setActiveDayIdx(idx !== -1 ? idx : 0);
    }
  }, [activeWeekStart, dateFilter, schedule, setSearchParams]);

  // Sync state with URL when it changes
  useEffect(() => {
    const urlDate = parseYYYYMMDD(weekParam);
    if (urlDate) {
      const monday = getMonday(urlDate);
      if (monday.getTime() !== activeWeekStart.getTime()) {
        setActiveWeekStart(monday);
      }
    }
  }, [weekParam, activeWeekStart]);

  const changeWeek = (direction: number) => {
    const newMonday = new Date(activeWeekStart);
    newMonday.setDate(activeWeekStart.getDate() + direction * 7);
    setActiveWeekStart(newMonday);
    setSearchParams({ week: newMonday.toISOString().split('T')[0] });
    setDateFilter('');
  };

  const toggleFavorite = () => {
    if (favorite) {
      if (pinnedEntity?.id === entityID && pinnedEntity?.type === entityType) unpinEntity();
      removeFavorite(entityID, entityType);
    } else {
      addFavorite({ id: entityID, type: entityType as any, name: entityName });
      const performPin = () => {
        setIsConfirmLoading(true);
        setTimeout(() => {
          pinEntity({ id: entityID, type: entityType as any, name: entityName });
          setToastMessage('Закреплено на главной!');
          setShowToast(true);
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          setIsConfirmLoading(false);
        }, 400);
      };
      if (!pinnedEntity) {
        setConfirmModal({
          isOpen: true,
          title: 'Закрепить на главной?',
          message: `Сделать расписание ${entityName} главным? Оно будет открываться сразу при входе на сайт.`,
          onConfirm: performPin
        });
      } else if (pinnedEntity.id !== entityID || pinnedEntity.type !== entityType) {
        setConfirmModal({
          isOpen: true,
          title: 'Заменить главную группу?',
          message: `Текущая главная группа — ${pinnedEntity.name}. Заменить её на ${entityName}?`,
          onConfirm: performPin
        });
      }
    }
  };

  const handleShare = async () => {
    let url = window.location.href;
    if (window.location.pathname === '/') {
      url = `${window.location.origin}/schedule/${entityType}/${entityID}`;
    }
    const shareData = {
      title: `Расписание: ${entityName}`,
      text: `Посмотри расписание для ${entityName} в Setka`,
      url: url
    };
    try {
      if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
        await navigator.share(shareData);
      } else {
        await copyToClipboard(url);
      }
    } catch (err) {
      if ((err as any).name !== 'AbortError') await copyToClipboard(url);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }
      setToastMessage('Ссылка скопирована!');
      setShowToast(true);
    } catch (err) { console.error('Copy failed', err); }
  };

  const isCurrentLesson = (timeNum: number, isToday: boolean) => {
    if (!isToday || !TIME_SLOTS[timeNum]) return false;
    const now = new Date();
    const { start, end } = TIME_SLOTS[timeNum];
    const [hStart, mStart] = start.replace('.', ':').split(':').map(Number);
    const [hEnd, mEnd] = end.replace('.', ':').split(':').map(Number);
    const startDate = new Date(); startDate.setHours(hStart, mStart, 0);
    const endDate = new Date(); endDate.setHours(hEnd, mEnd, 0);
    return now >= startDate && now <= endDate;
  };

  if (loading && !refreshing) return (
    <div className="app-container">
      <nav className={styles.nav}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
          {showBackButton ? (
            <div className={styles.backBtn} style={{ opacity: 0.5 }}><ArrowLeft size={24} /></div>
          ) : (
            <div style={{ width: 44 }} />
          )}
        </div>
        <div className={styles.headerTitle} style={{ display: 'block' }}>
          <h2 className={styles.entityNameDesktop}>{entityName}</h2>
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
          {!showBackButton && (
            <div className={`${styles.navActions} ${styles.mobileOnly}`}>
              <div className={styles.themeToggle} style={{ opacity: 0.5 }}><Search size={20} /></div>
              <div className={styles.themeToggle} style={{ opacity: 0.5 }}><Menu size={20} /></div>
            </div>
          )}
          <div className={styles.desktopOnly} style={{ width: 44 }}></div>
        </div>
      </nav>
      <div className={styles.viewModeHeader}><div className={styles.skeletonTitle}></div></div>
      <div className={styles.daySelector}>{[1, 2, 3, 4, 5, 6].map(i => <div key={i} className={styles.skeletonDayTab}></div>)}</div>
      <main className={styles.content}>
        <div className={styles.lessonList}>
          {[1, 2, 3].map(i => (
            <GlassCard key={i} className={`${styles.lessonCard} ${styles.skeletonCard}`}>
              <div className={styles.skeletonTime}></div>
              <div className={styles.lessonInfo}>
                <div className={styles.skeletonLine} style={{ width: '80%' }}></div>
                <div className={styles.skeletonLine} style={{ width: '40%' }}></div>
              </div>
            </GlassCard>
          ))}
        </div>
      </main>
    </div>
  );

  const currentDay = schedule[activeDayIdx];
  const isToday = currentDay ? parseDate(currentDay.day).toDateString() === new Date().toDateString() : false;

  return (
    <>
      <div className="app-container animate-fade-in" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
        <div className={styles.pullToRefresh} style={{ transform: `translateY(${pullDistance}px)`, opacity: pullDistance / 60 }}>
          <div className={`${styles.ptrSpinner} ${refreshing ? styles.spinning : ''}`}><ArrowLeft size={20} style={{ transform: 'rotate(-90deg)' }} /></div>
        </div>
        <Toast message={toastMessage} isVisible={showToast} onClose={() => setShowToast(false)} />
        <header className={styles.stickyHeader}>
          <nav className={styles.nav}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
              {showBackButton ? (
                <motion.button 
                  whileHover={{ scale: 1.05 }} 
                  whileTap={{ scale: 0.95 }} 
                  onClick={handleBack} 
                  className={styles.backBtn}
                >
                  <ArrowLeft size={24} />
                </motion.button>
              ) : (
                <h2 className={styles.entityNameMobile}>{entityName}</h2>
              )}
            </div>

            <div className={styles.headerTitle} style={{ display: showBackButton ? 'block' : undefined }}>
              <h2 className={styles.entityNameDesktop}>{entityName}</h2>
            </div>

            <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
              {!showBackButton && (
                <div className={`${styles.navActions} ${styles.mobileOnly}`}>
                  <button
                    className={styles.themeToggle}
                    onClick={() => navigate('/search')}
                    aria-label="Поиск"
                  >
                    <Search size={20} />
                  </button>
                  <button
                    className={styles.themeToggle}
                    onClick={openSidebar}
                    aria-label="Открыть меню"
                  >
                    <Menu size={20} />
                  </button>
                </div>
              )}
              <div className={styles.desktopOnly} style={{ width: 44 }}></div>
            </div>
          </nav>
        </header>

        <div className={styles.weekSelector}>
          <button 
            className={`${styles.weekNav} ${!paginationMeta.hasPrev ? styles.navDisabled : ''}`} 
            onClick={() => changeWeek(-1)}
            disabled={!paginationMeta.hasPrev}
          >
            ←
          </button>
          <div className={styles.weekInfo}><span className={styles.weekLabel}>{formatWeekRange(activeWeekStart)}</span></div>
          <button 
            className={`${styles.weekNav} ${!paginationMeta.hasNext ? styles.navDisabled : ''}`} 
            onClick={() => changeWeek(1)}
            disabled={!paginationMeta.hasNext}
          >
            →
          </button>
          <CustomDatePicker value={dateFilter} onChange={setDateFilter} />
        </div>

        {viewMode === 'day' && (
          <div className={styles.daySelector}>
            {schedule.map((day, idx) => {
              const date = parseDate(day.day);
              return (
                <button key={day.day} className={`${styles.dayTab} ${activeDayIdx === idx ? styles.activeTab : ''}`} onClick={() => setActiveDayIdx(idx)}>
                  <span className={styles.tabDay}>{['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][date.getDay()]}</span>
                  <span className={styles.tabDate}>{date.getDate()}</span>
                </button>
              );
            })}
            {schedule.length === 0 && <div className={styles.noFilterResults}>На этой неделе занятий нет</div>}
          </div>
        )}

        {viewMode === 'day' ? (
          <main className={styles.content}>
            <div className={styles.lessonList}>
              {currentDay?.lessons.length === 0 ? <div className={styles.empty}>Пар нет, можно отдыхать! 🥳</div> : (
                (() => {
                  const grouped = currentDay?.lessons.reduce((acc: any, lesson: any) => {
                    if (!acc[lesson.time]) acc[lesson.time] = [];
                    acc[lesson.time].push(lesson);
                    return acc;
                  }, {} as Record<number, Lesson[]>);
                  const timesList = Object.keys(grouped || {}).map(Number);
                  if (timesList.length === 0) return null;
                  const maxTime = Math.min(8, Math.max(...timesList));
                  const slotsToRender = [];
                  for (let t = 1; t <= maxTime; t++) slotsToRender.push({ time: t, rawLessons: (grouped as any)[t] });
                  return slotsToRender.map(({ time, rawLessons }) => {
                    const active = isCurrentLesson(time, isToday);
                    const times = TIME_SLOTS[time] || { start: '??:??', end: '??:??' };
                    if (!rawLessons || rawLessons.length === 0) {
                      return (
                        <GlassCard key={time} className={`${styles.lessonCard} ${active ? styles.activeLesson : ''} ${styles.emptySlotCard}`} glow={active}>
                          <div className={styles.lessonTime}><div className={styles.timeStart}>{times.start}</div><div className={styles.timeDivider}>–</div><div className={styles.timeEnd}>{times.end}</div></div>
                          <div className={styles.lessonInfo}><h3 className={styles.discipline} style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Нет пары</h3>{active && <div className={styles.status}><Clock size={12} /> Сейчас идет</div>}</div>
                        </GlassCard>
                      );
                    }
                    const mergedMap = new Map<string, Lesson & { groups?: string[] }>();
                    rawLessons.forEach((l: any) => {
                      if (!isLessonForSubgroup(l)) return;
                      const key = `${l.lesson}-${l.type_work}-${l.teacher}-${l.auditCorps}`;
                      if (mergedMap.has(key)) {
                        const existing = mergedMap.get(key)!;
                        if (l.group && existing.groups && !existing.groups.includes(l.group)) existing.groups.push(l.group);
                        else if (l.group && !existing.groups) existing.groups = [existing.group || '', l.group];
                      } else mergedMap.set(key, { ...l, groups: l.group ? [l.group] : [] });
                    });
                    const lessons = Array.from(mergedMap.values());
                    if (lessons.length === 0) return null;
                    const isMultiple = lessons.length > 1;
                    return (
                      <GlassCard key={time} className={`${styles.lessonCard} ${active ? styles.activeLesson : ''} ${isMultiple ? styles.multiCard : ''} ${!isMultiple ? getHighlightClass(lessons[0].type_work) : ''}`} glow={active} onClick={() => isMultiple && setSelectedGroup(lessons)}>
                        <div className={styles.lessonTime}><div className={styles.timeStart}>{times.start}</div><div className={styles.timeDivider}>–</div><div className={styles.timeEnd}>{times.end}</div></div>
                        <div className={styles.lessonInfo}>
                          {isMultiple ? (
                            <>
                              <h3 className={styles.discipline}>Несколько занятий ({lessons.length})</h3>
                              <div className={styles.meta}>
                                {lessons.slice(0, 3).map((l, i) => <span key={i} className={styles.multiTitle}>{l.lesson.length > 30 ? l.lesson.slice(0, 30) + '...' : l.lesson}</span>)}
                                {lessons.length > 3 && <span className={styles.more}>и еще {lessons.length - 3}...</span>}
                                <div className={styles.clickToView}>Нажмите, чтобы посмотреть все</div>
                              </div>
                            </>
                          ) : (
                            <>
                              <h3 className={styles.discipline}>{lessons[0].lesson}</h3>
                              <div className={styles.meta}>
                                <span className={`${styles.type} ${getHighlightClass(lessons[0].type_work)} ${getTypeColorClass(lessons[0].type_work)}`}>{lessons[0].type_work}</span>
                                {lessons[0].teacher && <span><User size={12} /> {lessons[0].teacher}</span>}
                                {lessons[0].auditCorps && <span><MapPin size={12} /> {lessons[0].auditCorps}</span>}
                                {lessons[0].subgroupName && <span className={styles.subgroup}>{lessons[0].subgroupName}</span>}
                              </div>
                            </>
                          )}
                          {active && <div className={styles.status}><Clock size={12} /> Сейчас идет</div>}
                        </div>
                        {isMultiple && <div className={styles.stacks}></div>}
                      </GlassCard>
                    );
                  });
                })()
              )}
            </div>
          </main>
        ) : (
          <div className={styles.weeklyGrid}>
            <div className={styles.gridHeader}>Время</div>
            {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'].map(dayName => <div key={dayName} className={styles.gridHeader}>{dayName}</div>)}
            {Object.entries(TIME_SLOTS).map(([slotIdx, times]) => (
              <React.Fragment key={slotIdx}>
                <div className={styles.gridRowLabel}><span>{times.start}</span><span>{times.end}</span></div>
                {[1, 2, 3, 4, 5, 6].map(dayOffset => {
                  const dayDate = new Date(activeWeekStart);
                  dayDate.setDate(activeWeekStart.getDate() + dayOffset - 1);
                  const dayData = schedule.find(d => parseDate(d.day).toDateString() === dayDate.toDateString());
                  const slotLessons = (dayData?.lessons.filter(l => l.time === Number(slotIdx)) || []).filter(isLessonForSubgroup);
                  return (
                    <div key={dayOffset} className={styles.gridCell}>
                      {slotLessons.length > 1 ? (
                        <div className={styles.gridLesson} onClick={() => setSelectedGroup(slotLessons)} style={{ borderLeftColor: 'var(--accent-color)', background: 'rgba(170, 59, 255, 0.1)', cursor: 'pointer' }}>
                          <span className={styles.gridLessonType}>Несколько</span>Занятий ({slotLessons.length})
                          <div style={{ opacity: 0.8, fontSize: '9px', marginTop: '4px', textTransform: 'uppercase', fontStyle: 'italic' }}>Нажмите, чтобы открыть</div>
                        </div>
                      ) : slotLessons.map((l, i) => (
                        <div key={i} className={styles.gridLesson} onClick={() => setSelectedGroup([l])} style={{ borderLeftColor: l.type_work.includes('Экзамен') ? '#f59e0b' : l.type_work.includes('Лек') ? '#3b82f6' : l.type_work.includes('Прак') ? '#ef4444' : '#10b981', background: l.type_work.includes('Экзамен') ? 'rgba(245, 158, 11, 0.1)' : undefined, cursor: 'pointer' }}>
                          <span className={`${styles.gridLessonType} ${getTypeColorClass(l.type_work)}`}>{l.type_work}</span>{l.lesson}
                          <div style={{ opacity: 0.6, fontSize: '9px', marginTop: '2px' }}>{l.auditCorps}</div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
      <FloatingActions 
        viewMode={viewMode}
        setViewMode={setViewMode}
        isSubscribed={isSubscribed}
        onToggleNotifications={toggleNotifications}
        isFavorite={favorite}
        onToggleFavorite={toggleFavorite}
        onShowSubgroups={entityType === 'group' ? () => setShowSubgroupDrawer(true) : undefined}
        isSubgroupActive={!!subgroup}
        onShare={handleShare}
        onExportICal={handleExportICal}
        hasNewChanges={hasNewChanges}
      />

      {createPortal(
        <AnimatePresence>
          {showSubgroupDrawer && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} className={styles.modalOverlay} onClick={() => setShowSubgroupDrawer(false)}>
              <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ duration: 0.4 }} className={styles.modalContent} onClick={e => e.stopPropagation()}>
                <div className={styles.modalHeader}><div className={styles.modalTimeTitle}><h3>Выбор подгруппы</h3></div><button onClick={() => setShowSubgroupDrawer(false)} className={styles.closeBtn}><X size={24} /></button></div>
                <div className={styles.subgroupOptions}>
                  <button onClick={() => { setSubgroup(null); setShowSubgroupDrawer(false); }} className={`${styles.subgroupOption} ${subgroup === null ? styles.optionActive : ''}`}>Все занятия</button>
                  {detectedSubgroups.map(num => (
                    <button key={num} onClick={() => { setSubgroup(num); setShowSubgroupDrawer(false); }} className={`${styles.subgroupOption} ${subgroup === num ? styles.optionActive : ''}`}>{num} подгруппа</button>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {createPortal(
        <AnimatePresence>
          {selectedGroup && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} className={styles.modalOverlay} onClick={() => setSelectedGroup(null)}>
              <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ duration: 0.4 }} className={styles.modalContent} onClick={e => e.stopPropagation()}>
                <div className={styles.modalHeader}><div className={styles.modalTimeTitle}><span className={styles.modalTime}>{TIME_SLOTS[selectedGroup[0].time]?.start} – {TIME_SLOTS[selectedGroup[0].time]?.end}</span><h3>Занятия</h3></div><button onClick={() => setSelectedGroup(null)} className={styles.closeBtn}><X size={24} /></button></div>
                <div className={styles.modalList}>
                  {selectedGroup.map((lesson: any, idx: number) => (
                    <GlassCard key={`${lesson.id}-${idx}`} className={styles.modalLessonCard}>
                      <h3 className={styles.discipline}>{lesson.lesson}</h3>
                      <div className={styles.meta}>
                        <span className={`${styles.type} ${getTypeColorClass(lesson.type_work)}`}>{lesson.type_work}</span>
                        {lesson.teacher && <span><User size={12} /> {lesson.teacher}</span>}
                        {lesson.auditCorps && <span><MapPin size={12} /> {lesson.auditCorps}</span>}
                        {lesson.subgroupName && <span className={styles.subgroup}>{lesson.subgroupName}</span>}
                        {lesson.groups && lesson.groups.length > 0 ? (
                          <span className={styles.lessonGroup}><User size={12} /> Группы: {lesson.groups.join(', ')}</span>
                        ) : lesson.group && <span className={styles.lessonGroup}><User size={12} /> Группа: {lesson.group}</span>}
                      </div>
                    </GlassCard>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      <ConfirmModal 
        isOpen={confirmModal.isOpen} 
        title={confirmModal.title} 
        message={confirmModal.message} 
        onConfirm={confirmModal.onConfirm} 
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))} 
        isLoading={isConfirmLoading} 
      />

      <ICalModal 
        isOpen={isICalModalOpen}
        onClose={() => setIsICalModalOpen(false)}
        onDownload={handleDownloadICal}
        onCopyLink={handleCopyICalLink}
        title={entityName}
      />

      <NotificationSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        onSave={handleSaveSettings}
        onUnsubscribe={handleUnsubscribe}
        initialSettings={notificationSettings}
        isLoading={isSettingsLoading}
      />
    </>
  );
};

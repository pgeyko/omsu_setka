import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Star, Share2, MapPin, User, Clock, Printer, LayoutGrid, List } from 'lucide-react';
import { GlassCard } from '../components/ui/GlassCard';
import { fetchSchedule, TIME_SLOTS } from '../api/client';
import type { Day, Lesson } from '../api/client';
import { useFavoritesStore } from '../store/useFavorites';
import { X } from 'lucide-react';
import { Toast } from '../components/ui/Toast';
import { CustomDatePicker } from '../components/ui/CustomDatePicker';
import styles from './ScheduleView.module.css';

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

const getDayName = (date: Date) => {
  return date.toLocaleDateString('ru-RU', { weekday: 'long' });
};

const formatDate = (date: Date) => {
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
};

const formatWeekRange = (monday: Date) => {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  if (monday.getMonth() === sunday.getMonth()) {
    return `${monday.getDate()} – ${sunday.getDate()} ${monday.toLocaleDateString('ru-RU', { month: 'long' })}`;
  }
  return `${monday.getDate()} ${monday.toLocaleDateString('ru-RU', { month: 'short' })} – ${sunday.getDate()} ${sunday.toLocaleDateString('ru-RU', { month: 'short' })}`;
};

export const ScheduleView: React.FC = () => {
  const { type, id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [schedule, setSchedule] = useState<Day[]>([]);
  const [filteredSchedule, setFilteredSchedule] = useState<Day[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDayIdx, setActiveDayIdx] = useState(0);
  const [dateFilter, setDateFilter] = useState('');
  const [activeWeekStart, setActiveWeekStart] = useState<Date>(getMonday(new Date()));
  const [selectedGroup, setSelectedGroup] = useState<Lesson[] | null>(null);
  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');
  const { addFavorite, removeFavorite, isFavorite } = useFavoritesStore();
  
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
  
  const entityID = parseInt(id || '0');
  const entityType = type || 'group';
  
  const prefixes: Record<string, string> = {
    'group': 'Группа',
    'tutor': 'Преподаватель',
    'auditory': 'Аудитория'
  };
  const prefix = prefixes[entityType] || '';
  const initialName = location.state?.name || (prefix ? `${prefix}: ID ${id}` : `ID ${id}`);
  const [entityName, setEntityName] = useState(initialName);
  const favorite = isFavorite(entityID, entityType);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await fetchSchedule(entityType, entityID);
        const sortedData = [...data].sort((a, b) => parseDate(a.day).getTime() - parseDate(b.day).getTime());
        setSchedule(sortedData);
        
        // Try to refine name from schedule data if group info is present
        if (!location.state?.name && sortedData.length > 0) {
           // Look for first lesson with a group or auditory
           for (const day of sortedData) {
             for (const lesson of day.lessons) {
               if (entityType === 'group' && lesson.group && !entityName.includes(lesson.group)) {
                 setEntityName(`Группа: ${lesson.group}`);
                 break;
               }
             }
           }
        }

        // Initial setup
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const monday = getMonday(today);
        setActiveWeekStart(monday);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [entityType, entityID]);

  // Handle filtering by week or specific date
  useEffect(() => {
    let weekStart = activeWeekStart;
    
    if (dateFilter) {
      weekStart = getMonday(new Date(dateFilter));
      setActiveWeekStart(weekStart);
    }

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    const weekDays = schedule.filter(d => {
      const date = parseDate(d.day);
      return date >= weekStart && date < weekEnd;
    });

    setFilteredSchedule(weekDays);

    // Auto-select day
    if (dateFilter) {
      const filterDate = new Date(dateFilter);
      const idx = weekDays.findIndex(d => parseDate(d.day).toDateString() === filterDate.toDateString());
      setActiveDayIdx(idx !== -1 ? idx : 0);
    } else {
      const today = new Date();
      const idx = weekDays.findIndex(d => parseDate(d.day).toDateString() === today.toDateString());
      setActiveDayIdx(idx !== -1 ? idx : 0);
    }
  }, [activeWeekStart, dateFilter, schedule]);

  const changeWeek = (direction: number) => {
    const newMonday = new Date(activeWeekStart);
    newMonday.setDate(activeWeekStart.getDate() + direction * 7);
    setActiveWeekStart(newMonday);
    setDateFilter('');
  };

  const toggleFavorite = () => {
    if (favorite) {
      removeFavorite(entityID, entityType);
    } else {
      addFavorite({ id: entityID, type: entityType as any, name: entityName });
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    const shareData = {
      title: `Расписание: ${entityName}`,
      text: `Посмотри расписание для ${entityName} в ОмГУ Зеркало`,
      url: url
    };
    
    if (navigator.share && /mobile|android|iphone|ipad/i.test(navigator.userAgent)) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        console.error('Error sharing:', err);
      }
    } else {
      await navigator.clipboard.writeText(url);
      setToastMessage('Ссылка скопирована!');
      setShowToast(true);
    }
  };
  
  const handlePrint = () => {
    window.print();
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

  if (loading) return <div className="app-container"><div className={styles.loading}>Загрузка расписания...</div></div>;

  const currentDay = filteredSchedule[activeDayIdx];
  const isToday = currentDay ? parseDate(currentDay.day).toDateString() === new Date().toDateString() : false;

  return (
    <div className="app-container animate-fade-in">
      <nav className={styles.nav}>
        <button onClick={() => navigate(-1)} className={styles.backBtn}><ArrowLeft size={24} /></button>
        <div className={styles.navActions}>
          <button onClick={handlePrint} className={styles.actionBtn} title="Печать"><Printer size={20} /></button>
          <div className={styles.viewToggle}>
            <button 
              onClick={() => setViewMode('day')} 
              className={`${styles.toggleBtn} ${viewMode === 'day' ? styles.toggleActive : ''}`}
              title="День"
            >
              <List size={20} />
            </button>
            <button 
              onClick={() => setViewMode('week')} 
              className={`${styles.toggleBtn} ${viewMode === 'week' ? styles.toggleActive : ''}`}
              title="Неделя"
            >
              <LayoutGrid size={20} />
            </button>
          </div>
          <button onClick={toggleFavorite} className={`${styles.actionBtn} ${favorite ? styles.active : ''}`}>
            <Star size={22} fill={favorite ? 'currentColor' : 'none'} />
          </button>
          <button id="shareBtn" onClick={handleShare} className={styles.actionBtn}><Share2 size={22} /></button>
        </div>
      </nav>

      <div className={styles.weekSelector}>
        <button className={styles.weekNav} onClick={() => changeWeek(-1)}>←</button>
        <div className={styles.weekInfo}>
          <span className={styles.weekLabel}>{formatWeekRange(activeWeekStart)}</span>
        </div>
        <button className={styles.weekNav} onClick={() => changeWeek(1)}>→</button>
        <CustomDatePicker value={dateFilter} onChange={setDateFilter} />
      </div>

      <Toast message={toastMessage} isVisible={showToast} onClose={() => setShowToast(false)} />

      <div className={styles.viewModeHeader}>
        <div className={styles.headerTitleRow}>
          <h2 className={styles.dateTitle}>
            {viewMode === 'day' 
              ? (currentDay ? `${getDayName(parseDate(currentDay.day))}, ${formatDate(parseDate(currentDay.day))}` : 'Нет данных')
              : `Неделя: ${formatWeekRange(activeWeekStart)}`
            }
            <span className={styles.headerSeparator}>•</span>
            <span className={styles.entityNameInline}>{entityName}</span>
          </h2>
        </div>
      </div>

      {viewMode === 'day' ? (
        <>
          <div className={styles.daySelector}>
            {filteredSchedule.map((day, idx) => {
              const date = parseDate(day.day);
              return (
                <button 
                  key={day.day} 
                  className={`${styles.dayTab} ${activeDayIdx === idx ? styles.activeTab : ''}`}
                  onClick={() => setActiveDayIdx(idx)}
                >
                  <span className={styles.tabDay}>
                    {['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][date.getDay()]}
                  </span>
                  <span className={styles.tabDate}>{date.getDate()}</span>
                </button>
              );
            })}
            {filteredSchedule.length === 0 && (
              <div className={styles.noFilterResults}>На этой неделе занятий нет</div>
            )}
          </div>

          <main className={styles.content}>
            <div className={styles.lessonList}>
              {currentDay?.lessons.length === 0 ? (
                <div className={styles.empty}>Пар нет, можно отдыхать! 🥳</div>
              ) : (
                (() => {
                  const grouped = currentDay?.lessons.reduce((acc, lesson) => {
                    if (!acc[lesson.time]) acc[lesson.time] = [];
                    acc[lesson.time].push(lesson);
                    return acc;
                  }, {} as Record<number, Lesson[]>);

                  return Object.entries(grouped || {})
                    .sort(([a], [b]) => Number(a) - Number(b))
                    .map(([timeStr, lessons]) => {
                      const time = Number(timeStr);
                      const active = isCurrentLesson(time, isToday);
                      const times = TIME_SLOTS[time] || { start: '??:??', end: '??:??' };
                      const isMultiple = lessons.length > 1;

                      return (
                        <GlassCard 
                          key={time} 
                          className={`${styles.lessonCard} ${active ? styles.activeLesson : ''} ${isMultiple ? styles.multiCard : ''}`} 
                          glow={active}
                          onClick={() => isMultiple && setSelectedGroup(lessons)}
                        >
                          <div className={styles.lessonTime}>
                            <div className={styles.timeStart}>{times.start}</div>
                            <div className={styles.timeDivider}>–</div>
                            <div className={styles.timeEnd}>{times.end}</div>
                          </div>
                          <div className={styles.lessonInfo}>
                            {isMultiple ? (
                              <>
                                <h3 className={styles.discipline}>Несколько занятий ({lessons.length})</h3>
                                <div className={styles.meta}>
                                  {lessons.slice(0, 3).map((l, i) => (
                                    <span key={i} className={styles.multiTitle}>
                                      {l.lesson.length > 30 ? l.lesson.slice(0, 30) + '...' : l.lesson}
                                    </span>
                                  ))}
                                  {lessons.length > 3 && <span className={styles.more}>и еще {lessons.length - 3}...</span>}
                                  <div className={styles.clickToView}>Нажмите, чтобы посмотреть все</div>
                                </div>
                              </>
                            ) : (
                              <>
                                <h3 className={styles.discipline}>{lessons[0].lesson}</h3>
                                <div className={styles.meta}>
                                  <span className={styles.type}>{lessons[0].type_work}</span>
                                  {lessons[0].teacher && <span><User size={12} /> {lessons[0].teacher}</span>}
                                  {lessons[0].auditCorps && <span><MapPin size={12} /> {lessons[0].auditCorps}</span>}
                                  {lessons[0].subgroupName && <span className={styles.subgroup}>{lessons[0].subgroupName}</span>}
                                </div>
                              </>
                            )}
                            {active && (
                              <div className={styles.status}>
                                <Clock size={12} /> Сейчас идет
                              </div>
                            )}
                          </div>
                          {isMultiple && <div className={styles.stacks}></div>}
                        </GlassCard>
                      );
                    });
                })()
              )}
            </div>
          </main>
        </>
      ) : (
        <div className={styles.weeklyGrid}>
          <div className={styles.gridHeader}>Время</div>
          {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'].map(dayName => (
            <div key={dayName} className={styles.gridHeader}>{dayName}</div>
          ))}
          
          {Object.entries(TIME_SLOTS).map(([slotIdx, times]) => (
            <React.Fragment key={slotIdx}>
              <div className={styles.gridRowLabel}>
                <span>{times.start}</span>
                <span>{times.end}</span>
              </div>
              {[1, 2, 3, 4, 5, 6].map(dayOffset => {
                const dayDate = new Date(activeWeekStart);
                dayDate.setDate(activeWeekStart.getDate() + dayOffset - 1);
                const dayData = filteredSchedule.find(d => parseDate(d.day).toDateString() === dayDate.toDateString());
                const slotLessons = dayData?.lessons.filter(l => l.time === Number(slotIdx)) || [];
                
                return (
                  <div key={dayOffset} className={styles.gridCell}>
                    {slotLessons.length > 1 ? (
                      <div 
                        className={styles.gridLesson}
                        onClick={() => setSelectedGroup(slotLessons)}
                        style={{ borderLeftColor: 'var(--accent-color)', background: 'rgba(170, 59, 255, 0.1)', cursor: 'pointer' }}
                      >
                        <span className={styles.gridLessonType}>Несколько</span>
                        Занятий ({slotLessons.length})
                        <div style={{ opacity: 0.8, fontSize: '9px', marginTop: '4px', textTransform: 'uppercase', fontStyle: 'italic' }}>Нажмите, чтобы открыть</div>
                      </div>
                    ) : slotLessons.map((l, i) => (
                      <div 
                        key={i} 
                        className={styles.gridLesson}
                        onClick={() => setSelectedGroup([l])}
                        style={{ borderLeftColor: l.type_work.includes('Лек') ? '#3b82f6' : l.type_work.includes('Прак') ? '#ef4444' : '#10b981', cursor: 'pointer' }}
                      >
                        <span className={styles.gridLessonType}>{l.type_work}</span>
                        {l.lesson}
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

      {selectedGroup && (
        <div className={styles.modalOverlay} onClick={() => setSelectedGroup(null)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTimeTitle}>
                <span className={styles.modalTime}>{TIME_SLOTS[selectedGroup[0].time]?.start} – {TIME_SLOTS[selectedGroup[0].time]?.end}</span>
                <h3>Занятия</h3>
              </div>
              <button onClick={() => setSelectedGroup(null)} className={styles.closeBtn}><X size={24} /></button>
            </div>
            <div className={styles.modalList}>
              {selectedGroup.map((lesson, idx) => (
                <GlassCard key={`${lesson.id}-${idx}`} className={styles.modalLessonCard}>
                  <h3 className={styles.discipline}>{lesson.lesson}</h3>
                  <div className={styles.meta}>
                    <span className={styles.type}>{lesson.type_work}</span>
                    {lesson.teacher && <span><User size={12} /> {lesson.teacher}</span>}
                    {lesson.auditCorps && <span><MapPin size={12} /> {lesson.auditCorps}</span>}
                    {lesson.subgroupName && <span className={styles.subgroup}>{lesson.subgroupName}</span>}
                    {lesson.group && <span className={styles.lessonGroup}><User size={12} /> Группа: {lesson.group}</span>}
                  </div>
                </GlassCard>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

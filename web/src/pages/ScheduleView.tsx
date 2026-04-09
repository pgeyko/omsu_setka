import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Star, Share2, MapPin, User, Clock, LayoutGrid, List, Layers } from 'lucide-react';
import { GlassCard } from '../components/ui/GlassCard';
import { fetchSchedule, fetchHealth, TIME_SLOTS } from '../api/client';
import type { Day, Lesson, HealthData } from '../api/client';
import { useFavoritesStore } from '../store/useFavorites';
import { X } from 'lucide-react';
import { Toast } from '../components/ui/Toast';
import { CustomDatePicker } from '../components/ui/CustomDatePicker';
import styles from './ScheduleView.module.css';

const formatRelativeTime = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);

  if (diffInMinutes < 1) return 'только что';
  if (diffInMinutes < 60) return `${diffInMinutes} мин назад`;
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours} ч назад`;
  
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
};

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
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [activeDayIdx, setActiveDayIdx] = useState(0);
  const [dateFilter, setDateFilter] = useState('');
  const [activeWeekStart, setActiveWeekStart] = useState<Date>(getMonday(new Date()));
  const [selectedGroup, setSelectedGroup] = useState<Lesson[] | null>(null);
  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');
  const [showSubgroupDrawer, setShowSubgroupDrawer] = useState(false);
  const { addFavorite, removeFavorite, isFavorite, subgroup, setSubgroup } = useFavoritesStore();

  const isLessonForSubgroup = (lesson: Lesson) => {
    if (!subgroup || entityType !== 'group') return true;
    
    const getSubgroupFromText = (text: string | undefined) => {
      if (!text) return null;
      // 1. Look for /X at the end (e.g. "МБС-501-О-01/1")
      const slashMatch = text.match(/\/(\d+)$/);
      if (slashMatch) return slashMatch[1];
      
      // 2. Look for "X подгруппа" or "X п/г"
      const wordMatch = text.match(/(\d+)\s*(?:подгруппа|подгр|п\/г)/i);
      if (wordMatch) return wordMatch[1];

      return null;
    };

    const lessonSubgroup = getSubgroupFromText(lesson.subgroupName) || getSubgroupFromText(lesson.group);

    // If lesson specifies a subgroup, it must match the selected one
    if (lessonSubgroup) {
      return lessonSubgroup === subgroup;
    }
    
    // If no subgroup info found in the lesson, it's a common lesson for all
    return true;
  };

  // Highlight types
  const getHighlightClass = (type: string) => {
    if (type.includes('Экзамен')) return styles.examHighlight;
    if (type.includes('Консультация')) return styles.consultHighlight;
    if (type.includes('Зачет')) return styles.testHighlight;
    if (type.includes('Прак')) return styles.practiceHighlight;
    if (type.includes('Лаб')) return styles.labHighlight;
    if (type.includes('Лек')) return styles.lectureHighlight;
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
  
  useEffect(() => {
    fetchHealth().then(data => setHealthData(data)).catch(console.error);
    const interval = setInterval(() => {
      fetchHealth().then(data => setHealthData(data)).catch(console.error);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

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

  const [refreshing, setRefreshing] = useState(false);
  const [startY, setStartY] = useState(0);
  const [pullDistance, setPullDistance] = useState(0);

  const loadData = React.useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    
    try {
      const data = await fetchSchedule(entityType, entityID);
      const sortedData = [...data].sort((a, b) => parseDate(a.day).getTime() - parseDate(b.day).getTime());
      setSchedule(sortedData);
      
      if (!location.state?.name && sortedData.length > 0) {
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
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [entityType, entityID, location.state?.name]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY <= 0) {
      setStartY(e.touches[0].clientY);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (startY > 0) {
      const distance = e.touches[0].clientY - startY;
      if (distance > 0) {
        setPullDistance(Math.min(distance, 80));
      }
    }
  };

  const handleTouchEnd = () => {
    if (pullDistance >= 60) {
      loadData(true);
    }
    setStartY(0);
    setPullDistance(0);
  };

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
    } catch (err) {
      console.error('Copy failed', err);
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
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
      if ((err as any).name !== 'AbortError') {
        await copyToClipboard(url);
      }
    }
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
        <button onClick={() => navigate(-1)} className={styles.backBtn}><ArrowLeft size={24} /></button>
        <div className={styles.navActions} style={{ width: '120px' }}></div>
      </nav>
      <div className={styles.viewModeHeader}>
        <div className={styles.skeletonTitle}></div>
      </div>
      <div className={styles.daySelector}>
        {[1,2,3,4,5,6].map(i => <div key={i} className={styles.skeletonDayTab}></div>)}
      </div>
      <main className={styles.content}>
        <div className={styles.lessonList}>
          {[1,2,3].map(i => (
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

  const currentDay = filteredSchedule[activeDayIdx];
  const isToday = currentDay ? parseDate(currentDay.day).toDateString() === new Date().toDateString() : false;

  return (
    <>
      <div 
        className="app-container animate-fade-in"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div 
          className={styles.pullToRefresh} 
          style={{ 
            transform: `translateY(${pullDistance}px)`, 
            opacity: pullDistance / 60 
          }}
        >
          <div className={`${styles.ptrSpinner} ${refreshing ? styles.spinning : ''}`}>
             <ArrowLeft size={20} style={{ transform: 'rotate(-90deg)' }}/>
          </div>
        </div>

        <Toast message={toastMessage} isVisible={showToast} onClose={() => setShowToast(false)} />

        <header className={styles.stickyHeader}>
          <nav className={styles.nav}>
            <button onClick={() => navigate(-1)} className={styles.backBtn}><ArrowLeft size={24} /></button>
            <div className={styles.navActions}>
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
              {entityType === 'group' && (
                <button 
                  onClick={() => setShowSubgroupDrawer(true)} 
                  className={`${styles.actionBtn} ${subgroup ? styles.filterActive : ''}`}
                  title="Выбор подгруппы"
                >
                  <Layers size={22} />
                </button>
              )}
              <button onClick={toggleFavorite} className={`${styles.actionBtn} ${favorite ? styles.active : ''}`}>
                <Star size={22} fill={favorite ? 'currentColor' : 'none'} />
              </button>
              <button id="shareBtn" onClick={handleShare} className={styles.actionBtn}><Share2 size={22} /></button>
            </div>
          </nav>
        </header>

        <div className={styles.weekSelector}>
          <button className={styles.weekNav} onClick={() => changeWeek(-1)}>←</button>
          <div className={styles.weekInfo}>
            <span className={styles.weekLabel}>{formatWeekRange(activeWeekStart)}</span>
          </div>
          <button className={styles.weekNav} onClick={() => changeWeek(1)}>→</button>
          <CustomDatePicker value={dateFilter} onChange={setDateFilter} />
        </div>

        <div className={styles.viewModeHeader}>
          <div className={styles.headerTitleRow}>
            <h2 className={styles.dateTitle}>
              <span className={styles.entityNameInline}>{entityName}</span>
            </h2>
          </div>
        </div>

        {viewMode === 'day' && (
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
        )}

        {viewMode === 'day' ? (
          <main className={styles.content}>
            <div className={styles.lessonList}>
              {currentDay?.lessons.length === 0 ? (
                <div className={styles.empty}>Пар нет, можно отдыхать! 🥳</div>
              ) : (
                (() => {
                  const filteredLessons = currentDay?.lessons.filter(isLessonForSubgroup) || [];
                  const maxTime = filteredLessons.length > 0 
                    ? Math.max(...filteredLessons.map(l => l.time)) 
                    : 0;

                  if (maxTime === 0) return <div className={styles.empty}>Пар нет, можно отдыхать! 🥳</div>;

                  const grouped = filteredLessons.reduce((acc, lesson) => {
                    if (!acc[lesson.time]) acc[lesson.time] = [];
                    acc[lesson.time].push(lesson);
                    return acc;
                  }, {} as Record<number, Lesson[]>);

                  const slots = [];
                  for (let time = 1; time <= maxTime; time++) {
                    const rawLessons = grouped[time] || [];
                    const active = isCurrentLesson(time, isToday);
                    const times = TIME_SLOTS[time] || { start: '??:??', end: '??:??' };

                    if (rawLessons.length === 0) {
                      slots.push(
                        <GlassCard key={time} className={`${styles.lessonCard} ${styles.emptySlotCard}`}>
                          <div className={styles.lessonTime}>
                            <div className={styles.timeStart}>{times.start}</div>
                            <div className={styles.timeDivider}>–</div>
                            <div className={styles.timeEnd}>{times.end}</div>
                          </div>
                          <div className={styles.lessonInfo}>
                            <h3 className={styles.discipline} style={{ opacity: 0.5 }}>Нет занятия</h3>
                          </div>
                        </GlassCard>
                      );
                      continue;
                    }

                    // Merging logic: group by unique key (lesson + type + teacher + auditory)
                    const mergedMap = new Map<string, Lesson & { groups?: string[] }>();
                    rawLessons.forEach(l => {
                      const key = `${l.lesson}-${l.type_work}-${l.teacher}-${l.auditCorps}`;
                      if (mergedMap.has(key)) {
                        const existing = mergedMap.get(key)!;
                        if (l.group && existing.groups && !existing.groups.includes(l.group)) {
                          existing.groups.push(l.group);
                        } else if (l.group && !existing.groups) {
                          existing.groups = [existing.group || '', l.group];
                        }
                      } else {
                        mergedMap.set(key, { ...l, groups: l.group ? [l.group] : [] });
                      }
                    });

                    const lessons = Array.from(mergedMap.values());
                    const isMultiple = lessons.length > 1;

                    slots.push(
                      <GlassCard 
                        key={time} 
                        className={`${styles.lessonCard} ${active ? styles.activeLesson : ''} ${isMultiple ? styles.multiCard : ''} ${!isMultiple ? getHighlightClass(lessons[0].type_work) : ''}`} 
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
                                <span className={`${styles.type} ${getHighlightClass(lessons[0].type_work)}`}>{lessons[0].type_work}</span>
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
                  }
                  return slots;
                })()
              )}
            </div>
          </main>
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
                  const slotLessons = (dayData?.lessons.filter(l => l.time === Number(slotIdx)) || [])
                    .filter(isLessonForSubgroup);
                  
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
                          style={{ 
                            borderLeftColor: l.type_work.includes('Экзамен') ? '#f59e0b' : l.type_work.includes('Консультация') ? '#10b981' : l.type_work.includes('Зачет') ? '#ef4444' : 'var(--accent-color)', 
                            background: l.type_work.includes('Экзамен') ? 'rgba(245, 158, 11, 0.1)' : undefined,
                            cursor: 'pointer' 
                          }}
                        >
                          <span 
                            className={styles.gridLessonType}
                            style={{ 
                              color: l.type_work.includes('Прак') ? '#ef4444' : l.type_work.includes('Лаб') ? '#10b981' : 'var(--accent-color)',
                              opacity: 1
                            }}
                          >
                            {l.type_work}
                          </span>
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

      {healthData && !healthData.upstream.healthy && (
        <div className={styles.statusBar} onClick={() => navigate('/status')}>
          <div className={styles.statusIndicator}>
            <div className={`${styles.statusDot} ${styles.unhealthy}`}></div>
            <span className={styles.statusText}>Источник недоступен</span>
          </div>
          <div className={styles.statusTime}>
            Последнее: {formatRelativeTime(healthData.upstream.last_success || '')}
          </div>
        </div>
      )}
    </div>

      {showSubgroupDrawer && (
        <div className={styles.modalOverlay} onClick={() => setShowSubgroupDrawer(false)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTimeTitle}>
                <h3>Выбор подгруппы</h3>
              </div>
              <button onClick={() => setShowSubgroupDrawer(false)} className={styles.closeBtn}><X size={24} /></button>
            </div>
            <div className={styles.subgroupOptions}>
              <button 
                onClick={() => { setSubgroup(null); setShowSubgroupDrawer(false); }} 
                className={`${styles.subgroupOption} ${subgroup === null ? styles.optionActive : ''}`}
              >
                Все занятия
              </button>
              {['1', '2'].map(num => (
                <button 
                  key={num}
                  onClick={() => { setSubgroup(num); setShowSubgroupDrawer(false); }} 
                  className={`${styles.subgroupOption} ${subgroup === num ? styles.optionActive : ''}`}
                >
                  {num} подгруппа
                </button>
              ))}
            </div>
          </div>
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
                  {(lesson as any).groups && (lesson as any).groups.length > 0 ? (
                    <span className={styles.lessonGroup}><User size={12} /> Группы: {(lesson as any).groups.join(', ')}</span>
                  ) : lesson.group && (
                    <span className={styles.lessonGroup}><User size={12} /> Группа: {lesson.group}</span>
                  )}
                </div>
              </GlassCard>
            ))}
          </div>
        </div>
      </div>
    )}
  </>
);
};

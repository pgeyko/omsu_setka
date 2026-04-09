import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, User, ChevronDown, ChevronUp, Calendar } from 'lucide-react';
import { GlassCard } from '../components/ui/GlassCard';
import { GlassInput } from '../components/ui/GlassInput';
import { fetchTutors, fetchSchedule, onRateLimit } from '../api/client';
import type { Tutor, SearchResult } from '../api/client';
import { useFavoritesStore } from '../store/useFavorites';
import { Toast } from '../components/ui/Toast';
import styles from './TutorsPage.module.css';

export const TutorsPage: React.FC = () => {
  const navigate = useNavigate();
  const [tutors, setTutors] = useState<Tutor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedTutor, setExpandedTutor] = useState<number | null>(null);
  const [tutorSubjects, setTutorSubjects] = useState<Record<number, string[]>>({});
  const [loadingSubjects, setLoadingSubjects] = useState<Record<number, boolean>>({});
  const [isFocused, setIsFocused] = useState(false);

  const { recentTutors, addRecent } = useFavoritesStore();
  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    onRateLimit((retry) => {
      setToastMessage(`Лимит запросов! Попробуйте через ${retry}`);
      setShowToast(true);
    });

    fetchTutors()
      .then((data: Tutor[]) => {
        // Filter empty and duplicates by name
        const unique = Array.from(new Map<string, Tutor>(
          data
            .filter(t => t.name && t.name.trim().length > 3)
            .map(t => [t.name, t])
        ).values());

        setTutors(unique.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
        setLoading(false);
      })
      .catch(console.error);
  }, []);

  const filteredTutors = useMemo(() => {
    if (!searchQuery) return tutors;
    const lowerQuery = searchQuery.toLowerCase();
    return tutors.filter(t => (t.name || '').toLowerCase().includes(lowerQuery));
  }, [tutors, searchQuery]);

  const loadTutorDetails = async (tutorId: number) => {
    if (tutorSubjects[tutorId] || loadingSubjects[tutorId]) return;

    setLoadingSubjects(prev => ({ ...prev, [tutorId]: true }));
    try {
      const schedule = await fetchSchedule('tutor', tutorId);
      const subjects = new Set<string>();

      schedule.forEach(day => {
        day.lessons.forEach(lesson => {
          if (lesson.lesson) subjects.add(lesson.lesson);
        });
      });

      setTutorSubjects(prev => ({ ...prev, [tutorId]: Array.from(subjects).sort() }));
    } catch (err) {
      console.error('Failed to load tutor subjects', err);
    } finally {
      setLoadingSubjects(prev => ({ ...prev, [tutorId]: false }));
    }
  };

  const handleExpand = (tutorId: number) => {
    if (expandedTutor === tutorId) {
      setExpandedTutor(null);
    } else {
      setExpandedTutor(tutorId);
      loadTutorDetails(tutorId);

      const tutor = tutors.find(t => t.id === tutorId);
      if (tutor) {
        addRecent({ id: tutor.id, name: tutor.name, type: 'tutor' });
      }
    }
  };

  const handleSelectRecent = (rec: SearchResult) => {
    setSearchQuery(rec.name);
    setIsFocused(false);
    // Expand the selected tutor
    setExpandedTutor(rec.id);
    loadTutorDetails(rec.id);
  };

  if (loading) return (
    <div className="app-container">
      <div className={styles.loading}>Загрузка списка преподавателей...</div>
    </div>
  );
  return (
    <div className="app-container animate-fade-in">
      <Toast message={toastMessage} isVisible={showToast} onClose={() => setShowToast(false)} />

      <header className={styles.stickyHeader}>
        <nav className={styles.nav}>
          <button onClick={() => navigate(-1)} className={styles.backBtn}><ArrowLeft size={24} /></button>
          <div className={styles.navTitle}>Преподаватели</div>
          <div className={styles.navActions}></div>
        </nav>
      </header>

      <main className={styles.container}>
        <div className={styles.searchWrapper}>
          <GlassInput
            icon={<Search size={20} />}
            placeholder="Поиск по ФИО..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 200)}
          />

          {isFocused && searchQuery.length < 2 && recentTutors.length > 0 && (
            <div className={styles.resultsDropdown}>
              <div className={styles.dropdownHeader}>Недавние преподаватели</div>
              {recentTutors.map(rec => (
                <div key={rec.id} className={styles.resultItem} onClick={() => handleSelectRecent(rec)}>
                  <User size={18} className={styles.resultIcon} />
                  <div className={styles.resultInfo}>
                    <div className={styles.resultLabel}>{rec.name}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.tutorList}>
          {filteredTutors.map(tutor => {
            const isExpanded = expandedTutor === tutor.id;
            const subjects = tutorSubjects[tutor.id] || [];
            const isLoading = loadingSubjects[tutor.id];

            return (
              <GlassCard
                key={tutor.id}
                className={styles.tutorCard}
                onClick={() => handleExpand(tutor.id)}
              >
                <div className={styles.tutorHeader}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <User size={20} className="text-accent" />
                    <span className={styles.tutorName}>{tutor.name}</span>
                  </div>
                  {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </div>

                {isExpanded && (
                  <div className={styles.details} onClick={e => e.stopPropagation()}>
                    {isLoading ? (
                      <div className={styles.loading}>Загрузка предметов...</div>
                    ) : (
                      <>
                        <span className={styles.sectionLabel}>Дисциплины (в текущем расписании)</span>
                        <div className={styles.subjects}>
                          {subjects.length > 0 ? (
                            subjects.map((sub, i) => (
                              <span key={i} className={styles.subjectBadge}>{sub}</span>
                            ))
                          ) : (
                            <span className={styles.empty}>Предметы не найдены</span>
                          )}
                        </div>
                        <button
                          className={styles.viewScheduleBtn}
                          onClick={() => navigate(`/schedule/tutor/${tutor.id}`, { state: { name: `Преподаватель: ${tutor.name}` } })}
                        >
                          <Calendar size={18} /> Открыть полное расписание
                        </button>
                      </>
                    )}
                  </div>
                )}
              </GlassCard>
            );
          })}
        </div>
      </main>
    </div>
  );
};


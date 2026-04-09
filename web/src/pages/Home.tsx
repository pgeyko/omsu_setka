import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Star, School, User, MapPin, Moon, Sun } from 'lucide-react';
import { GlassInput } from '../components/ui/GlassInput';
import { fetchSearch, fetchHealth } from '../api/client';
import type { SearchResult, GroupedSearchResult, HealthData } from '../api/client';
import { useFavoritesStore } from '../store/useFavorites';
import { useSettingsStore } from '../store/useSettings';
import styles from './Home.module.css';

const formatRelativeTime = (dateString: string) => {
  if (!dateString) return 'неизвестно';
  const date = new Date(dateString);
  const now = new Date();
  const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);

  if (diffInMinutes < 1) return 'только что';
  if (diffInMinutes < 60) return `${diffInMinutes} мин назад`;
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours} ч назад`;

  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
};

export const Home: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | GroupedSearchResult>([]);
  const [loading, setLoading] = useState(false);
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const navigate = useNavigate();
  const { favorites, recent, addRecent } = useFavoritesStore();
  const { theme, toggleTheme } = useSettingsStore();

  useEffect(() => {
    fetchHealth().then(setHealthData).catch(console.error);
    const interval = setInterval(() => {
      fetchHealth().then(setHealthData).catch(console.error);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);
    const debounce = setTimeout(async () => {
      try {
        const data = await fetchSearch(query);
        setResults(data);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(debounce);
  }, [query]);

  const handleResultClick = (res: SearchResult) => {
    addRecent(res);
    navigate(`/schedule/${res.type}/${res.id}`);
  };

  const renderResult = (res: SearchResult) => (
    <div 
      key={`${res.type}-${res.id}`} 
      className={styles.resultItem}
      onClick={() => handleResultClick(res)}
    >
      <div className={`${styles.resultIcon} ${styles[res.type]}`}>
        {res.type === 'group' && <School size={18} />}
        {res.type === 'tutor' && <User size={18} />}
        {res.type === 'auditory' && <MapPin size={18} />}
      </div>
      <div className={styles.resultInfo}>
        <span className={styles.resultLabel}>{res.name}</span>
        {res.building && <span className={styles.resultSub}>{res.building}</span>}
      </div>
    </div>
  );

  const hasResults = Array.isArray(results) ? results.length > 0 : (results.groups.length > 0 || results.tutors.length > 0 || results.auditories.length > 0);
  const showRecent = isFocused && query.length < 2 && recent.length > 0;

  return (
    <div className="app-container animate-fade-in">
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <h1 className={styles.title}>setka</h1>
          <div className={styles.headerActions}>
            <button onClick={toggleTheme} className={styles.actionBtn} title="Переключить тему">
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          </div>
        </div>
      </header>

      <section className={styles.searchSection}>
        <GlassInput
          icon={<Search size={20} />}
          placeholder="Группа, преподаватель или ауд..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 200)}
          loading={loading}
        />

        {showRecent && (
          <div className={`${styles.resultsContainer} animate-slide-up`}>
            <h3 className={styles.sectionTitle}>Недавние</h3>
            {recent.map(renderResult)}
          </div>
        )}

        {query.length >= 2 && hasResults && (
          <div className={`${styles.resultsContainer} animate-slide-up`}>
            {Array.isArray(results) ? (
              results.map(renderResult)
            ) : (
              <>
                {results.groups.length > 0 && (
                  <>
                    <h3 className={styles.sectionTitle}>Группы</h3>
                    {results.groups.map(renderResult)}
                  </>
                )}
                {results.tutors.length > 0 && (
                  <>
                    <h3 className={styles.sectionTitle}>Преподаватели</h3>
                    {results.tutors.map(renderResult)}
                  </>
                )}
                {results.auditories.length > 0 && (
                  <>
                    <h3 className={styles.sectionTitle}>Аудитории</h3>
                    {results.auditories.map(renderResult)}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {query.length >= 2 && !hasResults && !loading && (
          <div className={styles.noResults}>Ничего не найдено</div>
        )}
      </section>

      {query.length < 2 && favorites.length > 0 && (
        <section className={styles.favoritesSection}>
          <h2 className={styles.sectionTitle}>
            <Star size={18} fill="currentColor" /> Избранное
          </h2>
          <div className={styles.favoritesGrid}>
            {favorites.map((fav) => (
              <div 
                key={`${fav.type}-${fav.id}`}
                className={styles.favCard}
                onClick={() => navigate(`/schedule/${fav.type}/${fav.id}`)}
              >
                <div className={`${styles.favIcon} ${styles[fav.type]}`}>
                  {fav.type === 'group' && <School size={20} />}
                  {fav.type === 'tutor' && <User size={20} />}
                  {fav.type === 'auditory' && <MapPin size={20} />}
                </div>
                <div className={styles.favName}>{fav.name}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {healthData && (
        <div className={styles.statusBar} onClick={() => navigate('/status')}>
          <div className={styles.statusIndicator}>
            <div className={`${styles.statusDot} ${healthData.upstream.healthy ? styles.healthy : styles.unhealthy}`}></div>
            <span className={styles.statusText}>
              {healthData.upstream.healthy ? 'Данные актуальны' : 'Источник недоступен'}
            </span>
          </div>
          <div className={styles.statusTime}>
            Обновлено {formatRelativeTime(healthData.upstream.healthy ? healthData.last_sync.schedules : healthData.upstream.last_success || '')}
          </div>
        </div>
      )}
    </div>
  );
};

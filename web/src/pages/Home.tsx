import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Star, School, User, MapPin } from 'lucide-react';
import { GlassInput } from '../components/ui/GlassInput';
import { fetchSearch, fetchHealth } from '../api/client';
import type { SearchResult, GroupedSearchResult, HealthData } from '../api/client';
import { useFavoritesStore } from '../store/useFavorites';
import styles from './Home.module.css';

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

export const Home: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | GroupedSearchResult>([]);
  const [loading, setLoading] = useState(false);
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const navigate = useNavigate();
  const { favorites, recent, addRecent } = useFavoritesStore();

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

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await fetchSearch(query);
        setResults(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (item: SearchResult) => {
    const prefixes: Record<string, string> = {
      'group': 'Группа',
      'tutor': 'Преподаватель',
      'auditory': 'Аудитория'
    };
    const prefix = prefixes[item.type] || '';
    // Очищаем имя от существующих префиксов перед добавлением нового
    const cleanName = item.name.replace(/^(Группа|Преподаватель|Аудитория):\s*/i, '');
    const descriptiveName = prefix ? `${prefix}: ${cleanName}` : cleanName;
    
    addRecent({ ...item, name: descriptiveName });
    navigate(`/schedule/${item.type}/${item.id}`, { state: { name: descriptiveName } });
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'group': return <School size={16} />;
      case 'tutor': return <User size={16} />;
      case 'auditory': return <MapPin size={16} />;
      default: return <Search size={16} />;
    }
  };

  const renderResultItem = (res: SearchResult) => (
    <div key={`${res.type}-${res.id}`} className={styles.resultItem} onClick={() => handleSelect(res)}>
      <span className={styles.resultIcon}>{getIcon(res.type)}</span>
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
        <h1 className={styles.title}>setka</h1>
      </header>

      <section className={styles.searchSection}>
        <GlassInput 
          icon={<Search size={20} />}
          placeholder="Группа, преподаватель или ауд..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 200)}
        />
        
        {loading && <div className={styles.loader}>Searching...</div>}
        
        {(hasResults || showRecent) && (
          <div className={styles.resultsDropdown}>
            {showRecent ? (
              <div className={styles.dropdownSection}>
                <div className={styles.dropdownHeader}>Недавнее</div>
                {recent.map(renderResultItem)}
              </div>
            ) : Array.isArray(results) ? (
              results.map(renderResultItem)
            ) : (
              <>
                {results.groups.length > 0 && (
                  <div className={styles.dropdownSection}>
                    <div className={styles.dropdownHeader}>Группы</div>
                    {results.groups.map(renderResultItem)}
                  </div>
                )}
                {results.tutors.length > 0 && (
                  <div className={styles.dropdownSection}>
                    <div className={styles.dropdownHeader}>Преподаватели</div>
                    {results.tutors.map(renderResultItem)}
                  </div>
                )}
                {results.auditories.length > 0 && (
                  <div className={styles.dropdownSection}>
                    <div className={styles.dropdownHeader}>Аудитории</div>
                    {results.auditories.map(renderResultItem)}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </section>

      {query.length < 2 && (
        <div className={styles.quickAccess}>
          {favorites.length === 0 ? (
            <div className={styles.banner}>
              <div className={styles.bannerTitle}>Быстрый доступ к расписанию</div>
              <div className={styles.bannerText}>
                Добавьте группы, преподавателей или аудитории в избранное (нажав на ⭐), чтобы они всегда были под рукой на этой странице.
              </div>
            </div>
          ) : (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}><Star size={16} /> Избранное</h2>
              <div className={styles.grid}>
                {favorites.map(fav => (
                  <div key={`${fav.type}-${fav.id}`} className={styles.actionCard} onClick={() => handleSelect(fav)}>
                    <div className={styles.actionIcon}>
                      {fav.type === 'group' ? <School size={24} /> : fav.type === 'tutor' ? <User size={24} /> : <MapPin size={24} />}
                    </div>
                    <span className={styles.actionLabel}>{fav.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Навигация</h2>
            <div className={styles.grid}>
              <div className={styles.actionCard} onClick={() => navigate('/tutors')}>
                <div className={styles.actionIcon}><User size={24} /></div>
                <span className={styles.actionLabel}>Преподаватели</span>
              </div>
            </div>
          </div>
        </div>
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

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, History, Star, School, User, MapPin } from 'lucide-react';
import { GlassInput } from '../components/ui/GlassInput';
import { GlassCard } from '../components/ui/GlassCard';
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
    const descriptiveName = prefix ? `${prefix}: ${item.name}` : item.name;
    
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

  return (
    <div className="app-container animate-fade-in">
      <header className={styles.header}>
        <h1 className={styles.title}>ОмГУ <span>Зеркало</span></h1>
        <p className={styles.subtitle}>Расписание, которое не тормозит</p>
      </header>

      {healthData && (
        <div className={styles.statusBar} onClick={() => navigate('/status')}>
          <div className={styles.statusIndicator}>
            <div className={`${styles.statusDot} ${healthData.upstream.healthy ? styles.healthy : styles.unhealthy}`}></div>
            <span className={styles.statusText}>
              {healthData.upstream.healthy ? 'Данные актуальны' : 'Сервер ОмГУ недоступен'}
            </span>
          </div>
          <div className={styles.statusTime}>
            Обновлено {formatRelativeTime(healthData.upstream.healthy ? healthData.last_sync.schedules : healthData.upstream.last_success || '')}
          </div>
        </div>
      )}

      <section className={styles.searchSection}>
        <GlassInput 
          icon={<Search size={20} />}
          placeholder="Группа, преподаватель или ауд..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        
        {loading && <div className={styles.loader}>Searching...</div>}
        
        {hasResults && (
          <div className={styles.resultsDropdown}>
            {Array.isArray(results) ? (
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
          {favorites.length > 0 && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}><Star size={16} /> Избранное</h2>
              <div className={styles.grid}>
                {favorites.map(fav => (
                  <GlassCard key={`${fav.type}-${fav.id}`} className={styles.card} onClick={() => handleSelect(fav)}>
                    <div className={styles.cardType}>{fav.type === 'group' ? 'Группа' : fav.type === 'tutor' ? 'Преп.' : 'Ауд.'}</div>
                    <div className={styles.cardLabel}>{fav.name}</div>
                  </GlassCard>
                ))}
              </div>
            </div>
          )}

          {recent.length > 0 && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}><History size={16} /> Недавние</h2>
              <div className={styles.list}>
                {recent.map(rec => (
                  <div key={`${rec.type}-${rec.id}`} className={styles.listItem} onClick={() => handleSelect(rec)}>
                    {getIcon(rec.type)}
                    <span>{rec.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowLeft, School, User, MapPin, X, History } from 'lucide-react';
import { GlassInput } from '../components/ui/GlassInput';
import { fetchSearch } from '../api/client';
import type { SearchResult, GroupedSearchResult } from '../api/client';
import { useFavoritesStore } from '../store/useFavorites';
import styles from './SearchPage.module.css';

export const SearchPage: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | GroupedSearchResult>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const { recent, recentTutors, recentAuditories, addRecent } = useFavoritesStore();

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
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
    const cleanName = item.name.replace(/^(Группа|Преподаватель|Аудитория):\s*/i, '').replace(/^ID\s+/, '');
    const descriptiveName = prefix ? `${prefix}: ${cleanName}` : cleanName;

    addRecent({ ...item, name: descriptiveName });
    navigate(`/schedule/${item.type}/${item.id}`, { state: { name: descriptiveName } });
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'group': return <School size={18} />;
      case 'tutor': return <User size={18} />;
      case 'auditory': return <MapPin size={18} />;
      default: return <Search size={18} />;
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
  const showRecent = query.length < 2 && (recent.length > 0 || recentTutors.length > 0 || recentAuditories.length > 0);

  return (
    <div className="app-container animate-fade-in">
      <header className={styles.header}>
        <div className={styles.searchBar}>
          <button onClick={() => navigate(-1)} className={styles.backBtn}>
            <ArrowLeft size={24} />
          </button>
          <div className={styles.inputWrapper}>
            <GlassInput
              ref={inputRef}
              icon={<Search size={20} />}
              placeholder="Группа, преподаватель или аудитория"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button className={styles.clearBtn} onClick={() => setQuery('')}>
                <X size={18} />
              </button>
            )}
          </div>
        </div>
      </header>

      <main className={styles.content}>
        {loading && <div className={styles.loading}>Поиск...</div>}

        {hasResults && (
          <div className={styles.results}>
            {Array.isArray(results) ? (
              results.map(renderResultItem)
            ) : (
              <>
                {results.groups.length > 0 && (
                  <div className={styles.section}>
                    <div className={styles.sectionHeader}>Группы</div>
                    {results.groups.map(renderResultItem)}
                  </div>
                )}
                {results.tutors.length > 0 && (
                  <div className={styles.section}>
                    <div className={styles.sectionHeader}>Преподаватели</div>
                    {results.tutors.map(renderResultItem)}
                  </div>
                )}
                {results.auditories.length > 0 && (
                  <div className={styles.section}>
                    <div className={styles.sectionHeader}>Аудитории</div>
                    {results.auditories.map(renderResultItem)}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {showRecent && (
          <div className={styles.recent}>
            <div className={styles.sectionHeader}><History size={14} style={{ marginRight: 8 }} /> Недавние</div>
            {[...recent, ...recentTutors, ...recentAuditories].slice(0, 10).map(renderResultItem)}
          </div>
        )}

        {!loading && !hasResults && query.length >= 2 && (
          <div className={styles.noResults}>Ничего не найдено</div>
        )}
      </main>
    </div>
  );
};

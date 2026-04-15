import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, ArrowLeft, School, User, MapPin, X, History, Menu } from 'lucide-react';
import { GlassInput } from '../components/ui/GlassInput';
import { IconButton } from '../components/ui/IconButton';
import { PageHeader } from '../components/ui/PageHeader';
import { fetchSearch } from '../api/client';
import type { SearchResult, GroupedSearchResult } from '../api/client';
import { useFavoritesStore } from '../store/useFavorites';
import { useSidebarStore } from '../store/useSidebar';
import { listContainerMotion, listItemMotion } from '../utils/motion';
import styles from './SearchPage.module.css';

export const SearchPage: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | GroupedSearchResult>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const { recent, recentTutors, recentAuditories, addRecent } = useFavoritesStore();
  const { open: openSidebar } = useSidebarStore();

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
    <motion.div
      key={`${res.type}-${res.id}`}
      variants={listItemMotion}
      className={styles.resultItem}
      onClick={() => handleSelect(res)}
    >
      <span className={styles.resultIcon}>{getIcon(res.type)}</span>
      <div className={styles.resultInfo}>
        <span className={styles.resultLabel}>{res.name}</span>
        {res.building && <span className={styles.resultSub}>{res.building}</span>}
      </div>
    </motion.div>
  );

  const hasResults = Array.isArray(results) ? results.length > 0 : (results.groups.length > 0 || results.tutors.length > 0 || results.auditories.length > 0);
  const showRecent = query.length < 2 && (recent.length > 0 || recentTutors.length > 0 || recentAuditories.length > 0);

  return (
    <div className="app-container animate-fade-in">
      <PageHeader
        left={<IconButton icon={<ArrowLeft size={24} />} onClick={() => navigate(-1)} aria-label="Назад" />}
        center={(
          <div className={styles.inputWrapper}>
            <GlassInput
              ref={inputRef}
              icon={<Search size={20} />}
              placeholder="Группа, преподаватель или аудитория"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button className={styles.clearBtn} onClick={() => setQuery('')} aria-label="Очистить поиск">
                <X size={18} />
              </button>
            )}
          </div>
        )}
        right={<IconButton icon={<Menu size={24} />} onClick={openSidebar} aria-label="Открыть меню" className="mobile-only" />}
      />

      <main className={styles.content}>
        <AnimatePresence mode="wait">
          {loading && (
            <motion.div key="loading" variants={listItemMotion} initial="hidden" animate="visible" exit="exit" className={styles.loading}>
              Поиск...
            </motion.div>
          )}

          {!loading && hasResults && (
            <motion.div
              key="results"
              className={styles.results}
              variants={listContainerMotion}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
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
            </motion.div>
          )}

          {!loading && showRecent && (
            <motion.div
              key="recent"
              className={styles.recent}
              variants={listContainerMotion}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <div className={styles.sectionHeader}><History size={14} style={{ marginRight: 8 }} /> Недавние</div>
              {[...recent, ...recentTutors, ...recentAuditories].slice(0, 10).map(renderResultItem)}
            </motion.div>
          )}

          {!loading && !hasResults && query.length >= 2 && (
            <motion.div key="empty" variants={listItemMotion} initial="hidden" animate="visible" exit="exit" className={styles.noResults}>
              Ничего не найдено
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};

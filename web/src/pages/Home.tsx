import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Menu, Star, School, User, MapPin } from 'lucide-react';
import { useFavoritesStore } from '../store/useFavorites';
import { useSidebarStore } from '../store/useSidebar';
import { ScheduleContent } from '../components/ScheduleContent';
import type { SearchResult } from '../api/client';
import styles from './Home.module.css';

export const Home: React.FC = () => {
  const navigate = useNavigate();
  const { favorites, pinnedEntity } = useFavoritesStore();
  const { open } = useSidebarStore();

  useEffect(() => {
    // Redirection is removed to prevent cycles, we render content directly below
  }, []);

  const handleSelect = (item: SearchResult) => {
    navigate(`/schedule/${item.type}/${item.id}`, { state: { name: item.name } });
  };

  // If we have a pinned entity, we render the schedule directly on the home page
  if (pinnedEntity) {
    return (
      <ScheduleContent 
        entityType={pinnedEntity.type}
        entityID={pinnedEntity.id}
        initialName={pinnedEntity.name}
        showBackButton={false}
      />
    );
  }

  return (
    <div className="app-container animate-fade-in">
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <h1 className={styles.title}>setka</h1>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className={styles.themeToggle}
              onClick={() => navigate('/search')}
              aria-label="Поиск"
            >
              <Search size={20} />
            </button>
            <button
              className={`${styles.themeToggle} mobile-only`}
              onClick={open}
              aria-label="Открыть меню"
            >
              <Menu size={20} />
            </button>
          </div>
        </div>
      </header>

      <div className={styles.quickAccess}>
        {favorites.length === 0 ? (
          <div className={styles.banner}>
            <div className={styles.bannerTitle}>Персональное расписание</div>
            <div className={styles.bannerText}>
              Используйте поиск, чтобы найти свою группу или преподавателя, а затем добавьте их в избранное и закрепите на главной.
            </div>
            <button onClick={() => navigate('/search')} className={styles.searchButton}>
              <Search size={20} /> Перейти к поиску
            </button>
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
      </div>
    </div>
  );
};

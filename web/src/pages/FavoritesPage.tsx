import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Star, School, User, MapPin, ArrowLeft, Trash2, Menu } from 'lucide-react';
import { useFavoritesStore } from '../store/useFavorites';
import { useSidebarStore } from '../store/useSidebar';
import { GlassCard } from '../components/ui/GlassCard';
import { EmptyState } from '../components/ui/EmptyState';
import { IconButton } from '../components/ui/IconButton';
import { PageHeader } from '../components/ui/PageHeader';
import type { SearchResult } from '../api/client';
import { listItemMotion } from '../utils/motion';
import styles from './FavoritesPage.module.css';

export const FavoritesPage: React.FC = () => {
  const navigate = useNavigate();
  const { 
    favorites, 
    removeFavorite
  } = useFavoritesStore();
  const { open: openSidebar } = useSidebarStore();

  const handleSelect = (item: SearchResult) => {
    navigate(`/schedule/${item.type}/${item.id}`, { state: { name: item.name } });
  };

  return (
    <div className="app-container animate-fade-in">
      <PageHeader
        title="Избранное"
        left={<IconButton icon={<ArrowLeft size={24} />} onClick={() => navigate(-1)} aria-label="Назад" />}
        right={<IconButton icon={<Menu size={24} />} onClick={openSidebar} aria-label="Открыть меню" className="mobile-only" />}
      />

      <main className={styles.content}>
        {favorites.length === 0 ? (
          <EmptyState
            icon={<Star size={48} />}
            title="Список пуст"
            description="Добавляйте расписания в избранное, чтобы они появились здесь."
            action={(
            <button onClick={() => navigate('/')} className={styles.goHomeBtn}>
              На главную
            </button>
            )}
          />
        ) : (
          <div className={styles.list}>
            <AnimatePresence initial={false}>
              {favorites.map((fav) => (
                <motion.div
                  key={`${fav.type}-${fav.id}`}
                  layout
                  variants={listItemMotion}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  <GlassCard
                    className={styles.card}
                    onClick={() => handleSelect(fav)}
                  >
                    <div className={styles.cardMain}>
                      <div className={styles.icon}>
                        {fav.type === 'group' ? <School size={20} /> : fav.type === 'tutor' ? <User size={20} /> : <MapPin size={20} />}
                      </div>
                      <div className={styles.info}>
                        <span className={styles.label}>{fav.name}</span>
                        <span className={styles.type}>
                          {fav.type === 'group' ? 'Группа' : fav.type === 'tutor' ? 'Преподаватель' : 'Аудитория'}
                        </span>
                      </div>
                    </div>

                    <div className={styles.actions}>
                      <button
                        className={styles.actionBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFavorite(fav.id, fav.type);
                        }}
                        title="Удалить из избранного"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </GlassCard>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>
    </div>
  );
};

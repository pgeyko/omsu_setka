import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Star, School, User, MapPin, ArrowLeft, Trash2 } from 'lucide-react';
import { useFavoritesStore } from '../store/useFavorites';
import { GlassCard } from '../components/ui/GlassCard';
import styles from './FavoritesPage.module.css';

export const FavoritesPage: React.FC = () => {
  const navigate = useNavigate();
  const { 
    favorites, 
    removeFavorite
  } = useFavoritesStore();

  const handleSelect = (item: any) => {
    navigate(`/schedule/${item.type}/${item.id}`, { state: { name: item.name } });
  };

  return (
    <div className="app-container animate-fade-in">
      <header className={styles.header}>
        <nav className={styles.nav}>
          <button onClick={() => navigate(-1)} className={styles.backBtn}>
            <ArrowLeft size={24} />
          </button>
          <h1 className={styles.title}>Избранное</h1>
          <div style={{ width: 44 }} />
        </nav>
      </header>

      <main className={styles.content}>
        {favorites.length === 0 ? (
          <div className={styles.empty}>
            <Star size={48} className={styles.emptyIcon} />
            <h3>Список пуст</h3>
            <p>Добавляйте расписания в избранное, чтобы они появились здесь.</p>
            <button onClick={() => navigate('/')} className={styles.goHomeBtn}>
              На главную
            </button>
          </div>
        ) : (
          <div className={styles.list}>
            {favorites.map((fav) => (
              <motion.div
                key={`${fav.type}-${fav.id}`}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
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
          </div>
        )}
      </main>
    </div>
  );
};

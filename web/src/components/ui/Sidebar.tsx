import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Sun, 
  Moon, 
  User, 
  ExternalLink, 
  LogIn, 
  Grid, 
  Calendar,
  Home,
  Star
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSettingsStore } from '../../store/useSettings';
import { fetchHealth } from '../../api/client';
import type { HealthData } from '../../api/client';
import styles from './Sidebar.module.css';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { theme, toggleTheme } = useSettingsStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1100);
  const [healthData, setHealthData] = useState<HealthData | null>(null);

  useEffect(() => {
    fetchHealth().then(setHealthData).catch(console.error);
    const interval = setInterval(() => {
      fetchHealth().then(setHealthData).catch(console.error);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1100);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const menuItems = [
    { 
      icon: <Home size={20} />, 
      label: 'Главная', 
      path: '/',
      active: location.pathname === '/'
    },
    { 
      icon: <Star size={20} />, 
      label: 'Избранное', 
      path: '/favorites',
      active: location.pathname === '/favorites'
    },
    { 
      icon: <User size={20} />, 
      label: 'Преподаватели', 
      path: '/tutors',
      active: location.pathname === '/tutors'
    },
  ];

  const externalLinks = [
    {
      icon: <Calendar size={20} />,
      label: 'Оригинальное расписание',
      url: 'https://eservice.omsu.ru/schedule/'
    },
    {
      icon: <LogIn size={20} />,
      label: 'Вход в ЛК Есервисы',
      url: 'https://eservice.omsu.ru/schedule/backend/'
    },
    {
      icon: <Grid size={20} />,
      label: 'Все сервисы ОмГУ',
      url: 'https://eservice.omsu.ru/'
    }
  ];

  const handleNav = (path: string) => {
    navigate(path);
    if (!isDesktop) onClose();
  };

  const SidebarContent = (
    <aside className={styles.sidebar}>
      <div className={styles.header}>
        <span className={styles.logo}>setka</span>
        {!isDesktop && (
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={24} />
          </button>
        )}
      </div>

      <div className={styles.content}>
        <nav className={styles.nav}>
          <div className={styles.sectionLabel}>Навигация</div>
          {menuItems.map((item) => (
            <button 
              key={item.path} 
              className={`${styles.menuItem} ${item.active ? styles.active : ''}`}
              onClick={() => handleNav(item.path)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}

          <div className={styles.divider} />
          
          <div className={styles.sectionLabel}>Сервисы ОмГУ</div>
          {externalLinks.map((link) => (
            <a 
              key={link.url} 
              href={link.url} 
              target="_blank" 
              rel="noopener noreferrer" 
              className={styles.menuItem}
            >
              {link.icon}
              <span>{link.label}</span>
              <ExternalLink size={14} className={styles.extIcon} />
            </a>
          ))}
        </nav>
      </div>

      <div className={styles.footer}>
        <button className={styles.themeToggle} onClick={toggleTheme}>
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          <span>{theme === 'dark' ? 'Светлая тема' : 'Темная тема'}</span>
        </button>
        
        {healthData && (
          <div className={styles.statusInfo} onClick={() => { navigate('/status'); if(!isDesktop) onClose(); }}>
            <div className={`${styles.statusDot} ${healthData.upstream.healthy ? styles.healthy : styles.unhealthy}`} />
            <span className={styles.statusLabel}>
              {healthData.upstream.healthy ? 'Система онлайн' : 'Проблемы с источником'}
            </span>
          </div>
        )}

        <div className={styles.version}>v1.0.0</div>
      </div>
    </aside>
  );

  if (isDesktop) {
    return SidebarContent;
  }

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            className={styles.overlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            style={{ position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 5001, width: '100%', pointerEvents: 'none' }}
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          >
            <div style={{ pointerEvents: 'auto', height: '100%', width: '80%', maxWidth: '320px' }}>
              {SidebarContent}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
};

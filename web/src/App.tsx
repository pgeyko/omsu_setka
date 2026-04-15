import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { useLayoutEffect, useEffect } from 'react';
import { Home } from './pages/Home';
import { ScheduleView } from './pages/ScheduleView';
import { StatusPage } from './pages/StatusPage';
import { TutorsPage } from './pages/TutorsPage';
import { FavoritesPage } from './pages/FavoritesPage';
import { SearchPage } from './pages/SearchPage';
import { SettingsPage } from './pages/SettingsPage';
import { Footer } from './components/ui/Footer';
import { Sidebar } from './components/ui/Sidebar';
import { useSettingsStore } from './store/useSettings';
import { useSidebarStore } from './store/useSidebar';
import { onForegroundMessage } from './utils/firebase';
import { Toast } from './components/ui/Toast';
import { useState } from 'react';
import './styles/global.css';

const ScrollToTop = () => {
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
};

const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isOpen, close } = useSidebarStore();

  return (
    <>
      <Sidebar isOpen={isOpen} onClose={close} />
      <div className="with-sidebar">
        {children}
      </div>
    </>
  );
};

function App() {
  const { theme } = useSettingsStore();

  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  useEffect(() => {
    const unsubscribe = onForegroundMessage((payload) => {
      const title = payload.notification?.title || 'Уведомление';
      const body = payload.notification?.body || '';
      setToastMessage(`${title}: ${body}`);
      setShowToast(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    const setAppHeight = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };

    setAppHeight();
    window.addEventListener('resize', setAppHeight);
    return () => window.removeEventListener('resize', setAppHeight);
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <ScrollToTop />
        <MainLayout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/schedule/:type/:id" element={<ScheduleView />} />
            <Route path="/status" element={<StatusPage />} />
            <Route path="/tutors" element={<TutorsPage />} />
            <Route path="/favorites" element={<FavoritesPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </MainLayout>
        <Footer />
        <Toast
          isVisible={showToast}
          message={toastMessage}
          onClose={() => setShowToast(false)}
        />
      </BrowserRouter>
    </MotionConfig>
  );
}

export default App;

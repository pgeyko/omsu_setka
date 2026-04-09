import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useLayoutEffect, useEffect } from 'react';
import { Home } from './pages/Home';
import { ScheduleView } from './pages/ScheduleView';
import { StatusPage } from './pages/StatusPage';
import { TutorsPage } from './pages/TutorsPage';
import { Footer } from './components/ui/Footer';
import { useSettingsStore } from './store/useSettings';
import './styles/global.css';

const ScrollToTop = () => {
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
};

function App() {
  const { theme } = useSettingsStore();

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
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/schedule/:type/:id" element={<ScheduleView />} />
        <Route path="/status" element={<StatusPage />} />
        <Route path="/tutors" element={<TutorsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Footer />
    </BrowserRouter>
  );
}

export default App;

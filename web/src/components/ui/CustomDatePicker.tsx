import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, X } from 'lucide-react';
import { drawerMotion, drawerTransition, overlayMotion, overlayTransition } from '../../utils/motion';
import styles from './CustomDatePicker.module.css';

interface CustomDatePickerProps {
  value: string;
  onChange: (date: string) => void;
}

export const CustomDatePicker: React.FC<CustomDatePickerProps> = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(new Date());

  const daysInMonth = (month: number, year: number) => new Date(year, month + 1, 0).getDate();
  const startDayOfMonth = (month: number, year: number) => new Date(year, month, 1).getDay();

  const monthNames = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
  ];

  const handleDaySelect = (day: number) => {
    const selected = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    // Format as YYYY-MM-DD for input compatibility
    const year = selected.getFullYear();
    const month = String(selected.getMonth() + 1).padStart(2, '0');
    const date = String(selected.getDate()).padStart(2, '0');
    onChange(`${year}-${month}-${date}`);
    setIsOpen(false);
  };

  const changeMonth = (dir: number) => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + dir, 1));
  };

  const renderCalendar = () => {
    const totalDays = daysInMonth(viewDate.getMonth(), viewDate.getFullYear());
    const firstDay = (startDayOfMonth(viewDate.getMonth(), viewDate.getFullYear()) + 6) % 7; // Russian week starts Monday
    
    const days = [];
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className={styles.emptyDay} />);
    }
    
    for (let d = 1; d <= totalDays; d++) {
      const isSelected = value === `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isToday = new Date().toDateString() === new Date(viewDate.getFullYear(), viewDate.getMonth(), d).toDateString();
      
      days.push(
        <button
          key={d}
          onClick={() => handleDaySelect(d)}
          className={`${styles.day} ${isSelected ? styles.selected : ''} ${isToday ? styles.today : ''}`}
        >
          {d}
        </button>
      );
    }
    return days;
  };

  return (
    <div className={styles.container}>
      <button className={styles.trigger} onClick={() => setIsOpen(!isOpen)} aria-label="Открыть выбор даты">
        <CalendarIcon size={20} />
      </button>

      {createPortal(
        <AnimatePresence>
          {isOpen && (
            <motion.div
              variants={overlayMotion}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={overlayTransition}
              className={styles.modalOverlay}
              onClick={() => setIsOpen(false)}
            >
              <motion.div
                variants={drawerMotion}
                initial="hidden"
                animate="visible"
                exit="exit"
                transition={drawerTransition}
                className={styles.modalContent}
                onClick={e => e.stopPropagation()}
              >
                <div className={styles.drawerHeader}>
                  <h3>Выбор даты</h3>
                  <button onClick={() => setIsOpen(false)} className={styles.closeBtn} aria-label="Закрыть выбор даты">
                    <X size={24} />
                  </button>
                </div>

                <div className={styles.header}>
                  <button onClick={() => changeMonth(-1)} className={styles.navBtn} aria-label="Предыдущий месяц"><ChevronLeft size={18} /></button>
                  <div className={styles.currentMonth}>
                    {monthNames[viewDate.getMonth()]} {viewDate.getFullYear()}
                  </div>
                  <button onClick={() => changeMonth(1)} className={styles.navBtn} aria-label="Следующий месяц"><ChevronRight size={18} /></button>
                </div>

                <div className={styles.weekDays}>
                  {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => (
                    <div key={d} className={styles.weekDay}>{d}</div>
                  ))}
                </div>

                <div className={styles.grid}>
                  {renderCalendar()}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};

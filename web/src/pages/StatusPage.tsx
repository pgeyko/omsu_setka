import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, XCircle, AlertCircle, Clock } from 'lucide-react';
import { fetchHealth, fetchIncidents } from '../api/client';
import type { HealthData, Incident } from '../api/client';
import styles from './StatusPage.module.css';

export const StatusPage: React.FC = () => {
  const navigate = useNavigate();
  const [health, setHealth] = useState<HealthData | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [hData, iData] = await Promise.all([fetchHealth(), fetchIncidents()]);
        setHealth(hData);
        setIncidents(iData);
      } catch (e) {
        console.error('Failed to load status data', e);
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'up': return <CheckCircle2 size={24} className={styles.iconUp} />;
      case 'down': return <XCircle size={24} className={styles.iconDown} />;
      default: return <AlertCircle size={24} className={styles.iconAlert} />;
    }
  };

  const isHealthy = health?.upstream?.healthy ?? true;

  const today = new Date();
  const dateStr = today.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="app-container animate-fade-in">
      <header className={styles.stickyHeader}>
        <nav className={styles.nav}>
          <button onClick={() => navigate(-1)} className={styles.backBtn}>
            <ArrowLeft size={24} />
          </button>
          <div className={styles.navActions}>
             {/* Potential refresh button or other actions */}
          </div>
        </nav>
      </header>

      <div className={styles.viewModeHeader}>
        <h2 className={styles.dateTitle}>
          {dateStr}
          <span className={styles.headerSeparator}>•</span>
          <span className={styles.entityNameInline}>Мониторинг систем</span>
        </h2>
      </div>

      {loading && !health ? (
        <div className={styles.loading}>Загрузка статуса...</div>
      ) : (
        <>
          <div className={`${styles.heroCard} ${isHealthy ? styles.heroHealthy : styles.heroUnhealthy}`}>
            <div className={styles.heroHeader}>
              <div className={`${styles.statusDot} ${isHealthy ? styles.healthy : styles.unhealthy}`}></div>
              <h2>{isHealthy ? 'Все системы работают' : 'Сбой источника данных'}</h2>
            </div>
            
            {!isHealthy && health?.upstream?.last_error && (
              <div className={styles.lastErrorBox}>
                <div className={styles.errorLabel}>Текущая ошибка:</div>
                <div className={styles.errorText}>{health.upstream.last_error}</div>
              </div>
            )}
            
            <div className={styles.statsGrid}>
              <div className={styles.statBox}>
                <Clock size={16} />
                <div>
                  <div className={styles.statLabel}>Последнее обновление</div>
                  <div className={styles.statValue}>
                    {health?.last_sync?.schedules ? new Date(health.last_sync.schedules).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '—'}
                  </div>
                </div>
              </div>
              <div className={styles.statBox}>
                <AlertCircle size={16} />
                <div>
                  <div className={styles.statLabel}>Сбоев за всё время</div>
                  <div className={styles.statValue}>{health?.upstream?.total_failures || 0}</div>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.timelineSection}>
            <h3 className={styles.sectionTitle}>История инцидентов</h3>
            {incidents.length === 0 ? (
              <p className={styles.emptyText}>Инцидентов пока не зафиксировано.</p>
            ) : (
              <div className={styles.timeline}>
                {incidents.map((incident) => (
                  <div key={incident.id} className={styles.timelineItem}>
                    <div className={styles.timelineIcon}>
                      {getEventIcon(incident.event_type)}
                    </div>
                    <div className={styles.timelineContent}>
                      <div className={styles.timelineHeader}>
                        <span className={styles.timelineTitle}>{incident.message}</span>
                        <span className={styles.timelineTime}>
                          {new Date(incident.created_at).toLocaleDateString([], {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'})}
                        </span>
                      </div>
                      {incident.error_text && (
                        <div className={styles.timelineError}>{incident.error_text}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

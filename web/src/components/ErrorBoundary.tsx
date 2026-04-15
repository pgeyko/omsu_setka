import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          minHeight: '100vh', padding: '20px', textAlign: 'center', background: 'var(--bg-color)'
        }}>
          <AlertCircle size={48} color="var(--danger)" style={{ marginBottom: '16px' }} />
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>Ой, что-то пошло не так</h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
            В приложении произошла критическая ошибка. Мы уже её локализовали.
          </p>
          <button 
            className="icon-button" 
            style={{ padding: '8px 16px', background: 'var(--accent-color)', color: 'white', display: 'flex', gap: '8px', alignItems: 'center', borderRadius: 'var(--radius-full)' }}
            onClick={() => window.location.reload()}
          >
            <RefreshCw size={16} /> Попробовать снова
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

import { Link } from 'react-router-dom';
import { usePageMeta } from '../lib/usePageMeta';

export function NotFoundPage() {
  usePageMeta('Страница не найдена — сетка', 'Возможно, ссылка устарела.');
  return (
    <div className="fatal">
      <h1>Страница не найдена</h1>
      <p>Возможно, ссылка устарела. Вернитесь к расписанию.</p>
      <Link className="retry-btn" to="/">На главную</Link>
    </div>
  );
}

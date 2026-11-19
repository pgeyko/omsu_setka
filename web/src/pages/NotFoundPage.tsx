import { AppLink } from '../components/AppLink';
import { usePageMeta } from '../lib/usePageMeta';

export function NotFoundPage() {
  usePageMeta('Страница не найдена — сетка', 'Возможно, ссылка устарела.');
  return (
    <div className="fatal">
      <h1>Страница не найдена</h1>
      <p>Возможно, ссылка устарела. Вернитесь к расписанию.</p>
      <AppLink className="retry-btn" to="/" animate={false}>На главную</AppLink>
    </div>
  );
}

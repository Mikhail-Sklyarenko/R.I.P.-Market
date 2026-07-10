import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { filterSupportFaq } from '../data/support-faq';
import { SUPPORT_EMAIL } from '../utils/format';

type SupportWidgetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SupportWidget({ open, onOpenChange }: SupportWidgetProps) {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const widgetRef = useRef<HTMLDivElement>(null);
  const filteredArticles = filterSupportFaq(search);
  const greetingName = user?.steamPersonaName?.trim() || user?.username || 'гость';

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (widgetRef.current && !widgetRef.current.contains(event.target as Node)) {
        onOpenChange(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, onOpenChange]);

  return (
    <div className="support-widget" ref={widgetRef}>
      {open ? (
        <div className="support-widget-panel" data-testid="support-widget-panel">
          <div className="support-widget-panel-header">
            <h2 className="support-widget-title">Поддержка</h2>
            <button
              type="button"
              className="support-widget-close"
              aria-label="Закрыть"
              onClick={() => onOpenChange(false)}
            >
              ×
            </button>
          </div>

          <p className="support-widget-greeting" data-testid="support-widget-greeting">
            Здравствуйте, {greetingName}! Чем можем помочь?
          </p>

          <label className="field support-widget-search">
            <span className="sr-only">Поиск по FAQ</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск по вопросам…"
              data-testid="support-widget-search"
            />
          </label>

          <div className="support-widget-articles" data-testid="support-widget-articles">
            {filteredArticles.length === 0 ? (
              <p className="muted small">Ничего не найдено. Напишите нам — поможем вручную.</p>
            ) : (
              filteredArticles.map((article) => (
                <details key={article.id} className="support-widget-article">
                  <summary>{article.title}</summary>
                  <p className="muted small">{article.body}</p>
                </details>
              ))
            )}
          </div>

          <div className="support-widget-actions">
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="button primary sm"
              data-testid="support-widget-write"
            >
              Написать
            </a>
            <Link
              to="/support"
              className="button secondary sm"
              data-testid="support-widget-page-link"
              onClick={() => onOpenChange(false)}
            >
              Страница поддержки
            </Link>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className="support-widget-fab"
        aria-label="Открыть поддержку"
        aria-expanded={open}
        data-testid="support-widget-fab"
        onClick={() => onOpenChange(!open)}
      >
        ?
      </button>
    </div>
  );
}

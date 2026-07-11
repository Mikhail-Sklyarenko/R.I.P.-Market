import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  filterSupportWidgetFaq,
} from '../data/support-widget-faq';
import { SUPPORT_EMAIL } from '../utils/format';

type SupportWidgetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SupportWidget({ open, onOpenChange }: SupportWidgetProps) {
  const { user } = useAuth();
  const location = useLocation();
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const widgetRef = useRef<HTMLDivElement>(null);
  const filteredArticles = filterSupportWidgetFaq(search);
  const greetingName = user?.steamPersonaName?.trim() || user?.username || 'гость';
  const onFaqPage = location.pathname === '/support';

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

  useEffect(() => {
    if (!open) {
      setSearch('');
      setExpandedId(null);
    }
  }, [open]);

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
            <span className="sr-only">Поиск по статьям</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск по статьям…"
              data-testid="support-widget-search"
            />
          </label>

          <div className="support-widget-quick-links" data-testid="support-widget-articles">
            {filteredArticles.length === 0 ? (
              <p className="muted small">Ничего не найдено. Напишите нам — поможем вручную.</p>
            ) : (
              filteredArticles.map((article) => {
                const expanded = expandedId === article.id;
                return (
                  <div
                    key={article.id}
                    className={`support-widget-quick-item${expanded ? ' is-expanded' : ''}`}
                    data-testid={`support-widget-article-${article.id}`}
                  >
                    <button
                      type="button"
                      className="support-widget-quick-button"
                      aria-expanded={expanded}
                      onClick={() =>
                        setExpandedId((current) =>
                          current === article.id ? null : article.id,
                        )
                      }
                    >
                      {article.title}
                    </button>
                    {expanded ? (
                      <p className="muted small support-widget-quick-answer">{article.body}</p>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>

          <p className="muted small support-widget-hint">
            {onFaqPage
              ? 'Нужна помощь с конкретной сделкой? Опишите проблему в тикете ниже.'
              : 'Подробные инструкции — в полном разделе FAQ.'}
          </p>

          <div className="support-widget-actions">
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="button primary sm"
              data-testid="support-widget-write"
            >
              Отправить сообщение
            </a>
            {onFaqPage ? (
              <a
                href="#support-tickets"
                className="button secondary sm"
                data-testid="support-widget-ticket-link"
                onClick={() => onOpenChange(false)}
              >
                Создать тикет
              </a>
            ) : (
              <Link
                to="/support"
                className="button secondary sm"
                data-testid="support-widget-page-link"
                onClick={() => onOpenChange(false)}
              >
                Все вопросы
              </Link>
            )}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className="support-widget-fab"
        aria-label="Быстрая помощь"
        aria-expanded={open}
        data-testid="support-widget-fab"
        onClick={() => onOpenChange(!open)}
      >
        ?
      </button>
    </div>
  );
}

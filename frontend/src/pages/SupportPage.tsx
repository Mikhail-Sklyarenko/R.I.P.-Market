import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { createSupportTicket, listMySupportTickets } from '../api/marketplace';
import type { SupportTicket } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ErrorAlert } from '../components/ErrorAlert';
import { PageHeader } from '../components/PageHeader';
import {
  findFaqArticle,
  getDefaultFaqSelection,
  SUPPORT_FAQ_CATEGORIES,
  type SupportFaqCategoryId,
} from '../data/support-faq';
import { SUPPORT_EMAIL } from '../utils/format';

function renderFaqBody(body: string) {
  return body.split('\n\n').map((paragraph) => (
    <p key={paragraph.slice(0, 24)} className="support-faq-paragraph">
      {paragraph}
    </p>
  ));
}

export function SupportPage() {
  const { token } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const defaultSelection = useMemo(() => getDefaultFaqSelection(), []);
  const [selectedCategoryId, setSelectedCategoryId] = useState<SupportFaqCategoryId>(
    defaultSelection.categoryId,
  );
  const [selectedArticleId, setSelectedArticleId] = useState(defaultSelection.articleId);
  const [expandedCategoryId, setExpandedCategoryId] = useState<SupportFaqCategoryId | null>(
    defaultSelection.categoryId,
  );

  const selectedCategory = SUPPORT_FAQ_CATEGORIES.find(
    (category) => category.id === selectedCategoryId,
  );
  const selectedArticle =
    findFaqArticle(selectedCategoryId, selectedArticleId) ??
    selectedCategory?.articles[0] ??
    null;

  useEffect(() => {
    if (!token) {
      return;
    }
    listMySupportTickets(token)
      .then(setTickets)
      .catch(() => undefined);
  }, [token]);

  function toggleCategory(categoryId: SupportFaqCategoryId) {
    if (expandedCategoryId === categoryId) {
      setExpandedCategoryId(null);
      return;
    }

    const category = SUPPORT_FAQ_CATEGORIES.find((item) => item.id === categoryId);
    const firstArticle = category?.articles[0];
    setExpandedCategoryId(categoryId);
    setSelectedCategoryId(categoryId);
    if (firstArticle) {
      setSelectedArticleId(firstArticle.id);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token) {
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const ticket = await createSupportTicket(token, {
        subject: subject.trim(),
        body: body.trim(),
      });
      setTickets((current) => [ticket, ...current]);
      setSubject('');
      setBody('');
      setSuccess('Тикет создан. Команда поддержки ответит в этом разделе.');
    } catch (err: unknown) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page support-page">
      <PageHeader
        title="FAQ"
        subtitle="Полная база знаний R.I.P. Market — покупка, продажа, кошелёк и безопасность."
      />

      <div className="card support-faq-layout" data-testid="support-faq-section">
        <nav className="support-faq-sidebar" aria-label="Разделы FAQ">
          {SUPPORT_FAQ_CATEGORIES.map((category) => {
            const isExpanded = expandedCategoryId === category.id;
            const isActive = category.id === selectedCategoryId;
            return (
              <div
                key={category.id}
                className={`support-faq-sidebar-group${isExpanded ? ' is-expanded' : ''}${
                  isActive ? ' is-active' : ''
                }`}
                data-testid={`support-faq-category-${category.id}`}
              >
                <button
                  type="button"
                  className="support-faq-sidebar-category"
                  aria-expanded={isExpanded}
                  onClick={() => toggleCategory(category.id)}
                >
                  <span className="support-faq-sidebar-chevron" aria-hidden="true">
                    {isExpanded ? '▼' : '▶'}
                  </span>
                  {category.title}
                </button>
                {isExpanded ? (
                  <ul className="support-faq-sidebar-articles">
                    {category.articles.map((article) => (
                      <li key={article.id}>
                        <button
                          type="button"
                          className={`support-faq-sidebar-article${
                            selectedArticleId === article.id ? ' is-selected' : ''
                          }`}
                          data-testid={`support-faq-article-link-${article.id}`}
                          onClick={() => {
                            setSelectedCategoryId(category.id);
                            setSelectedArticleId(article.id);
                          }}
                        >
                          {article.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </nav>

        <article className="support-faq-content" data-testid="support-faq-content">
          {selectedArticle ? (
            <>
              <h2 className="support-faq-content-title">{selectedArticle.title}</h2>
              <div className="support-faq-content-body">
                {renderFaqBody(selectedArticle.body)}
              </div>
            </>
          ) : (
            <p className="muted">Выберите вопрос в меню слева.</p>
          )}
        </article>
      </div>

      <section
        id="support-tickets"
        className="card support-ticket-section"
        data-testid="support-page"
      >
        <h2 className="support-section-title">Создать тикет</h2>
        <p className="muted small">
          Не нашли ответ в FAQ? Укажите ID сделки и опишите проблему. Email:{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} data-testid="support-email-link">
            {SUPPORT_EMAIL}
          </a>
        </p>

        {!token ? (
          <p className="muted">
            <Link to="/login?returnUrl=%2Fsupport">Войдите</Link>, чтобы создать тикет.
          </p>
        ) : (
          <form className="support-ticket-form" onSubmit={(event) => void handleSubmit(event)}>
            <label className="field">
              <span className="field-label">Тема</span>
              <input
                type="text"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Проблема с обменом / выплатой"
                data-testid="support-ticket-subject"
                required
              />
            </label>
            <label className="field">
              <span className="field-label">Описание</span>
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={5}
                placeholder="ID сделки, что произошло, скриншоты ошибки…"
                data-testid="support-ticket-body"
                required
              />
            </label>
            <ErrorAlert error={error} />
            {success ? <p className="success-text">{success}</p> : null}
            <button
              type="submit"
              className="button primary"
              disabled={loading}
              data-testid="support-ticket-submit"
            >
              {loading ? 'Отправка…' : 'Отправить тикет'}
            </button>
          </form>
        )}

        {token && tickets.length > 0 ? (
          <div className="support-ticket-list" data-testid="support-ticket-list">
            <h3 className="support-subsection-title">Мои тикеты</h3>
            {tickets.map((ticket) => (
              <article key={ticket.id} className="support-ticket-card" data-testid={`support-ticket-${ticket.id}`}>
                <div className="support-ticket-card-header">
                  <strong>{ticket.subject}</strong>
                  <span className="muted small">{ticket.status === 'OPEN' ? 'Открыт' : 'Решён'}</span>
                </div>
                <p className="muted small">{ticket.body}</p>
                {ticket.adminReply ? (
                  <p className="support-ticket-reply" data-testid="support-ticket-reply">
                    <strong>Ответ поддержки:</strong> {ticket.adminReply}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}

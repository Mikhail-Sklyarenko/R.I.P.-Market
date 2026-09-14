import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLocale } from '../i18n';
import { PageHeader } from '../components/PageHeader';
import {
  findFaqArticle,
  getDefaultFaqSelection,
  getSupportFaqCategories,
  type SupportFaqCategoryId,
} from '../data/support-faq';

function renderFaqBody(body: string) {
  return body.split('\n\n').map((paragraph) => (
    <p key={paragraph.slice(0, 24)} className="support-faq-paragraph">
      {paragraph}
    </p>
  ));
}

export function FaqPage() {
  const { locale, t } = useLocale();
  const categories = useMemo(() => getSupportFaqCategories(locale), [locale]);
  const defaultSelection = useMemo(() => getDefaultFaqSelection(), []);
  const [selectedCategoryId, setSelectedCategoryId] = useState<SupportFaqCategoryId>(
    defaultSelection.categoryId,
  );
  const [selectedArticleId, setSelectedArticleId] = useState(defaultSelection.articleId);
  const [expandedCategoryId, setExpandedCategoryId] = useState<SupportFaqCategoryId | null>(
    defaultSelection.categoryId,
  );

  const selectedCategory = categories.find(
    (category) => category.id === selectedCategoryId,
  );
  const selectedArticle =
    findFaqArticle(selectedCategoryId, selectedArticleId, locale) ??
    selectedCategory?.articles[0] ??
    null;

  function toggleCategory(categoryId: SupportFaqCategoryId) {
    if (expandedCategoryId === categoryId) {
      setExpandedCategoryId(null);
      return;
    }

    const category = categories.find((item) => item.id === categoryId);
    const firstArticle = category?.articles[0];
    setExpandedCategoryId(categoryId);
    setSelectedCategoryId(categoryId);
    if (firstArticle) {
      setSelectedArticleId(firstArticle.id);
    }
  }

  return (
    <div className="page faq-page">
      <PageHeader
        title={t('faq.title')}
        subtitle={t('faq.subtitle')}
      />

      <div className="card support-faq-layout" data-testid="support-faq-section">
        <nav className="support-faq-sidebar" aria-label={t('faq.sectionsAria')}>
          {categories.map((category) => {
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
                    <svg viewBox="0 0 16 16" width="12" height="12">
                      {isExpanded ? (
                        <path
                          fill="currentColor"
                          d="M3.2 5.6a.75.75 0 0 1 1.06-.06L8 8.94l3.74-3.4a.75.75 0 1 1 1 1.12l-4.24 3.85a.75.75 0 0 1-1 0L3.26 6.66a.75.75 0 0 1-.06-1.06Z"
                        />
                      ) : (
                        <path
                          fill="currentColor"
                          d="M5.6 3.2a.75.75 0 0 1 1.06-.06l3.85 4.24a.75.75 0 0 1 0 1l-3.85 4.24a.75.75 0 1 1-1.12-1L8.94 8 5.54 4.26a.75.75 0 0 1 .06-1.06Z"
                        />
                      )}
                    </svg>
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
            <p className="muted">{t('faq.selectPrompt')}</p>
          )}
        </article>
      </div>

      <section className="card faq-support-cta" data-testid="faq-support-cta">
        <h2 className="support-section-title">{t('faq.ctaTitle')}</h2>
        <p className="muted small">{t('faq.ctaBody')}</p>
        <div className="faq-support-cta-actions">
          <Link to="/support" className="button primary sm" data-testid="faq-open-support">
            {t('faq.ctaButton')}
          </Link>
        </div>
      </section>
    </div>
  );
}

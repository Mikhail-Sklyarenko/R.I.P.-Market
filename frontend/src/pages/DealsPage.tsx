import { Link, useSearchParams } from 'react-router-dom';
import { useLocale } from '../i18n';
import { PageHeader } from '../components/PageHeader';
import { MyBuyRequestsPage } from './MyBuyRequestsPage';
import { MyLotsPage } from './MyLotsPage';
import { MyOrdersPage } from './MyOrdersPage';

export type DealsTab = 'purchases' | 'sales' | 'listings' | 'requests';

function parseDealsTab(value: string | null): DealsTab {
  if (value === 'sales' || value === 'listings' || value === 'requests') {
    return value;
  }
  return 'purchases';
}

export function DealsPage() {
  const { t } = useLocale();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseDealsTab(searchParams.get('tab'));

  function selectTab(next: DealsTab) {
    setSearchParams({ tab: next });
  }

  return (
    <div className="page seller-activity-page" data-testid="deals-page">
      <PageHeader
        title={t('deals.title')}
        subtitle={t('deals.subtitle')}
        actions={
          <Link to="/sell/inventory" className="button secondary">
            {t('lots.newLot')}
          </Link>
        }
      />

      <nav className="seller-activity-tabs" aria-label={t('deals.tabsAria')}>
        <button
          type="button"
          className={`seller-activity-tab${tab === 'purchases' ? ' active' : ''}`}
          aria-current={tab === 'purchases' ? 'page' : undefined}
          data-testid="deals-tab-purchases"
          onClick={() => selectTab('purchases')}
        >
          {t('deals.purchases')}
        </button>
        <button
          type="button"
          className={`seller-activity-tab${tab === 'sales' ? ' active' : ''}`}
          aria-current={tab === 'sales' ? 'page' : undefined}
          data-testid="deals-tab-sales"
          onClick={() => selectTab('sales')}
        >
          {t('deals.sales')}
        </button>
        <button
          type="button"
          className={`seller-activity-tab${tab === 'requests' ? ' active' : ''}`}
          aria-current={tab === 'requests' ? 'page' : undefined}
          data-testid="deals-tab-requests"
          onClick={() => selectTab('requests')}
        >
          {t('deals.requests')}
        </button>
        <button
          type="button"
          className={`seller-activity-tab${tab === 'listings' ? ' active' : ''}`}
          aria-current={tab === 'listings' ? 'page' : undefined}
          data-testid="deals-tab-listings"
          onClick={() => selectTab('listings')}
        >
          {t('deals.listings')}
        </button>
      </nav>

      {tab === 'purchases' ? (
        <MyOrdersPage embedded buyerOnly emptyStateMode="purchases" />
      ) : null}
      {tab === 'sales' ? (
        <MyOrdersPage embedded sellerOnly emptyStateMode="sales" />
      ) : null}
      {tab === 'requests' ? <MyBuyRequestsPage embedded /> : null}
      {tab === 'listings' ? <MyLotsPage embedded /> : null}
    </div>
  );
}

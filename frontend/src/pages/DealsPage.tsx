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

      <div className="seller-activity-tabs" role="tablist" aria-label={t('deals.tabsAria')}>
        <button
          type="button"
          role="tab"
          className={`seller-activity-tab${tab === 'purchases' ? ' active' : ''}`}
          aria-selected={tab === 'purchases'}
          data-testid="deals-tab-purchases"
          onClick={() => selectTab('purchases')}
        >
          {t('deals.purchases')}
        </button>
        <button
          type="button"
          role="tab"
          className={`seller-activity-tab${tab === 'sales' ? ' active' : ''}`}
          aria-selected={tab === 'sales'}
          data-testid="deals-tab-sales"
          onClick={() => selectTab('sales')}
        >
          {t('deals.sales')}
        </button>
        <button
          type="button"
          role="tab"
          className={`seller-activity-tab${tab === 'requests' ? ' active' : ''}`}
          aria-selected={tab === 'requests'}
          data-testid="deals-tab-requests"
          onClick={() => selectTab('requests')}
        >
          {t('deals.requests')}
        </button>
        <button
          type="button"
          role="tab"
          className={`seller-activity-tab${tab === 'listings' ? ' active' : ''}`}
          aria-selected={tab === 'listings'}
          data-testid="deals-tab-listings"
          onClick={() => selectTab('listings')}
        >
          {t('deals.listings')}
        </button>
      </div>

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

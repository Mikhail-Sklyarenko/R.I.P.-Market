import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { MyLotsPage } from './MyLotsPage';
import { MyOrdersPage } from './MyOrdersPage';

export type DealsTab = 'purchases' | 'sales' | 'listings';

function parseDealsTab(value: string | null): DealsTab {
  if (value === 'sales' || value === 'listings') {
    return value;
  }
  return 'purchases';
}

export function DealsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseDealsTab(searchParams.get('tab'));

  function selectTab(next: DealsTab) {
    setSearchParams({ tab: next });
  }

  return (
    <div className="page seller-activity-page" data-testid="deals-page">
      <PageHeader
        title="Сделки"
        subtitle="Покупки, продажи и ваши лоты в одном разделе."
        actions={
          <Link to="/sell/inventory" className="button secondary">
            Новый лот
          </Link>
        }
      />

      <div className="seller-activity-tabs" role="tablist" aria-label="Раздел сделок">
        <button
          type="button"
          role="tab"
          className={`seller-activity-tab${tab === 'purchases' ? ' active' : ''}`}
          aria-selected={tab === 'purchases'}
          data-testid="deals-tab-purchases"
          onClick={() => selectTab('purchases')}
        >
          Покупки
        </button>
        <button
          type="button"
          role="tab"
          className={`seller-activity-tab${tab === 'sales' ? ' active' : ''}`}
          aria-selected={tab === 'sales'}
          data-testid="deals-tab-sales"
          onClick={() => selectTab('sales')}
        >
          Продажи
        </button>
        <button
          type="button"
          role="tab"
          className={`seller-activity-tab${tab === 'listings' ? ' active' : ''}`}
          aria-selected={tab === 'listings'}
          data-testid="deals-tab-listings"
          onClick={() => selectTab('listings')}
        >
          Мои лоты
        </button>
      </div>

      {tab === 'purchases' ? (
        <MyOrdersPage embedded buyerOnly emptyStateMode="purchases" />
      ) : null}
      {tab === 'sales' ? (
        <MyOrdersPage embedded sellerOnly emptyStateMode="sales" />
      ) : null}
      {tab === 'listings' ? <MyLotsPage embedded /> : null}
    </div>
  );
}

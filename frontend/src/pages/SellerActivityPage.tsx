import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { MyLotsPage } from './MyLotsPage';
import { MyOrdersPage } from './MyOrdersPage';

type SellerActivityTab = 'lots' | 'orders';

export function SellerActivityPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: SellerActivityTab =
    searchParams.get('tab') === 'orders' ? 'orders' : 'lots';

  function selectTab(next: SellerActivityTab) {
    setSearchParams({ tab: next });
  }

  return (
    <div className="page seller-activity-page" data-testid="seller-activity-page">
      <PageHeader
        title="Мои продажи"
        subtitle="Лоты и сделки продавца в одном разделе."
        actions={
          <Link to="/sell/inventory" className="button secondary">
            Новый лот
          </Link>
        }
      />

      <div className="seller-activity-tabs" role="tablist" aria-label="Раздел продаж">
        <button
          type="button"
          role="tab"
          className={`seller-activity-tab${tab === 'lots' ? ' active' : ''}`}
          aria-selected={tab === 'lots'}
          data-testid="seller-activity-tab-lots"
          onClick={() => selectTab('lots')}
        >
          Мои лоты
        </button>
        <button
          type="button"
          role="tab"
          className={`seller-activity-tab${tab === 'orders' ? ' active' : ''}`}
          aria-selected={tab === 'orders'}
          data-testid="seller-activity-tab-orders"
          onClick={() => selectTab('orders')}
        >
          Мои сделки
        </button>
      </div>

      {tab === 'lots' ? <MyLotsPage embedded /> : <MyOrdersPage embedded sellerOnly />}
    </div>
  );
}

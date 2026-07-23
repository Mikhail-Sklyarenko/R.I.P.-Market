import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { NotificationCategory } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useLocale } from '../i18n';
import { useNotifications } from '../hooks/useNotifications';
import { ErrorAlert } from '../components/ErrorAlert';
import { LoadingState } from '../components/LoadingState';
import { NotificationItem } from '../components/NotificationItem';
import { PageHeader } from '../components/PageHeader';
import {
  isActionRequiredNotification,
  notificationCategoryFilterLabel,
  notificationEventFilterLabel,
  NOTIFICATION_CATEGORY_FILTER_IDS,
  NOTIFICATION_EVENT_FILTER_IDS,
  type NotificationCategoryFilterId,
  type NotificationEventFilterId,
} from '../utils/notification-labels';

export function NotificationsPage() {
  const { user } = useAuth();
  const { locale, t } = useLocale();
  const [categoryFilter, setCategoryFilter] = useState<NotificationCategoryFilterId>('all');
  const category: NotificationCategory | undefined =
    categoryFilter === 'all' ? undefined : categoryFilter;

  const { notifications, loading, error, unreadCount, markRead, markAllRead } =
    useNotifications({ pollMs: 10000, category });
  const [eventFilter, setEventFilter] = useState<NotificationEventFilterId>('all');
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  const filteredNotifications = useMemo(() => {
    return notifications.filter((notification) => {
      if (showUnreadOnly && notification.readAt) {
        return false;
      }
      if (eventFilter === 'action_required') {
        return isActionRequiredNotification(notification, user?.id);
      }
      if (eventFilter !== 'all' && notification.eventType !== eventFilter) {
        return false;
      }
      return true;
    });
  }, [notifications, eventFilter, showUnreadOnly, user?.id]);

  return (
    <div className="page">
      <PageHeader
        title={t('notifications.title')}
        subtitle={
          unreadCount > 0
            ? t('notifications.unreadCount', { count: unreadCount })
            : t('notifications.allRead')
        }
        actions={
          unreadCount > 0 ? (
            <button
              type="button"
              className="button secondary"
              data-testid="notifications-mark-all-read"
              onClick={() => void markAllRead()}
            >
              {t('notifications.readAll')}
            </button>
          ) : null
        }
      />

      <div className="card notifications-filters" data-testid="notifications-filters">
        <div className="catalog-filters-row">
          <label className="field catalog-filter-field">
            <span className="field-label">{t('notifications.category')}</span>
            <select
              value={categoryFilter}
              onChange={(event) =>
                setCategoryFilter(event.target.value as NotificationCategoryFilterId)
              }
              data-testid="notifications-category-filter"
            >
              {NOTIFICATION_CATEGORY_FILTER_IDS.map((id) => (
                <option key={id} value={id}>
                  {notificationCategoryFilterLabel(id, locale)}
                </option>
              ))}
            </select>
          </label>
          <label className="field catalog-filter-field">
            <span className="field-label">{t('notifications.eventType')}</span>
            <select
              value={eventFilter}
              onChange={(event) =>
                setEventFilter(event.target.value as NotificationEventFilterId)
              }
              data-testid="notifications-event-filter"
            >
              {NOTIFICATION_EVENT_FILTER_IDS.map((id) => (
                <option key={id} value={id}>
                  {notificationEventFilterLabel(id, locale)}
                </option>
              ))}
            </select>
          </label>
          <label className="field catalog-filter-field notifications-unread-toggle">
            <span className="field-label">{t('notifications.show')}</span>
            <select
              value={showUnreadOnly ? 'unread' : 'all'}
              onChange={(event) => setShowUnreadOnly(event.target.value === 'unread')}
              data-testid="notifications-read-filter"
            >
              <option value="all">{t('notifications.showAll')}</option>
              <option value="unread">{t('notifications.showUnread')}</option>
            </select>
          </label>
        </div>
      </div>

      <ErrorAlert error={error} />

      {loading ? <LoadingState message={t('common.loading')} /> : null}

      {!loading && filteredNotifications.length === 0 ? (
        <div className="card empty-state" data-testid="notifications-empty">
          <h3 className="empty-state-title">{t('notifications.emptyPageTitle')}</h3>
          <p className="empty-state-message">{t('notifications.emptyPageMessage')}</p>
          <Link to="/deals?tab=purchases" className="button secondary">
            {t('notifications.myDeals')}
          </Link>
        </div>
      ) : null}

      <div className="notifications-list" data-testid="notifications-list">
        {filteredNotifications.map((notification) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            onRead={async (item) => {
              if (!item.readAt) {
                await markRead(item.id);
              }
            }}
          />
        ))}
      </div>
    </div>
  );
}

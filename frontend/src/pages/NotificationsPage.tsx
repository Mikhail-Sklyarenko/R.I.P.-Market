import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { NotificationCategory } from '../api/types';
import { useNotifications } from '../hooks/useNotifications';
import { ErrorAlert } from '../components/ErrorAlert';
import { LoadingState } from '../components/LoadingState';
import { NotificationItem } from '../components/NotificationItem';
import { PageHeader } from '../components/PageHeader';
import {
  NOTIFICATION_CATEGORY_FILTER_OPTIONS,
  NOTIFICATION_EVENT_FILTER_OPTIONS,
} from '../utils/notification-labels';

type EventTypeFilter = (typeof NOTIFICATION_EVENT_FILTER_OPTIONS)[number]['value'];
type CategoryFilter = (typeof NOTIFICATION_CATEGORY_FILTER_OPTIONS)[number]['value'];

export function NotificationsPage() {
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const category: NotificationCategory | undefined =
    categoryFilter === 'all' ? undefined : categoryFilter;

  const { notifications, loading, error, unreadCount, markRead, markAllRead } =
    useNotifications({ pollMs: 10000, category });
  const [eventFilter, setEventFilter] = useState<EventTypeFilter>('all');
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  const filteredNotifications = useMemo(() => {
    return notifications.filter((notification) => {
      if (showUnreadOnly && notification.readAt) {
        return false;
      }
      if (eventFilter !== 'all' && notification.eventType !== eventFilter) {
        return false;
      }
      return true;
    });
  }, [notifications, eventFilter, showUnreadOnly]);

  return (
    <div className="page">
      <PageHeader
        title="Уведомления"
        subtitle={
          unreadCount > 0
            ? `${unreadCount} непрочитанных`
            : 'Все уведомления прочитаны'
        }
        actions={
          unreadCount > 0 ? (
            <button
              type="button"
              className="button secondary"
              data-testid="notifications-mark-all-read"
              onClick={() => void markAllRead()}
            >
              Прочитать все
            </button>
          ) : null
        }
      />

      <div className="card notifications-filters" data-testid="notifications-filters">
        <div className="catalog-filters-row">
          <label className="field catalog-filter-field">
            <span className="field-label">Категория</span>
            <select
              value={categoryFilter}
              onChange={(event) =>
                setCategoryFilter(event.target.value as CategoryFilter)
              }
              data-testid="notifications-category-filter"
            >
              {NOTIFICATION_CATEGORY_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field catalog-filter-field">
            <span className="field-label">Тип события</span>
            <select
              value={eventFilter}
              onChange={(event) => setEventFilter(event.target.value as EventTypeFilter)}
              data-testid="notifications-event-filter"
            >
              {NOTIFICATION_EVENT_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field catalog-filter-field notifications-unread-toggle">
            <span className="field-label">Показать</span>
            <select
              value={showUnreadOnly ? 'unread' : 'all'}
              onChange={(event) => setShowUnreadOnly(event.target.value === 'unread')}
              data-testid="notifications-read-filter"
            >
              <option value="all">Все</option>
              <option value="unread">Только непрочитанные</option>
            </select>
          </label>
        </div>
      </div>

      <ErrorAlert error={error} />

      {loading ? <LoadingState message="Загрузка уведомлений…" /> : null}

      {!loading && filteredNotifications.length === 0 ? (
        <div className="card empty-state" data-testid="notifications-empty">
          <h3 className="empty-state-title">Нет уведомлений</h3>
          <p className="empty-state-message">
            Здесь появятся события по вашим сделкам и кошельку.
          </p>
          <Link to="/my/orders" className="button secondary">
            Мои сделки
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

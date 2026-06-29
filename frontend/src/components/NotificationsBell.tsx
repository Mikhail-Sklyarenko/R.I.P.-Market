import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useNotifications } from '../hooks/useNotifications';
import { NotificationItem } from './NotificationItem';

const DROPDOWN_LIMIT = 10;

export function NotificationsBell() {
  const { notifications, unreadCount, markRead } = useNotifications();
  const [open, setOpen] = useState(false);

  async function handleRead(notification: { id: string; readAt: string | null }) {
    if (!notification.readAt) {
      await markRead(notification.id);
    }
  }

  return (
    <div className="notifications-wrap">
      <button
        type="button"
        className="button secondary notifications-button"
        onClick={() => setOpen((value) => !value)}
        data-testid="notifications-button"
        aria-expanded={open}
      >
        Notifications
        {unreadCount > 0 ? (
          <span className="notifications-badge" data-testid="notifications-unread-count">
            {unreadCount}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="notifications-panel" data-testid="notifications-panel">
          {notifications.length === 0 ? (
            <p className="muted small">No notifications yet.</p>
          ) : (
            notifications.slice(0, DROPDOWN_LIMIT).map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                compact
                onRead={handleRead}
              />
            ))
          )}
          <Link
            to="/notifications"
            className="notification-view-all"
            onClick={() => setOpen(false)}
            data-testid="notifications-view-all"
          >
            Все уведомления
          </Link>
        </div>
      ) : null}
    </div>
  );
}

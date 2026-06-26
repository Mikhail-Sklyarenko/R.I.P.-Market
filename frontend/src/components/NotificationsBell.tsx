import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listNotifications, markNotificationRead } from '../api/marketplace';
import type { Notification } from '../api/types';
import { useAuth } from '../auth/AuthContext';

export function NotificationsBell() {
  const { token } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    if (!token) {
      return;
    }
    listNotifications(token)
      .then(setNotifications)
      .catch(() => undefined);
  }, [token]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  const unreadCount = notifications.filter((item) => !item.readAt).length;

  async function handleRead(notification: Notification) {
    if (!token || notification.readAt) {
      return;
    }
    await markNotificationRead(token, notification.id);
    load();
  }

  return (
    <div className="notifications-wrap">
      <button
        type="button"
        className="button secondary notifications-button"
        onClick={() => setOpen((value) => !value)}
        data-testid="notifications-button"
      >
        Notifications
        {unreadCount > 0 ? <span className="notifications-badge">{unreadCount}</span> : null}
      </button>
      {open ? (
        <div className="notifications-panel" data-testid="notifications-panel">
          {notifications.length === 0 ? (
            <p className="muted small">No notifications yet.</p>
          ) : (
            notifications.slice(0, 10).map((notification) => (
              <button
                key={notification.id}
                type="button"
                className={`notification-item ${notification.readAt ? '' : 'unread'}`}
                data-testid={`notification-${notification.eventType}`}
                onClick={() => void handleRead(notification)}
              >
                <strong>{notification.title}</strong>
                <span>{notification.message}</span>
                {notification.payload &&
                typeof notification.payload.orderId === 'string' ? (
                  <Link
                    to={`/orders/${notification.payload.orderId}`}
                    onClick={(event) => event.stopPropagation()}
                  >
                    View order
                  </Link>
                ) : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

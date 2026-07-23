import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useLocale } from '../i18n';
import { useNotifications } from '../hooks/useNotifications';
import { getNotificationDisplay } from '../utils/notification-labels';
import { NotificationItem } from './NotificationItem';

const PANEL_LIMIT = 10;
const TOAST_MS = 4500;

type NotificationsWidgetProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

function BellIcon() {
  return (
    <svg
      className="notifications-widget-icon"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 3a5 5 0 0 0-5 5v2.1c0 .5-.2 1-.5 1.4L5.1 13.8A1 1 0 0 0 6 15.5h12a1 1 0 0 0 .9-1.7l-1.4-2.3c-.3-.4-.5-.9-.5-1.4V8a5 5 0 0 0-5-5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M10 18a2 2 0 0 0 4 0"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function NotificationsWidget({
  open: controlledOpen,
  onOpenChange,
}: NotificationsWidgetProps) {
  const { token, user } = useAuth();
  const { locale, t } = useLocale();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [internalOpen, setInternalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [pulseFab, setPulseFab] = useState(false);
  const widgetRef = useRef<HTMLDivElement>(null);
  const prevUnreadRef = useRef(0);

  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (widgetRef.current && !widgetRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, setOpen]);

  useEffect(() => {
    if (!token) {
      prevUnreadRef.current = 0;
      return;
    }

    if (unreadCount <= prevUnreadRef.current) {
      prevUnreadRef.current = unreadCount;
      return;
    }

    const latestUnread = notifications.find((item) => !item.readAt);
    if (latestUnread && user && prevUnreadRef.current > 0) {
      const display = getNotificationDisplay(latestUnread, user.id, locale);
      setToastMessage(display.title);
      setPulseFab(true);
      const toastTimer = window.setTimeout(() => setToastMessage(null), TOAST_MS);
      const pulseTimer = window.setTimeout(() => setPulseFab(false), TOAST_MS);
      prevUnreadRef.current = unreadCount;
      return () => {
        window.clearTimeout(toastTimer);
        window.clearTimeout(pulseTimer);
      };
    }

    prevUnreadRef.current = unreadCount;
    return undefined;
  }, [notifications, token, unreadCount, user, locale]);

  async function handleRead(notification: { id: string; readAt: string | null }) {
    if (!notification.readAt) {
      await markRead(notification.id);
    }
  }

  if (!token) {
    return null;
  }

  return (
    <div className="notifications-widget" ref={widgetRef}>
      {toastMessage && !open ? (
        <div className="notifications-widget-toast" data-testid="notifications-toast" role="status">
          {toastMessage}
        </div>
      ) : null}

      {open ? (
        <div className="notifications-widget-panel" data-testid="notifications-panel">
          <div className="notifications-widget-panel-header">
            <h2 className="notifications-widget-title">{t('notifications.title')}</h2>
            <div className="notifications-widget-panel-actions">
              {unreadCount > 0 ? (
                <button
                  type="button"
                  className="link-button small"
                  data-testid="notifications-mark-all-read"
                  onClick={() => void markAllRead()}
                >
                  {t('notifications.readAll')}
                </button>
              ) : null}
              <button
                type="button"
                className="notifications-widget-close"
                aria-label={t('notifications.close')}
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </div>
          </div>

          <div className="notifications-widget-list">
            {notifications.length === 0 ? (
              <p className="muted small">{t('notifications.empty')}</p>
            ) : (
              notifications.slice(0, PANEL_LIMIT).map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  compact
                  onRead={handleRead}
                />
              ))
            )}
          </div>

          <Link
            to="/notifications"
            className="notification-view-all"
            onClick={() => setOpen(false)}
            data-testid="notifications-view-all"
          >
            {t('notifications.viewAll')}
          </Link>
        </div>
      ) : null}

      <button
        type="button"
        className={`notifications-widget-fab${unreadCount > 0 ? ' has-unread' : ''}${pulseFab ? ' is-pulsing' : ''}`}
        aria-label={t('notifications.fabAria')}
        aria-expanded={open}
        data-testid="notifications-button"
        onClick={() => setOpen(!open)}
      >
        <BellIcon />
        {unreadCount > 0 ? (
          <span className="notifications-widget-badge" data-testid="notifications-unread-count">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>
    </div>
  );
}

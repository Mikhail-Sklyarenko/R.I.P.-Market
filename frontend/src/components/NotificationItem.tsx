import { useNavigate } from 'react-router-dom';
import type { Notification } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useLocale } from '../i18n';
import {
  getNotificationDisplay,
  getNotificationTargetPath,
} from '../utils/notification-labels';

type NotificationItemProps = {
  notification: Notification;
  onRead?: (notification: Notification) => void | Promise<void>;
  compact?: boolean;
};

export function NotificationItem({
  notification,
  onRead,
  compact = false,
}: NotificationItemProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { locale, t } = useLocale();
  const display = getNotificationDisplay(notification, user?.id, locale);
  const targetPath = getNotificationTargetPath(notification);

  async function handleClick() {
    if (!notification.readAt && onRead) {
      await onRead(notification);
    }
    if (targetPath) {
      navigate(targetPath);
    }
  }

  return (
    <button
      type="button"
      className={`notification-item ${notification.readAt ? '' : 'unread'}`}
      data-testid={`notification-${notification.eventType}`}
      onClick={() => void handleClick()}
    >
      <strong>{display.title}</strong>
      <span className={compact ? 'small muted' : ''}>{display.message}</span>
      {targetPath ? (
        <span className="small notification-item-link">
          {targetPath.startsWith('/orders/') ? t('notifications.open') : t('notifications.toWallet')}
        </span>
      ) : null}
    </button>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../api/marketplace';
import type { Notification, NotificationCategory } from '../api/types';
import { useAuth } from '../auth/AuthContext';

type UseNotificationsOptions = {
  pollMs?: number;
  unreadOnly?: boolean;
  category?: NotificationCategory;
};

export function useNotifications(options: UseNotificationsOptions = {}) {
  const { token } = useAuth();
  const { pollMs = 5000, unreadOnly = false, category } = options;
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const refresh = useCallback(
    async (silent = false) => {
      if (!token) {
        setNotifications([]);
        return;
      }
      if (!silent) {
        setLoading(true);
      }
      setError(null);
      try {
        const data = await listNotifications(token, { unreadOnly, category });
        setNotifications(data);
      } catch (err) {
        setError(err);
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [token, unreadOnly, category],
  );

  const markRead = useCallback(
    async (notificationId: string) => {
      if (!token) {
        return;
      }
      await markNotificationRead(token, notificationId);
      await refresh(true);
    },
    [token, refresh],
  );

  const markAllRead = useCallback(async () => {
    if (!token) {
      return;
    }
    await markAllNotificationsRead(token);
    await refresh(true);
  }, [token, refresh]);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.readAt).length,
    [notifications],
  );

  useEffect(() => {
    void refresh(false);
    const timer = window.setInterval(() => {
      void refresh(true);
    }, pollMs);
    return () => window.clearInterval(timer);
  }, [refresh, pollMs]);

  return {
    notifications,
    loading,
    error,
    unreadCount,
    refresh,
    markRead,
    markAllRead,
  };
}

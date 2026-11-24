import { Bell, Trash2 } from 'lucide-react';
import { Pagination, usePagination } from '@/components/ui/pagination';
import type { Notification } from './types';
import { ActionButton, EmptyBlock, Panel } from './ui';

interface NotificationsTabProps {
  notifications: Notification[];
  isBusy: (key: string) => boolean;
  onMarkRead: (n: Notification) => void;
  onMarkAllRead: () => void;
  onDelete: (n: Notification) => void;
}

export default function NotificationsTab({ notifications, isBusy, onMarkRead, onMarkAllRead, onDelete }: NotificationsTabProps) {
  const unread = notifications.filter((n) => !n.read).length;
  const { pageItems, ...pager } = usePagination(notifications, 15);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">Notifications</h1>
          <p className="text-sm text-zinc-500">{unread ? `${unread} unread` : 'All read'}</p>
        </div>
        {unread > 0 && (
          <ActionButton variant="secondary" loading={isBusy('read-all')} onClick={onMarkAllRead}>Mark all as read</ActionButton>
        )}
      </div>

      <Panel>
        {notifications.length === 0 ? (
          <EmptyBlock icon={<Bell className="h-5 w-5" />} title="No notifications" body="Payments, repair requests and listing enquiries will show up here." />
        ) : (
          <>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {pageItems.map((n) => (
                <li key={n.id} className={`flex gap-3 px-5 py-4 ${n.read ? '' : 'bg-zinc-50 dark:bg-zinc-800/40'}`}>
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-zinc-950 dark:bg-white'}`} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${n.read ? 'text-zinc-700 dark:text-zinc-300' : 'font-semibold text-zinc-950 dark:text-white'}`}>{n.title}</p>
                    <p className="mt-0.5 break-words text-sm text-zinc-500">{n.message}</p>
                    <p className="mt-1 text-xs text-zinc-400">
                      {new Date(n.createdAt).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-start gap-1">
                    {!n.read && (
                      <ActionButton size="sm" variant="ghost" loading={isBusy(`read-${n.id}`)} onClick={() => onMarkRead(n)}>Mark read</ActionButton>
                    )}
                    <ActionButton size="sm" variant="ghost" aria-label="Delete notification" loading={isBusy(`del-${n.id}`)} icon={<Trash2 className="h-4 w-4" />} onClick={() => onDelete(n)} />
                  </div>
                </li>
              ))}
            </ul>
            <div className="px-5 pb-4"><Pagination {...pager} onPageChange={pager.setPage} label="notifications" /></div>
          </>
        )}
      </Panel>
    </div>
  );
}

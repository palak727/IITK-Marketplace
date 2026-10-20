import { useEffect, useState } from 'react';
import { Bell, Check, X } from 'lucide-react';
import { api } from '../../utils/api';
import { useShop } from '../../context/ShopContext';

const NotificationInbox = ({ onClose }) => {
  const { token, refreshNotificationCount } = useShop();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.get(`/notifications?page=${page}&limit=20`, token)
      .then((result) => {
        if (!active) return;
        setNotifications((current) => page === 1 ? result.notifications || [] : [...current, ...(result.notifications || [])]);
        setTotal(result.total || 0);
        setError('');
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || 'Unable to load notifications.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, token]);

  const markRead = async (notification) => {
    try {
      await api.patch(`/notifications/${notification._id}/read`, {}, token);
      setNotifications((current) => current.map((item) => item._id === notification._id ? { ...item, read: true } : item));
      refreshNotificationCount();
    } catch (requestError) {
      setError(requestError.message || 'Unable to update this notification.');
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex justify-end" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="bg-white w-full max-w-md h-full shadow-2xl flex flex-col" role="dialog" aria-modal="true" aria-label="Notifications">
        <header className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-bold text-navy flex items-center gap-2"><Bell size={18} /> Notifications</h2>
          <button type="button" onClick={onClose} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg" aria-label="Close notifications"><X size={18} /></button>
        </header>
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {error && <p role="alert" className="px-5 py-3 text-sm text-rose-700">{error}</p>}
          {loading && notifications.length === 0 && <p role="status" className="p-6 text-center text-sm text-slate-500">Loading notifications...</p>}
          {!loading && !error && notifications.length === 0 && <p className="p-8 text-center text-sm text-slate-500">No notifications yet.</p>}
          {notifications.map((notification) => (
            <article key={notification._id} className={`px-5 py-4 ${notification.read ? 'bg-white' : 'bg-amber-50/70'}`}>
              <p className="text-sm text-slate-800">{notification.message}</p>
              <time className="mt-1 block text-xs text-slate-500">{new Date(notification.createdAt).toLocaleString()}</time>
              {!notification.read && (
                <button type="button" onClick={() => markRead(notification)} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-royal">
                  <Check size={14} /> Mark read
                </button>
              )}
            </article>
          ))}
          {notifications.length < total && (
            <button type="button" disabled={loading} onClick={() => setPage((current) => current + 1)} className="w-full p-4 text-sm font-semibold text-royal disabled:opacity-50">Load older</button>
          )}
        </div>
      </section>
    </div>
  );
};

export default NotificationInbox;

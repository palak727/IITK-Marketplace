import { useState, useEffect } from 'react';
import { useShop } from '../../context/ShopContext';
import { X, MessageSquare, ChevronRight } from 'lucide-react';
import { getProductId, api } from '../../utils/api';

export default function ChatInbox({ onClose }) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const { auth, openChat, all_product, unreadCount, socket } = useShop();

  useEffect(() => {
    if (!auth) {
      setConversations([]);
      setLoading(false);
      return;
    }

    const fetchMyChats = async () => {
      try {
        const token = auth?.token;
        setLoading(true);
        const data = await api.get(`/chat/my-conversations?page=${page}&limit=50`, token);
        setConversations((previous) => {
          const next = new Map(page === 1 ? [] : previous.map((item) => [item.conversationId, item]));
          (data?.conversations || []).forEach((item) => next.set(item.conversationId, item));
          return Array.from(next.values()).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        });
        setTotal(data?.total || 0);
      } catch (err) {
        console.error('Failed to fetch chats:', err);
        setConversations([]);
      } finally {
        setLoading(false);
      }
    };

    fetchMyChats();
  }, [auth, unreadCount, socket, page]);

  useEffect(() => {
    if (!auth || !socket) return undefined;

    const handler = (msg) => {
      if (!msg || !msg.conversationId) return;

      setConversations((prev) => {
        const next = [...prev];
        const index = next.findIndex((item) => item.conversationId === msg.conversationId);
        const entry = {
          conversationId: msg.conversationId,
          otherUserId: String(msg.senderId) === String(auth.user.id) ? String(msg.receiverId) : String(msg.senderId),
          otherUserName: String(msg.senderId) === String(auth.user.id) ? 'You' : (msg.senderName || 'IITKian'),
          productId: msg.productId || '',
          lastMessage: msg.text || 'New message',
          updatedAt: msg.createdAt || new Date().toISOString(),
          unread: String(msg.receiverId) === String(auth.user.id),
          product: msg.product || null,
        };

        if (index >= 0) {
          next[index] = { ...next[index], ...entry };
        } else {
          next.unshift(entry);
        }

        return next.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      });
    };

    socket.on('chat:message', handler);
    return () => socket.off('chat:message', handler);
  }, [auth, socket]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        
        {/* Header */}
        <div className="bg-navy text-white px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare size={20} />
            <h3 className="font-bold text-base">My Messages</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg text-slate-300 hover:text-white">
            <X size={20} />
          </button>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <p className="text-center text-slate-400 py-8 text-sm">Loading conversations...</p>
          ) : conversations.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm space-y-1">
              <MessageSquare size={32} className="mx-auto text-slate-300 mb-2" />
              <p className="font-semibold text-slate-600">No messages yet</p>
              <p className="text-xs">Messages from buyers or sellers will appear here.</p>
            </div>
          ) : (
            conversations.map((chat) => {
              const product =
                all_product.find((item) => String(getProductId(item)) === String(chat.productId)) ||
                chat.product ||
                { name: 'Product Inquiry', _id: chat.productId || '', image: '', new_price: 0, status: 'available' };

              return (
              <div
                key={chat.conversationId || chat._id}
                onClick={() => {
                  openChat(product, chat.otherUserId, chat.otherUserName || 'IITKian', chat.productId || getProductId(product));
                  onClose();
                }}
                className="p-3 rounded-xl border border-slate-200 hover:border-royal hover:bg-slate-50 cursor-pointer transition flex items-center justify-between group"
              >
                <div className="min-w-0 flex-1 pr-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-bold text-xs text-navy truncate">
                      {chat.otherUserName || 'IITKian'}
                    </p>
                    <span className="text-[10px] text-slate-400">
                      {new Date(chat.updatedAt || chat.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-royal truncate mb-0.5">
                    📦 {chat.product?.name || 'Product Inquiry'}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {chat.lastMessage || 'Tap to view conversation'}
                  </p>
                </div>
                <ChevronRight size={16} className="text-slate-400 group-hover:text-royal shrink-0" />
              </div>
              );
            })
          )}
          {!loading && conversations.length < total && (
            <button type="button" onClick={() => setPage((current) => current + 1)} className="w-full py-3 text-sm font-semibold text-royal">Load older conversations</button>
          )}
        </div>
      </div>
    </div>
  );
}

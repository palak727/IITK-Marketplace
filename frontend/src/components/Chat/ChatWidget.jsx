import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Circle, Tag, MapPin } from 'lucide-react';
import LazyImage from '../LazyImage/LazyImage';
import { useShop } from '../../context/ShopContext';
import { api, formatPrice, getProductId, getStatusBadge } from '../../utils/api';

const ChatWidget = () => {
  const { activeChat, closeChat, sendMessage, auth, socket, onlineUsers, token, refreshUnreadCount } = useShop();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [messagePage, setMessagePage] = useState(1);
  const [messageTotal, setMessageTotal] = useState(0);
  const bottomRef = useRef(null);

  const currentUserId = String(auth?.user?.id || auth?.user?._id || '');
  const sellerId = String(activeChat?.sellerId || activeChat?.product?.sellerId || '');
  const isOnline = sellerId ? onlineUsers[sellerId] : false;

  useEffect(() => {
    if (!activeChat || !auth || !currentUserId) {
      setMessages([]);
      return undefined;
    }

    const productId = String(activeChat.productId || getProductId(activeChat.product) || '');
    const conversationId = [currentUserId, sellerId].sort().join('_') + (productId ? `_${productId}` : '');
    let disposed = false;

    const fetchHistory = async () => {
      try {
        const result = await api.get(`/chat/conversation/${conversationId}?page=1&limit=50`, token || auth.token);
        if (disposed) return;
        setMessages(result.messages || []);
        setMessageTotal(result.total || 0);
        setMessagePage(1);
        setHistoryError('');
        await api.post(`/chat/conversation/${conversationId}/read`, {}, token || auth.token).catch(() => null);
        refreshUnreadCount();
      } catch (error) {
        if (disposed) return;
        if (error.status === 404) {
          setMessages([]);
          setMessageTotal(0);
          setHistoryError('');
        } else {
          setHistoryError(error.message || 'Unable to load conversation history.');
        }
      }
    };

    const joinAndLoad = () => {
      if (socket?.connected) {
        socket.timeout(5000).emit('chat:join', { conversationId }, () => fetchHistory());
      } else {
        fetchHistory();
      }
    };
    const handleMessage = (message) => {
      if (!message || message.conversationId !== conversationId) return;
      setMessages((previous) => previous.some((item) => (item._id || item.id) === (message._id || message.id))
        ? previous
        : [...previous, message]);
    };

    setMessages([]);
    setHistoryError('');
    if (socket) {
      socket.on('chat:message', handleMessage);
      socket.on('connect', joinAndLoad);
    }
    joinAndLoad();

    return () => {
      disposed = true;
      socket?.off('chat:message', handleMessage);
      socket?.off('connect', joinAndLoad);
    };
  }, [socket, activeChat, auth, currentUserId, sellerId, token, refreshUnreadCount]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (event) => {
    event.preventDefault();
    if (!input.trim() || sending) return;
    const text = input.trim();
    setSending(true);
    try {
      const message = await sendMessage(text);
      if (message) {
        setMessages((previous) => previous.some((item) => (item._id || item.id) === (message._id || message.id))
          ? previous
          : [...previous, message]);
        setInput('');
      }
      setHistoryError('');
    } catch (error) {
      setHistoryError(error.message || 'Message could not be sent.');
    } finally {
      setSending(false);
    }
  };

  const loadOlderMessages = async () => {
    const nextPage = messagePage + 1;
    const productId = String(activeChat.productId || getProductId(activeChat.product) || '');
    const conversationId = [currentUserId, sellerId].sort().join('_') + (productId ? `_${productId}` : '');
    try {
      const result = await api.get(`/chat/conversation/${conversationId}?page=${nextPage}&limit=50`, token || auth?.token);
      setMessages((previous) => [...(result.messages || []), ...previous]);
      setMessagePage(nextPage);
      setHistoryError('');
    } catch (error) {
      setHistoryError(error.message || 'Unable to load older messages.');
    }
  };

  if (!activeChat) return null;

  const badge = getStatusBadge(activeChat.product?.status);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 50, scale: 0.95 }}
        className="fixed bottom-4 right-4 w-[380px] max-w-[calc(100vw-2rem)] z-50 glass-card overflow-hidden shadow-2xl flex flex-col max-h-[560px]"
      >
        <div className="bg-navy text-white px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <div className="w-9 h-9 rounded-full bg-royal text-white font-bold text-sm flex items-center justify-center">
                {(activeChat.sellerName || 'S').charAt(0)}
              </div>
              <Circle
                size={10}
                className={`absolute bottom-0 right-0 rounded-full border-2 border-navy ${
                  isOnline ? 'fill-emerald-400 text-emerald-400' : 'fill-slate-400 text-slate-400'
                }`}
              />
            </div>
            <div>
              <p className="font-bold text-sm leading-tight">{activeChat.sellerName || 'Senior Seller'}</p>
              <p className="text-[11px] text-slate-300">
                {isOnline ? 'Online now' : 'IITK Student'} · Direct Buyer-Seller Chat
              </p>
            </div>
          </div>
          <button onClick={closeChat} className="p-1 hover:bg-white/10 rounded-lg text-slate-300 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="p-3 border-b border-slate-200 bg-slate-50/80 flex gap-3 items-center">
          <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 border border-slate-200">
            <LazyImage src={activeChat.product?.image} alt="" className="w-full h-full" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.className}`}>
                {badge.label}
              </span>
              {activeChat.product?.hall && (
                <span className="text-[10px] text-slate-500 flex items-center gap-0.5">
                  <MapPin size={10} /> {activeChat.product.hall}
                </span>
              )}
            </div>
            <p className="text-xs font-semibold text-navy truncate">{activeChat.product?.name}</p>
            <p className="text-sm font-bold text-royal">{formatPrice(activeChat.product?.new_price)}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[220px] max-h-[300px] bg-slate-50/30">
          {messageTotal > messages.length && (
            <button type="button" onClick={loadOlderMessages} className="text-xs text-royal underline">Load older messages</button>
          )}
          {historyError && <p role="alert" className="text-xs text-rose-600">{historyError}</p>}
          {messages.length === 0 && (
            <div className="text-center py-6 text-slate-400 text-xs space-y-1">
              <Tag size={20} className="mx-auto text-slate-300 mb-2" />
              <p className="font-semibold text-slate-600">Start the conversation</p>
              <p>Discuss pickup timing in hostel or payment details</p>
            </div>
          )}
          {messages.map((msg) => {
            const isMine = String(msg.senderId) === currentUserId;
            return (
              <div key={msg._id || msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[82%] px-3.5 py-2.5 rounded-2xl text-sm ${
                    isMine
                      ? 'bg-royal text-white rounded-br-none shadow-sm'
                      : 'bg-white border border-slate-200 text-navy rounded-bl-none shadow-sm'
                  }`}
                >
                  {!isMine && <p className="text-[10px] font-bold text-royal mb-0.5">{msg.senderName}</p>}
                  <p className="leading-snug">{msg.text}</p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={handleSend} className="p-3 bg-white border-t border-slate-200 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={2000}
            placeholder="Ask about pickup time, condition..."
            className="flex-1 input-field py-2 text-sm"
          />
          <button type="submit" disabled={sending || !input.trim()} className="btn-primary p-2.5 shrink-0 disabled:opacity-50">
            <Send size={18} />
          </button>
        </form>
      </motion.div>
    </AnimatePresence>
  );
};

export default ChatWidget;

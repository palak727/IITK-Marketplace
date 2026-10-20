import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import toast from 'react-hot-toast';
import { useShop } from '../../context/ShopContext';
import ChatInbox from '../Chat/ChatInbox';
import NotificationInbox from '../Notifications/NotificationInbox';
import iitkLogo from '../../assets/iitk_logo.jpeg';

const Header = () => {
  const { user, logout, getCartCount, unreadCount, notificationUnreadCount, searchQuery, setSearchQuery } = useShop();
  const [showInbox, setShowInbox] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleSearch = (value) => {
    setSearchQuery(value);
    if (location.pathname !== '/') navigate('/');
  };

  const totalCartCount = getCartCount();

  return (
    <>
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          
          {/* Logo Section */}
          <Link to="/" className="flex items-center gap-3 group">
            <img
              src={iitkLogo}
              alt="IIT Kanpur Logo"
              className="w-10 h-10 object-contain group-hover:scale-105 transition-transform"
            />
            <div>
              <h1 className="text-base font-bold text-slate-900 leading-tight">IITK Marketplace</h1>
              <p className="text-[11px] text-slate-500 font-medium">Campus buy & sell</p>
            </div>
          </Link>

          <div className="flex-1 max-w-md mx-4 hidden md:block">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => handleSearch(event.target.value)}
                placeholder="Search coolers, mattresses, cycles..."
                className="input-field py-2 text-sm bg-slate-100/70 border-transparent focus:bg-white"
              />
            </div>
          </div>

          {/* Navigation Items */}
          <div className="flex items-center gap-1 sm:gap-2">
            
            {/* 1. Home Link */}
            <Link
              to="/"
              className="px-3 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition-colors"
            >
              <span className="hidden sm:inline">Home</span>
            </Link>

            {/* 2. Sell Link */}
            {user ? (
              <Link
                to="/dashboard"
                className="px-3 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition-colors"
              >
                <span className="hidden sm:inline">Sell</span>
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => {
                  toast.error('Please sign in to list an item.');
                  navigate('/login', { state: { from: '/dashboard' } });
                }}
                className="px-3 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition-colors"
              >
                <span className="hidden sm:inline">Sell</span>
              </button>
            )}

            {/* Chat Inbox Button */}
            <button
              type="button"
              onClick={() => {
                if (!user) {
                  toast.error('Please sign in to view notifications.');
                  navigate('/login', { state: { from: location.pathname } });
                  return;
                }
                setShowNotifications(true);
              }}
              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors relative"
              title="Notifications"
              aria-label="Notifications"
            >
              <Bell size={19} />
              {notificationUnreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-rose-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {notificationUnreadCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                if (!user) {
                  toast.error('Please sign in to view messages.');
                  navigate('/login', { state: { from: location.pathname } });
                  return;
                }
                setShowInbox(true);
              }}
              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors relative cursor-pointer"
              title="Messages"
            >
              Messages
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Cart Link */}
            <Link
              to="/cart"
              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors relative"
              title="Cart"
            >
              Cart
              {totalCartCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-amber-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {totalCartCount}
                </span>
              )}
            </Link>

            <div className="h-4 w-px bg-slate-200 mx-1 hidden sm:block" />

            {/* User Profile / Auth Button */}
            {user ? (
              <div className="flex items-center gap-2 pl-1">
                <span className="text-sm font-semibold text-slate-700 hidden sm:inline">
                  {user.name || user.email?.split('@')[0]}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setShowInbox(false);
                    setShowNotifications(false);
                    logout();
                  }}
                  className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                  title="Logout"
                >
                  Logout
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="btn-primary py-2 px-4 text-xs sm:text-sm font-semibold"
              >
                Login / Sign Up
              </Link>
            )}
          </div>

        </div>
        <div className="md:hidden px-4 pb-3">
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => handleSearch(event.target.value)}
            placeholder="Search campus listings"
            aria-label="Search campus listings"
            className="input-field py-2 text-sm bg-slate-100/70 border-transparent focus:bg-white"
          />
        </div>
      </header>

      {/* Chat Inbox Pop-up Modal */}
      {showInbox && user && <ChatInbox key={user.id || user._id} onClose={() => setShowInbox(false)} />}
      {showNotifications && user && <NotificationInbox key={user.id || user._id} onClose={() => setShowNotifications(false)} />}
    </>
  );
};

export default Header;

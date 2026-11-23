import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Bell, LogOut, MessageCircle, Search, ShoppingBag } from 'lucide-react';
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
  const totalCartCount = getCartCount();

  const handleSearch = (value) => {
    setSearchQuery(value);
    if (location.pathname !== '/') navigate('/');
  };
  const requireUser = (message, open) => {
    if (!user) {
      toast.error(message);
      navigate('/login', { state: { from: location.pathname } });
      return;
    }
    open();
  };

  return <>
    <header className="market-header">
      <div className="market-header-inner">
        <Link to="/" className="market-brand" aria-label="IITK Marketplace home">
          <img src={iitkLogo} alt="" />
          <span className="market-brand-copy"><strong>IITK Marketplace</strong><small>Campus buy & sell</small></span>
        </Link>
        <label className="market-search">
          <Search size={16} />
          <input type="search" value={searchQuery} onChange={(event) => handleSearch(event.target.value)} placeholder="Search campus listings" aria-label="Search campus listings" className="input-field" />
        </label>
        <nav className="market-nav" aria-label="Main navigation">
          <Link to="/" aria-label="Home"><span className="nav-label">Browse</span></Link>
          {user ? <Link to="/dashboard"><span className="nav-label">Sell</span></Link> : <button type="button" onClick={() => { toast.error('Please sign in to list an item.'); navigate('/login', { state: { from: '/dashboard' } }); }}><span className="nav-label">Sell</span></button>}
          <button type="button" onClick={() => requireUser('Please sign in to view notifications.', () => setShowNotifications(true))} title="Notifications" aria-label={`Notifications${notificationUnreadCount ? `, ${notificationUnreadCount} unread` : ''}`}>
            <Bell size={17} /><span className="market-count" style={{ display: notificationUnreadCount > 0 ? 'grid' : 'none' }}>{notificationUnreadCount}</span>
          </button>
          <button type="button" onClick={() => requireUser('Please sign in to view messages.', () => setShowInbox(true))} title="Messages" aria-label={`Messages${unreadCount ? `, ${unreadCount} unread` : ''}`}>
            <MessageCircle size={17} /><span className="nav-label">Messages</span>{unreadCount > 0 && <span className="market-count">{unreadCount}</span>}
          </button>
          <Link to="/cart" title="Cart" aria-label={`Cart${totalCartCount ? `, ${totalCartCount} items` : ''}`}>
            <ShoppingBag size={17} /><span className="nav-label">Cart</span>{totalCartCount > 0 && <span className="market-count">{totalCartCount}</span>}
          </Link>
          {user ? <button type="button" onClick={() => { setShowInbox(false); setShowNotifications(false); logout(); }} title="Log out" aria-label="Log out"><LogOut size={17} /><span className="nav-label">Logout</span></button> : <Link to="/login" className="market-login">Sign in</Link>}
        </nav>
      </div>
      <div className="market-mobile-search"><label className="market-search" style={{ display: 'block', maxWidth: 'none' }}><Search size={16} /><input type="search" value={searchQuery} onChange={(event) => handleSearch(event.target.value)} placeholder="Search campus listings" aria-label="Search campus listings" className="input-field" /></label></div>
    </header>
    {showInbox && user && <ChatInbox key={user.id || user._id} onClose={() => setShowInbox(false)} />}
    {showNotifications && user && <NotificationInbox key={user.id || user._id} onClose={() => setShowNotifications(false)} />}
  </>;
};

export default Header;

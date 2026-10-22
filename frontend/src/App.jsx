import { Routes, Route, Navigate } from 'react-router-dom';
import Header from './components/Header/Header';
import Footer from './components/Footer/Footer';
import ChatWidget from './components/Chat/ChatWidget';
import Shop from './pages/Shop';
import ShopCategory from './pages/ShopCategory';
import Product from './pages/Product';
import Cart from './pages/Cart';
import LoginSignUp from './pages/LoginSignUp';
import ForgotPassword from './pages/ForgotPassword';
import Dashboard from './pages/Dashboard';
import NotFound from './pages/NotFound';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans">
      <Header />

      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Shop />} />
          <Route path="/category/:category" element={<ShopCategory />} />
          <Route path="/coolers" element={<Navigate to="/category/coolers" replace />} />
          <Route path="/matress" element={<Navigate to="/category/mattresses" replace />} />
          <Route path="/mattresses" element={<Navigate to="/category/mattresses" replace />} />
          <Route path="/cycles" element={<Navigate to="/category/cycles" replace />} />
          <Route path="/product/:productId" element={<Product />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/login" element={<LoginSignUp />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      <Footer />
      <ChatWidget />
    </div>
  );
}

export default App;
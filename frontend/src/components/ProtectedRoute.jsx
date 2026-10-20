import { Navigate, useLocation } from 'react-router-dom';
import { useShop } from '../context/ShopContext';

const ProtectedRoute = ({ children }) => {
  const { auth } = useShop();
  const location = useLocation();

  if (!auth) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }

  return children;
};

export default ProtectedRoute;

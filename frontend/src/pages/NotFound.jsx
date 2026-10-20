import { Link } from 'react-router-dom';

const NotFound = () => (
  <div className="max-w-lg mx-auto px-4 py-20 text-center">
    <div className="glass-card p-10 border border-slate-200">
      <h1 className="text-2xl font-bold text-navy mb-2">Page not found</h1>
      <p className="text-slate-500 text-sm mb-6">
        That page is not part of the campus marketplace. Head back to browse listings.
      </p>
      <Link to="/" className="btn-primary inline-block text-sm">
        Go back to Marketplace
      </Link>
    </div>
  </div>
);

export default NotFound;

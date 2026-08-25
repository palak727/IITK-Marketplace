# IITK Campus Marketplace

A campus marketplace for IIT Kanpur students to buy and sell used essentials such as coolers, mattresses, cycles, appliances, and study materials. The platform supports verified @iitk.ac.in authentication, OTP-based flows, listing management, cart actions, filtered discovery, and real-time buyer-seller chat.

## Project summary for resume

Built a full-stack campus marketplace that helps IITK students buy and sell everyday essentials securely and efficiently. The system includes verified student authentication, OTP-based account flows, product listing and filtering, cart management, seller dashboards, and live messaging for item inquiries. The platform is designed for real campus use, with a resilient in-memory fallback and production-oriented architecture details for local development and deployment readiness.

## Stack

- Frontend: React + Vite + Tailwind CSS
- Backend: Node.js + Express + Socket.IO (deployed on Render)
- Database: MongoDB for durable data
- Auth and security: JWT-based session handling and OTP verification workflows

## Architecture overview

- Frontend: Vite single-page app that renders the product catalog, dashboard, cart, and chat experience.
- Backend API: Express routes for authentication, product management, chat history, and seller workflows.
- Database layer: MongoDB is the primary persistent store; the app automatically falls back to an in-memory store when no valid connection is configured.
- Message system: Socket.IO provides real-time buyer-seller chat through the persistent Render backend.
- Queueing and async flow: OTP/email delivery is handled in a non-blocking style so the app can keep serving requests without waiting on mail transport delays.
- Auth flow: JWT tokens are generated on login and validated for protected routes, while OTP verification enforces IITK-only access.

## Production-ready details

- Environment configuration is managed through environment variables such as MONGO_URI, JWT_SECRET, and optional email credentials.
- Health checks are exposed at /health for deployment probes and service monitoring.
- Logging is kept simple and explicit through console-based startup and connection messages.
- The app is structured to support a clean local/dev mode and future deployment to a managed host or container environment.
- Route-level guards and request validation help protect the API from malformed requests.

## Project layout

- frontend/: Vite frontend app
- backend/: Express API, chat socket handlers, MongoDB models, product, and auth logic
- README.md: project overview and setup guide

## Local setup

1. Install backend dependencies
   ```bash
   cd backend
   npm install
   ```

2. Start the backend server
   ```bash
   npm start
   ```
   The API runs on http://localhost:5000

3. Install frontend dependencies
   ```bash
   cd ../frontend
   npm install
   ```

4. Start the frontend app
   ```bash
   npm run dev
   ```
   The app runs on http://localhost:5173

5. Optional: run automated checks
   ```bash
   cd ../backend
   npm test
   ```

## Environment notes

- The backend uses MongoDB when MONGO_URI is set. Configure it on Render; the in-memory fallback is local-development only and is intentionally ephemeral.
- Deploy the backend to Render and set FRONTEND_URL to the frontend URL. Set frontend VITE_API_BASE_URL to `https://your-backend.onrender.com/api` and VITE_SOCKET_URL to `https://your-backend.onrender.com`.
- A /health endpoint returns app health and uptime for deployment checks.
- For live email delivery, configure EMAIL_USER and EMAIL_PASS in the backend environment.

## Core features

- Verified IITK mail registration and login
- OTP request and verification flow
- Product browsing by category, hall, and search filters
- Filtered marketplace product lists
- Add-to-cart and cart total tracking
- Seller product reservations and status updates
- chat through HTTP polling
- Reset password flow using OTP
- Sold-item filtering from public listings

## Impact narrative

Built a campus marketplace serving student sellers and buyers across IITK, with secure listing workflows, buyer-seller chat, and trusted student authentication. The platform supports real-time product inquiries, protected seller dashboards, and streamlined campus commerce for everyday essentials.

## Notes

- The app only accepts @iitk.ac.in email addresses for student authentication.
- The frontend expects the backend at http://localhost:5000 unless VITE_API_BASE_URL is configured.
- The app includes a default pagination model and a scoped conversation model to support more realistic product-specific messaging.

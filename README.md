# IITK Campus Marketplace

A campus marketplace for IIT Kanpur students to buy and sell used essentials such as coolers, mattresses, cycles, appliances, and study materials. The platform supports verified @iitk.ac.in authentication, OTP-based flows, listing management, cart actions, filtered discovery, and real-time buyer-seller chat.

## Project summary for resume

Built a full-stack campus marketplace that helps IITK students buy and sell everyday essentials securely and efficiently. The system includes verified student authentication, purpose-bound OTP flows, protected product and reservation workflows, cart management, seller dashboards, and live messaging.

## Stack

- Frontend: React + Vite + Tailwind CSS
- Backend: Node.js + Express + Socket.IO (deployed on Render)
- Database: MongoDB for durable data
- Auth and security: JWT-based session handling and OTP verification workflows

## Architecture overview

- Frontend: Vite single-page app that renders the product catalog, dashboard, cart, and chat experience.
- Backend API: Express routes for authentication, product management, chat history, and seller workflows.
- Database layer: MongoDB is the only backend database. The server will not start unless it connects successfully.
- Message system: Socket.IO provides real-time buyer-seller chat through the persistent Render backend.
- Queueing and async flow: OTP/email delivery is handled in a non-blocking style so the app can keep serving requests without waiting on mail transport delays.
- Auth flow: JWT tokens are generated on login, checked against the current user for protected routes, and expire after seven days. OTP verification gates registration and password reset.

## Production-ready details

- Environment configuration is managed through variables such as MONGO_URI, JWT_SECRET, and the Gmail API OAuth credentials used for OTP email delivery.
- Health checks are exposed at /health for deployment probes and service monitoring.
- `/readiness` reports ready only when MongoDB and required production configuration are available.
- Logging is kept simple and explicit through console-based startup and connection messages.
- The app is structured to support a clean local/dev mode and future deployment to a managed host or container environment.
- Route-level guards and request validation help protect the API from malformed requests.

## Project layout

- frontend/: Vite frontend app
- backend/: Express API, chat socket handlers, MongoDB models, product, and auth logic
- README.md: project overview and setup guide

## Local setup

1. Start a local MongoDB instance or create a MongoDB Atlas database, then configure `MONGO_URI` in `backend/.env`.

2. Install backend dependencies
   ```bash
   cd backend
   npm install
   ```

3. Seed the existing sample listings into MongoDB (safe to repeat):
   ```bash
   npm run seed
   ```
   This imports the records from `backend/data/seedProducts.js`. Seeded listings use stable, non-user seller identifiers and are browse-only because no seller accounts are created. Re-running the command skips already-seeded records without changing their fields or deleting existing listings.

4. Start the backend server
   ```bash
   npm start
   ```
   The API runs on http://localhost:5000

5. Install frontend dependencies
   ```bash
   cd ../frontend
   npm install
   ```

6. Start the frontend app
   ```bash
   npm run dev
   ```
   The app runs on http://localhost:5173

7. Run the repository test suite and frontend production build from the root
   ```bash
   npm test
   npm run build
   ```

## Environment notes

- Copy `backend/.env.example` for local development and configure `MONGO_URI` plus the needed integration settings only in the ignored `.env` file or the hosting provider's environment settings. `MONGO_URI` is mandatory in every environment.
- Production Render configuration requires `MONGO_URI` (a MongoDB Atlas connection string), a random `JWT_SECRET` of at least 32 characters, explicit HTTPS `FRONTEND_URL` origins, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, and `GMAIL_USER`.
- After configuring Render's backend `MONGO_URI`, run `npm run seed` from the backend directory in an environment that can reach the same Atlas cluster. The seed command is not run during server startup.
- Set Vercel `VITE_API_BASE_URL` to `https://your-backend.onrender.com/api` and `VITE_SOCKET_URL` to `https://your-backend.onrender.com`.
- `/health` is a liveness check; use `/readiness` as the production readiness probe.
- For live OTP email delivery, configure `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, and `GMAIL_USER` in the backend environment. The backend uses the Gmail API with the `https://www.googleapis.com/auth/gmail.send` scope; authorize the sending Gmail account once during setup and keep all four values server-side. If logs report `invalid_grant`, the refresh token is revoked, expired, or was issued for a different OAuth client/account: re-authorize the sending account with the Gmail send scope using the configured client, then replace `GMAIL_REFRESH_TOKEN` in the backend environment and redeploy. For OAuth apps in Testing status, refresh tokens can expire after seven days.
- OTP verification state and marketplace data are persisted in MongoDB. Per-process rate limits are not shared across multiple Render instances; use a shared rate-limit store before scaling horizontally.
- Vercel production builds fail unless both `VITE_API_BASE_URL` and `VITE_SOCKET_URL` are set to your public backend origin (never commit secrets in Vite variables).
- JWTs are stored in browser `localStorage` for this SPA + Socket.IO setup. This is a known XSS tradeoff; keep tokens out of URLs/logs and prefer HttpOnly cookies only if you migrate auth holistically.

## Core features

- Verified IITK mail registration and login
- OTP request and verification flow
- Product browsing by category, hall, and search filters
- Filtered marketplace product lists
- Add-to-cart and cart total tracking
- Seller product reservations and status updates
- real-time chat over authenticated Socket.IO with REST fallback
- Reset password flow using OTP
- Sold-item filtering from public listings

## Impact narrative

Built a campus marketplace serving student sellers and buyers across IITK, with verified student registration, protected listing workflows, buyer-seller chat, and seller dashboards.

## Notes

- The app only accepts @iitk.ac.in email addresses for student authentication.
- The frontend expects the backend at http://localhost:5000 unless VITE_API_BASE_URL is configured.
- The app includes a default pagination model and a scoped conversation model to support more realistic product-specific messaging.
- Logout removes the JWT from this browser. It does not revoke tokens already issued elsewhere; they remain valid until their seven-day expiry or until the user is deleted/disabled.

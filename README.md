# IITK Campus Marketplace

A marketplace for IIT Kanpur students to buy and sell used items like coolers, mattresses, cycles, appliances, and books.

Students can sign up using their IITK email, browse listings, manage products, add items to their cart, and chat with sellers in real time.

## Tech Stack

- **Frontend:** React, Vite, Tailwind CSS
- **Backend:** Node.js, Express
- **Database:** MongoDB
- **Real-time chat:** Socket.IO
- **Authentication:** JWT and email OTP verification
- **Deployment:** Render (backend) and Vercel (frontend)

## Features

- IITK email-based registration and login
- OTP verification and password reset
- Browse products by category, hall, and search filters
- Add items to cart and view the total price
- Create, update, and manage product listings
- Contact sellers through chat to arrange a purchase
- Seller dashboard to manage listings and mark completed sales
- Real-time buyer-seller chat with a REST fallback
- Filter sold items from public listings

## Project Structure

```text
├── frontend/   # React application
├── backend/    # Express API, database models and chat
├── README.md
└── vercel.json
```

## Getting Started

### 1. Set up the backend

Make sure MongoDB is running locally or create a MongoDB Atlas database.

Create a `backend/.env` file using `backend/.env.example` as a reference. Configure the required environment variables, including `MONGO_URI`.

Install the backend dependencies:

```bash
cd backend
npm install
```

### 2. Seed local user accounts and sample products

```bash
export MONGO_URI=mongodb://127.0.0.1:27017/iitk-marketplace
export SEED_USER_PASSWORD='choose-a-password-for-new-seed-users'
npm --prefix backend run seed
```

The seed command creates missing users with verified email and a bcrypt-hashed password from `SEED_USER_PASSWORD`. Existing accounts and passwords are left unchanged. It links sample listings to the corresponding users, and rerunning it reuses the accounts and products. In production, set `ALLOW_PRODUCTION_SEED=true` only for the command, then unset it:

```bash
ALLOW_PRODUCTION_SEED=true npm --prefix backend run seed
```

PowerShell equivalent (with `MONGO_URI` and `SEED_USER_PASSWORD` already set in the process environment):

```powershell
$env:NODE_ENV = 'production'
$env:ALLOW_PRODUCTION_SEED = 'true'
npm --prefix backend run seed
Remove-Item Env:ALLOW_PRODUCTION_SEED
```

Seeded account emails are `priya.verma@iitk.ac.in`, `aman.sharma@iitk.ac.in`, `rohan.gupta@iitk.ac.in`, `sneha.patel@iitk.ac.in`, and `ananya.roy@iitk.ac.in`. If a matching account already exists in the target database, its email and password are left unchanged; log in with its existing password or use the normal password reset flow.

### 3. Start the backend

```bash
npm start
```

The backend runs at [https://iitk-marketplace.onrender.com/](https://iitk-marketplace.onrender.com/).

### 4. Start the frontend

Open another terminal and run:

```bash
cd frontend
npm install
npm run dev
```

The frontend runs at [https://iitk-marketplace-lrey.vercel.app/](https://iitk-marketplace-lrey.vercel.app/).

### 5. Run tests and build the frontend

From the repository root:

```bash
npm test
npm run build
```

## Environment Variables

### Backend

Configure these variables in `backend/.env` or your hosting provider:

- `MONGO_URI` — MongoDB connection string
- `JWT_SECRET` — secret used to sign JWTs
- `FRONTEND_URL` — allowed frontend URL or comma-separated URLs
- `GMAIL_CLIENT_ID` — Gmail OAuth client ID
- `GMAIL_CLIENT_SECRET` — Gmail OAuth client secret
- `GMAIL_REFRESH_TOKEN` — token used to refresh Gmail access
- `GMAIL_USER` — Gmail account used to send OTP emails
- `SOLD_PRODUCT_RETENTION_DAYS` — days to retain sold listings before soft-archiving them (default: `30`)
- `PRODUCT_CLEANUP_INTERVAL_MS` — cleanup interval in milliseconds (default: `3600000`, one hour)

Keep all secrets private and never commit them to Git.

### Frontend

The frontend uses `http://localhost:5000` by default for local development.

For deployment, configure these Vercel environment variables:

- `VITE_API_BASE_URL` — backend URL including `/api`
- `VITE_SOCKET_URL` — backend base URL for Socket.IO

For example, if your backend is deployed on Render, use its public URL for both variables, adding `/api` only to `VITE_API_BASE_URL`.

## Deployment Notes

- Configure the backend environment variables in Render and the frontend variables in Vercel.
- Seed users and listings only when needed. In either environment, configure `MONGO_URI` and `SEED_USER_PASSWORD`, then run `npm --prefix backend run seed`. For production, also set `ALLOW_PRODUCTION_SEED=true` only while running that command, then unset it. Seeding does not run during application startup. Existing accounts and listings are reused, and existing account passwords and listing details are not overwritten.
- Buyers contact sellers through chat. Sellers mark their own listings sold after completing a transaction; sold listings disappear from public browsing immediately.
- The backend starts a scheduled cleanup task after connecting to MongoDB. It soft-archives sold listings after the configured retention period. Archived products remain in MongoDB so chat and notification references are preserved. Listings without a valid `soldAt` date and available listings are retained.
- Cleanup runs in bounded batches of 100 and is safe to run on multiple backend instances. The in-process interval triggers the same idempotent cleanup task.
- Before deploying, run `npm --prefix backend run migrate:lifecycle` against the target MongoDB to create/verify product indexes. The command does not rewrite or delete product data.
- Existing databases may still contain legacy `reserved` products, fields, and indexes. Before removing those stored values, use a reviewed one-time migration that changes only `status: "reserved"` products to `available`, unsets `reservedBy`, `reservedUntil`, and `reservationRequestId`, and drops the old product `status_1_reservedUntil_1` index. The unused reservation-request collection and its indexes are not deleted automatically; preserve that history unless it has been separately reviewed.
- `/health` reports basic service status, while `/readiness` checks whether the backend is ready to serve traffic.
- Marketplace data and OTP verification state are stored in MongoDB.
- Rate limits are maintained per backend process. A shared rate-limit store is needed before running multiple backend instances.
- JWTs are stored in browser `localStorage` and expire after seven days. Logging out removes the token from the current browser but does not revoke tokens already issued elsewhere.

## Notes

- Only `@iitk.ac.in` email addresses are accepted for student authentication.
- Never commit `.env` files, OAuth credentials, or other secrets.
- If OTP emails stop working because the Gmail refresh token expires or becomes invalid, re-authorize the sending account and update `GMAIL_REFRESH_TOKEN` in the backend environment.

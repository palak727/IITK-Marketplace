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
- Reserve products and update their status
- Seller dashboard to manage listings and reservations
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

### 2. Add sample products

```bash
npm run seed
```

This adds sample listings to the database. You can run the command again without duplicating the seeded products. These listings are for browsing and are not linked to actual seller accounts.

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

Keep all secrets private and never commit them to Git.

### Frontend

The frontend uses `http://localhost:5000` by default for local development.

For deployment, configure these Vercel environment variables:

- `VITE_API_BASE_URL` — backend URL including `/api`
- `VITE_SOCKET_URL` — backend base URL for Socket.IO

For example, if your backend is deployed on Render, use its public URL for both variables, adding `/api` only to `VITE_API_BASE_URL`.

## Deployment Notes

- Configure the backend environment variables in Render and the frontend variables in Vercel.
- Run `npm run seed` from the backend directory to add sample products to the production database.
- `/health` reports basic service status, while `/readiness` checks whether the backend is ready to serve traffic.
- Marketplace data and OTP verification state are stored in MongoDB.
- Rate limits are maintained per backend process. A shared rate-limit store is needed before running multiple backend instances.
- JWTs are stored in browser `localStorage` and expire after seven days. Logging out removes the token from the current browser but does not revoke tokens already issued elsewhere.

## Notes

- Only `@iitk.ac.in` email addresses are accepted for student authentication.
- Never commit `.env` files, OAuth credentials, or other secrets.
- If OTP emails stop working because the Gmail refresh token expires or becomes invalid, re-authorize the sending account and update `GMAIL_REFRESH_TOKEN` in the backend environment.

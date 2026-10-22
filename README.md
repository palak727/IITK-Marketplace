# IITK Campus Marketplace

A marketplace for IIT Kanpur students to buy and sell used items such as coolers, mattresses, cycles, appliances, and books.

Students can register using their IITK email, browse listings, manage products, and chat with sellers in real time.

## Tech Stack

- **Frontend:** React, Vite, Tailwind CSS
- **Backend:** Node.js, Express.js
- **Database:** MongoDB
- **Authentication:** JWT, Email OTP Verification
- **Real-time Chat:** Socket.IO
- **Image Storage:** Cloudinary
- **Deployment:** Vercel (Frontend), Render (Backend)

## Features

- IITK email-based registration and login
- Email OTP verification and password reset
- Browse and search listings by category and hall
- Add products to cart and calculate total price
- Create, edit, and delete product listings
- Real-time buyer-seller chat with REST API fallback
- Seller dashboard to manage listings and mark items as sold
- Sold items automatically disappear from public listings

## Project Structure

```text
├── frontend/       # React frontend
├── backend/        # Express API, models, and chat
├── README.md
└── vercel.json
```

## Getting Started

### Prerequisites

- Node.js and npm
- MongoDB local instance or MongoDB Atlas account
- Cloudinary account for product image uploads
- Gmail OAuth credentials for OTP emails

### 1. Configure Environment Variables

Create `backend/.env` using `backend/.env.example` as a reference.

Configure the following variables:

```env
MONGO_URI=
JWT_SECRET=
FRONTEND_URL=

GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REFRESH_TOKEN=
GMAIL_USER=

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
SEED_USER_PASSWORD=
```

For the frontend, configure the following variables in `frontend/.env` for local development:

```env
VITE_API_BASE_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
```

### 2. Start the Backend

```bash
cd backend
npm install
npm start
```

### 3. Start the Frontend

Open another terminal:

```bash
cd frontend
npm install
npm run dev
```

The frontend and backend should now be running locally.

## Deployment

- **Frontend:** [IITK Campus Marketplace](https://iitk-marketplace-lrey.vercel.app/)
- **Backend:** [Render API](https://iitk-marketplace.onrender.com/)

To deploy your own instance:

1. Deploy the backend to Render and configure its environment variables.
2. Deploy the frontend to Vercel.
3. Set `VITE_API_BASE_URL` to your backend URL followed by `/api`.
4. Set `VITE_SOCKET_URL` to your backend's base URL.
5. Ensure MongoDB, Gmail OAuth, and Cloudinary are configured correctly.

## Notes

- Only `@iitk.ac.in` email addresses are accepted for registration.
- Product images are stored in Cloudinary; MongoDB stores their URLs.
- Sellers can manage,chat with and delete only their own listings.
- The backend seeds its sample users and products at startup in both development and production. Set `SEED_USER_PASSWORD` to the password for newly created sample accounts; existing seed users and listings are reused on later restarts.
- Never commit `.env` files or expose credentials and secrets.
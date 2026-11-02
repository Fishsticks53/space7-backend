# space7

A topic-based discussion platform where each **Space** represents one discussion topic with a single continuous message thread. Messages can receive **Appreciations** (likes) to surface high-quality contributions.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express.js, Sequelize ORM |
| Database | PostgreSQL (Render) |
| Realtime | Socket.IO |
| Queue | BullMQ |
| Redis | Upstash Redis |
| File Storage | Cloudinary |
| Auth | JWT + bcrypt |
| Email | Nodemailer + Brevo SMTP |
| Validation | Joi |
| Infrastructure | Render (Backend + Database) |
| Frontend | React Native (Expo), Axios, Socket.IO client, React Navigation, Context API |

---

## Architecture

- **Backend API** is deployed on **Render**
- **PostgreSQL database** is hosted on **Render**
- **Redis instance** used for BullMQ queues is hosted on **Upstash**
- **Cloudinary** is used for media storage
- **Brevo SMTP** is used for sending transactional emails

---

## Project Structure

```
space7/
├── backend/
│   ├── src/
│   │   ├── config/         # Database, Redis, Cloudinary config
│   │   ├── controllers/    # Route handlers
│   │   ├── middlewares/    # Auth, error, validation middleware
│   │   ├── models/         # Sequelize models + associations
│   │   ├── queues/         # BullMQ queue definitions
│   │   ├── routes/         # Express route definitions
│   │   ├── services/       # Business logic
│   │   ├── sockets/        # Socket.IO server
│   │   ├── utils/          # Helpers (JWT, OTP, email, word counter)
│   │   ├── validators/     # Joi schemas
│   │   ├── workers/        # BullMQ workers
│   │   ├── app.js          # Express app
│   │   └── server.js       # HTTP server entry point
│   ├── package.json
├── mobile/
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── contexts/       # AuthContext, SocketContext
│   │   ├── navigation/     # AppNavigator
│   │   ├── screens/        # All app screens
│   │   └── services/       # API service layer
│   ├── App.js
│   └── package.json
├── .env.example
└── README.md
```

---

# Getting Started (Development)

### Prerequisites

- Node.js **18+**
- Expo CLI
- PostgreSQL (optional for local development)

---

## 1. Clone the repository

```bash
git clone https://github.com/yourusername/space7.git
cd space7
```

---

## 2. Configure environment variables

Create a `.env` file from the template.

```bash
cp .env.example .env
```

Fill in the required values.

Important environment variables include:

```
JWT_SECRET=your_secret

DATABASE_URL=your_render_postgres_connection_string

REDIS_HOST=your_upstash_redis_host
REDIS_PORT=your_upstash_redis_port
REDIS_PASSWORD=your_upstash_redis_password

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

BREVO_SMTP_HOST=smtp-relay.brevo.com
BREVO_SMTP_PORT=587
BREVO_SMTP_USER=your_brevo_login
BREVO_SMTP_PASS=your_brevo_api_key
```

---

## 3. Start the backend

```bash
cd backend
npm install
npm start
```

The backend server will run on:

```
http://localhost:5000
```

The application connects to:

- **Render PostgreSQL database**
- **Upstash Redis instance**

---

## 4. Start the mobile app

```bash
cd mobile
npm install
npx expo start
```

Run on:

- Android emulator (`a`)
- iOS simulator (`i`)
- Physical device via **Expo Go**

Update the API base URL in:

```
mobile/src/services/api.js
```

Example:

```
https://space7backend.onrender.com/


# Email Service

Transactional emails such as:

- Signup OTP
- Password Reset OTP
- Account notifications

are sent using **Brevo SMTP** via **Nodemailer**.

Example configuration:

```
BREVO_SMTP_HOST=smtp-relay.brevo.com
BREVO_SMTP_PORT=587
BREVO_SMTP_USER=your_brevo_login
BREVO_SMTP_PASS=your_brevo_api_key
```

---

# API Endpoints

### Auth

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/signup` | Register new user |
| POST | `/api/auth/verify-otp` | Verify email OTP |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/forgot-password` | Request password reset OTP |
| POST | `/api/auth/reset-password` | Reset password with OTP |

---

### Spaces

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/spaces/trending` | Trending spaces |
| GET | `/api/spaces/search?q=` | Search spaces |
| GET | `/api/spaces/tag/:tag` | Search by hashtag |
| GET | `/api/spaces/recommended` | Recommended for user |
| GET | `/api/spaces/my` | User's joined spaces |
| POST | `/api/spaces` | Create a space |
| GET | `/api/spaces/:id` | Get space details |
| POST | `/api/spaces/:id/join` | Join a space |
| POST | `/api/spaces/:id/invite` | Generate invite code |
| DELETE | `/api/spaces/:id/members/:userId` | Remove member |
| PUT | `/api/spaces/:id/lock` | Toggle lock |
| PUT | `/api/spaces/:id/archive` | Archive space |

---

### Messages

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/messages/:spaceId` | List messages (sort=recent\|most_appreciated) |
| POST | `/api/messages/:spaceId` | Send message (supports media upload) |
| POST | `/api/messages/:spaceId/:messageId/appreciate` | Toggle appreciation |
| DELETE | `/api/messages/:spaceId/:messageId` | Delete message |

---

### Profile

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/profile/me` | Own profile + stats |
| GET | `/api/profile/user/:userId` | Other user profile |
| GET | `/api/profile/search?q=` | Search users |
| PUT | `/api/profile/username` | Update username |
| PUT | `/api/profile/bio` | Update bio |
| PUT | `/api/profile/picture` | Upload avatar |
| PUT | `/api/profile/password` | Change password |
| DELETE | `/api/profile/account` | Delete account |

---

### Notifications

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/notifications` | List notifications |
| PUT | `/api/notifications/:id/read` | Mark as read |
| PUT | `/api/notifications/read-all` | Mark all as read |

---

# Socket.IO Events

| Event | Direction | Description |
|---|---|---|
| `join_space` | Client → Server | Join a space room (private spaces: members only; optional ack `{ ok, error }`) |
| `leave_space` | Client → Server | Leave a space room |
| `receive_message` | Server → Client | New message received (emitted after `POST /api/messages/:spaceId`) |
| `message_appreciated` | Server → Client | Message appreciation update (emitted after the appreciate endpoint) |

Messages are sent over REST, not the socket, so the server can check membership and persist them first.

---

# Environment Variables

See `.env.example` for the complete list.

| Variable | Description |
|---|---|
| JWT_SECRET | Secret used for signing JWT tokens |
| DATABASE_URL | Render PostgreSQL connection string |
| REDIS_HOST | Upstash Redis host |
| REDIS_PORT | Upstash Redis port |
| REDIS_PASSWORD | Upstash Redis password |
| CLOUDINARY_* | Cloudinary storage credentials |
| BREVO_SMTP_HOST | Brevo SMTP server |
| BREVO_SMTP_PORT | Brevo SMTP port |
| BREVO_SMTP_USER | Brevo SMTP login |
| BREVO_SMTP_PASS | Brevo SMTP API key |

---

# Demo Video

[Watch Demo](project_demo.mp4)

---

# License

MIT

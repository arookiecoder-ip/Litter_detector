# LitterWatch 🌿 — AI-Powered Litter Detection System

A production-ready, real-time litter detection and evidence capture webapp powered by TensorFlow.js, Express.js, and MongoDB. Deployed with a split architecture: **Vercel (frontend)** + **DigitalOcean (backend)**.

🌐 **Live Demo:** [https://litter-detector.vercel.app](https://litter-detector.vercel.app)  
🔌 **API Base:** `http://157.245.98.171:3005/api`

---

## How It Works

1. **Connects to your webcam** via the `getUserMedia()` WebRTC API
2. **Runs TensorFlow.js COCO-SSD** object detection at 1–15 configurable FPS — entirely in the browser
3. **Detects litter events** — when a litter item and a person are simultaneously detected above configurable confidence thresholds
4. **Automatically captures a JPEG** of the incident and uploads it to the backend
5. **Stores evidence** in MongoDB with GridFS image store, GPS coordinates, severity scoring, and a status lifecycle
6. **Auto-expires data** after 90 days (GDPR TTL index)

No video is ever uploaded to the server — only a single JPEG snapshot per detected incident.

---

## Architecture

```
Browser (Vanilla JS + TF.js COCO-SSD)
       │
       │  /api/* proxied by Vercel rewrites
       ▼
Vercel CDN  ──────────────────────────────────▶  DigitalOcean VPS (Ubuntu)
(Static frontend: index.html, app.js, style.css)     PM2 → Express.js :3005
                                                           │
                                                      MongoDB :27017
                                                      (GridFS image store)
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JS, TensorFlow.js COCO-SSD, WebRTC |
| Backend | Node.js, Express.js |
| Database | MongoDB + Mongoose + GridFS |
| Auth | JWT (access 15m + refresh 7d rotation) |
| Process Manager | PM2 |
| Frontend Hosting | Vercel |
| Backend Hosting | DigitalOcean (Ubuntu) |
| Security | Helmet, bcrypt, express-rate-limit, express-validator |
| Logging | Winston |

---

## Project Structure

```
Litter_detector/
├── backend/
│   ├── config/
│   │   ├── db.js                # MongoDB connection + retry logic
│   │   └── environment.js       # Centralized env var config
│   ├── controllers/
│   │   ├── authController.js    # Register / login / refresh / me
│   │   ├── captureController.js # Upload, list, get, update, delete
│   │   └── imageController.js   # GridFS image streaming
│   ├── middleware/
│   │   ├── auth.js              # JWT verification middleware
│   │   ├── upload.js            # Multer + MIME/magic byte validation
│   │   └── validation.js        # express-validator rule sets
│   ├── models/
│   │   ├── User.js              # User schema (bcrypt, 12 rounds)
│   │   ├── Capture.js           # Evidence schema (90-day TTL)
│   │   └── Event.js             # Audit log schema
│   ├── routes/
│   │   ├── auth.js              # /api/auth/*
│   │   ├── capture.js           # /api/capture/*
│   │   └── images.js            # /api/images/*
│   ├── utils/
│   │   └── logger.js            # Winston security event logger
│   ├── server.js                # Express app entry point
│   ├── .env                     # ⚠️ Git-ignored — create from .env.example
│   └── .env.example             # Template with all required variables
├── frontend/
│   ├── public/
│   │   ├── index.html           # Single-page app shell
│   │   ├── app.js               # Vanilla JS application (TF.js, WebRTC, UI)
│   │   ├── style.css            # Full design system
│   │   └── vercel.json          # Vercel rewrites (fallback if root used)
│   └── src/services/
│       └── api.js               # API client module
├── test/
│   └── captureController.test.js
├── ecosystem.config.js           # PM2 production config
├── vercel.json                   # Vercel build + API proxy config
├── Dockerfile
├── docker-compose.yml
├── nginx.conf
└── README.md
```

---

## Local Development

### Prerequisites

- Node.js 18+
- MongoDB (local install or Atlas URI)
- Modern browser with webcam access

### 1. Clone & Install

```bash
git clone https://github.com/<your-username>/Litter_detector.git
cd Litter_detector
npm install
```

### 2. Configure Environment

```bash
cp backend/.env.example backend/.env
# Open backend/.env and fill in:
#   MONGODB_URI — your local or Atlas connection string
#   JWT_SECRET — min 64 random chars
#   JWT_REFRESH_SECRET — min 64 random chars (different from above)
```

Generate secrets quickly:
```bash
node -e "const c=require('crypto'); console.log(c.randomBytes(48).toString('hex'))"
# Run twice — one for each secret
```

### 3. Start the Backend

```bash
npm run dev
# Server starts at http://localhost:5000
```

### 4. Serve the Frontend

```bash
npx serve frontend/public
# Open http://localhost:3000
```

---

## Production Deployment (DigitalOcean + Vercel)

### Backend — DigitalOcean Ubuntu VPS

#### 1. Install Node.js & PM2

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
npm install -g pm2
```

#### 2. Install MongoDB

```bash
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
  gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor

echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] \
  https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | \
  tee /etc/apt/sources.list.d/mongodb-org-7.0.list

apt-get update && apt-get install -y mongodb-org
systemctl start mongod && systemctl enable mongod
```

#### 3. Clone & Configure

```bash
git clone https://github.com/<your-username>/Litter_detector.git
cd Litter_detector
npm install

# Create the .env file
cp backend/.env.example backend/.env
nano backend/.env
```

**Required values in `backend/.env`:**

```env
PORT=3005
NODE_ENV=production
MONGODB_URI=mongodb://127.0.0.1:27017/litter-detection-db
ALLOWED_ORIGINS=https://litter-detector.vercel.app
JWT_SECRET=<64+ char random string>
JWT_REFRESH_SECRET=<different 64+ char random string>
```

#### 4. Start with PM2

```bash
pm2 start backend/server.js --name litter-detector-backend
pm2 save
pm2 startup   # copy & run the command it outputs
```

#### 5. Open Firewall Port

```bash
ufw allow 3005/tcp
ufw reload
```

#### 6. Verify

```bash
curl http://localhost:3005/api/health
# → {"status":"ok","environment":"production"}
```

---

### Frontend — Vercel

The `vercel.json` at the repo root handles everything:
- Serves `frontend/public/` as static files
- Proxies all `/api/*` requests to the DigitalOcean backend

#### Deploy Steps

1. Import repo at [vercel.com/new](https://vercel.com/new)
2. **Root Directory:** leave as `/` (repo root)
3. **Build Command:** leave blank (static site)
4. **Output Directory:** leave blank (handled by `vercel.json`)
5. Click **Deploy**

No environment variables needed in Vercel — all API calls are proxied to the backend.

---

## API Reference

### Authentication

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | ❌ | Create account |
| POST | `/api/auth/login` | ❌ | Login — returns JWT access + refresh tokens |
| POST | `/api/auth/refresh` | ❌ | Exchange refresh token for new access token |
| GET | `/api/auth/me` | ✅ | Get current user profile |

### Captures

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/capture` | ✅ | Upload JPEG + detection metadata (multipart) |
| GET | `/api/capture` | ✅ | List captures (paginated) |
| GET | `/api/capture/:id` | ✅ | Get single capture record |
| PUT | `/api/capture/:id` | ✅ | Update capture status |
| DELETE | `/api/capture/:id` | ✅ | Delete capture and its image |

### Images

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/images/:id` | ✅ | Stream image from GridFS |

### Health

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | ❌ | Server health check |

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | ✅ | `5000` | Port the server listens on (use `3005` for production) |
| `NODE_ENV` | ✅ | `development` | `development` or `production` |
| `MONGODB_URI` | ✅ | *(in-memory)* | MongoDB connection string |
| `JWT_SECRET` | ✅ | — | Min 64-char secret for access tokens |
| `JWT_REFRESH_SECRET` | ✅ | — | Min 64-char secret for refresh tokens (different from above) |
| `JWT_EXPIRY` | ❌ | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRY` | ❌ | `7d` | Refresh token lifetime |
| `ALLOWED_ORIGINS` | ✅ | `http://localhost:3000` | CORS whitelist — comma-separated URLs or `*` |
| `MAX_FILE_SIZE` | ❌ | `5242880` | Max upload size in bytes (5MB) |
| `UPLOAD_DIR` | ❌ | `./uploads` | Temp upload directory |
| `RATE_LIMIT_WINDOW_MS` | ❌ | `900000` | Rate limit window (15 min) |
| `RATE_LIMIT_MAX_REQUESTS` | ❌ | `100` | Max requests per window per IP |
| `MIN_DETECTION_CONFIDENCE` | ❌ | `0.5` | Minimum COCO-SSD confidence to process |
| `LITTER_DETECTION_THRESHOLD` | ❌ | `0.6` | Min confidence to flag as litter |
| `PERSON_DETECTION_THRESHOLD` | ❌ | `0.5` | Min confidence to flag as person |
| `HTTPS_ENABLED` | ❌ | `false` | Enable HTTPS (requires SSL certs in `backend/ssl/`) |

---

## Detection Details

- Model: **COCO-SSD** (`lite_mobilenet_v2`) via TensorFlow.js — runs **entirely in the browser**
- Detects litter when a known litter-class object and a person appear simultaneously
- Configurable detection FPS (1–15) via the UI
- Real-time canvas overlay with bounding boxes and class labels
- 10-second cooldown between auto-captures to prevent event flooding
- Only a JPEG snapshot is sent to the server — no video stream is ever uploaded

---

## Security

| Feature | Implementation |
|---|---|
| Password hashing | bcrypt, 12 rounds |
| Authentication | JWT access (15m) + refresh token rotation (7d) |
| Security headers | Helmet.js (CSP, HSTS, noSniff, XSS filter) |
| Rate limiting | 100 requests / 15 min per IP |
| File validation | MIME type + magic byte checks |
| Input validation | express-validator rule sets |
| NoSQL injection | Mongoose schema enforcement |
| Image storage | GridFS (private, not directly accessible) |
| Audit logging | Winston security event logger |
| Data retention | 90-day TTL index (GDPR compliance) |
| CORS | Explicit origin whitelist |

---

## npm Scripts

| Command | Description |
|---|---|
| `npm start` | Start backend with Node.js |
| `npm run dev` | Start backend with nodemon (auto-reload) |
| `npm test` | Run test suite (Jest + Supertest) |

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `ECONNREFUSED 127.0.0.1:27017` | MongoDB is not running: `systemctl start mongod` |
| `curl` to port 3005 fails | Check UFW: `ufw allow 3005/tcp` |
| Vercel shows old content | Trigger a redeploy from the Vercel dashboard |
| PM2 process not found | Start fresh: `pm2 start backend/server.js --name litter-detector-backend` |
| 502 from Vercel `/api/*` | Backend is down — check `pm2 status` and `pm2 logs` |
| JWT errors after redeploy | Secrets changed — log out and log back in |

---

## License

MIT

# Litter Detection System — LitterWatch 🌿

A production-ready, real-time AI-powered litter detection and evidence capture webapp.

---

## What It Does

1. **Connects to your webcam** via `getUserMedia()` WebRTC API
2. **Runs TensorFlow.js COCO-SSD** object detection at configurable FPS (1–15)
3. **Detects litter events** — when a recognized litter item + a person are both detected simultaneously above configurable confidence thresholds
4. **Automatically captures a JPEG** of the incident and uploads it to the backend
5. **Stores evidence** in MongoDB with GridFS image store, GPS coordinates, severity scoring, and status lifecycle
6. **Auto-expires data** after 90 days (GDPR TTL index)

---

## Architecture

```
Frontend (Vanilla JS + TF.js)
       ↓ HTTPS (multipart/json)
Backend (Express.js + Node.js)
       ↓
MongoDB (Mongoose + GridFS)
```

---

## Quick Start (Development)

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)
- Modern browser with webcam

### 1. Clone & Install

```bash
git clone <your-repo>
cd litter-detection-webapp
npm install
```

### 2. Configure Environment

```bash
cp backend/.env.example backend/.env
# Edit backend/.env with your MongoDB URI and JWT secrets
```

### 3. Start the Backend

```bash
npm run dev
# Server starts at http://localhost:5000
```

### 4. Serve the Frontend

Using any static file server from `frontend/public/`:

```bash
npx serve frontend/public
# or
python -m http.server 3000 --directory frontend/public
```

Open **http://localhost:3000** in your browser.

---

## Production (Docker)

```bash
# Copy and fill in secrets
cp backend/.env.example .env
# Edit .env and set strong JWT_SECRET and JWT_REFRESH_SECRET

docker-compose up -d --build
```

Frontend served by nginx at **http://localhost:80**  
API available at **http://localhost:5000/api**

---

## npm Scripts

| Command | Description |
|---|---|
| `npm start` | Start backend with node |
| `npm run dev` | Start backend with nodemon (hot-reload) |
| `npm test` | Run test suite (Jest + Supertest) |

---

## API Endpoints

### Auth
| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login, returns JWT pair |
| POST | `/api/auth/refresh` | Refresh access token |
| GET  | `/api/auth/me` | Get current user (auth) |

### Captures
| Method | Path | Description |
|---|---|---|
| POST   | `/api/capture` | Upload image + detection (multipart) |
| GET    | `/api/capture` | List captures (paginated) |
| GET    | `/api/capture/:id` | Get single capture |
| PUT    | `/api/capture/:id` | Update status |
| DELETE | `/api/capture/:id` | Delete capture + image |

### Images
| Method | Path | Description |
|---|---|---|
| GET | `/api/images/:id` | Stream image from GridFS |

---

## Project Structure

```
litter-detection-webapp/
├── backend/
│   ├── config/
│   │   ├── db.js                # MongoDB connection
│   │   └── environment.js       # Centralized env vars
│   ├── middleware/
│   │   ├── auth.js              # JWT verification
│   │   ├── upload.js            # Multer + magic byte validation
│   │   └── validation.js        # express-validator rules
│   ├── models/
│   │   ├── User.js              # User schema (bcrypt)
│   │   ├── Capture.js           # Evidence schema (TTL)
│   │   └── Event.js             # Audit log
│   ├── routes/
│   │   ├── auth.js
│   │   ├── capture.js
│   │   └── images.js
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── captureController.js
│   │   └── imageController.js
│   ├── utils/
│   │   └── logger.js            # Winston security logger
│   ├── server.js                # Express app entry point
│   └── .env.example
├── frontend/
│   ├── public/
│   │   ├── index.html           # Single-page app shell
│   │   ├── style.css            # Full design system
│   │   └── app.js               # Vanilla JS application
│   └── src/services/api.js      # React-ready API module
├── test/
│   └── captureController.test.js
├── Dockerfile
├── docker-compose.yml
├── nginx.conf
└── README.md
```

---

## Security Features

- **HTTPS/TLS** (configurable)
- **JWT** with short-lived access tokens (15m) + refresh rotation (7d)
- **bcrypt** password hashing (12 rounds)
- **Helmet.js** security headers
- **Rate limiting** (100 req / 15 min per IP)
- **MIME + magic byte validation** on uploads
- **Input validation** via express-validator
- **MongoDB injection protection** via Mongoose
- **GridFS** private image storage (not publicly accessible)
- **Winston** security event logging
- **GDPR TTL** auto-expiry (90 days)
- **Non-root Docker user**

---

## Privacy Compliance

| Standard | Status |
|---|---|
| GDPR (EU) | ✅ Consent banner, 90-day TTL, deletion rights |
| CCPA (California) | ✅ Data disclosure, opt-out |
| PIPEDA (Canada) | ✅ Consent, secure storage |

---

## Detection Details

- Uses **TensorFlow.js COCO-SSD** (`lite_mobilenet_v2`) — runs entirely in the browser
- No video is ever uploaded — only a JPEG snapshot is sent when an incident is detected
- Configurable thresholds for litter confidence (default 60%) and person confidence (default 50%)
- Configurable detection frequency (1–15 FPS)
- Canvas overlay shows real-time bounding boxes with class labels
- 10-second cooldown between auto-captures to prevent flood

---

## License

MIT

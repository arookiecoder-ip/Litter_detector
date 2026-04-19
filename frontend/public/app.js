/**
 * LitterWatch — Frontend Application Logic
 * Pure Vanilla JS — no build step required.
 * 
 * Implements:
 *  - GDPR consent flow
 *  - JWT authentication (login / register / refresh)
 *  - Camera access via getUserMedia
 *  - TensorFlow.js COCO-SSD object detection
 *  - Canvas overlay with bounding boxes
 *  - Automatic litter+person triggered capture
 *  - Evidence gallery with pagination
 *  - Session statistics dashboard
 *  - Memory management (tensor cleanup)
 */

'use strict';

/* ══════════════════════════════════════════════════════════
   CONFIGURATION
   ══════════════════════════════════════════════════════════ */
const IS_DEV_SERVER = window.location.port === '3000';
const API_BASE = IS_DEV_SERVER 
  ? 'http://localhost:5000/api' 
  : '/api';

const LITTER_CLASSES = new Set([
  'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl',
  'banana', 'apple', 'sandwich', 'orange', 'broccoli', 'carrot',
  'hot dog', 'pizza', 'donut', 'cake', 'book', 'scissors', 'toothbrush',
  'cell phone', 'backpack', 'umbrella', 'handbag', 'tie', 'suitcase',
  'frisbee', 'skis', 'snowboard', 'sports ball', 'kite', 'baseball bat',
  'tennis racket', 'remote', 'mouse', 'keyboard',
  // Generic catch-all for ambiguous items detected near people
  'trash', 'garbage', 'plastic bag', 'can', 'cigarette', 'paper', 'box',
]);

// How long to suppress re-captures after one event (seconds)
const CAPTURE_COOLDOWN_S = 10;

/* ══════════════════════════════════════════════════════════
   STATE
   ══════════════════════════════════════════════════════════ */
const state = {
  user: null,
  accessToken: null,
  refreshToken: null,
  model: null,
  modelLoaded: false,
  cameraStream: null,
  detecting: false,
  lastCaptureTime: 0,
  sessionDetections: 0,
  todayCaptures: 0,
  litterThreshold: 0.35,
  personThreshold: 0.40,
  motionThreshold: 2.0,
  detectionIntervalMs: 100, // 10 FPS
  currentPage: 0,
  pageSize: 12,
  capturesTotal: 0,
  fpsCounter: { frames: 0, lastTs: 0 },
  lastMotionPixels: null,
  lastMotionScore: 0,
  lastDetections: { litter: [], people: [], all: [] },
};

/* ══════════════════════════════════════════════════════════
   DOM REFERENCES
   ══════════════════════════════════════════════════════════ */
const $ = (id) => document.getElementById(id);

const dom = {
  // Modals
  consentModal:   $('consentModal'),
  authModal:      $('authModal'),
  captureModal:   $('captureModal'),
  // Consent
  acceptConsent:  $('acceptConsent'),
  declineConsent: $('declineConsent'),
  // Auth
  tabLogin:       $('tabLogin'),
  tabRegister:    $('tabRegister'),
  loginForm:      $('loginForm'),
  registerForm:   $('registerForm'),
  loginEmail:     $('loginEmail'),
  loginPassword:  $('loginPassword'),
  loginError:     $('loginError'),
  loginSubmit:    $('loginSubmit'),
  regName:        $('regName'),
  regEmail:       $('regEmail'),
  regPassword:    $('regPassword'),
  registerError:  $('registerError'),
  registerSubmit: $('registerSubmit'),
  // App
  app:            $('app'),
  notification:   $('notification'),
  userGreeting:   $('userGreeting'),
  logoutBtn:      $('logoutBtn'),
  // Nav
  navCamera:      $('navCamera'),
  navCaptures:    $('navCaptures'),
  navDashboard:   $('navDashboard'),
  viewCamera:     $('viewCamera'),
  viewCaptures:   $('viewCaptures'),
  viewDashboard:  $('viewDashboard'),
  // Camera
  videoFeed:      $('videoFeed'),
  overlayCanvas:  $('overlayCanvas'),
  captureCanvas:  $('captureCanvas'),
  cameraFrame:    $('cameraFrame'),
  startCameraBtn: $('startCameraBtn'),
  stopCameraBtn:  $('stopCameraBtn'),
  manualCaptureBtn: $('manualCaptureBtn'),
  hudDot:         $('hudDot'),
  hudStatusText:  $('hudStatusText'),
  hudMotion:      $('hudMotion'),
  hudFps:         $('hudFps'),
  // Model
  modelSpinner:   $('modelSpinner'),
  modelStatusText:$('modelStatusText'),
  // Stats
  statLitter:     $('statLitter'),
  statPerson:     $('statPerson'),
  statTotal:      $('statTotal'),
  statCaptures:   $('statCaptures'),
  detectionItems: $('detectionItems'),
  // Alert
  litterAlertBox: $('litterAlertBox'),
  alertDetails:   $('alertDetails'),
  // Thresholds
  litterThreshold:    $('litterThreshold'),
  litterThresholdVal: $('litterThresholdVal'),
  personThreshold:    $('personThreshold'),
  personThresholdVal: $('personThresholdVal'),
  motionThreshold:    $('motionThreshold'),
  motionThresholdVal: $('motionThresholdVal'),
  detectionFps:       $('detectionFps'),
  detectionFpsVal:    $('detectionFpsVal'),
  // Captures view
  statusFilter:       $('statusFilter'),
  refreshCaptures:    $('refreshCaptures'),
  capturesGrid:       $('capturesGrid'),
  capturesPagination: $('capturesPagination'),
  // Dashboard
  dashTotalCaptures:  $('dashTotalCaptures'),
  dashVerified:       $('dashVerified'),
  dashPending:        $('dashPending'),
  dashAvgSeverity:    $('dashAvgSeverity'),
  dashDetections:     $('dashDetections'),
  dashLastCapture:    $('dashLastCapture'),
  // Capture modal
  captureModalClose:  $('captureModalClose'),
  captureModalTitle:  $('captureModalTitle'),
  captureModalBody:   $('captureModalBody'),
};

/* ══════════════════════════════════════════════════════════
   UTILITY
   ══════════════════════════════════════════════════════════ */
let notifTimer = null;

function showNotification(message, type = 'success') {
  clearTimeout(notifTimer);
  dom.notification.textContent = message;
  dom.notification.className = `notification notification--${type}`;
  dom.notification.classList.remove('hidden');
  notifTimer = setTimeout(() => dom.notification.classList.add('hidden'), 4000);
}

dom.notification.addEventListener('click', () => {
  clearTimeout(notifTimer);
  dom.notification.classList.add('hidden');
});

function showError(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
}

function clearError(el) {
  el.textContent = '';
  el.classList.add('hidden');
}

function formatDate(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function setHUD(statusText, dotClass = '') {
  dom.hudStatusText.textContent = statusText;
  dom.hudDot.className = 'hud-dot' + (dotClass ? ` ${dotClass}` : '');
}

/* ══════════════════════════════════════════════════════════
   TOKEN STORAGE
   ══════════════════════════════════════════════════════════ */
function saveTokens(access, refresh) {
  state.accessToken = access;
  state.refreshToken = refresh;
  sessionStorage.setItem('access', access);
  sessionStorage.setItem('refresh', refresh);
}

function loadTokens() {
  state.accessToken = sessionStorage.getItem('access');
  state.refreshToken = sessionStorage.getItem('refresh');
}

function clearTokens() {
  state.accessToken = null;
  state.refreshToken = null;
  sessionStorage.removeItem('access');
  sessionStorage.removeItem('refresh');
}

/* ══════════════════════════════════════════════════════════
   API CLIENT
   ══════════════════════════════════════════════════════════ */
async function apiRequest(method, path, body = null, isFormData = false) {
  const headers = {};
  if (state.accessToken) headers['Authorization'] = `Bearer ${state.accessToken}`;
  if (!isFormData && body) headers['Content-Type'] = 'application/json';

  let res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: isFormData ? body : (body ? JSON.stringify(body) : undefined),
  });

  // Auto-refresh access token on 401
  if (res.status === 401 && state.refreshToken) {
    try {
      const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: state.refreshToken }),
      });
      if (refreshRes.ok) {
        const data = await refreshRes.json();
        saveTokens(data.accessToken, data.refreshToken);
        headers['Authorization'] = `Bearer ${state.accessToken}`;
        res = await fetch(`${API_BASE}${path}`, {
          method,
          headers,
          body: isFormData ? body : (body ? JSON.stringify(body) : undefined),
        });
      } else {
        logout();
        throw new Error('Session expired. Please log in again.');
      }
    } catch {
      logout();
      throw new Error('Session expired. Please log in again.');
    }
  }

  return res;
}

/* ══════════════════════════════════════════════════════════
   CONSENT FLOW
   ══════════════════════════════════════════════════════════ */
function hasConsent() {
  return localStorage.getItem('gdpr_consent') === 'true';
}

function recordConsent(accepted) {
  localStorage.setItem('gdpr_consent', String(accepted));
  localStorage.setItem('consent_timestamp', new Date().toISOString());
}

dom.acceptConsent.addEventListener('click', () => {
  recordConsent(true);
  dom.consentModal.classList.add('hidden');
  checkAuth();
});

dom.declineConsent.addEventListener('click', () => {
  recordConsent(false);
  dom.consentModal.classList.add('hidden');
  showNotification('Camera access is required to use this application.', 'warning');
});

/* ══════════════════════════════════════════════════════════
   AUTHENTICATION
   ══════════════════════════════════════════════════════════ */
function showApp() {
  dom.app.classList.remove('hidden');
  dom.authModal.classList.add('hidden');
  dom.userGreeting.textContent = `Hi, ${state.user.name.split(' ')[0]}`;
  loadModel();
}

function showAuthModal() {
  dom.app.classList.add('hidden');
  dom.authModal.classList.remove('hidden');
}

async function checkAuth() {
  loadTokens();
  if (!state.accessToken) { showAuthModal(); return; }
  try {
    const res = await apiRequest('GET', '/auth/me');
    if (res.ok) {
      state.user = await res.json();
      showApp();
    } else {
      clearTokens();
      showAuthModal();
    }
  } catch {
    showAuthModal();
  }
}

// Tab switching
dom.tabLogin.addEventListener('click', () => {
  dom.tabLogin.classList.add('active');
  dom.tabRegister.classList.remove('active');
  dom.loginForm.classList.remove('hidden');
  dom.registerForm.classList.add('hidden');
  clearError(dom.loginError);
});

dom.tabRegister.addEventListener('click', () => {
  dom.tabRegister.classList.add('active');
  dom.tabLogin.classList.remove('active');
  dom.registerForm.classList.remove('hidden');
  dom.loginForm.classList.add('hidden');
  clearError(dom.registerError);
});

// Login
dom.loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError(dom.loginError);
  dom.loginSubmit.disabled = true;
  dom.loginSubmit.textContent = 'Logging in…';
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: dom.loginEmail.value, password: dom.loginPassword.value }),
    });
    const data = await res.json();
    if (!res.ok) { showError(dom.loginError, data.error || 'Login failed'); return; }
    state.user = data.user;
    saveTokens(data.accessToken, data.refreshToken);
    showApp();
  } catch (err) {
    showError(dom.loginError, 'Network error. Is the server running?');
  } finally {
    dom.loginSubmit.disabled = false;
    dom.loginSubmit.textContent = 'Login';
  }
});

// Register
dom.registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError(dom.registerError);
  dom.registerSubmit.disabled = true;
  dom.registerSubmit.textContent = 'Creating account…';
  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: dom.regName.value,
        email: dom.regEmail.value,
        password: dom.regPassword.value,
        gdprConsent: true,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      const msg = data.errors ? data.errors.map(e => e.msg).join(' | ') : data.error;
      showError(dom.registerError, msg || 'Registration failed');
      return;
    }
    state.user = data.user;
    saveTokens(data.accessToken, data.refreshToken);
    showNotification('Account created successfully! 🎉');
    showApp();
  } catch (err) {
    showError(dom.registerError, 'Network error. Is the server running?');
  } finally {
    dom.registerSubmit.disabled = false;
    dom.registerSubmit.textContent = 'Create Account';
  }
});

// Logout
function logout() {
  stopCamera();
  clearTokens();
  state.user = null;
  showAuthModal();
}
dom.logoutBtn.addEventListener('click', logout);

/* ══════════════════════════════════════════════════════════
   NAVIGATION
   ══════════════════════════════════════════════════════════ */
function switchView(view) {
  ['camera', 'captures', 'dashboard'].forEach(v => {
    $(`nav${v.charAt(0).toUpperCase() + v.slice(1)}`).classList.remove('active');
    $(`view${v.charAt(0).toUpperCase() + v.slice(1)}`).classList.remove('active');
    $(`view${v.charAt(0).toUpperCase() + v.slice(1)}`).classList.add('hidden');
  });
  $(`nav${view.charAt(0).toUpperCase() + view.slice(1)}`).classList.add('active');
  $(`view${view.charAt(0).toUpperCase() + view.slice(1)}`).classList.remove('hidden');
  $(`view${view.charAt(0).toUpperCase() + view.slice(1)}`).classList.add('active');

  if (view === 'captures') loadCaptures();
  if (view === 'dashboard') loadDashboard();
}

dom.navCamera.addEventListener('click',    () => switchView('camera'));
dom.navCaptures.addEventListener('click',  () => switchView('captures'));
dom.navDashboard.addEventListener('click', () => switchView('dashboard'));

/* ══════════════════════════════════════════════════════════
   MODEL LOADING
   ══════════════════════════════════════════════════════════ */
async function loadModel() {
  dom.modelSpinner.style.display = 'inline-block';
  dom.modelStatusText.textContent = 'Loading AI model…';
  try {
    // Cache model in browser if possible
    state.model = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
    state.modelLoaded = true;
    dom.modelSpinner.style.display = 'none';
    dom.modelStatusText.textContent = '✅ Model ready';
    showNotification('AI detection model loaded', 'success');
  } catch (err) {
    dom.modelSpinner.style.display = 'none';
    dom.modelStatusText.textContent = '❌ Model failed to load';
    showNotification('Failed to load detection model', 'error');
    console.error('Model load error:', err);
  }

  // Memory cleanup every 60 seconds
  setInterval(() => {
    if (typeof tf !== 'undefined') {
      try { tf.disposeVariables(); } catch {}
      console.debug(`TF tensors: ${tf.memory().numTensors}`);
    }
  }, 60000);
}

/* ══════════════════════════════════════════════════════════
   CAMERA
   ══════════════════════════════════════════════════════════ */
async function startCamera() {
  if (!state.modelLoaded) {
    showNotification('Please wait for the AI model to load first.', 'warning');
    return;
  }

  // Modern browsers block mediaDevices on insecure origins (HTTP) unless it's localhost
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showNotification('Camera access blocked. Please use HTTPS or localhost.', 'error');
    setHUD('Camera Error');
    return;
  }

  const constraints = {
    video: {
      width:  { ideal: 1280 },
      height: { ideal: 720 },
      facingMode: 'environment',
    },
    audio: false,
  };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    dom.videoFeed.srcObject = stream;
    state.cameraStream = stream;
    dom.videoFeed.addEventListener('loadeddata', () => {
      dom.startCameraBtn.classList.add('hidden');
      dom.stopCameraBtn.classList.remove('hidden');
      dom.manualCaptureBtn.classList.remove('hidden');
      setHUD('Camera Active', 'active');
      startDetectionLoop();
    }, { once: true });
  } catch (err) {
    const msg = handleCameraError(err);
    showNotification(msg, 'error');
    setHUD('Camera Error');
  }
}

function stopCamera() {
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach(t => t.stop());
    state.cameraStream = null;
  }
  state.detecting = false;
  dom.videoFeed.srcObject = null;
  dom.startCameraBtn.classList.remove('hidden');
  dom.stopCameraBtn.classList.add('hidden');
  dom.manualCaptureBtn.classList.add('hidden');
  setHUD('Camera Stopped');
  clearOverlay();
}

function handleCameraError(err) {
  const map = {
    NotAllowedError:    'Camera permission denied. Please allow camera access.',
    PermissionDeniedError: 'Permission denied. Check browser/OS settings.',
    NotFoundError:      'No camera device found. Please connect a camera.',
    NotSupportedError:  'Your browser does not support camera access.',
    NotReadableError:   'Camera is in use by another application.',
    OverconstrainedError: 'Selected camera settings are not supported.',
  };
  return map[err.name] || `Camera error: ${err.message}`;
}

dom.startCameraBtn.addEventListener('click', startCamera);
dom.stopCameraBtn.addEventListener('click', stopCamera);
dom.manualCaptureBtn.addEventListener('click', () => {
  const d = state.lastDetections;
  triggerCapture({ litter: d.litter.length > 0 ? d.litter : [{ class: 'manual', score: 1 }], people: d.people });
});

/* ══════════════════════════════════════════════════════════
   DETECTION LOOP
   ══════════════════════════════════════════════════════════ */
let detectionTimer = null;

function startDetectionLoop() {
  state.detecting = true;

  const loop = async () => {
    if (!state.detecting || !state.cameraStream) return;

    try {
      const video = dom.videoFeed;
      if (video.readyState !== video.HAVE_ENOUGH_DATA) {
        detectionTimer = setTimeout(loop, state.detectionIntervalMs);
        return;
      }

      // Run detection
      const predictions = await state.model.detect(video);
      const motionScore = detectMotion(video);
      state.lastMotionScore = motionScore;
      dom.hudMotion.textContent = `Motion: ${motionScore.toFixed(1)}%`;
      updateFPS();

      // Split into litter + persons
      const litter = predictions.filter(p =>
        LITTER_CLASSES.has(p.class.toLowerCase()) && p.score >= state.litterThreshold
      );
      const people = predictions.filter(p =>
        p.class === 'person' && p.score >= state.personThreshold
      );

      state.lastDetections = { litter, people, all: predictions };
      state.sessionDetections++;

      updateOverlay(predictions, litter, people);
      updateDetectionUI(litter, people, predictions);

      // Auto-capture if litter + person found AND cooldown elapsed, 
      // OR if person + motion spike found
      const now = Date.now() / 1000;
      const motionSpike = motionScore >= state.motionThreshold && motionScore < 20.0;
      const validEvent = (litter.length > 0 && people.length > 0) || (motionSpike && people.length > 0);

      if (validEvent && (now - state.lastCaptureTime) > CAPTURE_COOLDOWN_S) {
        triggerCapture({ 
          litter: litter.length > 0 ? litter : [{ class: 'motion_object_thrown', score: (motionScore/100) }], 
          people 
        });
      }

    } catch (err) {
      console.error('Detection error:', err);
    }

    if (state.detecting) {
      detectionTimer = setTimeout(loop, state.detectionIntervalMs);
    }
  };

  loop();
}

/* ══════════════════════════════════════════════════════════
   CANVAS OVERLAY
   ══════════════════════════════════════════════════════════ */
function clearOverlay() {
  const canvas = dom.overlayCanvas;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function updateOverlay(all, litter, people) {
  const video = dom.videoFeed;
  const canvas = dom.overlayCanvas;
  canvas.width  = video.videoWidth  || canvas.offsetWidth;
  canvas.height = video.videoHeight || canvas.offsetHeight;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const scaleX = canvas.width  / (video.videoWidth  || canvas.width);
  const scaleY = canvas.height / (video.videoHeight || canvas.height);

  all.forEach(pred => {
    const [x, y, w, h] = pred.bbox;
    const sx = x * scaleX, sy = y * scaleY, sw = w * scaleX, sh = h * scaleY;

    const isLitter = LITTER_CLASSES.has(pred.class.toLowerCase()) && pred.score >= state.litterThreshold;
    const isPerson = pred.class === 'person' && pred.score >= state.personThreshold;
    if (!isLitter && !isPerson && pred.score < 0.4) return;

    const color = isLitter ? '#ffa502' : isPerson ? '#1e90ff' : '#4a5568';
    const lineWidth = isLitter || isPerson ? 2 : 1;

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.strokeRect(sx, sy, sw, sh);

    // Label background
    const label = `${pred.class} ${(pred.score * 100).toFixed(0)}%`;
    ctx.font = 'bold 11px "Space Mono", monospace';
    const textW = ctx.measureText(label).width + 8;
    const textH = 18;
    ctx.fillStyle = color;
    ctx.fillRect(sx, sy - textH, textW, textH);
    ctx.fillStyle = '#000';
    ctx.fillText(label, sx + 4, sy - 4);
  });

  // Flash red frame when litter+person detected
  if (litter.length > 0 && people.length > 0) {
    ctx.strokeStyle = 'rgba(255,71,87,0.6)';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
  }
}

/* ══════════════════════════════════════════════════════════
   DETECTION UI
   ══════════════════════════════════════════════════════════ */
function updateDetectionUI(litter, people, all) {
  dom.statLitter.textContent  = litter.length;
  dom.statPerson.textContent  = people.length;
  dom.statTotal.textContent   = all.length;
  dom.statCaptures.textContent = state.todayCaptures;

  const motionSpike = state.lastMotionScore >= state.motionThreshold && state.lastMotionScore < 20.0;
  const hasEvent = (litter.length > 0 && people.length > 0) || (motionSpike && people.length > 0);
  
  setHUD(hasEvent ? '⚠️ LITTER EVENT' : 'Scanning…', hasEvent ? 'alert' : 'active');

  // Litter alert box
  if (hasEvent) {
    dom.litterAlertBox.classList.remove('hidden');
    const detectedClasses = litter.length > 0 
      ? [...new Set(litter.map(l => l.class))].join(', ')
      : `Fast motion (${state.lastMotionScore.toFixed(1)}%)`;
    dom.alertDetails.textContent = `Detected: ${detectedClasses} near ${people.length} person(s).`;
  } else {
    dom.litterAlertBox.classList.add('hidden');
  }

  // Detected items list
  if (all.length === 0) {
    dom.detectionItems.innerHTML = `
      <div class="empty-state"><span>📡</span><p>No objects detected</p></div>
    `;
    return;
  }

  const relevant = all.filter(p => p.score >= 0.35).slice(0, 12);
  dom.detectionItems.innerHTML = relevant.map(pred => {
    const isLitter = LITTER_CLASSES.has(pred.class.toLowerCase());
    const color = isLitter ? '#ffa502' : pred.class === 'person' ? '#1e90ff' : '#4a5568';
    return `
      <div class="detection-item">
        <span class="class-name" style="color:${color}">${pred.class}</span>
        <div class="confidence-bar">
          <div class="confidence-fill" style="width:${(pred.score*100).toFixed(0)}%;background:${color}"></div>
        </div>
        <span class="score">${(pred.score*100).toFixed(0)}%</span>
      </div>
    `;
  }).join('');
}

/* ══════════════════════════════════════════════════════════
   MOTION DETECTION 
   ══════════════════════════════════════════════════════════ */
let motionCanvas = null;
let motionCtx = null;

function detectMotion(video) {
  const W = 64;
  const H = 36;
  if (!motionCanvas) {
    motionCanvas = document.createElement('canvas');
    motionCanvas.width = W;
    motionCanvas.height = H;
    motionCtx = motionCanvas.getContext('2d', { willReadFrequently: true });
  }

  motionCtx.drawImage(video, 0, 0, W, H);
  const imgData = motionCtx.getImageData(0, 0, W, H);
  const px = imgData.data;
  const currentPixels = new Uint8Array(W * H);
  
  for (let i = 0; i < W * H; i++) {
    // Grayscale: 0.299 R + 0.587 G + 0.114 B
    currentPixels[i] = (px[i*4]*299 + px[i*4+1]*587 + px[i*4+2]*114) / 1000;
  }

  let motionScore = 0;
  if (state.lastMotionPixels) {
    let diffCount = 0;
    for (let i = 0; i < W * H; i++) {
      if (Math.abs(currentPixels[i] - state.lastMotionPixels[i]) > 20) {
        diffCount++;
      }
    }
    motionScore = (diffCount / (W * H)) * 100;
  }
  
  state.lastMotionPixels = currentPixels;
  return motionScore;
}

/* ══════════════════════════════════════════════════════════
   FPS COUNTER
   ══════════════════════════════════════════════════════════ */
function updateFPS() {
  state.fpsCounter.frames++;
  const now = performance.now();
  const elapsed = now - state.fpsCounter.lastTs;
  if (elapsed >= 1000) {
    const fps = (state.fpsCounter.frames / elapsed * 1000).toFixed(1);
    dom.hudFps.textContent = `${fps} FPS`;
    state.fpsCounter.frames = 0;
    state.fpsCounter.lastTs = now;
  }
}

/* ══════════════════════════════════════════════════════════
   THRESHOLD CONTROLS
   ══════════════════════════════════════════════════════════ */
dom.litterThreshold.addEventListener('input', (e) => {
  state.litterThreshold = parseInt(e.target.value) / 100;
  dom.litterThresholdVal.textContent = `${e.target.value}%`;
});

dom.personThreshold.addEventListener('input', (e) => {
  state.personThreshold = parseInt(e.target.value) / 100;
  dom.personThresholdVal.textContent = `${e.target.value}%`;
});

dom.motionThreshold.addEventListener('input', (e) => {
  state.motionThreshold = parseFloat(e.target.value);
  dom.motionThresholdVal.textContent = `${state.motionThreshold.toFixed(1)}%`;
});

dom.detectionFps.addEventListener('input', (e) => {
  const fps = parseInt(e.target.value);
  state.detectionIntervalMs = Math.round(1000 / fps);
  dom.detectionFpsVal.textContent = `${fps} FPS`;
});

/* ══════════════════════════════════════════════════════════
   CAPTURE → BACKEND
   ══════════════════════════════════════════════════════════ */
async function triggerCapture(detectionData) {
  state.lastCaptureTime = Date.now() / 1000;
  state.todayCaptures++;
  dom.statCaptures.textContent = state.todayCaptures;

  // Snap current frame to canvas
  const video = dom.videoFeed;
  const canvas = dom.captureCanvas;
  canvas.width  = video.videoWidth  || 1280;
  canvas.height = video.videoHeight || 720;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // Compress to JPEG blob
  canvas.toBlob(async (blob) => {
    if (!blob) { showNotification('Failed to capture frame', 'error'); return; }

    // Get GPS position (optional)
    let lat = null, lng = null;
    try {
      const pos = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 3000 })
      );
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
    } catch {}

    const form = new FormData();
    form.append('image', blob, 'capture.jpg');
    form.append('detection', JSON.stringify({
      litter: detectionData.litter.map(l => ({
        class: l.class, confidence: l.score || 0, score: l.score || 0,
        bbox: { x: l.bbox?.[0] || 0, y: l.bbox?.[1] || 0, width: l.bbox?.[2] || 0, height: l.bbox?.[3] || 0 },
      })),
      people: (detectionData.people || []).map(p => ({ class: 'person', score: p.score || 0 })),
    }));
    if (lat !== null) form.append('latitude', String(lat));
    if (lng !== null) form.append('longitude', String(lng));

    try {
      const res = await apiRequest('POST', '/capture', form, true);
      if (res.ok) {
        const data = await res.json();
        showNotification(`📸 Evidence captured! Severity: ${data.severity}/10`, 'success');
      } else {
        const err = await res.json().catch(() => ({}));
        showNotification(err.error || 'Capture upload failed', 'error');
      }
    } catch (err) {
      showNotification('Network error during capture', 'error');
      console.error('Capture upload error:', err);
    }
  }, 'image/jpeg', 0.88);
}

/* ══════════════════════════════════════════════════════════
   EVIDENCE / CAPTURES VIEW
   ══════════════════════════════════════════════════════════ */
async function loadCaptures(page = 0) {
  state.currentPage = page;
  dom.capturesGrid.innerHTML = `
    <div class="loading-state" style="grid-column:1/-1">
      <div class="spinner spinner-large"></div><p>Loading captures…</p>
    </div>`;

  try {
    const status = dom.statusFilter.value;
    const skip = page * state.pageSize;
    const qs = new URLSearchParams({ skip, limit: state.pageSize });
    if (status) qs.append('status', status);

    const res = await apiRequest('GET', `/capture?${qs}`);
    if (!res.ok) { showNotification('Failed to load captures', 'error'); return; }

    const data = await res.json();
    state.capturesTotal = data.total;

    if (data.captures.length === 0) {
      dom.capturesGrid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <span>📭</span><p>No captures found.</p>
        </div>`;
      dom.capturesPagination.innerHTML = '';
      return;
    }

    dom.capturesGrid.innerHTML = data.captures.map(c => renderCaptureCard(c)).join('');

    // Bind card clicks
    dom.capturesGrid.querySelectorAll('.capture-card').forEach(card => {
      card.addEventListener('click', () => openCaptureModal(card.dataset.id));
    });

    renderPagination(data.total);
  } catch (err) {
    showNotification('Network error loading captures', 'error');
    console.error(err);
  }
}

function renderCaptureCard(c) {
  const items = (c.litterDetected || []).map(l => `<span class="item-tag">${l.class}</span>`).join('');
  const sevPct = ((c.severity || 1) / 10 * 100).toFixed(0);
  const imageUrl = c.imageId ? `${API_BASE}/images/${c.imageId}?token=${state.accessToken}` : '';

  return `
    <div class="capture-card" data-id="${c._id}" tabindex="0" role="button" aria-label="View capture details">
      ${imageUrl
        ? `<img src="${imageUrl}" alt="Capture" loading="lazy" onerror="this.style.display='none'">`
        : `<div style="aspect-ratio:16/9;background:var(--bg-elevated);display:flex;align-items:center;justify-content:center;font-size:2rem;">📷</div>`
      }
      <div class="capture-card-body">
        <div class="capture-card-meta">
          <span class="capture-card-time">${formatDate(c.timestamp || c.createdAt)}</span>
          <span class="status-badge status-${c.status || 'pending'}">${c.status || 'pending'}</span>
        </div>
        <div class="capture-card-items">${items || '<span class="item-tag">litter</span>'}</div>
        <div class="severity-bar">
          <span>Severity</span>
          <div class="severity-track"><div class="severity-fill" style="width:${sevPct}%"></div></div>
          <span>${c.severity || 1}/10</span>
        </div>
      </div>
    </div>
  `;
}

function renderPagination(total) {
  const pages = Math.ceil(total / state.pageSize);
  if (pages <= 1) { dom.capturesPagination.innerHTML = ''; return; }

  let html = '';
  for (let i = 0; i < pages; i++) {
    html += `<button class="page-btn ${i === state.currentPage ? 'active' : ''}" data-page="${i}">${i + 1}</button>`;
  }
  dom.capturesPagination.innerHTML = html;
  dom.capturesPagination.querySelectorAll('.page-btn').forEach(btn => {
    btn.addEventListener('click', () => loadCaptures(parseInt(btn.dataset.page)));
  });
}

dom.statusFilter.addEventListener('change', () => loadCaptures(0));
dom.refreshCaptures.addEventListener('click', () => loadCaptures(state.currentPage));

/* ─── Capture Detail Modal ─── */
async function openCaptureModal(id) {
  dom.captureModal.classList.remove('hidden');
  dom.captureModalBody.innerHTML = `<div class="loading-state"><div class="spinner"></div></div>`;

  try {
    const res = await apiRequest('GET', `/capture/${id}`);
    if (!res.ok) { showNotification('Failed to load capture', 'error'); return; }
    const c = await res.json();

    const imageUrl = c.imageId ? `${API_BASE}/images/${c.imageId}?token=${state.accessToken}` : null;
    const litter = (c.litterDetected || []).map(l => `${l.class} (${(l.confidence*100).toFixed(0)}%)`).join(', ');

    dom.captureModalTitle.textContent = `Capture – ${formatDate(c.timestamp || c.createdAt)}`;
    dom.captureModalBody.innerHTML = `
      <div class="capture-detail">
        ${imageUrl ? `<img src="${imageUrl}" alt="Evidence photo" />` : ''}
        <div class="detail-grid">
          <div class="detail-item"><dt>Status</dt><dd><span class="status-badge status-${c.status}">${c.status}</span></dd></div>
          <div class="detail-item"><dt>Severity</dt><dd>${c.severity || 1}/10</dd></div>
          <div class="detail-item"><dt>People Detected</dt><dd>${c.personDetected?.count || 'N/A'}</dd></div>
          <div class="detail-item"><dt>Litter Items</dt><dd>${litter || 'N/A'}</dd></div>
          <div class="detail-item"><dt>Location</dt><dd>${c.location?.address || `${c.location?.latitude?.toFixed(4) || '?'}, ${c.location?.longitude?.toFixed(4) || '?'}` || 'N/A'}</dd></div>
          <div class="detail-item"><dt>Expires</dt><dd>${c.expiresAt ? formatDate(c.expiresAt) : 'N/A'}</dd></div>
        </div>
        <div class="detail-actions">
          <button class="btn btn-sm btn-secondary" onclick="updateCaptureStatus('${id}', 'verified')">✅ Verify</button>
          <button class="btn btn-sm btn-secondary" onclick="updateCaptureStatus('${id}', 'resolved')">🏁 Resolve</button>
          <button class="btn btn-sm btn-ghost" onclick="updateCaptureStatus('${id}', 'dismissed')">🚫 Dismiss</button>
          <button class="btn btn-sm btn-danger" onclick="deleteCapture('${id}')">🗑️ Delete</button>
        </div>
      </div>
    `;
  } catch (err) {
    dom.captureModalBody.innerHTML = `<p style="color:var(--danger)">Failed to load capture.</p>`;
  }
}

async function updateCaptureStatus(id, status) {
  try {
    const res = await apiRequest('PUT', `/capture/${id}`, { status });
    if (res.ok) {
      showNotification(`Status updated to "${status}"`, 'success');
      dom.captureModal.classList.add('hidden');
      loadCaptures(state.currentPage);
    } else {
      showNotification('Failed to update status', 'error');
    }
  } catch { showNotification('Network error', 'error'); }
}

// Expose for inline onclick handlers in modal
window.updateCaptureStatus = updateCaptureStatus;

async function deleteCapture(id) {
  if (!confirm('Delete this capture permanently? This cannot be undone.')) return;
  try {
    const res = await apiRequest('DELETE', `/capture/${id}`);
    if (res.ok) {
      showNotification('Capture deleted', 'success');
      dom.captureModal.classList.add('hidden');
      loadCaptures(state.currentPage);
    } else {
      showNotification('Failed to delete', 'error');
    }
  } catch { showNotification('Network error', 'error'); }
}
window.deleteCapture = deleteCapture;

dom.captureModalClose.addEventListener('click', () => dom.captureModal.classList.add('hidden'));
dom.captureModal.addEventListener('click', (e) => {
  if (e.target === dom.captureModal) dom.captureModal.classList.add('hidden');
});

// Keyboard accessibility for cards
dom.capturesGrid.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('capture-card')) {
    openCaptureModal(e.target.dataset.id);
  }
});

/* ══════════════════════════════════════════════════════════
   DASHBOARD
   ══════════════════════════════════════════════════════════ */
async function loadDashboard() {
  dom.dashDetections.textContent = state.sessionDetections;

  try {
    const res = await apiRequest('GET', '/capture?limit=100');
    if (!res.ok) return;
    const data = await res.json();

    const total  = data.total;
    const verified = data.captures.filter(c => c.status === 'verified').length;
    const pending  = data.captures.filter(c => c.status === 'pending').length;
    const sums     = data.captures.map(c => c.severity || 1);
    const avg      = sums.length ? (sums.reduce((a,b) => a+b, 0) / sums.length).toFixed(1) : '—';
    const last     = data.captures[0];

    dom.dashTotalCaptures.textContent  = total;
    dom.dashVerified.textContent       = verified;
    dom.dashPending.textContent        = pending;
    dom.dashAvgSeverity.textContent    = avg;
    dom.dashLastCapture.textContent    = last ? formatDate(last.timestamp || last.createdAt) : '—';
  } catch (err) {
    console.error('Dashboard load error:', err);
  }
}

/* ══════════════════════════════════════════════════════════
   BOOT
   ══════════════════════════════════════════════════════════ */
function boot() {
  if (!hasConsent()) {
    dom.consentModal.classList.remove('hidden');
  } else {
    checkAuth();
  }
}

document.addEventListener('DOMContentLoaded', boot);

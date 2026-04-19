// test/captureController.test.js
const request = require('supertest');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

// Set test environment before importing server
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-at-least-32-chars';
process.env.JWT_EXPIRY = '15m';
process.env.JWT_REFRESH_EXPIRY = '7d';
process.env.MONGODB_URI = process.env.TEST_MONGODB_URI || 'mongodb://localhost:27017/litter-test';
process.env.HTTPS_ENABLED = 'false';
process.env.ALLOWED_ORIGINS = 'http://localhost:3000';

const app = require('../backend/server');
const User = require('../backend/models/User');
const Capture = require('../backend/models/Capture');

let validToken;
let testUserId;
let captureId;

// Small JPEG for testing (1x1 pixel)
const MINIMAL_JPEG = Buffer.from([
  0xFF,0xD8,0xFF,0xE0,0x00,0x10,0x4A,0x46,0x49,0x46,0x00,0x01,
  0x01,0x00,0x00,0x01,0x00,0x01,0x00,0x00,0xFF,0xDB,0x00,0x43,
  0x00,0x08,0x06,0x06,0x07,0x06,0x05,0x08,0x07,0x07,0x07,0x09,
  0x09,0x08,0x0A,0x0C,0x14,0x0D,0x0C,0x0B,0x0B,0x0C,0x19,0x12,
  0x13,0x0F,0x14,0x1D,0x1A,0x1F,0x1E,0x1D,0x1A,0x1C,0x1C,0x20,
  0x24,0x2E,0x27,0x20,0x22,0x2C,0x23,0x1C,0x1C,0x28,0x37,0x29,
  0x2C,0x30,0x31,0x34,0x34,0x34,0x1F,0x27,0x39,0x3D,0x38,0x32,
  0x3C,0x2E,0x33,0x34,0x32,0xFF,0xC0,0x00,0x0B,0x08,0x00,0x01,
  0x00,0x01,0x01,0x01,0x11,0x00,0xFF,0xC4,0x00,0x1F,0x00,0x00,
  0x01,0x05,0x01,0x01,0x01,0x01,0x01,0x01,0x00,0x00,0x00,0x00,
  0x00,0x00,0x00,0x00,0x01,0x02,0x03,0x04,0x05,0x06,0x07,0x08,
  0x09,0x0A,0x0B,0xFF,0xC4,0x00,0xB5,0x10,0x00,0x02,0x01,0x03,
  0x03,0x02,0x04,0x03,0x05,0x05,0x04,0x04,0x00,0x00,0x01,0x7D,
  0x01,0x02,0x03,0x00,0x04,0x11,0x05,0x12,0x21,0x31,0x41,0x06,
  0x13,0x51,0x61,0x07,0x22,0x71,0x14,0x32,0x81,0x91,0xA1,0x08,
  0x23,0x42,0xB1,0xC1,0x15,0x52,0xD1,0xF0,0x24,0x33,0x62,0x72,
  0x82,0xFF,0xDA,0x00,0x08,0x01,0x01,0x00,0x00,0x3F,0x00,0xFB,
  0xBE,0xFF,0xD9
]);

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  await User.deleteMany({ email: /^testuser/ });
  await Capture.deleteMany({});

  // Create a test user
  const user = new User({
    name: 'Test User',
    email: 'testuser@example.com',
    password: 'TestPassword1',
    gdprConsentAccepted: true,
    gdprConsentTimestamp: new Date(),
  });
  await user.save();
  testUserId = user._id.toString();

  // Login to get token
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'testuser@example.com', password: 'TestPassword1' });

  validToken = res.body.accessToken;
});

afterAll(async () => {
  await User.deleteMany({ email: /^testuser/ });
  await Capture.deleteMany({});
  await mongoose.disconnect();
});

describe('Health Check', () => {
  test('GET /api/health returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('Auth Endpoints', () => {
  test('POST /api/auth/register — creates user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'New Tester',
        email: 'testuser2@example.com',
        password: 'Password123',
        gdprConsent: true,
      });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.accessToken).toBeDefined();
  });

  test('POST /api/auth/login — returns tokens', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'testuser@example.com', password: 'TestPassword1' });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
  });

  test('POST /api/auth/login — rejects wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'testuser@example.com', password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  test('GET /api/auth/me — returns user profile', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('testuser@example.com');
    expect(res.body.password).toBeUndefined(); // Never expose password
  });
});

describe('Capture Endpoints', () => {
  test('POST /api/capture — creates capture with image', async () => {
    const res = await request(app)
      .post('/api/capture')
      .set('Authorization', `Bearer ${validToken}`)
      .attach('image', MINIMAL_JPEG, { filename: 'test.jpg', contentType: 'image/jpeg' })
      .field('detection', JSON.stringify({
        litter: [{ class: 'bottle', score: 0.95, bbox: [10,10,100,100] }],
        people: [{ class: 'person', score: 0.88 }],
      }))
      .field('latitude', '40.7128')
      .field('longitude', '-74.0060');

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.id).toBeDefined();
    captureId = res.body.id;
  });

  test('GET /api/capture — returns list', async () => {
    const res = await request(app)
      .get('/api/capture')
      .set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.captures)).toBe(true);
  });

  test('GET /api/capture/:id — returns capture', async () => {
    if (!captureId) return; // Skip if previous test failed
    const res = await request(app)
      .get(`/api/capture/${captureId}`)
      .set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(200);
    expect(res.body._id).toBe(captureId);
  });

  test('PUT /api/capture/:id — updates status', async () => {
    if (!captureId) return;
    const res = await request(app)
      .put(`/api/capture/${captureId}`)
      .set('Authorization', `Bearer ${validToken}`)
      .send({ status: 'verified' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('verified');
  });

  test('DELETE /api/capture/:id — deletes capture', async () => {
    if (!captureId) return;
    const res = await request(app)
      .delete(`/api/capture/${captureId}`)
      .set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('GET /api/capture — requires auth', async () => {
    const res = await request(app).get('/api/capture');
    expect(res.status).toBe(401);
  });

  test('POST /api/capture — rejects non-image file', async () => {
    const res = await request(app)
      .post('/api/capture')
      .set('Authorization', `Bearer ${validToken}`)
      .attach('image', Buffer.from('this is not an image'), { filename: 'hack.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
  });
});

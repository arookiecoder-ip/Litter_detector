// controllers/authController.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const env = require('../config/environment');
const { securityLogger } = require('../utils/logger');

/**
 * Generate access + refresh token pair.
 */
const generateTokens = (userId, role) => {
  const accessToken = jwt.sign(
    { id: userId, role, type: 'access' },
    env.jwtSecret,
    { expiresIn: env.jwtExpiry }
  );
  const refreshToken = jwt.sign(
    { id: userId, role, type: 'refresh' },
    env.jwtRefreshSecret,
    { expiresIn: env.jwtRefreshExpiry }
  );
  return { accessToken, refreshToken };
};

// POST /api/auth/register
const register = async (req, res) => {
  try {
    const { email, password, name, gdprConsent } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const user = new User({
      email,
      password,
      name,
      gdprConsentAccepted: gdprConsent === true,
      gdprConsentTimestamp: gdprConsent === true ? new Date() : undefined,
    });

    await user.save();

    const { accessToken, refreshToken } = generateTokens(user._id, user.role);

    securityLogger.info({ event: 'USER_REGISTERED', userId: user._id, email });

    res.status(201).json({
      success: true,
      user,
      accessToken,
      refreshToken,
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
};

// POST /api/auth/login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const ip = req.ip;

    const user = await User.findOne({ email });
    if (!user) {
      securityLogger.warn({ event: 'LOGIN_FAILED', email, ip, reason: 'USER_NOT_FOUND' });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.isActive) {
      securityLogger.warn({ event: 'LOGIN_FAILED', email, ip, reason: 'ACCOUNT_DISABLED' });
      return res.status(403).json({ error: 'Account is disabled' });
    }

    const passwordValid = await user.comparePassword(password);
    if (!passwordValid) {
      securityLogger.warn({ event: 'LOGIN_FAILED', email, ip, reason: 'WRONG_PASSWORD' });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    user.lastLogin = new Date();
    await user.save();

    const { accessToken, refreshToken } = generateTokens(user._id, user.role);

    securityLogger.info({ event: 'LOGIN_SUCCESS', userId: user._id, email, ip });

    res.json({
      success: true,
      user,
      accessToken,
      refreshToken,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
};

// POST /api/auth/refresh
const refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token required' });
    }

    const decoded = jwt.verify(refreshToken, env.jwtRefreshSecret);

    if (decoded.type !== 'refresh') {
      return res.status(401).json({ error: 'Invalid token type' });
    }

    const user = await User.findById(decoded.id);
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'User not found or disabled' });
    }

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user._id, user.role);

    res.json({ accessToken, refreshToken: newRefreshToken });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Refresh token expired', code: 'REFRESH_EXPIRED' });
    }
    res.status(401).json({ error: 'Invalid refresh token' });
  }
};

// GET /api/auth/me
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
};

module.exports = { register, login, refresh, getMe };

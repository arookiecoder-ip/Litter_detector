// routes/auth.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { validateRegister, validateLogin, validate } = require('../middleware/validation');
const { register, login, refresh, getMe } = require('../controllers/authController');

router.post('/register', validateRegister, validate, register);
router.post('/login', validateLogin, validate, login);
router.post('/refresh', refresh);
router.get('/me', auth, getMe);

module.exports = router;

const express = require('express');
const router = express.Router();
const { signup, login, forgotPassword, verifyOtp, resetPassword, refreshToken, logout } = require('../controllers/authController');

router.post('/signup', signup);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/verify-otp', verifyOtp);
router.post('/reset-password', resetPassword);

// POST /api/auth/refresh-token endpoint
router.post('/refresh-token', refreshToken);

// POST /api/auth/logout endpoint
router.post('/logout', logout);

module.exports = router;

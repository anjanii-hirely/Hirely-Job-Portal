const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const { sendPasswordResetEmail } = require('../utils/passwordResetNotifications');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Generate JWT token
function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      role: user.role,
      name: user.name,
      email: user.email
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    }
  );
}

// Public user information
function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    headline: user.headline,
    companyName: user.company_name
  };
}

// ========================================
// POST /api/auth/register
// ========================================

router.post('/register', async (req, res) => {
  try {
    const {
      name,
      email: rawEmail,
      password,
      role,
      companyName,
      phone
    } = req.body;

    const email = (rawEmail || '').trim().toLowerCase();

    if (!name || !email || !password || !role) {
      return res.status(400).json({
        error: 'Name, email, password and role are required.'
      });
    }

    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({
        error: 'Please enter a valid email address.'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters long.'
      });
    }

    if (!phone || !/^\+[1-9]\d{7,14}$/.test(phone.trim())) {
      return res.status(400).json({
        error: 'Enter a valid phone number with country code, e.g. +919876543210.'
      });
    }

    if (!['seeker', 'recruiter'].includes(role)) {
      return res.status(400).json({
        error: 'Invalid role.'
      });
    }

    if (role === 'recruiter' && !companyName) {
      return res.status(400).json({
        error: 'Company name is required for recruiters.'
      });
    }

    const [existing] = await pool.query(
      'SELECT id FROM users WHERE LOWER(email) = ?',
      [email]
    );

    if (existing.length) {
      return res.status(409).json({
        error: 'An account with this email already exists.'
      });
    }

    const hash = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      `INSERT INTO users
      (name, email, password_hash, role, headline, company_name, phone_number)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        email,
        hash,
        role,
        role === 'seeker' ? '' : null,
        role === 'recruiter' ? companyName : null,
        phone.trim()
      ]
    );

    const [[user]] = await pool.query(
      'SELECT * FROM users WHERE id = ?',
      [result.insertId]
    );

    await pool.query(
      `INSERT INTO notifications (user_id, icon, title, body)
       VALUES (?, '👋', 'Welcome to Hirely', ?)`,
      [
        user.id,
        role === 'seeker'
          ? 'Complete your profile to get noticed by recruiters.'
          : 'Post your first job or internship to start receiving applications.'
      ]
    );

    const token = signToken(user);

    res.status(201).json({
      token,
      user: publicUser(user)
    });

  } catch (err) {
    console.error('Registration error:', err);

    res.status(500).json({
      error: 'Registration failed.'
    });
  }
});


// ========================================
// POST /api/auth/login
// ========================================

router.post('/login', async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const { password, role } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required.'
      });
    }

    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({
        error: 'Please enter a valid email address.'
      });
    }

    const [[user]] = await pool.query(
      'SELECT * FROM users WHERE LOWER(email) = ?',
      [email]
    );

    if (!user) {
      return res.status(401).json({
        error: 'Invalid email or password.'
      });
    }

    if (role && user.role !== role) {
      return res.status(401).json({
        error: `No ${role} account found with this email.`
      });
    }

    if (user.role === 'admin') {
      return res.status(401).json({
        error: 'Please use the admin login page.'
      });
    }

    const ok = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!ok) {
      return res.status(401).json({
        error: 'Invalid email or password.'
      });
    }

    const token = signToken(user);

    res.json({
      token,
      user: publicUser(user)
    });

  } catch (err) {
    console.error('Login error:', err);

    res.status(500).json({
      error: 'Login failed.'
    });
  }
});


// ========================================
// POST /api/auth/forgot-password
// Brevo Email OTP - 3 minutes
// ========================================

router.post('/forgot-password', async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();

    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({
        error: 'Please enter a valid email address.'
      });
    }

    const [[user]] = await pool.query(
      'SELECT id, name, email FROM users WHERE LOWER(email) = ?',
      [email]
    );

    // Generic response for unknown accounts
    if (!user) {
      return res.json({
        message: 'If an account exists, a password reset OTP will be sent.'
      });
    }

    // Generate six-digit OTP
    const otp = String(
      crypto.randomInt(0, 1000000)
    ).padStart(6, '0');

    const tokenHash = crypto
      .createHash('sha256')
      .update(otp)
      .digest('hex');

    // Remove old OTP records
    await pool.query(
      'DELETE FROM password_reset_tokens WHERE user_id = ? OR expires_at < NOW()',
      [user.id]
    );

    // Save OTP with 3-minute expiry
    await pool.query(
      `INSERT INTO password_reset_tokens
      (user_id, token_hash, expires_at)
      VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 3 MINUTE))`,
      [user.id, tokenHash]
    );

    // Send OTP through Brevo
    try {
      await sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        otp
      });

    } catch (emailError) {
      console.error('Brevo email error:', emailError.message);

      await pool.query(
        'DELETE FROM password_reset_tokens WHERE user_id = ?',
        [user.id]
      );

      return res.status(503).json({
        error: 'Could not send reset email. Please check Brevo settings.'
      });
    }

    res.json({
      message: 'OTP sent successfully. It expires in 3 minutes.',
      emailSent: true
    });

  } catch (err) {
    console.error('Forgot password error:', err);

    res.status(500).json({
      error: 'Password reset request failed.'
    });
  }
});


// ========================================
// POST /api/auth/reset-password
// ========================================

router.post('/reset-password', async (req, res) => {
  try {
    const token = (
      req.body.otp ||
      req.body.token ||
      ''
    ).trim();

    const password = req.body.password || '';

    if (!/^\d{6}$/.test(token) || !password) {
      return res.status(400).json({
        error: 'Enter the 6-digit OTP and your new password.'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters.'
      });
    }

    const tokenHash = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    const [[row]] = await pool.query(
      `SELECT id, user_id
       FROM password_reset_tokens
       WHERE token_hash = ?
       AND used_at IS NULL
       AND expires_at > NOW()
       LIMIT 1`,
      [tokenHash]
    );

    if (!row) {
      return res.status(400).json({
        error: 'This OTP is invalid or has expired. Please request a new one.'
      });
    }

    const hash = await bcrypt.hash(password, 10);

    await pool.query(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [hash, row.user_id]
    );

    await pool.query(
      'UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?',
      [row.id]
    );

    // Delete all reset tokens for this user
    await pool.query(
      'DELETE FROM password_reset_tokens WHERE user_id = ?',
      [row.user_id]
    );

    res.json({
      message: 'Password reset successfully. You can now log in with your new password.'
    });

  } catch (err) {
    console.error('Reset password error:', err);

    res.status(500).json({
      error: 'Password reset failed.'
    });
  }
});


// ========================================
// POST /api/auth/admin-login
// ========================================

router.post('/admin-login', async (req, res) => {
  try {
    const email = (req.body.email || '').trim();
    const password = req.body.password || '';

    if (!email || !password) {
      return res.status(400).json({
        error: 'Please enter the admin email and password.'
      });
    }

    const [[user]] = await pool.query(
      `SELECT * FROM users
       WHERE email = ? AND role = 'admin'`,
      [email]
    );

    if (!user) {
      return res.status(401).json({
        error: 'Invalid admin credentials.'
      });
    }

    const ok = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!ok) {
      return res.status(401).json({
        error: 'Invalid admin credentials.'
      });
    }

    const token = signToken(user);

    res.json({
      token,
      user: publicUser(user)
    });

  } catch (err) {
    console.error('Admin login error:', err);

    res.status(500).json({
      error: 'Admin login failed.'
    });
  }
});


// ========================================
// GET /api/auth/me
// ========================================

router.get('/me', requireAuth, async (req, res) => {
  try {
    const [[user]] = await pool.query(
      'SELECT * FROM users WHERE id = ?',
      [req.user.id]
    );

    if (!user) {
      return res.status(404).json({
        error: 'User not found.'
      });
    }

    res.json({
      user: publicUser(user)
    });

  } catch (err) {
    console.error('Get user error:', err);

    res.status(500).json({
      error: 'Could not fetch user information.'
    });
  }
});

module.exports = router;
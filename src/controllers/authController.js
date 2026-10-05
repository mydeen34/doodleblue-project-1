const prisma = require('../config/prisma');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Signup logic
const signup = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // 1. Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Name, email, and password are required'
      });
    }
    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid email format'
      });
    }

    // 2. Check if the email already exists in MySQL using Prisma
    const existingUser = await prisma.users.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(409).json({
        status: 'error',
        message: 'Email already exists'
      });
    }

    // 3. Hash the password before saving (NEVER save plain text)
    // 10 is the saltRounds (how many times the hashing happens, more is secure but slower)
    const hashedPassword = await bcrypt.hash(password, 10);

    // 4. Save the user into MySQL using Prisma
    const newUser = await prisma.users.create({
      data: {
        name,
        email,
        password: hashedPassword
      }
    });

    // 5. Return success response
    return res.status(201).json({
      status: 'success',
      message: 'User registered successfully!',
      data: {
        userId: newUser.id,
        name: newUser.name,
        email: newUser.email
      }
    });

  } catch (error) {
    console.error('Signup Error:', error);
    // 6. Handle unexpected database or server errors
    return res.status(500).json({
      status: 'error',
      message: 'Internal server error during signup'
    });
  }
};

// Login logic
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Email and password are required'
      });
    }

    // 2. Check if the user exists in MySQL using Prisma
    const user = await prisma.users.findUnique({
      where: { email }
    });

    if (!user) {
      // User not found
      return res.status(401).json({
        status: 'error',
        message: 'Invalid email or password'
      });
    }

    // 3. Compare the entered password with the hashed password from the database
    // bcrypt.compare will return true if they match, false otherwise
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid email or password'
      });
    }

    // 4. Generate the Access Token (Short-lived)
    const accessToken = jwt.sign(
      { userId: user.id, email: user.email }, 
      process.env.JWT_ACCESS_SECRET,          
      { expiresIn: '15m' }                    
    );

    // 5. Generate the Refresh Token (Long-lived)
    const refreshToken = jwt.sign(
      { userId: user.id }, // We just need userId here to re-issue tokens
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: '7d' } // 7 days
    );

    // 6. Save the Refresh Token in MySQL database using Prisma
    // We calculate the expiration date to be 7 days from now for the DB record
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    
    await prisma.refresh_tokens.create({
      data: {
        user_id: user.id,
        token: refreshToken,
        expires_at: expiresAt
      }
    });

    // 7. Set the Refresh Token as an HttpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true, // Prevents JavaScript from reading the cookie
      secure: process.env.NODE_ENV === 'production', // true on HTTPS, false on local HTTP
      sameSite: 'strict', // Protects against Cross-Site Request Forgery (CSRF)
      maxAge: 7 * 24 * 60 * 60 * 1000 // Cookie lives for 7 days (in milliseconds)
    });

    // 8. Return success response (ONLY returning the Access Token in JSON)
    return res.status(200).json({
      status: 'success',
      message: 'Logged in successfully!',
      accessToken: accessToken,
      data: {
        userId: user.id,
        name: user.name,
        email: user.email
      }
    });

  } catch (error) {
    console.error('Login Error:', error);
    // 5. Handle unexpected errors
    return res.status(500).json({
      status: 'error',
      message: 'Internal server error during login'
    });
  }
};

// Forgot Password logic
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ status: 'error', message: 'Email is required' });
    }

    // 1. Check if the user exists in MySQL using Prisma
    const user = await prisma.users.findUnique({
      where: { email },
      select: { id: true } // Teaching 'select': only fetches the id column from MySQL
    });
    
    if (!user) {
      // For security, it's often better to say "If the email exists, an OTP was sent"
      // But for beginner friendliness, we'll return an error if it doesn't exist.
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    const userId = user.id;

    // 2. Generate a secure 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // 3. Set expiration time (e.g., 10 minutes from now)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // 4. Store OTP in MySQL using Prisma
    await prisma.otps.create({
      data: {
        user_id: userId,
        otp: otp,
        expires_at: expiresAt
      }
    });

    // 5. Send/handle the OTP
    // Normally you would send an email here. For development, we return it in a safe debug object.
    return res.status(200).json({
      status: 'success',
      message: 'OTP generated successfully',
      debug_otp: otp // MOCKING EMAIL SENDING: Only for development/testing!
    });

  } catch (error) {
    console.error('Forgot Password Error:', error);
    return res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

// Verify OTP logic
const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ status: 'error', message: 'Email and OTP are required' });
    }

    // 1. Verify Email exists using Prisma
    const user = await prisma.users.findUnique({
      where: { email },
      select: { id: true }
    });
    
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    const userId = user.id;

    // 2. Find the OTP record using findFirst and orderBy (LIMIT 1 ORDER BY created_at DESC)
    const otpRecord = await prisma.otps.findFirst({
      where: {
        user_id: userId,
        otp: otp
      },
      orderBy: {
        created_at: 'desc'
      }
    });

    if (!otpRecord) {
      return res.status(400).json({ status: 'error', message: 'Invalid OTP' });
    }

    // 3. Check if OTP has expired
    const now = new Date();
    if (now > new Date(otpRecord.expires_at)) {
      return res.status(400).json({ status: 'error', message: 'OTP has expired' });
    }

    // If we reach here, the OTP is valid and not expired
    // If we reach here, the OTP is valid and not expired
    // We do NOT delete it yet. We will delete it when the password is actually reset.
    // await db.execute('DELETE FROM otps WHERE id = ?', [otpRecord.id]);

    return res.status(200).json({
      status: 'success',
      message: 'OTP verified successfully! You can now reset your password.'
    });

  } catch (error) {
    console.error('Verify OTP Error:', error);
    return res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

// Reset Password logic
const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ status: 'error', message: 'Email, OTP, and new password are required' });
    }

    // 1. Verify Email exists using Prisma
    const user = await prisma.users.findUnique({
      where: { email },
      select: { id: true }
    });
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }
    const userId = user.id;

    // 2. Verify OTP again to ensure the user has the right to reset the password
    const otpRecord = await prisma.otps.findFirst({
      where: {
        user_id: userId,
        otp: otp
      },
      orderBy: {
        created_at: 'desc'
      }
    });

    if (!otpRecord) {
      return res.status(400).json({ status: 'error', message: 'Invalid or missing OTP' });
    }

    const now = new Date();
    if (now > new Date(otpRecord.expires_at)) {
      return res.status(400).json({ status: 'error', message: 'OTP has expired' });
    }

    // 3. Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // 4. Update the user's password in MySQL using Prisma update()
    await prisma.users.update({
      where: { id: userId },
      data: { password: hashedPassword }
    });

    // 5. Delete the OTP using Prisma delete() so it cannot be reused
    await prisma.otps.delete({
      where: { id: otpRecord.id }
    });

    return res.status(200).json({
      status: 'success',
      message: 'Password reset successfully! You can now login with your new password.'
    });

  } catch (error) {
    console.error('Reset Password Error:', error);
    return res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

// Refresh Token logic
const refreshToken = async (req, res) => {
  try {
    // Read the token from the HttpOnly cookie (requires cookie-parser)
    const token = req.cookies.refreshToken;

    if (!token) {
      return res.status(401).json({ status: 'error', message: 'No refresh token provided' });
    }

    // 1. Verify the JWT signature and expiration
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    } catch (err) {
      return res.status(403).json({ status: 'error', message: 'Invalid or expired refresh token' });
    }

    // 2. Check the database using Prisma to see if this exact token exists
    const dbToken = await prisma.refresh_tokens.findFirst({
      where: { token }
    });

    if (!dbToken) {
      return res.status(403).json({ status: 'error', message: 'Refresh token not found in database' });
    }

    // 3. Check if it was explicitly revoked
    if (dbToken.revoked_at !== null) {
      return res.status(403).json({ status: 'error', message: 'Refresh token has been revoked' });
    }

    // 4. Fetch the user using Prisma findUnique on primary key id
    const user = await prisma.users.findUnique({
      where: { id: decoded.userId }
    });

    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    // 5. Generate a NEW Access Token (15 minutes)
    const newAccessToken = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: '15m' }
    );

    // 6. Return ONLY the new Access Token (the old refresh token cookie remains untouched)
    return res.status(200).json({
      status: 'success',
      accessToken: newAccessToken
    });

  } catch (error) {
    console.error('Refresh Token Error:', error);
    return res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

// Logout logic
const logout = async (req, res) => {
  try {
    const token = req.cookies.refreshToken;

    if (token) {
      // 1. Revoke the refresh token in MySQL using Prisma updateMany()
      await prisma.refresh_tokens.updateMany({
        where: { token: token },
        data: { revoked_at: new Date() }
      });
    }

    // 2. Clear the cookie from the user's browser
    // Note: Options must match the ones used when setting the cookie (except maxAge/expires)
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });

    return res.status(200).json({
      status: 'success',
      message: 'Logged out successfully!'
    });

  } catch (error) {
    console.error('Logout Error:', error);
    return res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

module.exports = {
  signup,
  login,
  forgotPassword,
  verifyOtp,
  resetPassword,
  refreshToken,
  logout
};



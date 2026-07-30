import express from 'express';
import crypto from 'crypto';
import { body, validationResult } from 'express-validator';
import User from '../models/User.js';
import Student from '../models/Student.js';
import {
  generateToken,
  authenticateToken,
  authorizeRoles,
  rateLimitLogin
} from '../middleware/auth.js';
import { sendPasswordResetEmail } from '../utils/email.js';
import { sendPasswordResetSMS, sendCredentialsSMS } from '../utils/sms.js';
import { uploadAvatar } from '../middleware/upload.js';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const router = express.Router();

// Login endpoint
router.post('/login', rateLimitLogin, [
  body('identifier').trim().notEmpty().withMessage('Please provide your email or phone number'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').optional().isIn(['parent', 'student', 'staff']).withMessage('Invalid account type')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { identifier, password, role } = req.body;

    // Find user by email or phone
    const user = await User.findByIdentifier(identifier);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account has been deactivated. Please contact administration.'
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Confirm the selected account type matches the account (checked after
    // password verification so a wrong guess here can't be used to probe
    // whether an identifier exists). "Staff" also covers admin accounts.
    if (role) {
      const roleMatches = role === 'staff' ? ['staff', 'admin'].includes(user.role) : user.role === role;
      if (!roleMatches) {
        return res.status(401).json({
          success: false,
          message: `This account is registered as ${user.role}, not ${role}. Please select the correct account type.`
        });
      }
    }

    // Generate JWT token
    const token = generateToken(user._id, user.role);

    // Record this sign-in for the account-activity list (keep the last 10,
    // most-recent first). The pre-save hook only re-hashes when the password
    // field changes, so saving here is safe.
    const loginAt = new Date();
    user.lastLogin = loginAt;
    user.loginHistory = [
      { at: loginAt, ip: req.ip, userAgent: req.headers['user-agent'] },
      ...(user.loginHistory || [])
    ].slice(0, 10);
    await user.save();

    // Get additional user info based on role
    let userData = {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      division: user.division,
      classes: user.classes,
      staffType: user.staffType,
      avatarUrl: user.avatarUrl,
      notificationPrefs: user.notificationPrefs,
      loginHistory: user.loginHistory,
      lastLogin: user.lastLogin
    };

    // If user is a student, get student info
    if (user.role === 'student') {
      const student = await Student.findOne({ userId: user._id });
      if (student) {
        userData.student = {
          id: student._id,
          fullName: student.fullName,
          regNumber: student.regNumber,
          class: student.class,
          division: student.division,
          session: student.session
        };
      }
    }

    // If user is a parent, list the children linked to this account
    if (user.role === 'parent') {
      const children = await Student.find({ parentUserId: user._id, isActive: true });
      userData.children = children.map((child) => ({
        id: child._id,
        fullName: child.fullName,
        regNumber: child.regNumber,
        class: child.class,
        division: child.division,
        session: child.session
      }));
    }

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: userData
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred during login'
    });
  }
});

// Admin register endpoint (for admin to create users, e.g. staff/teacher accounts)
router.post('/admin/register', authenticateToken, authorizeRoles('admin'), [
  body('name').optional({ checkFalsy: true }).trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('Please provide a valid email'),
  body('phone').optional({ checkFalsy: true }).isString().withMessage('Please provide a valid phone number'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').isIn(['student', 'parent', 'staff', 'admin']).withMessage('Invalid role'),
  body('division').optional().isIn(['nursery', 'primary', 'secondary', 'college']).withMessage('Invalid division'),
  body('classes').optional().isArray().withMessage('Classes must be a list'),
  body('staffType').optional({ checkFalsy: true }).isIn(['class_teacher', 'subject_teacher', 'bursar']).withMessage('Invalid staff type')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { name, email, phone, password, role, division, classes, staffType } = req.body;

    if (!email && !phone) {
      return res.status(400).json({
        success: false,
        message: 'An email or phone number is required to create an account'
      });
    }

    // Check if user already exists
    const existingUser = await User.findByIdentifier(email || phone);
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'A user with this email or phone number already exists'
      });
    }

    // A staff member's class assignment only makes sense alongside a division
    const cleanClasses = role === 'staff' && Array.isArray(classes)
      ? classes.map((c) => c.trim()).filter(Boolean)
      : [];
    if (cleanClasses.length > 0 && !division) {
      return res.status(400).json({
        success: false,
        message: 'Assign a division before assigning specific classes'
      });
    }

    // Create user
    const userData = {
      name: name?.trim() || undefined,
      email: email || undefined,
      phone: phone || undefined,
      passwordHash: password, // Will be hashed by the model
      role,
      division: (role === 'student' || role === 'parent' || role === 'staff') ? division : undefined,
      classes: cleanClasses,
      staffType: role === 'staff' ? (staffType || undefined) : undefined
    };

    const user = await User.createUser(userData);

    if (user.phone) {
      await sendCredentialsSMS({ phone: user.phone, identifier: email || phone, password, role });
    }

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        division: user.division,
        classes: user.classes,
        staffType: user.staffType
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred during registration'
    });
  }
});

// Change password endpoint
router.post('/change-password', authenticateToken, [
  body('currentPassword').isLength({ min: 1 }).withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { currentPassword, newPassword } = req.body;
    const userId = req.userId;

    // Get user with password
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    user.passwordHash = newPassword; // Will be hashed by pre-save middleware
    await user.save();

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while changing password'
    });
  }
});

// Update the signed-in user's own profile — contact details + notification
// preferences. (Name is only editable for staff/admin; students/parents are
// named on their student record and managed by an admin.)
router.patch('/profile', authenticateToken, [
  body('name').optional({ checkFalsy: true }).trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('Please provide a valid email'),
  body('phone').optional({ checkFalsy: true }).isString().withMessage('Please provide a valid phone number'),
  body('notificationPrefs').optional().isObject().withMessage('Invalid notification preferences')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { name, email, phone, notificationPrefs } = req.body;
    const isStaffAdmin = ['staff', 'admin'].includes(req.user.role);

    const setOps = {};
    const unsetOps = {};

    if (name !== undefined && isStaffAdmin) {
      if (name.trim()) setOps.name = name.trim(); else unsetOps.name = '';
    }
    if (email !== undefined) {
      if (email) setOps.email = email.toLowerCase().trim(); else unsetOps.email = '';
    }
    if (phone !== undefined) {
      if (phone) setOps.phone = phone.trim(); else unsetOps.phone = '';
    }

    // The account must keep at least one way to sign in / be contacted.
    const finalEmail = 'email' in setOps ? setOps.email : ('email' in unsetOps ? undefined : req.user.email);
    const finalPhone = 'phone' in setOps ? setOps.phone : ('phone' in unsetOps ? undefined : req.user.phone);
    if (!finalEmail && !finalPhone) {
      return res.status(400).json({ success: false, message: 'At least one of email or phone is required' });
    }

    if (notificationPrefs && typeof notificationPrefs === 'object') {
      ['emailNotices', 'smsNotices', 'emailBills', 'smsBills'].forEach((key) => {
        if (typeof notificationPrefs[key] === 'boolean') setOps[`notificationPrefs.${key}`] = notificationPrefs[key];
      });
    }

    const update = {};
    if (Object.keys(setOps).length) update.$set = setOps;
    if (Object.keys(unsetOps).length) update.$unset = unsetOps;

    const user = await User.findByIdAndUpdate(req.user._id, update, { new: true, runValidators: true }).select('-passwordHash');

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        name: user.name,
        email: user.email,
        phone: user.phone,
        notificationPrefs: user.notificationPrefs
      }
    });

  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'That email or phone is already in use by another account' });
    }
    console.error('Profile update error:', error);
    res.status(500).json({ success: false, message: 'An error occurred while updating your profile' });
  }
});

// Upload/replace the signed-in user's profile photo
router.post('/profile/avatar', authenticateToken, uploadAvatar, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'An image file is required' });
    }
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { avatarUrl: req.file.path } },
      { new: true }
    ).select('-passwordHash');

    res.json({ success: true, message: 'Profile photo updated', avatarUrl: user.avatarUrl });

  } catch (error) {
    console.error('Avatar upload error:', error);
    res.status(500).json({ success: false, message: 'An error occurred while updating your photo' });
  }
});

// Get current user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    let userData = {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      division: user.division,
      classes: user.classes,
      staffType: user.staffType,
      avatarUrl: user.avatarUrl,
      notificationPrefs: user.notificationPrefs,
      loginHistory: user.loginHistory,
      lastLogin: user.lastLogin,
      isActive: user.isActive
    };

    // If user is a student, get student info
    if (user.role === 'student') {
      const student = await Student.findOne({ userId: user._id });
      if (student) {
        userData.student = {
          id: student._id,
          fullName: student.fullName,
          regNumber: student.regNumber,
          class: student.class,
          division: student.division,
          session: student.session,
          photoUrl: student.photoUrl,
          parentInfo: student.parentInfo
        };
      }
    }

    // If user is a parent, list the children linked to this account
    if (user.role === 'parent') {
      const children = await Student.find({ parentUserId: user._id, isActive: true });
      userData.children = children.map((child) => ({
        id: child._id,
        fullName: child.fullName,
        regNumber: child.regNumber,
        class: child.class,
        division: child.division,
        session: child.session,
        photoUrl: child.photoUrl
      }));
    }

    res.json({
      success: true,
      user: userData
    });

  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching profile'
    });
  }
});

// Logout endpoint (client-side token removal, but we can track it)
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    // In a more sophisticated setup, you might want to blacklist the token
    // For now, we'll just return success and let client remove the token
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred during logout'
    });
  }
});

// Verify token endpoint
router.get('/verify', authenticateToken, (req, res) => {
  res.json({
    success: true,
    message: 'Token is valid',
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      division: req.user.division,
      classes: req.user.classes,
      staffType: req.user.staffType
    }
  });
});

// Password reset request (simplified version)
router.post('/forgot-password', [
  body('identifier').trim().notEmpty().withMessage('Please provide your email or phone number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { identifier } = req.body;
    const genericMessage = 'If an account with this email or phone number exists, you will receive password reset instructions.';

    // Check if user exists
    const user = await User.findByIdentifier(identifier);
    if (!user) {
      // Don't reveal if the account exists or not for security
      return res.json({ success: true, message: genericMessage });
    }

    // Generate a random token; only the hash is stored so a leaked DB can't be used to reset passwords
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.passwordResetExpires = Date.now() + 60 * 60 * 1000; // 1 hour
    await user.save();

    const resetUrl = `${FRONTEND_URL}/reset-password/${resetToken}`;

    if (user.email) {
      await sendPasswordResetEmail({ email: user.email, resetUrl });
    } else if (user.phone) {
      await sendPasswordResetSMS({ phone: user.phone, resetUrl });
    } else if (user.role === 'student') {
      // Student accounts have no contact info of their own (they log in
      // with their registration number) — the reset link has to go to
      // whichever contact is on file for their parent instead.
      const student = await Student.findOne({ userId: user._id });
      if (student?.parentInfo?.email) {
        await sendPasswordResetEmail({ email: student.parentInfo.email, resetUrl });
      } else if (student?.parentInfo?.phone) {
        await sendPasswordResetSMS({ phone: student.parentInfo.phone, resetUrl });
      }
    }

    res.json({ success: true, message: genericMessage });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while processing your request'
    });
  }
});

// Complete a password reset using the token emailed to the user
router.post('/reset-password/:token', [
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'This password reset link is invalid or has expired. Please request a new one.'
      });
    }

    user.passwordHash = req.body.password;
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    await user.save();

    res.json({
      success: true,
      message: 'Your password has been reset successfully. You can now sign in with your new password.'
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while resetting your password'
    });
  }
});

// Get authentication status
router.get('/status', (req, res) => {
  res.json({ 
    message: 'Authentication system is ready',
    phase: 'Phase 2 - Authentication & Student Portal',
    features: [
      'User Login/Logout',
      'JWT Token Authentication',
      'Role-based Authorization',
      'Password Management',
      'Account Security'
    ]
  });
});

export default router;
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// JWT Secret (should be in environment variables)
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Generate JWT token
export const generateToken = (userId, role) => {
  return jwt.sign(
    { 
      userId, 
      role,
      iat: Math.floor(Date.now() / 1000)
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

// Verify JWT token middleware
export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token required'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Get user from database
    const user = await User.findById(decoded.userId).select('-passwordHash');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account has been deactivated'
      });
    }

    // Check if account is locked
    if (user.isLocked) {
      return res.status(401).json({
        success: false,
        message: 'Account is temporarily locked'
      });
    }

    // Attach user to request object
    req.user = user;
    req.userId = user._id;
    req.userRole = user.role;
    
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token has expired'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }

    console.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication error'
    });
  }
};

// Authorization middleware - check user roles
export const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    next();
  };
};

// Finance access (fee schedules, invoices, payments recording) is limited to
// administrators and the bursar — teaching staff (class/subject teachers) have
// no billing responsibilities. Must run after authenticateToken.
export const authorizeFinance = (req, res, next) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  const isFinance = user.role === 'admin' || (user.role === 'staff' && user.staffType === 'bursar');
  if (!isFinance) {
    return res.status(403).json({
      success: false,
      message: 'Access denied — billing is limited to administrators and the bursar.'
    });
  }
  next();
};

// Check if user is student or parent of the student
export const authorizeStudentAccess = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const { role, _id: userId } = req.user;

    // Admins and staff can access any student
    if (['admin', 'staff'].includes(role)) {
      return next();
    }

    // Students can only access their own data
    if (role === 'student') {
      const Student = (await import('../models/Student.js')).default;
      const student = await Student.findOne({ userId, _id: studentId });
      
      if (!student) {
        return res.status(403).json({
          success: false,
          message: 'Access denied - not your student record'
        });
      }
    }

    // Parents can access their child's data
    if (role === 'parent') {
      const Student = (await import('../models/Student.js')).default;
      const student = await Student.findById(studentId);

      const isParentOfStudent = student && (
        student.parentUserId?.equals(userId) ||
        (req.user.email && student.parentInfo.email === req.user.email) ||
        (req.user.phone && student.parentInfo.phone === req.user.phone)
      );

      if (!isParentOfStudent) {
        return res.status(403).json({
          success: false,
          message: 'Access denied - not your child\'s record'
        });
      }
    }

    next();
  } catch (error) {
    console.error('Student authorization error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authorization error'
    });
  }
};

// Check division access for role-based operations
export const authorizeDivisionAccess = (req, res, next) => {
  const { division } = req.params;
  const { role, division: userDivision } = req.user;

  // Admins can access all divisions
  if (role === 'admin') {
    return next();
  }

  // Staff and other roles are restricted to their division
  if (userDivision && userDivision !== division) {
    return res.status(403).json({
      success: false,
      message: 'Access denied - division not authorized'
    });
  }

  next();
};

// Rate limiting for login attempts
const loginAttempts = new Map();

export const rateLimitLogin = (req, res, next) => {
  const { identifier } = req.body;
  const key = `login_${identifier}`;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const maxAttempts = 5;

  const attempts = loginAttempts.get(key) || [];
  const recentAttempts = attempts.filter(time => now - time < windowMs);

  if (recentAttempts.length >= maxAttempts) {
    return res.status(429).json({
      success: false,
      message: 'Too many login attempts. Please try again in 15 minutes.'
    });
  }

  recentAttempts.push(now);
  loginAttempts.set(key, recentAttempts);

  next();
};

// Clean up old login attempts periodically
setInterval(() => {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  
  for (const [key, attempts] of loginAttempts.entries()) {
    const recentAttempts = attempts.filter(time => now - time < windowMs);
    if (recentAttempts.length === 0) {
      loginAttempts.delete(key);
    } else {
      loginAttempts.set(key, recentAttempts);
    }
  }
}, 5 * 60 * 1000); // Clean up every 5 minutes

export default {
  generateToken,
  authenticateToken,
  authorizeRoles,
  authorizeStudentAccess,
  authorizeDivisionAccess,
  rateLimitLogin
};
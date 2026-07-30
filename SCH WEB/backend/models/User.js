import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  // Display name for staff/admin accounts (students/parents are named on their
  // own records). Shown in the navbar and staff list.
  name: {
    type: String,
    trim: true
  },
  email: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    unique: true,
    sparse: true,
    trim: true
  },
  passwordHash: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['student', 'parent', 'staff', 'admin'],
    required: true
  },
  division: {
    type: String,
    enum: ['nursery', 'primary', 'secondary', 'college'],
    required: function() {
      return this.role === 'student' || this.role === 'parent';
    }
  },
  // Further narrows a staff member's division assignment to specific classes
  // (e.g. a class teacher). Only meaningful alongside `division` — empty
  // means "all classes in the assigned division".
  classes: {
    type: [String],
    default: []
  },
  // A staff member's job function. Only meaningful when role === 'staff'.
  staffType: {
    type: String,
    enum: ['class_teacher', 'subject_teacher', 'bursar'],
    default: undefined
  },
  // Profile picture (Cloudinary URL). Students have their photo on the Student
  // record; this covers staff/admin/parent accounts.
  avatarUrl: {
    type: String,
    trim: true
  },
  // How the account wants to be notified. Enforcement lives in the send paths;
  // these are the user's stored preferences.
  notificationPrefs: {
    emailNotices: { type: Boolean, default: true },
    smsNotices: { type: Boolean, default: false },
    emailBills: { type: Boolean, default: true },
    smsBills: { type: Boolean, default: false }
  },
  // Recent sign-ins (most-recent first, capped) for the account-activity view.
  loginHistory: {
    type: [{
      at: { type: Date, default: Date.now },
      ip: String,
      userAgent: String
    }],
    default: []
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date,
    default: null
  },
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: {
    type: Date,
    default: null
  },
  passwordResetToken: {
    type: String,
    default: null
  },
  passwordResetExpires: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Virtual for account locked status
userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Index for performance
userSchema.index({ role: 1 });
userSchema.index({ division: 1 });

// Every account needs at least one way to log in — except students, who log
// in with their registration number (resolved via the linked Student record,
// not stored on the User itself)
userSchema.pre('validate', function(next) {
  if (this.role !== 'student' && !this.email && !this.phone) {
    return next(new Error('An account needs at least an email or a phone number'));
  }
  next();
});

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
  if (!this.isModified('passwordHash')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare passwords
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (this.isLocked) {
    throw new Error('Account is temporarily locked due to too many failed login attempts');
  }
  
  const isMatch = await bcrypt.compare(candidatePassword, this.passwordHash);
  
  if (!isMatch) {
    this.loginAttempts += 1;
    
    // Lock account after 5 failed attempts for 30 minutes
    if (this.loginAttempts >= 5) {
      this.lockUntil = Date.now() + 30 * 60 * 1000; // 30 minutes
    }
    
    await this.save();
    return false;
  }
  
  // Reset login attempts on successful login
  if (this.loginAttempts > 0) {
    this.loginAttempts = 0;
    this.lockUntil = undefined;
  }
  
  this.lastLogin = new Date();
  await this.save();
  
  return true;
};

// Method to create user with hashed password
userSchema.statics.createUser = async function(userData) {
  const user = new this(userData);
  return await user.save();
};

// Method to find by email
userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() });
};

// Method to find by phone
userSchema.statics.findByPhone = function(phone) {
  return this.findOne({ phone });
};

// Method to find by email, phone, or student registration number — used at
// login, where the user may type in whichever identifier they were given.
// Registration numbers (e.g. "GMA/PRI/2024/0001") aren't stored on the User
// itself, so a "/" in the identifier routes the lookup through the Student
// collection instead.
userSchema.statics.findByIdentifier = async function(identifier) {
  const trimmed = identifier.trim();

  if (trimmed.includes('@')) {
    return this.findOne({ email: trimmed.toLowerCase() });
  }

  if (trimmed.includes('/')) {
    const Student = (await import('./Student.js')).default;
    const student = await Student.findOne({ regNumber: trimmed.toUpperCase() }).select('userId');
    return student ? this.findById(student.userId) : null;
  }

  return this.findOne({ phone: trimmed });
};

export default mongoose.model('User', userSchema);
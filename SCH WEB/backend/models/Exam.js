import mongoose from 'mongoose';

const questionSchema = new mongoose.Schema({
  questionText: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['mcq', 'short', 'essay'],
    required: true
  },
  options: [String], // mcq only
  correctAnswer: String, // mcq only — must exactly match one entry in `options`
  imageUrl: String, // optional — e.g. a diagram/photo the question refers to
  marks: {
    type: Number,
    required: true,
    min: 1,
    default: 1
  }
});

questionSchema.pre('validate', function(next) {
  if (this.type === 'mcq') {
    if (!this.options || this.options.length < 2) {
      return next(new Error('An MCQ question needs at least 2 options'));
    }
    if (!this.correctAnswer || !this.options.includes(this.correctAnswer)) {
      return next(new Error('correctAnswer must exactly match one of the MCQ options'));
    }
  }
  next();
});

const examSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxLength: 200
  },
  description: {
    type: String,
    maxLength: 2000
  },
  subject: {
    type: String,
    trim: true,
    maxLength: 100
  },
  division: {
    type: String,
    enum: ['nursery', 'primary', 'secondary', 'college'],
    required: true
  },
  // Specific classes within the division; empty = every class in the division.
  classes: [String],
  durationMinutes: {
    type: Number,
    required: true,
    min: 1
  },
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date,
    required: true
  },
  questions: [questionSchema],
  shuffleQuestions: {
    type: Boolean,
    default: false
  },
  // Whether students see their score/breakdown right after submitting, or
  // only once an admin has finished manually grading short/essay answers.
  showResultsImmediately: {
    type: Boolean,
    default: true
  },
  isPublished: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

examSchema.index({ isPublished: 1, isActive: 1 });
examSchema.index({ division: 1 });
examSchema.index({ startTime: 1, endTime: 1 });

examSchema.pre('validate', function(next) {
  if (this.endTime && this.startTime && this.endTime <= this.startTime) {
    return next(new Error('endTime must be after startTime'));
  }
  next();
});

examSchema.virtual('totalMarks').get(function() {
  return (this.questions || []).reduce((sum, q) => sum + (q.marks || 0), 0);
});

// Strips answer keys before sending an exam to a student taking it — the
// student-facing routes always use this instead of the raw document.
examSchema.methods.toStudentView = function() {
  const obj = this.toObject();
  obj.questions = obj.questions.map(({ correctAnswer, ...rest }) => rest);
  return obj;
};

examSchema.statics.findAvailableForUser = function(division, classes = []) {
  const now = new Date();
  const query = {
    isPublished: true,
    isActive: true,
    division,
    endTime: { $gte: now }
  };

  if (classes.length > 0) {
    query.$or = [
      { classes: { $size: 0 } },
      { classes: { $in: classes } }
    ];
  }

  return this.find(query).sort({ startTime: 1 });
};

export default mongoose.model('Exam', examSchema);

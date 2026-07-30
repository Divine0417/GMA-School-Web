import mongoose from 'mongoose';

const answerSchema = new mongoose.Schema({
  questionId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  answer: {
    type: String,
    default: ''
  },
  // Set immediately for mcq (auto-scored on submit); left null for short/essay
  // until an admin grades it.
  marksAwarded: Number
}, { _id: false });

const submissionSchema = new mongoose.Schema({
  examId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exam',
    required: true
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },
  startedAt: {
    type: Date,
    required: true,
    default: Date.now
  },
  submittedAt: Date,
  answers: [answerSchema],
  score: Number,
  maxScore: Number,
  status: {
    type: String,
    enum: ['in_progress', 'submitted', 'graded'],
    default: 'in_progress'
  },
  autoSubmitted: {
    type: Boolean,
    default: false
  },
  tabSwitchCount: {
    type: Number,
    default: 0
  },
  fullscreenExitCount: {
    type: Number,
    default: 0
  },
  gradedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  gradedAt: Date
}, {
  timestamps: true
});

// One attempt per student per exam.
submissionSchema.index({ examId: 1, studentId: 1 }, { unique: true });

submissionSchema.methods.upsertAnswer = function(questionId, answer) {
  const existing = this.answers.find((a) => a.questionId.toString() === questionId.toString());
  if (existing) {
    existing.answer = answer;
  } else {
    this.answers.push({ questionId, answer });
  }
};

// Auto-scores mcq answers against the exam's answer key and leaves short/essay
// answers ungraded (marksAwarded stays undefined until an admin grades them).
submissionSchema.methods.autoScore = function(exam) {
  const questionById = new Map(exam.questions.map((q) => [q._id.toString(), q]));

  this.answers.forEach((answer) => {
    const question = questionById.get(answer.questionId.toString());
    if (question && question.type === 'mcq') {
      answer.marksAwarded = answer.answer === question.correctAnswer ? question.marks : 0;
    }
  });

  this.maxScore = exam.totalMarks;
  this.recomputeScore();

  const allGraded = this.answers.every((a) => a.marksAwarded !== undefined && a.marksAwarded !== null);
  this.status = allGraded ? 'graded' : 'submitted';
};

submissionSchema.methods.recomputeScore = function() {
  this.score = this.answers.reduce((sum, a) => sum + (a.marksAwarded || 0), 0);
};

export default mongoose.model('Submission', submissionSchema);

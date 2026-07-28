import express from 'express';
import { body, validationResult } from 'express-validator';
import Student from '../models/Student.js';
import ReportCard from '../models/ReportCard.js';
import Invoice from '../models/Invoice.js';
import Notice from '../models/Notice.js';
import Resource from '../models/Resource.js';
import Exam from '../models/Exam.js';
import Submission from '../models/Submission.js';
import {
  authenticateToken, 
  authorizeRoles, 
  authorizeStudentAccess 
} from '../middleware/auth.js';

const router = express.Router();

// Get student dashboard data
router.get('/dashboard', authenticateToken, authorizeRoles('student', 'parent', 'staff', 'admin'), async (req, res) => {
  try {
    let studentId;
    
    // Determine student ID based on user role
    if (req.userRole === 'student') {
      const student = await Student.findOne({ userId: req.userId });
      if (!student) {
        return res.status(404).json({
          success: false,
          message: 'Student record not found'
        });
      }
      studentId = student._id;
    } else if (req.userRole === 'parent') {
      // Parent can view any of their children's dashboards. Matches on the
      // linked parentUserId first (how accounts are provisioned now),
      // falling back to contact-info matching for older records. Passing
      // ?studentId= picks a specific child (still scoped to this parent's
      // own children); omitting it defaults to the first one found.
      const baseQuery = {
        isActive: true,
        $or: [
          { parentUserId: req.userId },
          ...(req.user.email ? [{ 'parentInfo.email': req.user.email }] : []),
          ...(req.user.phone ? [{ 'parentInfo.phone': req.user.phone }] : [])
        ]
      };
      const student = req.query.studentId
        ? await Student.findOne({ ...baseQuery, _id: req.query.studentId })
        : await Student.findOne(baseQuery);
      if (!student) {
        return res.status(404).json({
          success: false,
          message: 'No student record found for this parent'
        });
      }
      studentId = student._id;
    } else {
      // Staff/Admin need studentId parameter
      studentId = req.query.studentId;
      if (!studentId) {
        return res.status(400).json({
          success: false,
          message: 'Student ID is required'
        });
      }
    }

    // Get student info
    const student = await Student.findById(studentId).populate('userId', 'email lastLogin');
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Get recent report cards
    const recentReportCards = await ReportCard.findByStudent(studentId, student.session);

    // Billing is a parent/staff/admin concern — students don't see fee info,
    // so skip the query entirely rather than just hiding it in the response
    const outstandingInvoices = req.userRole === 'student'
      ? []
      : await Invoice.find({
          studentId,
          status: { $in: ['pending', 'partial', 'overdue'] },
          isActive: true
        }).limit(5);

    // Get recent notices for student's division/class
    const recentNotices = await Notice.findForUser(req.userRole, student.division, [student.class]).limit(5);

    // Calculate dashboard stats
    const totalOwed = outstandingInvoices.reduce((sum, invoice) => sum + invoice.balance, 0);
    const overdueCount = outstandingInvoices.filter(invoice =>
      invoice.status === 'overdue' || invoice.dueDate < new Date()
    ).length;

    const dashboardData = {
      student: {
        id: student._id,
        fullName: student.fullName,
        regNumber: student.regNumber,
        class: student.class,
        division: student.division,
        session: student.session,
        photoUrl: student.photoUrl
      },
      stats: {
        ...(req.userRole !== 'student' && { totalOwed, overdueCount }),
        recentReportCards: recentReportCards.length,
        unreadNotices: recentNotices.filter(notice =>
          !notice.hasUserRead(req.userId)
        ).length
      },
      recentActivity: {
        reportCards: recentReportCards.slice(0, 3),
        ...(req.userRole !== 'student' && { invoices: outstandingInvoices.slice(0, 3) }),
        notices: recentNotices.slice(0, 3)
      }
    };

    res.json({
      success: true,
      data: dashboardData
    });

  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching dashboard data'
    });
  }
});

// Get student report cards
router.get('/:studentId/report-cards', authenticateToken, authorizeStudentAccess, async (req, res) => {
  try {
    const { studentId } = req.params;
    const { session, term } = req.query;

    // Staff/admin previewing a student's report cards can see drafts too;
    // students/parents only ever see published ones.
    let query = { studentId, isActive: true };
    if (!['staff', 'admin'].includes(req.userRole)) query.isPublished = true;
    if (session) query.session = session;
    if (term) query.term = term;

    const reportCards = await ReportCard.find(query)
      .sort({ session: -1, term: 1 })
      .populate('uploadedBy', 'email');

    res.json({
      success: true,
      data: reportCards
    });

  } catch (error) {
    console.error('Report cards fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching report cards'
    });
  }
});

// Get student invoices and bills — billing is a parent/staff/admin concern,
// students don't see fees or payment info about their own account
router.get('/:studentId/invoices', authenticateToken, authorizeStudentAccess, async (req, res) => {
  try {
    if (req.userRole === 'student') {
      return res.status(403).json({
        success: false,
        message: 'Students do not have access to billing information'
      });
    }

    const { studentId } = req.params;
    const { status, session } = req.query;

    let query = { studentId, isActive: true };
    if (status) query.status = status;
    if (session) query.session = session;

    const invoices = await Invoice.find(query)
      .populate('feeScheduleId', 'division class term session')
      .sort({ dueDate: -1 });

    // Calculate totals
    const summary = {
      totalOwed: invoices.filter(inv => ['pending', 'partial', 'overdue'].includes(inv.status))
        .reduce((sum, inv) => sum + inv.balance, 0),
      totalPaid: invoices.reduce((sum, inv) => sum + inv.amountPaid, 0),
      overdueCount: invoices.filter(inv => inv.status === 'overdue').length
    };

    res.json({
      success: true,
      data: {
        invoices,
        summary
      }
    });

  } catch (error) {
    console.error('Invoices fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching invoices'
    });
  }
});

// Opt an optional fee item (e.g. uniform) in or out of an invoice's amount
// due. Mandatory items can't be toggled — only ones the fee schedule marked
// optional. Recomputes amountDue/balance from whichever items are currently
// included, preserving any discount already applied.
router.patch('/:studentId/invoices/:invoiceId/optional-items', authenticateToken, authorizeStudentAccess, [
  body('itemIndex').isInt({ min: 0 }).withMessage('Valid item index is required'),
  body('included').isBoolean().withMessage('included must be true or false')
], async (req, res) => {
  try {
    if (req.userRole === 'student') {
      return res.status(403).json({
        success: false,
        message: 'Students do not have access to billing information'
      });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { studentId, invoiceId } = req.params;
    const { itemIndex, included } = req.body;

    const invoice = await Invoice.findOne({ _id: invoiceId, studentId, isActive: true });
    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    // "Paid" just means the currently-included items are settled — a parent
    // can still opt into a new optional item afterward (which will correctly
    // reopen a balance and move the status off "paid"). Only a cancelled
    // invoice is truly locked.
    if (invoice.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'This invoice can no longer be modified' });
    }

    const item = invoice.feeItems[itemIndex];
    if (!item) {
      return res.status(404).json({ success: false, message: 'Fee item not found' });
    }
    if (!item.isOptional) {
      return res.status(400).json({ success: false, message: 'Only optional fee items can be toggled' });
    }

    const wasIncluded = item.included;
    if (wasIncluded === included) {
      return res.json({ success: true, message: 'No change', data: invoice });
    }
    item.included = included;

    // Adjust amountDue by just this item's amount rather than recomputing
    // from the full fee catalog — on an installment invoice, amountDue is
    // only a fractional share of the mandatory total, and re-deriving it
    // from feeItems' full face-value amounts would silently re-add the
    // *entire* mandatory portion to this one installment.
    invoice.amountDue += included ? item.amount : -item.amount;

    await invoice.save();
    await invoice.populate([
      { path: 'studentId', select: 'fullName regNumber division class' },
      { path: 'feeScheduleId', select: 'division class term session' },
      { path: 'paymentHistory.receivedBy', select: 'email phone' },
      { path: 'discount.authorizedBy', select: 'email phone' }
    ]);

    res.json({ success: true, message: 'Invoice updated', data: invoice });

  } catch (error) {
    console.error('Optional fee item toggle error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while updating the invoice'
    });
  }
});

// Get student notices
router.get('/:studentId/notices', authenticateToken, authorizeStudentAccess, async (req, res) => {
  try {
    const { studentId } = req.params;
    const { category, unreadOnly } = req.query;

    // Get student info to determine division
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    let notices = await Notice.findForUser(req.userRole, student.division, [student.class]);

    // Filter by category if specified
    if (category && category !== 'all') {
      notices = notices.filter(notice => notice.category === category);
    }

    // Filter unread only if specified
    if (unreadOnly === 'true') {
      notices = notices.filter(notice => !notice.hasUserRead(req.userId));
    }

    res.json({
      success: true,
      data: notices
    });

  } catch (error) {
    console.error('Notices fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching notices'
    });
  }
});

// Mark notice as read
router.post('/notices/:noticeId/read', authenticateToken, async (req, res) => {
  try {
    const { noticeId } = req.params;

    const notice = await Notice.findById(noticeId);
    if (!notice) {
      return res.status(404).json({
        success: false,
        message: 'Notice not found'
      });
    }

    await notice.markAsRead(req.userId);

    res.json({
      success: true,
      message: 'Notice marked as read'
    });

  } catch (error) {
    console.error('Mark notice read error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while marking notice as read'
    });
  }
});

// Acknowledge notice
router.post('/notices/:noticeId/acknowledge', authenticateToken, async (req, res) => {
  try {
    const { noticeId } = req.params;

    const notice = await Notice.findById(noticeId);
    if (!notice) {
      return res.status(404).json({
        success: false,
        message: 'Notice not found'
      });
    }

    if (!notice.acknowledgmentRequired) {
      return res.status(400).json({
        success: false,
        message: 'This notice does not require acknowledgment'
      });
    }

    await notice.acknowledge(req.userId);

    res.json({
      success: true,
      message: 'Notice acknowledged successfully'
    });

  } catch (error) {
    console.error('Acknowledge notice error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while acknowledging notice'
    });
  }
});

// Get learning resources for a student's division/class
router.get('/:studentId/resources', authenticateToken, authorizeStudentAccess, async (req, res) => {
  try {
    const { studentId } = req.params;
    const { type, subject } = req.query;

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    let resources = await Resource.findForUser(student.division, [student.class]);

    if (type && type !== 'all') {
      resources = resources.filter((resource) => resource.type === type);
    }
    if (subject && subject !== 'all') {
      resources = resources.filter((resource) => resource.subject === subject);
    }

    res.json({
      success: true,
      data: resources
    });

  } catch (error) {
    console.error('Resources fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching resources'
    });
  }
});

// ===== CBT EXAM SYSTEM =====

// A student's own attempt is what's actually taking the exam — a
// parent/staff/admin viewing the same portal shouldn't be able to start,
// answer, submit, or trigger anti-cheat logging on the student's behalf.
const requireStudentRole = (req, res, next) => {
  if (req.userRole !== 'student') {
    return res.status(403).json({ success: false, message: 'Only the student can take this exam' });
  }
  next();
};

const submissionDeadline = (submission, exam) => new Date(Math.min(
  submission.startedAt.getTime() + exam.durationMinutes * 60000,
  exam.endTime.getTime()
));

// Fisher-Yates — re-shuffled on every fetch, which is fine (and arguably a
// mild anti-cheat plus) since answers are keyed by questionId, not position.
const shuffled = (arr) => {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

// Exam lobby — exams available to the student's division/class, with their
// attempt status on each.
router.get('/:studentId/exams', authenticateToken, authorizeStudentAccess, async (req, res) => {
  try {
    const { studentId } = req.params;
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const exams = await Exam.findAvailableForUser(student.division, [student.class]);
    const submissions = await Submission.find({ studentId, examId: { $in: exams.map((e) => e._id) } });
    const statusByExam = new Map(submissions.map((s) => [s.examId.toString(), s.status]));

    const data = exams.map((exam) => ({
      _id: exam._id,
      title: exam.title,
      description: exam.description,
      subject: exam.subject,
      durationMinutes: exam.durationMinutes,
      startTime: exam.startTime,
      endTime: exam.endTime,
      totalMarks: exam.totalMarks,
      submissionStatus: statusByExam.get(exam._id.toString()) || 'not_started'
    }));

    res.json({ success: true, data });
  } catch (error) {
    console.error('Exam lobby fetch error:', error);
    res.status(500).json({ success: false, message: 'An error occurred while fetching exams' });
  }
});

// Start (or resume) an attempt. Returns the exam with answer keys stripped
// and a deadline derived from startedAt + duration, so a page refresh can't
// reset the clock (startedAt lives in the DB, not the browser).
router.post('/:studentId/exams/:examId/start', authenticateToken, authorizeStudentAccess, requireStudentRole, async (req, res) => {
  try {
    const { studentId, examId } = req.params;
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const exam = await Exam.findById(examId);
    if (!exam || !exam.isPublished || !exam.isActive) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }

    const inScope = exam.division === student.division && (exam.classes.length === 0 || exam.classes.includes(student.class));
    if (!inScope) {
      return res.status(403).json({ success: false, message: 'This exam is not available to your class' });
    }

    const now = new Date();
    if (now < exam.startTime) {
      return res.status(400).json({ success: false, message: 'This exam has not started yet' });
    }
    if (now > exam.endTime) {
      return res.status(400).json({ success: false, message: 'This exam window has closed' });
    }

    let submission = await Submission.findOne({ examId, studentId });
    if (submission && submission.status !== 'in_progress') {
      return res.status(400).json({ success: false, message: 'You have already submitted this exam' });
    }
    if (!submission) {
      submission = new Submission({ examId, studentId, startedAt: now });
      await submission.save();
    }

    const studentView = exam.toStudentView();
    if (exam.shuffleQuestions) studentView.questions = shuffled(studentView.questions);

    res.json({
      success: true,
      data: {
        exam: studentView,
        submission: { _id: submission._id, startedAt: submission.startedAt, answers: submission.answers },
        deadline: submissionDeadline(submission, exam)
      }
    });
  } catch (error) {
    console.error('Exam start error:', error);
    res.status(500).json({ success: false, message: 'An error occurred while starting the exam' });
  }
});

// Autosave a single answer — called on an interval by the exam-taking UI.
router.patch('/:studentId/exams/:examId/answer', authenticateToken, authorizeStudentAccess, requireStudentRole, [
  body('questionId').notEmpty().withMessage('questionId is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { examId, studentId } = req.params;
    const submission = await Submission.findOne({ examId, studentId, status: 'in_progress' });
    if (!submission) {
      return res.status(404).json({ success: false, message: 'No active attempt found' });
    }
    const exam = await Exam.findById(examId);
    if (new Date() > submissionDeadline(submission, exam)) {
      return res.status(400).json({ success: false, message: 'Time is up for this exam' });
    }

    submission.upsertAnswer(req.body.questionId, req.body.answer || '');
    await submission.save();

    res.json({ success: true, message: 'Answer saved' });
  } catch (error) {
    console.error('Answer autosave error:', error);
    res.status(500).json({ success: false, message: 'An error occurred while saving your answer' });
  }
});

// Log an anti-cheat event (tab switch / fullscreen exit) without ending the attempt.
router.post('/:studentId/exams/:examId/violation', authenticateToken, authorizeStudentAccess, requireStudentRole, [
  body('type').isIn(['tab_switch', 'fullscreen_exit']).withMessage('Invalid violation type')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { examId, studentId } = req.params;
    const submission = await Submission.findOne({ examId, studentId, status: 'in_progress' });
    if (!submission) {
      return res.status(404).json({ success: false, message: 'No active attempt found' });
    }

    if (req.body.type === 'tab_switch') submission.tabSwitchCount += 1;
    else submission.fullscreenExitCount += 1;
    await submission.save();

    res.json({
      success: true,
      data: { tabSwitchCount: submission.tabSwitchCount, fullscreenExitCount: submission.fullscreenExitCount }
    });
  } catch (error) {
    console.error('Violation logging error:', error);
    res.status(500).json({ success: false, message: 'An error occurred while logging the violation' });
  }
});

// Finalize an attempt — auto-scores mcq answers immediately; short/essay
// answers wait for manual grading (see admin submission-grading route).
router.post('/:studentId/exams/:examId/submit', authenticateToken, authorizeStudentAccess, requireStudentRole, async (req, res) => {
  try {
    const { examId, studentId } = req.params;
    const submission = await Submission.findOne({ examId, studentId });
    if (!submission) {
      return res.status(404).json({ success: false, message: 'No attempt found for this exam' });
    }
    if (submission.status !== 'in_progress') {
      return res.status(400).json({ success: false, message: 'This exam has already been submitted' });
    }
    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }

    const now = new Date();
    submission.submittedAt = now;
    submission.autoSubmitted = !!req.body.autoSubmitted || now > submissionDeadline(submission, exam);
    submission.autoScore(exam);
    await submission.save();

    res.json({
      success: true,
      message: 'Exam submitted successfully',
      data: {
        status: submission.status,
        ...(exam.showResultsImmediately && { score: submission.score, maxScore: submission.maxScore })
      }
    });
  } catch (error) {
    console.error('Exam submit error:', error);
    res.status(500).json({ success: false, message: 'An error occurred while submitting the exam' });
  }
});

// Result view — full breakdown once submitted (immediately, or only after
// grading, per the exam's showResultsImmediately setting).
router.get('/:studentId/exams/:examId/result', authenticateToken, authorizeStudentAccess, async (req, res) => {
  try {
    const { examId, studentId } = req.params;
    const submission = await Submission.findOne({ examId, studentId });
    if (!submission || submission.status === 'in_progress') {
      return res.status(404).json({ success: false, message: 'No result available yet' });
    }
    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }

    if (!exam.showResultsImmediately && submission.status !== 'graded') {
      return res.json({
        success: true,
        data: { status: submission.status, pending: true, submittedAt: submission.submittedAt }
      });
    }

    const breakdown = exam.questions.map((q) => {
      const answer = submission.answers.find((a) => a.questionId.toString() === q._id.toString());
      return {
        questionText: q.questionText,
        type: q.type,
        marks: q.marks,
        yourAnswer: answer?.answer || '',
        marksAwarded: answer?.marksAwarded,
        correctAnswer: q.type === 'mcq' ? q.correctAnswer : undefined
      };
    });

    res.json({
      success: true,
      data: {
        status: submission.status,
        score: submission.score,
        maxScore: submission.maxScore,
        submittedAt: submission.submittedAt,
        autoSubmitted: submission.autoSubmitted,
        breakdown
      }
    });
  } catch (error) {
    console.error('Exam result fetch error:', error);
    res.status(500).json({ success: false, message: 'An error occurred while fetching the result' });
  }
});

// Exam history — every past attempt, most recent first.
router.get('/:studentId/exam-history', authenticateToken, authorizeStudentAccess, async (req, res) => {
  try {
    const submissions = await Submission.find({
      studentId: req.params.studentId,
      status: { $in: ['submitted', 'graded'] }
    })
      .populate('examId', 'title subject startTime')
      .sort({ submittedAt: -1 });

    res.json({ success: true, data: submissions });
  } catch (error) {
    console.error('Exam history fetch error:', error);
    res.status(500).json({ success: false, message: 'An error occurred while fetching exam history' });
  }
});

// Update student profile (limited fields)
router.patch('/:studentId/profile', authenticateToken, authorizeStudentAccess, [
  body('photoUrl').optional().isURL().withMessage('Photo URL must be valid'),
  body('parentInfo.phone').optional().isMobilePhone().withMessage('Invalid phone number'),
  body('emergencyContact.phone').optional().isMobilePhone().withMessage('Invalid emergency contact phone')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { studentId } = req.params;
    const allowedUpdates = ['photoUrl', 'parentInfo.phone', 'emergencyContact'];

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Update allowed fields only
    const updates = {};
    Object.keys(req.body).forEach(key => {
      if (allowedUpdates.some(field => key.startsWith(field))) {
        updates[key] = req.body[key];
      }
    });

    const updatedStudent = await Student.findByIdAndUpdate(
      studentId,
      { $set: updates },
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Profile updated successfully',
      student: updatedStudent
    });

  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while updating profile'
    });
  }
});

// Get learning resources (placeholder for Phase 3)
router.get('/:studentId/resources', authenticateToken, authorizeStudentAccess, (req, res) => {
  res.json({
    success: true,
    message: 'Learning resources will be available in Phase 3',
    data: []
  });
});

export default router;
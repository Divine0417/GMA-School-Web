import express from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { body, validationResult } from 'express-validator';
import User from '../models/User.js';
import Student from '../models/Student.js';
import ReportCard from '../models/ReportCard.js';
import FeeSchedule from '../models/FeeSchedule.js';
import Invoice from '../models/Invoice.js';
import Application from '../models/Application.js';
import CareerApplication from '../models/CareerApplication.js';
import ContactMessage from '../models/ContactMessage.js';
import Notice from '../models/Notice.js';
import Resource from '../models/Resource.js';
import Exam from '../models/Exam.js';
import Submission from '../models/Submission.js';
import {
  authenticateToken,
  authorizeRoles,
  authorizeDivisionAccess
} from '../middleware/auth.js';
import { sendCredentialsEmail, sendAdmissionDecision } from '../utils/email.js';
import { sendCredentialsSMS, sendAdmissionDecisionSMS } from '../utils/sms.js';
import { uploadReportCard, uploadStudentPhoto, uploadNoticeAttachments, uploadResourceFile, uploadQuestionsCsv } from '../middleware/upload.js';
import { parseQuestionsCsv } from '../utils/csv.js';
import {
  getStaffScope,
  scopedDivisionClassFilter,
  isWithinScope,
  noticeDivisionScopeQuery,
  isNoticeWithinDivisionScope,
  resourceDivisionScopeQuery,
  isResourceWithinDivisionScope
} from '../utils/scope.js';

const router = express.Router();

// ===== STUDENT MANAGEMENT =====

// Get the real, currently-in-use class names for a division — used wherever
// admin/staff have to type a class name that must match a student exactly
// (staff class-scoping, fee schedules), since class names have no fixed
// canonical list and are otherwise easy to typo/mismatch.
router.get('/classes', authenticateToken, authorizeRoles('admin', 'staff'), async (req, res) => {
  try {
    const { division } = req.query;
    if (!division) {
      return res.status(400).json({ success: false, message: 'Division is required' });
    }

    const staffScope = getStaffScope(req.user);
    if (staffScope && staffScope.division !== division) {
      return res.status(403).json({ success: false, message: `You can only view classes in the ${staffScope.division} division` });
    }

    const classes = await Student.distinct('class', { division, isActive: true });
    classes.sort((a, b) => a.localeCompare(b));

    res.json({ success: true, data: classes });

  } catch (error) {
    console.error('Classes fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching classes'
    });
  }
});

// Get all students with filtering
router.get('/students', authenticateToken, authorizeRoles('admin', 'staff'), async (req, res) => {
  try {
    const { division, class: className, session, search, status, page = 1, limit = 20 } = req.query;

    let query = { isActive: true, ...scopedDivisionClassFilter(req.user, { division, class: className }) };
    if (session) query.session = session;
    // Records created before the status field existed have no status key
    // stored at all, so a strict 'active' equality would wrongly exclude
    // them; treat "active" as "not explicitly graduated" instead. Any other
    // requested status (e.g. 'graduated') is always explicitly set, so an
    // exact match is correct there.
    if (status === 'active') query.status = { $ne: 'graduated' };
    else if (status) query.status = status;
    
    // Text search
    if (search) {
      query.$text = { $search: search };
    }

    const skip = (page - 1) * limit;
    const students = await Student.find(query)
      .populate('userId', 'isActive lastLogin')
      .sort({ fullName: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Student.countDocuments(query);

    res.json({
      success: true,
      data: {
        students,
        pagination: {
          current: parseInt(page),
          total: Math.ceil(total / limit),
          totalRecords: total
        }
      }
    });

  } catch (error) {
    console.error('Students fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching students'
    });
  }
});

// Create new student
router.post('/students', authenticateToken, authorizeRoles('admin', 'staff'), [
  body('fullName').trim().isLength({ min: 2 }).withMessage('Full name is required'),
  body('division').isIn(['nursery', 'primary', 'secondary', 'college']).withMessage('Invalid division'),
  body('class').trim().notEmpty().withMessage('Class is required'),
  body('dateOfBirth').isISO8601().withMessage('Valid date of birth is required'),
  body('gender').isIn(['male', 'female']).withMessage('Gender is required'),
  body('parentInfo.name').trim().notEmpty().withMessage('Parent name is required'),
  body('parentInfo.email').optional({ checkFalsy: true }).isEmail().withMessage('Please provide a valid parent email'),
  body('parentInfo.phone').trim().notEmpty().withMessage('Parent phone is required'),
  body('parentInfo.address').trim().notEmpty().withMessage('Parent address is required'),
  body('emergencyContact.name').trim().notEmpty().withMessage('Emergency contact name is required'),
  body('emergencyContact.phone').trim().notEmpty().withMessage('Emergency contact phone is required'),
  body('emergencyContact.relationship').trim().notEmpty().withMessage('Emergency contact relationship is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const studentData = req.body;

    const staffScope = getStaffScope(req.user);
    if (staffScope && !isWithinScope(req.user, studentData.division, studentData.class)) {
      return res.status(403).json({
        success: false,
        message: staffScope.classes
          ? `You can only add students to your assigned classes: ${staffScope.classes.join(', ')}`
          : `You can only add students to the ${staffScope.division} division`
      });
    }

    // Generate registration number
    const regNumber = await Student.generateRegNumber(studentData.division);

    // Validate the student record BEFORE creating any login account, so a
    // bad field (e.g. a missing address) can't leave an orphaned user with
    // no matching student record behind.
    const student = new Student({
      ...studentData,
      userId: new mongoose.Types.ObjectId(),
      regNumber,
      session: studentData.session || '2024/2025'
    });
    await student.validate();

    // The student logs in with their registration number, not an email or
    // phone — sidesteps ever colliding with the parent's own contact info.
    const studentPassword = crypto.randomBytes(4).toString('hex');
    const studentUser = await User.createUser({
      passwordHash: studentPassword,
      role: 'student',
      division: studentData.division
    });

    student.userId = studentUser._id;

    // Create parent user if requested, reusing an existing account for siblings
    if (studentData.createParentAccount) {
      const parentIdentifier = studentData.parentInfo.email || studentData.parentInfo.phone;
      let parentUser = await User.findByIdentifier(parentIdentifier);
      let generatedParentPassword = null;
      if (!parentUser) {
        generatedParentPassword = crypto.randomBytes(4).toString('hex');
        parentUser = await User.createUser({
          email: studentData.parentInfo.email || undefined,
          phone: studentData.parentInfo.phone || undefined,
          passwordHash: generatedParentPassword,
          role: 'parent',
          division: studentData.division
        });
      }
      student.parentUserId = parentUser._id;

      if (generatedParentPassword) {
        if (parentUser.phone) {
          await sendCredentialsSMS({ phone: parentUser.phone, identifier: parentUser.email || parentUser.phone, password: generatedParentPassword, role: 'parent' });
        }
        if (parentUser.email) {
          await sendCredentialsEmail({ email: parentUser.email, identifier: parentUser.email, password: generatedParentPassword, studentName: student.fullName });
        }
      }
    }

    await student.save();

    // The student's own login always goes to the parent's contact info —
    // the student account has no email/phone of its own.
    if (studentData.parentInfo.phone) {
      await sendCredentialsSMS({ phone: studentData.parentInfo.phone, identifier: regNumber, password: studentPassword, role: 'student' });
    }
    if (studentData.parentInfo.email) {
      await sendCredentialsEmail({ email: studentData.parentInfo.email, identifier: regNumber, password: studentPassword, studentName: student.fullName });
    }

    const populatedStudent = await Student.findById(student._id).populate('userId', 'isActive');

    res.status(201).json({
      success: true,
      message: 'Student created successfully',
      data: populatedStudent
    });

  } catch (error) {
    console.error('Student creation error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while creating student'
    });
  }
});

// Update student
router.patch('/students/:studentId', authenticateToken, authorizeRoles('admin', 'staff'), async (req, res) => {
  try {
    const { studentId } = req.params;
    const updates = req.body;

    // Remove fields that shouldn't be updated directly
    delete updates.regNumber;
    delete updates.userId;
    delete updates.parentUserId;
    delete updates._id;

    const existing = await Student.findById(studentId);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    if (!isWithinScope(req.user, existing.division, existing.class)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied - outside your assigned classes'
      });
    }

    const targetDivision = updates.division || existing.division;
    const targetClass = updates.class || existing.class;
    if (!isWithinScope(req.user, targetDivision, targetClass)) {
      return res.status(403).json({
        success: false,
        message: 'You cannot move this student outside your assigned classes'
      });
    }

    const student = await Student.findByIdAndUpdate(
      studentId,
      { $set: updates },
      { new: true, runValidators: true }
    ).populate('userId', 'isActive');

    res.json({
      success: true,
      message: 'Student updated successfully',
      data: student
    });

  } catch (error) {
    console.error('Student update error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while updating student'
    });
  }
});

// Upload/replace a student's photo
router.post('/students/:studentId/photo', authenticateToken, authorizeRoles('admin', 'staff'), uploadStudentPhoto, async (req, res) => {
  try {
    const { studentId } = req.params;

    const existing = await Student.findById(studentId);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    if (!isWithinScope(req.user, existing.division, existing.class)) {
      return res.status(403).json({ success: false, message: 'Access denied - outside your assigned classes' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'A photo file is required' });
    }

    const student = await Student.findByIdAndUpdate(
      studentId,
      { $set: { photoUrl: req.file.path } },
      { new: true }
    ).populate('userId', 'isActive');

    res.json({ success: true, message: 'Photo updated successfully', data: student });

  } catch (error) {
    console.error('Student photo upload error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while uploading the photo'
    });
  }
});

// Mark student as graduated (keeps the record, hides them from the default roster)
router.patch('/students/:studentId/graduate', authenticateToken, authorizeRoles('admin', 'staff'), async (req, res) => {
  try {
    const { studentId } = req.params;

    const existing = await Student.findById(studentId);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    if (!isWithinScope(req.user, existing.division, existing.class)) {
      return res.status(403).json({ success: false, message: 'Access denied - outside your assigned classes' });
    }

    const student = await Student.findByIdAndUpdate(
      studentId,
      { $set: { status: 'graduated', graduatedAt: new Date() } },
      { new: true, runValidators: true }
    ).populate('userId', 'isActive');

    res.json({
      success: true,
      message: 'Student marked as graduated',
      data: student
    });

  } catch (error) {
    console.error('Student graduation error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while updating student status'
    });
  }
});

// Reverse a graduation (in case of a mistake)
router.patch('/students/:studentId/reactivate', authenticateToken, authorizeRoles('admin', 'staff'), async (req, res) => {
  try {
    const { studentId } = req.params;

    const existing = await Student.findById(studentId);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    if (!isWithinScope(req.user, existing.division, existing.class)) {
      return res.status(403).json({ success: false, message: 'Access denied - outside your assigned classes' });
    }

    const student = await Student.findByIdAndUpdate(
      studentId,
      { $set: { status: 'active', graduatedAt: null } },
      { new: true, runValidators: true }
    ).populate('userId', 'isActive');

    res.json({
      success: true,
      message: 'Student reactivated',
      data: student
    });

  } catch (error) {
    console.error('Student reactivation error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while updating student status'
    });
  }
});

// Delete (soft) a student record — hides them from the roster and locks their portal login
router.delete('/students/:studentId', authenticateToken, authorizeRoles('admin', 'staff'), async (req, res) => {
  try {
    const { studentId } = req.params;

    const existing = await Student.findById(studentId);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    if (!isWithinScope(req.user, existing.division, existing.class)) {
      return res.status(403).json({ success: false, message: 'Access denied - outside your assigned classes' });
    }

    const student = await Student.findByIdAndUpdate(
      studentId,
      { $set: { isActive: false } },
      { new: true }
    );

    if (student.userId) {
      await User.findByIdAndUpdate(student.userId, { isActive: false });
    }

    res.json({
      success: true,
      message: 'Student deleted successfully'
    });

  } catch (error) {
    console.error('Student delete error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while deleting student'
    });
  }
});

// ===== REPORT CARD MANAGEMENT =====

// Get report cards (optionally filtered by student/division/class/session/term)
router.get('/report-cards', authenticateToken, authorizeRoles('admin', 'staff'), async (req, res) => {
  try {
    const { studentId, division, class: className, session, term, page = 1, limit = 20 } = req.query;

    let query = { isActive: true, ...scopedDivisionClassFilter(req.user, { division, class: className }) };
    if (studentId) query.studentId = studentId;
    if (session) query.session = session;
    if (term) query.term = term;

    const skip = (page - 1) * limit;
    const reportCards = await ReportCard.find(query)
      .populate('studentId', 'fullName regNumber')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await ReportCard.countDocuments(query);

    res.json({
      success: true,
      data: {
        reportCards,
        pagination: {
          current: parseInt(page),
          total: Math.ceil(total / limit),
          totalRecords: total
        }
      }
    });

  } catch (error) {
    console.error('Report cards fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching report cards'
    });
  }
});

// Upload a report card for a student
router.post('/report-cards', authenticateToken, authorizeRoles('admin', 'staff'), uploadReportCard, [
  body('studentId').isMongoId().withMessage('Valid student is required'),
  body('term').isIn(['first', 'second', 'third']).withMessage('Invalid term'),
  body('session').trim().notEmpty().withMessage('Session is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'A report card PDF is required'
      });
    }

    const { studentId, term, session } = req.body;

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    if (!isWithinScope(req.user, student.division, student.class)) {
      return res.status(403).json({ success: false, message: 'Access denied - outside your assigned classes' });
    }

    const reportCard = await ReportCard.create({
      studentId,
      term,
      session,
      type: 'uploaded',
      fileUrl: req.file.path,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      uploadedBy: req.userId,
      division: student.division,
      class: student.class
    });

    res.status(201).json({
      success: true,
      message: 'Report card uploaded successfully',
      data: reportCard
    });

  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'A report card for this student, term, and session already exists'
      });
    }
    console.error('Report card upload error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while uploading the report card'
    });
  }
});

const reportCardValidators = [
  body('studentId').isMongoId().withMessage('Valid student is required'),
  body('term').isIn(['first', 'second', 'third']).withMessage('Invalid term'),
  body('session').trim().notEmpty().withMessage('Session is required'),
  body('subjects').isArray({ min: 1 }).withMessage('At least one subject is required'),
  body('subjects.*.name').trim().notEmpty().withMessage('Each subject needs a name'),
  body('subjects.*.ca1').optional().isFloat({ min: 0 }),
  body('subjects.*.ca2').optional().isFloat({ min: 0 }),
  body('subjects.*.exam').optional().isFloat({ min: 0 }),
  body('nextTermBeginsDate').optional({ checkFalsy: true }).isISO8601()
];

// Create a manually-entered report card (scores typed in directly, not a
// file upload) — this is the primary path; staff of a class enter subject
// scores and the system computes grades/averages itself.
router.post('/report-cards/manual', authenticateToken, authorizeRoles('admin', 'staff'), reportCardValidators, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { studentId } = req.body;
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    if (!isWithinScope(req.user, student.division, student.class)) {
      return res.status(403).json({ success: false, message: 'Access denied - outside your assigned classes' });
    }

    const reportCard = await ReportCard.create({
      studentId,
      term: req.body.term,
      session: req.body.session,
      type: 'manual',
      subjects: req.body.subjects,
      attendance: req.body.attendance,
      classTeacherComment: req.body.classTeacherComment,
      principalComment: req.body.principalComment,
      nextTermBeginsDate: req.body.nextTermBeginsDate || undefined,
      summary: {
        position: req.body.summary?.position,
        numberInClass: req.body.summary?.numberInClass
      },
      uploadedBy: req.userId,
      division: student.division,
      class: student.class
    });

    res.status(201).json({
      success: true,
      message: 'Report card created successfully',
      data: reportCard
    });

  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'A report card for this student, term, and session already exists'
      });
    }
    console.error('Report card creation error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while creating the report card'
    });
  }
});

// Edit a manually-entered report card
router.patch('/report-cards/manual/:reportCardId', authenticateToken, authorizeRoles('admin', 'staff'), reportCardValidators, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const existing = await ReportCard.findById(req.params.reportCardId);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Report card not found' });
    }
    if (existing.type !== 'manual') {
      return res.status(400).json({ success: false, message: 'Only manually-entered report cards can be edited this way' });
    }
    if (!isWithinScope(req.user, existing.division, existing.class)) {
      return res.status(403).json({ success: false, message: 'Access denied - outside your assigned classes' });
    }

    existing.subjects = req.body.subjects;
    existing.attendance = req.body.attendance;
    existing.classTeacherComment = req.body.classTeacherComment;
    existing.principalComment = req.body.principalComment;
    existing.nextTermBeginsDate = req.body.nextTermBeginsDate || undefined;
    existing.summary.position = req.body.summary?.position;
    existing.summary.numberInClass = req.body.summary?.numberInClass;

    await existing.save();

    res.json({
      success: true,
      message: 'Report card updated successfully',
      data: existing
    });

  } catch (error) {
    console.error('Report card update error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while updating the report card'
    });
  }
});

// Publish/unpublish a report card (a parent/student never sees a draft)
router.patch('/report-cards/:reportCardId/publish', authenticateToken, authorizeRoles('admin', 'staff'), [
  body('isPublished').isBoolean().withMessage('isPublished must be true or false')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const existing = await ReportCard.findById(req.params.reportCardId);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Report card not found' });
    }
    if (!isWithinScope(req.user, existing.division, existing.class)) {
      return res.status(403).json({ success: false, message: 'Access denied - outside your assigned classes' });
    }

    existing.isPublished = req.body.isPublished;
    await existing.save();

    res.json({ success: true, message: 'Report card updated successfully', data: existing });

  } catch (error) {
    console.error('Report card publish toggle error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while updating the report card'
    });
  }
});

// Remove a report card
router.delete('/report-cards/:reportCardId', authenticateToken, authorizeRoles('admin', 'staff'), async (req, res) => {
  try {
    const existing = await ReportCard.findById(req.params.reportCardId);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Report card not found' });
    }
    if (!isWithinScope(req.user, existing.division, existing.class)) {
      return res.status(403).json({ success: false, message: 'Access denied - outside your assigned classes' });
    }

    await ReportCard.findByIdAndUpdate(req.params.reportCardId, { isActive: false });

    res.json({ success: true, message: 'Report card deleted successfully' });

  } catch (error) {
    console.error('Report card deletion error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while deleting the report card'
    });
  }
});

// ===== FEE SCHEDULE MANAGEMENT =====

// Create fee schedule
router.post('/fee-schedules', authenticateToken, authorizeRoles('admin', 'staff'), [
  body('division').isIn(['nursery', 'primary', 'secondary', 'college']).withMessage('Invalid division'),
  body('class').trim().notEmpty().withMessage('Class is required'),
  body('term').isIn(['first', 'second', 'third']).withMessage('Invalid term'),
  body('session').trim().notEmpty().withMessage('Session is required'),
  body('feeItems').isArray({ min: 1 }).withMessage('At least one fee item is required'),
  body('dueDate').isISO8601().withMessage('Valid due date is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const feeScheduleData = {
      ...req.body,
      createdBy: req.userId
    };

    const feeSchedule = new FeeSchedule(feeScheduleData);
    await feeSchedule.save();

    res.status(201).json({
      success: true,
      message: 'Fee schedule created successfully',
      data: feeSchedule
    });

  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Fee schedule already exists for this class, term, and session'
      });
    }
    
    console.error('Fee schedule creation error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while creating fee schedule'
    });
  }
});

// Update fee schedule
router.patch('/fee-schedules/:feeScheduleId', authenticateToken, authorizeRoles('admin', 'staff'), [
  body('division').optional().isIn(['nursery', 'primary', 'secondary', 'college']).withMessage('Invalid division'),
  body('class').optional().trim().notEmpty().withMessage('Class is required'),
  body('term').optional().isIn(['first', 'second', 'third']).withMessage('Invalid term'),
  body('session').optional().trim().notEmpty().withMessage('Session is required'),
  body('feeItems').optional().isArray({ min: 1 }).withMessage('At least one fee item is required'),
  body('dueDate').optional().isISO8601().withMessage('Valid due date is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const updates = { ...req.body };
    delete updates._id;
    delete updates.createdBy;
    delete updates.totalAmount;

    const feeSchedule = await FeeSchedule.findById(req.params.feeScheduleId);
    if (!feeSchedule) {
      return res.status(404).json({ success: false, message: 'Fee schedule not found' });
    }

    Object.assign(feeSchedule, updates);
    await feeSchedule.save();

    res.json({
      success: true,
      message: 'Fee schedule updated successfully',
      data: feeSchedule
    });

  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Fee schedule already exists for this class, term, and session'
      });
    }

    console.error('Fee schedule update error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while updating fee schedule'
    });
  }
});

// Generate invoices from fee schedule
router.post('/fee-schedules/:feeScheduleId/generate-invoices', authenticateToken, authorizeRoles('admin', 'staff'), async (req, res) => {
  try {
    const { feeScheduleId } = req.params;

    const feeSchedule = await FeeSchedule.findById(feeScheduleId);
    if (!feeSchedule) {
      return res.status(404).json({
        success: false,
        message: 'Fee schedule not found'
      });
    }

    // Get all students currently enrolled in the class — not filtered by
    // session, since a student's own session field is independently edited
    // and shouldn't gate whether they get billed for this schedule's term.
    const students = await Student.findByDivisionAndClass(
      feeSchedule.division,
      feeSchedule.class
    );

    const numberOfInstallments = feeSchedule.paymentPlan?.allowInstallments
      ? Math.max(1, feeSchedule.paymentPlan.numberOfInstallments || 1)
      : 1;

    const feeItems = feeSchedule.feeItems.map(item => ({
      name: item.name,
      description: item.description,
      amount: item.amount,
      category: item.category,
      isOptional: item.isOptional || false,
      // Mandatory items always count toward amountDue; optional ones start
      // excluded until a parent (or staff) opts in via the toggle route.
      included: !item.isOptional
    }));

    // Split the total evenly across installments, folding any rounding
    // remainder into the last one so the sum always equals the full total.
    const baseShare = Math.floor(feeSchedule.totalAmount / numberOfInstallments);
    const installmentAmounts = Array.from({ length: numberOfInstallments }, (_, i) =>
      i === numberOfInstallments - 1
        ? feeSchedule.totalAmount - baseShare * (numberOfInstallments - 1)
        : baseShare
    );

    const installmentDueDate = (index) => {
      const provided = feeSchedule.paymentPlan?.installmentDates?.[index];
      if (provided) return provided;
      // No explicit dates given — space installments a month apart, ending
      // on the fee schedule's own due date.
      const date = new Date(feeSchedule.dueDate);
      date.setMonth(date.getMonth() - (numberOfInstallments - 1 - index));
      return date;
    };

    const invoices = [];
    let skipped = 0;
    let needsReview = 0;

    for (const student of students) {
      const existingForStudent = await Invoice.find({
        studentId: student._id,
        feeScheduleId,
        term: feeSchedule.term,
        session: feeSchedule.session
      });

      // If the schedule was edited (total amount and/or installment count
      // changed) after some of this student's installments were already
      // generated, blindly filling in whatever installment numbers are
      // still missing — using today's numbers — would produce a set of
      // invoices that no longer sums to the schedule's actual total (as
      // happened before this check existed). Skip the student entirely and
      // flag them for manual review instead of creating a mismatched
      // invoice alongside stale ones.
      const isStale = existingForStudent.some((inv) => {
        const expected = installmentAmounts[inv.installmentNumber - 1];
        return expected === undefined || inv.amountDue !== expected;
      });

      if (isStale) {
        needsReview++;
        continue;
      }

      for (let i = 0; i < numberOfInstallments; i++) {
        const installmentNumber = i + 1;

        const alreadyExists = existingForStudent.some((inv) => inv.installmentNumber === installmentNumber);
        if (alreadyExists) {
          skipped++;
          continue;
        }

        const invoiceNumber = await Invoice.generateInvoiceNumber(feeSchedule.session);

        const invoice = new Invoice({
          invoiceNumber,
          studentId: student._id,
          feeScheduleId,
          term: feeSchedule.term,
          session: feeSchedule.session,
          feeItems,
          amountDue: installmentAmounts[i],
          dueDate: installmentDueDate(i),
          installmentNumber,
          latePaymentFee: feeSchedule.latePaymentFee || 0,
          createdBy: req.userId
        });

        await invoice.save();
        invoices.push(invoice);
      }
    }

    let message;
    if (students.length === 0) {
      message = `No students found in ${feeSchedule.division} / "${feeSchedule.class}". The class name on this fee schedule must exactly match a student's class — double check spelling and capitalization on the Students page.`;
    } else if (invoices.length === 0 && needsReview === 0) {
      message = `All ${students.length} student(s) in this class already have invoices for this schedule — nothing new to generate.`;
    } else {
      message = `Generated ${invoices.length} invoice${invoices.length === 1 ? '' : 's'} for ${students.length} student${students.length === 1 ? '' : 's'} in ${feeSchedule.division} / ${feeSchedule.class}.`;
    }
    if (needsReview > 0) {
      message += ` ${needsReview} student(s) were skipped because they already have invoices from before this schedule was last edited (the amounts no longer match) — review and correct their existing invoices manually before generating more.`;
    }

    res.json({
      success: true,
      message,
      data: {
        generated: invoices.length,
        skipped,
        studentsFound: students.length,
        needsReview
      }
    });

  } catch (error) {
    console.error('Invoice generation error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while generating invoices'
    });
  }
});

// Get all fee schedules
router.get('/fee-schedules', authenticateToken, authorizeRoles('admin', 'staff'), async (req, res) => {
  try {
    const { division, session, term, page = 1, limit = 20 } = req.query;

    let query = { isActive: true };
    if (division) query.division = division;
    if (session) query.session = session;
    if (term) query.term = term;

    const skip = (page - 1) * limit;
    const feeSchedules = await FeeSchedule.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await FeeSchedule.countDocuments(query);

    res.json({
      success: true,
      data: {
        feeSchedules,
        pagination: {
          current: parseInt(page),
          total: Math.ceil(total / limit),
          totalRecords: total
        }
      }
    });

  } catch (error) {
    console.error('Fee schedules fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching fee schedules'
    });
  }
});

// Get all invoices
router.get('/invoices', authenticateToken, authorizeRoles('admin', 'staff'), async (req, res) => {
  try {
    const { status, division, session, studentId, page = 1, limit = 20 } = req.query;

    let query = { isActive: true };
    if (status) query.status = status;
    if (session) query.session = session;
    if (studentId) query.studentId = studentId;

    const skip = (page - 1) * limit;
    let invoicesQuery = Invoice.find(query)
      .populate('studentId', 'fullName regNumber division class')
      .populate('paymentHistory.receivedBy', 'email phone')
      .populate('discount.authorizedBy', 'email phone')
      .sort({ dueDate: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    let invoices = await invoicesQuery;

    // Division isn't stored directly on Invoice, so filter after populating
    if (division) {
      invoices = invoices.filter((inv) => inv.studentId?.division === division);
    }

    const total = await Invoice.countDocuments(query);

    res.json({
      success: true,
      data: {
        invoices,
        pagination: {
          current: parseInt(page),
          total: Math.ceil(total / limit),
          totalRecords: total
        }
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

// Manually record a payment against an invoice (cash, bank transfer, etc. — Paystack payments are recorded automatically via the payment routes)
router.post('/invoices/:invoiceId/payments', authenticateToken, authorizeRoles('admin', 'staff'), [
  body('amount').isFloat({ min: 0.01 }).withMessage('A valid payment amount is required'),
  body('paymentMethod').isIn(['cash', 'bank_transfer', 'card', 'other']).withMessage('Invalid payment method'),
  body('notes').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const invoice = await Invoice.findById(req.params.invoiceId);
    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    await invoice.addPayment({
      amount: req.body.amount,
      paymentMethod: req.body.paymentMethod,
      notes: req.body.notes,
      receivedBy: req.userId
    });

    await invoice.populate('paymentHistory.receivedBy', 'email phone');

    res.json({ success: true, message: 'Payment recorded successfully', data: invoice });

  } catch (error) {
    console.error('Payment recording error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while recording the payment'
    });
  }
});

// Apply a discount to an invoice
router.patch('/invoices/:invoiceId/discount', authenticateToken, authorizeRoles('admin', 'staff'), [
  body('amount').isFloat({ min: 0 }).withMessage('A valid discount amount is required'),
  body('reason').trim().notEmpty().withMessage('A reason is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const invoice = await Invoice.findById(req.params.invoiceId);
    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    // Undo any previous discount before applying the new one, so re-applying
    // doesn't compound on top of a discount already baked into amountDue.
    if (invoice.discount?.amount) {
      invoice.amountDue += invoice.discount.amount;
    }

    await invoice.applyDiscount(req.body.amount, req.body.reason, req.userId);
    await invoice.populate('discount.authorizedBy', 'email phone');

    res.json({ success: true, message: 'Discount applied successfully', data: invoice });

  } catch (error) {
    console.error('Discount application error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while applying the discount'
    });
  }
});

// ===== APPLICATION MANAGEMENT =====

// Get all applications
router.get('/applications', authenticateToken, authorizeRoles('admin', 'staff'), async (req, res) => {
  try {
    const { status, division, session, page = 1, limit = 20 } = req.query;
    
    let query = { isActive: true };
    if (status) query.status = status;
    if (division) query.divisionApplied = division;
    if (session) query.sessionApplied = session;

    const skip = (page - 1) * limit;
    const applications = await Application.find(query)
      .populate('admissionDecision.decisionBy', 'email phone')
      .populate('interviewSchedule.interviewer', 'email phone')
      .populate('communicationHistory.sentBy', 'email phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Application.countDocuments(query);

    res.json({
      success: true,
      data: {
        applications,
        pagination: {
          current: parseInt(page),
          total: Math.ceil(total / limit),
          totalRecords: total
        }
      }
    });

  } catch (error) {
    console.error('Applications fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching applications'
    });
  }
});

// Creates (or reuses, for a sibling's application) a parent portal account,
// a separate student portal account (login is the registration number, not
// email/phone — sidesteps students and parents ever colliding on the same
// contact info), and the Student record linking them. Sends both sets of
// credentials to the parent's contact info, since the student has none of
// their own. Skips work if this application was already provisioned, so
// re-approving is safe to repeat.
const provisionAccountFromApplication = async (application) => {
  if (application.linkedStudentId) return;

  const father = application.parentInfo.father;
  const parentIdentifier = father.email || father.phone;

  let parentUser = await User.findByIdentifier(parentIdentifier);
  let generatedParentPassword = null;

  if (!parentUser) {
    generatedParentPassword = crypto.randomBytes(4).toString('hex');
    parentUser = await User.createUser({
      email: father.email || undefined,
      phone: father.phone || undefined,
      passwordHash: generatedParentPassword,
      role: 'parent',
      division: application.divisionApplied
    });
  }

  const regNumber = await Student.generateRegNumber(application.divisionApplied);
  const passportPhoto = application.documents.find((doc) => doc.type === 'passport_photo');

  const studentPassword = crypto.randomBytes(4).toString('hex');
  const studentUser = await User.createUser({
    passwordHash: studentPassword,
    role: 'student',
    division: application.divisionApplied
  });

  const student = new Student({
    userId: studentUser._id,
    parentUserId: parentUser._id,
    regNumber,
    fullName: application.fullName,
    class: application.classApplied,
    division: application.divisionApplied,
    session: application.sessionApplied,
    photoUrl: passportPhoto?.fileUrl || null,
    dateOfBirth: application.dateOfBirth,
    gender: application.gender,
    parentInfo: {
      name: father.name,
      ...(father.email && { email: father.email }),
      phone: father.phone,
      relationship: 'father',
      address: father.address || 'Not provided'
    },
    emergencyContact: {
      name: father.name,
      phone: father.phone,
      relationship: 'father'
    },
    medicalInfo: {
      bloodGroup: application.medicalInfo?.bloodGroup,
      allergies: application.medicalInfo?.allergies,
      medications: application.medicalInfo?.medications
    }
  });

  await student.save();

  application.linkedStudentId = student._id;
  await application.save();

  if (generatedParentPassword) {
    if (parentUser.phone) {
      await sendCredentialsSMS({
        phone: parentUser.phone,
        identifier: parentUser.email || parentUser.phone,
        password: generatedParentPassword,
        role: 'parent'
      });
    }
    if (parentUser.email) {
      await sendCredentialsEmail({
        email: parentUser.email,
        identifier: parentUser.email,
        password: generatedParentPassword,
        studentName: student.fullName
      });
    }
  }

  // The student's own login always goes to the parent's contact — the
  // student account has no email/phone of its own to send to directly.
  if (father.phone) {
    await sendCredentialsSMS({
      phone: father.phone,
      identifier: regNumber,
      password: studentPassword,
      role: 'student'
    });
  }
  if (father.email) {
    await sendCredentialsEmail({
      email: father.email,
      identifier: regNumber,
      password: studentPassword,
      studentName: student.fullName
    });
  }
};

// Update application status
router.patch('/applications/:applicationId/status', authenticateToken, authorizeRoles('admin', 'staff'), [
  body('status').isIn(['pending', 'under_review', 'approved', 'rejected', 'waitlisted']).withMessage('Invalid status'),
  body('remarks').optional().trim(),
  body('conditions').optional().isArray()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { applicationId } = req.params;
    const { status, remarks, conditions } = req.body;

    const application = await Application.findById(applicationId);
    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }

    await application.updateStatus(status, req.userId, remarks, conditions || []);

    if (status === 'approved') {
      await provisionAccountFromApplication(application);
    }

    if (['approved', 'rejected', 'waitlisted'].includes(status)) {
      const decision = application.admissionDecision.decision;
      const father = application.parentInfo.father;
      const notificationMessage = `Decision: ${decision}${remarks ? ` — ${remarks}` : ''}`;

      if (father.email) {
        await sendAdmissionDecision({
          parentEmail: father.email,
          studentName: application.fullName,
          applicationNumber: application.applicationNumber,
          decision,
          remarks
        });
      } else if (father.phone) {
        await sendAdmissionDecisionSMS({
          phone: father.phone,
          studentName: application.fullName,
          applicationNumber: application.applicationNumber,
          decision
        });
      }

      await application.addCommunication({
        type: father.email ? 'email' : 'sms',
        subject: 'Admission Decision',
        message: notificationMessage,
        sentBy: req.userId
      });
    }

    await application.populate([
      { path: 'admissionDecision.decisionBy', select: 'email phone' },
      { path: 'interviewSchedule.interviewer', select: 'email phone' },
      { path: 'communicationHistory.sentBy', select: 'email phone' }
    ]);

    res.json({
      success: true,
      message: 'Application status updated successfully',
      data: application
    });

  } catch (error) {
    console.error('Application status update error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while updating application status'
    });
  }
});

// Update an application's fee status
router.patch('/applications/:applicationId/fee', authenticateToken, authorizeRoles('admin', 'staff'), [
  body('amount').optional().isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
  body('paid').isBoolean().withMessage('paid must be true or false')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { amount, paid } = req.body;
    const update = { 'applicationFee.paid': paid };
    if (amount !== undefined) update['applicationFee.amount'] = amount;
    update['applicationFee.paymentDate'] = paid ? new Date() : null;

    const application = await Application.findByIdAndUpdate(
      req.params.applicationId,
      { $set: update },
      { new: true, runValidators: true }
    );

    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }
    await application.populate([
      { path: 'admissionDecision.decisionBy', select: 'email phone' },
      { path: 'interviewSchedule.interviewer', select: 'email phone' },
      { path: 'communicationHistory.sentBy', select: 'email phone' }
    ]);

    res.json({ success: true, message: 'Application fee updated', data: application });

  } catch (error) {
    console.error('Application fee update error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while updating the application fee'
    });
  }
});

// Schedule (or update) an admission interview
router.patch('/applications/:applicationId/interview', authenticateToken, authorizeRoles('admin', 'staff'), [
  body('date').optional().isISO8601().withMessage('Valid date is required'),
  body('time').optional().trim(),
  body('location').optional().trim(),
  body('notes').optional().trim(),
  body('attended').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { date, time, location, notes, attended } = req.body;

    const application = await Application.findByIdAndUpdate(
      req.params.applicationId,
      {
        $set: {
          interviewSchedule: {
            date: date || undefined,
            time: time || undefined,
            location: location || undefined,
            interviewer: req.userId,
            notes: notes || undefined,
            attended: attended || false
          }
        }
      },
      { new: true, runValidators: true }
    ).populate([
      { path: 'admissionDecision.decisionBy', select: 'email phone' },
      { path: 'interviewSchedule.interviewer', select: 'email phone' },
      { path: 'communicationHistory.sentBy', select: 'email phone' }
    ]);

    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    res.json({ success: true, message: 'Interview schedule updated', data: application });

  } catch (error) {
    console.error('Application interview update error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while updating the interview schedule'
    });
  }
});

// ===== CAREER APPLICATION MANAGEMENT =====

// Get all career applications
router.get('/career-applications', authenticateToken, authorizeRoles('admin', 'staff'), async (req, res) => {
  try {
    const { status, position, page = 1, limit = 20 } = req.query;

    let query = { isActive: true };
    if (status) query.status = status;
    if (position) query.position = position;

    const skip = (page - 1) * limit;
    const careerApplications = await CareerApplication.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await CareerApplication.countDocuments(query);

    res.json({
      success: true,
      data: {
        careerApplications,
        pagination: {
          current: parseInt(page),
          total: Math.ceil(total / limit),
          totalRecords: total
        }
      }
    });

  } catch (error) {
    console.error('Career applications fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching career applications'
    });
  }
});

// Update career application status
router.patch('/career-applications/:careerApplicationId/status', authenticateToken, authorizeRoles('admin', 'staff'), [
  body('status').isIn(['pending', 'reviewing', 'shortlisted', 'rejected', 'hired']).withMessage('Invalid status')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { careerApplicationId } = req.params;
    const { status } = req.body;

    const careerApplication = await CareerApplication.findByIdAndUpdate(
      careerApplicationId,
      { status },
      { new: true, runValidators: true }
    );

    if (!careerApplication) {
      return res.status(404).json({
        success: false,
        message: 'Career application not found'
      });
    }

    res.json({
      success: true,
      message: 'Career application status updated successfully',
      data: careerApplication
    });

  } catch (error) {
    console.error('Career application status update error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while updating career application status'
    });
  }
});

// ===== CONTACT MESSAGE MANAGEMENT =====

// Get all contact messages
router.get('/messages', authenticateToken, authorizeRoles('admin', 'staff'), async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    let query = { isActive: true };
    if (status) query.status = status;

    const skip = (page - 1) * limit;
    const messages = await ContactMessage.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await ContactMessage.countDocuments(query);

    res.json({
      success: true,
      data: {
        messages,
        pagination: {
          current: parseInt(page),
          total: Math.ceil(total / limit),
          totalRecords: total
        }
      }
    });

  } catch (error) {
    console.error('Contact messages fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching contact messages'
    });
  }
});

// Update contact message status
router.patch('/messages/:messageId/status', authenticateToken, authorizeRoles('admin', 'staff'), [
  body('status').isIn(['new', 'read', 'replied']).withMessage('Invalid status')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { messageId } = req.params;
    const { status } = req.body;

    const message = await ContactMessage.findByIdAndUpdate(
      messageId,
      { status },
      { new: true, runValidators: true }
    );

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    res.json({
      success: true,
      message: 'Message status updated successfully',
      data: message
    });

  } catch (error) {
    console.error('Contact message status update error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while updating message status'
    });
  }
});

// ===== STAFF MANAGEMENT =====

// Get all staff/admin accounts (admin only — staff shouldn't see other staff's contact info)
router.get('/staff', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;

    let query = { role: { $in: ['staff', 'admin'] } };
    if (search) {
      query.$or = [
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;
    const staff = await User.find(query)
      .select('-passwordHash')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await User.countDocuments(query);

    res.json({
      success: true,
      data: {
        staff,
        pagination: {
          current: parseInt(page),
          total: Math.ceil(total / limit),
          totalRecords: total
        }
      }
    });

  } catch (error) {
    console.error('Staff fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching staff'
    });
  }
});

// Activate/deactivate a staff account
router.patch('/staff/:userId/status', authenticateToken, authorizeRoles('admin'), [
  body('isActive').isBoolean().withMessage('isActive must be true or false')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const user = await User.findOneAndUpdate(
      { _id: req.params.userId, role: { $in: ['staff', 'admin'] } },
      { isActive: req.body.isActive },
      { new: true }
    ).select('-passwordHash');

    if (!user) {
      return res.status(404).json({ success: false, message: 'Staff account not found' });
    }

    res.json({ success: true, message: 'Staff account updated successfully', data: user });

  } catch (error) {
    console.error('Staff status update error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while updating staff account'
    });
  }
});

// Update a staff/admin account's details (email, phone, role, division)
router.patch('/staff/:userId', authenticateToken, authorizeRoles('admin'), [
  body('role').optional().isIn(['staff', 'admin']).withMessage('Role must be staff or admin'),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('Please provide a valid email'),
  body('division').optional({ checkFalsy: true }).isIn(['nursery', 'primary', 'secondary', 'college']).withMessage('Invalid division'),
  body('classes').optional().isArray().withMessage('Classes must be a list')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { email, phone, role, division, classes } = req.body;

    if (!email && !phone) {
      return res.status(400).json({ success: false, message: 'At least one of email or phone is required' });
    }

    const cleanClasses = Array.isArray(classes) ? classes.map((c) => c.trim()).filter(Boolean) : [];
    if (cleanClasses.length > 0 && !division) {
      return res.status(400).json({ success: false, message: 'Assign a division before assigning specific classes' });
    }

    const setOps = {};
    const unsetOps = {};
    if (email) setOps.email = email; else unsetOps.email = '';
    if (phone) setOps.phone = phone; else unsetOps.phone = '';
    if (role) setOps.role = role;
    if (division) setOps.division = division; else unsetOps.division = '';
    if (cleanClasses.length > 0) setOps.classes = cleanClasses; else unsetOps.classes = '';

    const update = {};
    if (Object.keys(setOps).length) update.$set = setOps;
    if (Object.keys(unsetOps).length) update.$unset = unsetOps;

    const user = await User.findOneAndUpdate(
      { _id: req.params.userId, role: { $in: ['staff', 'admin'] } },
      update,
      { new: true, runValidators: true }
    ).select('-passwordHash');

    if (!user) {
      return res.status(404).json({ success: false, message: 'Staff account not found' });
    }

    res.json({ success: true, message: 'Staff account updated successfully', data: user });

  } catch (error) {
    console.error('Staff update error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'That email or phone is already in use by another account' });
    }
    res.status(500).json({
      success: false,
      message: 'An error occurred while updating staff account'
    });
  }
});

// ===== NOTICE MANAGEMENT =====

// Get all notices
router.get('/notices', authenticateToken, authorizeRoles('admin', 'staff'), async (req, res) => {
  try {
    const { category, isPublished, page = 1, limit = 20 } = req.query;

    let query = { isActive: true, ...noticeDivisionScopeQuery(req.user) };
    if (category) query.category = category;
    if (isPublished !== undefined) query.isPublished = isPublished === 'true';

    const skip = (page - 1) * limit;
    const notices = await Notice.find(query)
      .populate('lastModifiedBy', 'email phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Notice.countDocuments(query);

    res.json({
      success: true,
      data: {
        notices,
        pagination: {
          current: parseInt(page),
          total: Math.ceil(total / limit),
          totalRecords: total
        }
      }
    });

  } catch (error) {
    console.error('Notices fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching notices'
    });
  }
});

const EXT_TO_FILE_TYPE = { pdf: 'pdf', doc: 'doc', docx: 'docx', jpg: 'jpg', jpeg: 'jpeg', png: 'png' };

// Create notice. Sent as multipart so optional file attachments can ride
// along — targetAudience/metadata arrive as JSON-encoded strings since
// multipart form fields can't carry nested objects natively.
router.post('/notices', authenticateToken, authorizeRoles('admin', 'staff'), uploadNoticeAttachments, [
  body('title').trim().isLength({ min: 5, max: 200 }).withMessage('Title must be 5-200 characters'),
  body('body').trim().isLength({ min: 10, max: 5000 }).withMessage('Body must be 10-5000 characters'),
  body('category').isIn(['general', 'academic', 'fees', 'events', 'holidays', 'emergency', 'maintenance', 'exam', 'admission']).withMessage('Invalid category'),
  body('priority').isIn(['low', 'medium', 'high', 'urgent']).withMessage('Invalid priority'),
  body('expiryDate').isISO8601().withMessage('Valid expiry date is required'),
  body('summary').optional({ checkFalsy: true }).trim().isLength({ max: 300 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    let targetAudience = {};
    let metadata;
    try {
      if (req.body.targetAudience) targetAudience = JSON.parse(req.body.targetAudience);
      if (req.body.metadata) metadata = JSON.parse(req.body.metadata);
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid targetAudience/metadata payload' });
    }

    const staffScope = getStaffScope(req.user);
    if (staffScope) {
      const divisions = targetAudience.divisions || [];
      const outOfScope = divisions.some((d) => d !== staffScope.division);
      if (divisions.length === 0 || outOfScope) {
        return res.status(403).json({
          success: false,
          message: `As a staff member assigned to ${staffScope.division}, notices must target only the ${staffScope.division} division`
        });
      }
    }

    const attachments = (req.files || []).map((file) => {
      const ext = file.originalname.split('.').pop().toLowerCase();
      return {
        fileName: file.originalname,
        fileUrl: file.path,
        fileType: EXT_TO_FILE_TYPE[ext] || 'other',
        fileSize: file.size
      };
    });

    const noticeData = {
      title: req.body.title,
      body: req.body.body,
      category: req.body.category,
      priority: req.body.priority,
      expiryDate: req.body.expiryDate,
      summary: req.body.summary || undefined,
      targetAudience,
      metadata,
      attachments,
      createdBy: req.userId
    };

    const notice = new Notice(noticeData);
    await notice.save();

    res.status(201).json({
      success: true,
      message: 'Notice created successfully',
      data: notice
    });

  } catch (error) {
    console.error('Notice creation error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while creating notice'
    });
  }
});

// Publish/unpublish a notice
router.patch('/notices/:noticeId/publish', authenticateToken, authorizeRoles('admin', 'staff'), [
  body('isPublished').isBoolean().withMessage('isPublished must be true or false')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const existing = await Notice.findById(req.params.noticeId);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Notice not found' });
    }
    if (!isNoticeWithinDivisionScope(req.user, existing)) {
      return res.status(403).json({ success: false, message: 'Access denied - outside your assigned division' });
    }

    const notice = await Notice.findByIdAndUpdate(
      req.params.noticeId,
      { isPublished: req.body.isPublished, lastModifiedBy: req.userId },
      { new: true }
    );

    res.json({ success: true, message: 'Notice updated successfully', data: notice });

  } catch (error) {
    console.error('Notice publish toggle error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while updating notice'
    });
  }
});

// Pin/unpin a notice (pinned notices sort to the top)
router.patch('/notices/:noticeId/pin', authenticateToken, authorizeRoles('admin', 'staff'), [
  body('isPinned').isBoolean().withMessage('isPinned must be true or false')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const existing = await Notice.findById(req.params.noticeId);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Notice not found' });
    }
    if (!isNoticeWithinDivisionScope(req.user, existing)) {
      return res.status(403).json({ success: false, message: 'Access denied - outside your assigned division' });
    }

    const notice = await Notice.findByIdAndUpdate(
      req.params.noticeId,
      { isPinned: req.body.isPinned, lastModifiedBy: req.userId },
      { new: true }
    );

    res.json({ success: true, message: 'Notice updated successfully', data: notice });

  } catch (error) {
    console.error('Notice pin toggle error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while updating notice'
    });
  }
});

// Deactivate (soft-delete) a notice
router.delete('/notices/:noticeId', authenticateToken, authorizeRoles('admin', 'staff'), async (req, res) => {
  try {
    const existing = await Notice.findById(req.params.noticeId);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Notice not found' });
    }
    if (!isNoticeWithinDivisionScope(req.user, existing)) {
      return res.status(403).json({ success: false, message: 'Access denied - outside your assigned division' });
    }

    const notice = await Notice.findByIdAndUpdate(
      req.params.noticeId,
      { isActive: false },
      { new: true }
    );

    res.json({ success: true, message: 'Notice deleted successfully' });

  } catch (error) {
    console.error('Notice deletion error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while deleting notice'
    });
  }
});

// ===== LEARNING RESOURCES =====

// Get all resources
router.get('/resources', authenticateToken, authorizeRoles('admin', 'staff'), async (req, res) => {
  try {
    const { type, subject, isPublished, page = 1, limit = 20 } = req.query;

    let query = { isActive: true, ...resourceDivisionScopeQuery(req.user) };
    if (type) query.type = type;
    if (subject) query.subject = subject;
    if (isPublished !== undefined) query.isPublished = isPublished === 'true';

    const skip = (page - 1) * limit;
    const resources = await Resource.find(query)
      .populate('lastModifiedBy', 'email phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Resource.countDocuments(query);

    res.json({
      success: true,
      data: {
        resources,
        pagination: {
          current: parseInt(page),
          total: Math.ceil(total / limit),
          totalRecords: total
        }
      }
    });

  } catch (error) {
    console.error('Resources fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching resources'
    });
  }
});

// Create resource. Sent as multipart so an optional file upload (for
// type 'document') can ride along — divisions/classes arrive as
// JSON-encoded strings since multipart form fields can't carry arrays natively.
router.post('/resources', authenticateToken, authorizeRoles('admin', 'staff'), uploadResourceFile, [
  body('title').trim().isLength({ min: 3, max: 200 }).withMessage('Title must be 3-200 characters'),
  body('type').isIn(['document', 'video', 'link']).withMessage('Invalid resource type'),
  body('description').optional({ checkFalsy: true }).trim().isLength({ max: 2000 }),
  body('subject').optional({ checkFalsy: true }).trim().isLength({ max: 100 }),
  body('externalUrl').optional({ checkFalsy: true }).isURL().withMessage('A valid URL is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    let divisions = [];
    let classes = [];
    try {
      if (req.body.divisions) divisions = JSON.parse(req.body.divisions);
      if (req.body.classes) classes = JSON.parse(req.body.classes);
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid divisions/classes payload' });
    }

    const staffScope = getStaffScope(req.user);
    if (staffScope) {
      const outOfScope = divisions.some((d) => d !== staffScope.division);
      if (divisions.length === 0 || outOfScope) {
        return res.status(403).json({
          success: false,
          message: `As a staff member assigned to ${staffScope.division}, resources must target only the ${staffScope.division} division`
        });
      }
    }

    if (req.body.type === 'document' && !req.file) {
      return res.status(400).json({ success: false, message: 'A file upload is required for document resources' });
    }

    const resourceData = {
      title: req.body.title,
      description: req.body.description || undefined,
      subject: req.body.subject || undefined,
      type: req.body.type,
      divisions,
      classes,
      externalUrl: req.body.externalUrl || undefined,
      createdBy: req.userId
    };

    if (req.file) {
      resourceData.fileUrl = req.file.path;
      resourceData.fileName = req.file.originalname;
      resourceData.fileSize = req.file.size;
    }

    const resource = new Resource(resourceData);
    await resource.save();

    res.status(201).json({
      success: true,
      message: 'Resource created successfully',
      data: resource
    });

  } catch (error) {
    console.error('Resource creation error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'An error occurred while creating resource'
    });
  }
});

// Publish/unpublish a resource
router.patch('/resources/:resourceId/publish', authenticateToken, authorizeRoles('admin', 'staff'), [
  body('isPublished').isBoolean().withMessage('isPublished must be a boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const existing = await Resource.findById(req.params.resourceId);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Resource not found' });
    }
    if (!isResourceWithinDivisionScope(req.user, existing)) {
      return res.status(403).json({ success: false, message: 'Access denied - outside your assigned division' });
    }

    const resource = await Resource.findByIdAndUpdate(
      req.params.resourceId,
      { isPublished: req.body.isPublished, lastModifiedBy: req.userId },
      { new: true }
    );

    res.json({ success: true, message: 'Resource updated successfully', data: resource });

  } catch (error) {
    console.error('Resource publish toggle error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while updating resource'
    });
  }
});

// Deactivate (soft-delete) a resource
router.delete('/resources/:resourceId', authenticateToken, authorizeRoles('admin', 'staff'), async (req, res) => {
  try {
    const existing = await Resource.findById(req.params.resourceId);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Resource not found' });
    }
    if (!isResourceWithinDivisionScope(req.user, existing)) {
      return res.status(403).json({ success: false, message: 'Access denied - outside your assigned division' });
    }

    await Resource.findByIdAndUpdate(req.params.resourceId, { isActive: false });

    res.json({ success: true, message: 'Resource deleted successfully' });

  } catch (error) {
    console.error('Resource deletion error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while deleting resource'
    });
  }
});

// ===== CBT EXAM SYSTEM =====

// Exams only ever target one division at a time (unlike Notices/Resources),
// so scope enforcement here is a plain equality check rather than the
// $or-based helpers those two use.
const denyIfOutOfExamScope = (req, exam) => {
  const staffScope = getStaffScope(req.user);
  if (staffScope && exam.division !== staffScope.division) {
    return true;
  }
  return false;
};

router.get('/exams', authenticateToken, authorizeRoles('admin', 'staff'), async (req, res) => {
  try {
    const { division, subject, isPublished, page = 1, limit = 20 } = req.query;

    const staffScope = getStaffScope(req.user);
    let query = { isActive: true };
    if (staffScope) query.division = staffScope.division;
    else if (division) query.division = division;
    if (subject) query.subject = subject;
    if (isPublished !== undefined) query.isPublished = isPublished === 'true';

    const skip = (page - 1) * limit;
    const exams = await Exam.find(query)
      .select('-questions.correctAnswer')
      .sort({ startTime: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Exam.countDocuments(query);

    res.json({
      success: true,
      data: {
        exams,
        pagination: {
          current: parseInt(page),
          total: Math.ceil(total / limit),
          totalRecords: total
        }
      }
    });
  } catch (error) {
    console.error('Exams fetch error:', error);
    res.status(500).json({ success: false, message: 'An error occurred while fetching exams' });
  }
});

router.get('/exams/:examId', authenticateToken, authorizeRoles('admin', 'staff'), async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.examId);
    if (!exam || !exam.isActive) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }
    if (denyIfOutOfExamScope(req, exam)) {
      return res.status(403).json({ success: false, message: 'Access denied - outside your assigned division' });
    }
    res.json({ success: true, data: exam });
  } catch (error) {
    console.error('Exam fetch error:', error);
    res.status(500).json({ success: false, message: 'An error occurred while fetching exam' });
  }
});

router.post('/exams', authenticateToken, authorizeRoles('admin', 'staff'), [
  body('title').trim().isLength({ min: 3, max: 200 }).withMessage('Title must be 3-200 characters'),
  body('division').isIn(['nursery', 'primary', 'secondary', 'college']).withMessage('Invalid division'),
  body('durationMinutes').isInt({ min: 1 }).withMessage('Duration must be a positive number of minutes'),
  body('startTime').isISO8601().withMessage('Valid start time is required'),
  body('endTime').isISO8601().withMessage('Valid end time is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const staffScope = getStaffScope(req.user);
    if (staffScope && req.body.division !== staffScope.division) {
      return res.status(403).json({
        success: false,
        message: `As a staff member assigned to ${staffScope.division}, exams must target only the ${staffScope.division} division`
      });
    }

    const exam = new Exam({
      title: req.body.title,
      description: req.body.description || undefined,
      subject: req.body.subject || undefined,
      division: req.body.division,
      classes: req.body.classes || [],
      durationMinutes: req.body.durationMinutes,
      startTime: req.body.startTime,
      endTime: req.body.endTime,
      questions: req.body.questions || [],
      shuffleQuestions: !!req.body.shuffleQuestions,
      showResultsImmediately: req.body.showResultsImmediately !== false,
      createdBy: req.userId
    });
    await exam.save();

    res.status(201).json({ success: true, message: 'Exam created successfully', data: exam });
  } catch (error) {
    console.error('Exam creation error:', error);
    res.status(400).json({ success: false, message: error.message || 'An error occurred while creating exam' });
  }
});

// Edit exam metadata and/or replace its question list entirely — the exam
// builder UI always sends the full current question list back, so this is a
// full replace rather than a per-question patch.
router.patch('/exams/:examId', authenticateToken, authorizeRoles('admin', 'staff'), async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.examId);
    if (!exam || !exam.isActive) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }
    if (denyIfOutOfExamScope(req, exam)) {
      return res.status(403).json({ success: false, message: 'Access denied - outside your assigned division' });
    }

    const editable = ['title', 'description', 'subject', 'classes', 'durationMinutes', 'startTime', 'endTime', 'questions', 'shuffleQuestions', 'showResultsImmediately'];
    editable.forEach((field) => {
      if (req.body[field] !== undefined) exam[field] = req.body[field];
    });
    exam.lastModifiedBy = req.userId;

    await exam.save();
    res.json({ success: true, message: 'Exam updated successfully', data: exam });
  } catch (error) {
    console.error('Exam update error:', error);
    res.status(400).json({ success: false, message: error.message || 'An error occurred while updating exam' });
  }
});

router.patch('/exams/:examId/publish', authenticateToken, authorizeRoles('admin', 'staff'), [
  body('isPublished').isBoolean().withMessage('isPublished must be a boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const exam = await Exam.findById(req.params.examId);
    if (!exam || !exam.isActive) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }
    if (denyIfOutOfExamScope(req, exam)) {
      return res.status(403).json({ success: false, message: 'Access denied - outside your assigned division' });
    }
    if (req.body.isPublished && exam.questions.length === 0) {
      return res.status(400).json({ success: false, message: 'Cannot publish an exam with no questions' });
    }

    exam.isPublished = req.body.isPublished;
    exam.lastModifiedBy = req.userId;
    await exam.save();

    res.json({ success: true, message: 'Exam updated successfully', data: exam });
  } catch (error) {
    console.error('Exam publish toggle error:', error);
    res.status(500).json({ success: false, message: 'An error occurred while updating exam' });
  }
});

router.delete('/exams/:examId', authenticateToken, authorizeRoles('admin', 'staff'), async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.examId);
    if (!exam) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }
    if (denyIfOutOfExamScope(req, exam)) {
      return res.status(403).json({ success: false, message: 'Access denied - outside your assigned division' });
    }

    exam.isActive = false;
    await exam.save();

    res.json({ success: true, message: 'Exam deleted successfully' });
  } catch (error) {
    console.error('Exam deletion error:', error);
    res.status(500).json({ success: false, message: 'An error occurred while deleting exam' });
  }
});

// Bulk-append questions to an exam from an uploaded CSV (header row:
// questionText,type,marks,option1..option6,correctAnswer).
router.post('/exams/:examId/questions/csv', authenticateToken, authorizeRoles('admin', 'staff'), uploadQuestionsCsv, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'A CSV file is required' });
    }

    const exam = await Exam.findById(req.params.examId);
    if (!exam || !exam.isActive) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }
    if (denyIfOutOfExamScope(req, exam)) {
      return res.status(403).json({ success: false, message: 'Access denied - outside your assigned division' });
    }

    const { questions, errors } = parseQuestionsCsv(req.file.buffer.toString('utf-8'));
    if (questions.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid questions found in CSV', errors });
    }

    exam.questions.push(...questions);
    exam.lastModifiedBy = req.userId;
    await exam.save();

    res.json({
      success: true,
      message: `${questions.length} question(s) added${errors.length ? `, ${errors.length} row(s) skipped` : ''}`,
      data: exam,
      warnings: errors
    });
  } catch (error) {
    console.error('CSV question upload error:', error);
    res.status(400).json({ success: false, message: error.message || 'An error occurred while processing the CSV' });
  }
});

// List all submissions for an exam (for grading + a results overview)
router.get('/exams/:examId/submissions', authenticateToken, authorizeRoles('admin', 'staff'), async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.examId);
    if (!exam) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }
    if (denyIfOutOfExamScope(req, exam)) {
      return res.status(403).json({ success: false, message: 'Access denied - outside your assigned division' });
    }

    const submissions = await Submission.find({ examId: req.params.examId })
      .populate('studentId', 'fullName regNumber class')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: { exam, submissions } });
  } catch (error) {
    console.error('Submissions fetch error:', error);
    res.status(500).json({ success: false, message: 'An error occurred while fetching submissions' });
  }
});

// Export an exam's results as CSV
router.get('/exams/:examId/submissions/export', authenticateToken, authorizeRoles('admin', 'staff'), async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.examId);
    if (!exam) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }
    if (denyIfOutOfExamScope(req, exam)) {
      return res.status(403).json({ success: false, message: 'Access denied - outside your assigned division' });
    }

    const submissions = await Submission.find({ examId: req.params.examId })
      .populate('studentId', 'fullName regNumber class')
      .sort({ createdAt: -1 });

    const escape = (value) => {
      const str = String(value ?? '');
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };

    const rows = [
      ['Student Name', 'Reg Number', 'Class', 'Score', 'Max Score', 'Status', 'Submitted At'],
      ...submissions.map((s) => [
        s.studentId?.fullName || '',
        s.studentId?.regNumber || '',
        s.studentId?.class || '',
        s.score ?? '',
        s.maxScore ?? exam.totalMarks,
        s.status,
        s.submittedAt ? s.submittedAt.toISOString() : ''
      ])
    ];
    const csv = rows.map((row) => row.map(escape).join(',')).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${exam.title.replace(/[^a-z0-9]/gi, '-')}-results.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('Results export error:', error);
    res.status(500).json({ success: false, message: 'An error occurred while exporting results' });
  }
});

// Manually grade short/essay answers on a submission (mcq answers are
// already auto-scored at submit time). Body: { answers: [{ questionId, marksAwarded }] }
router.patch('/submissions/:submissionId/grade', authenticateToken, authorizeRoles('admin', 'staff'), [
  body('answers').isArray({ min: 1 }).withMessage('answers must be a non-empty array')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const submission = await Submission.findById(req.params.submissionId);
    if (!submission) {
      return res.status(404).json({ success: false, message: 'Submission not found' });
    }
    const exam = await Exam.findById(submission.examId);
    if (!exam) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }
    if (denyIfOutOfExamScope(req, exam)) {
      return res.status(403).json({ success: false, message: 'Access denied - outside your assigned division' });
    }
    if (submission.status === 'in_progress') {
      return res.status(400).json({ success: false, message: 'Cannot grade a submission the student has not submitted yet' });
    }

    req.body.answers.forEach(({ questionId, marksAwarded }) => {
      const answer = submission.answers.find((a) => a.questionId.toString() === questionId);
      if (answer) answer.marksAwarded = marksAwarded;
    });

    submission.recomputeScore();
    submission.status = 'graded';
    submission.gradedBy = req.userId;
    submission.gradedAt = new Date();
    await submission.save();

    res.json({ success: true, message: 'Submission graded successfully', data: submission });
  } catch (error) {
    console.error('Submission grading error:', error);
    res.status(500).json({ success: false, message: 'An error occurred while grading submission' });
  }
});

// Get admin dashboard stats
router.get('/dashboard/stats', authenticateToken, authorizeRoles('admin', 'staff'), async (req, res) => {
  try {
    const { division } = req.query;

    // Build queries based on user role and division/class access. A scoped
    // staff member's own assignment always wins over the query param.
    let studentQuery = { isActive: true };
    let applicationQuery = { isActive: true };
    let invoiceQuery = { isActive: true };

    const staffScope = getStaffScope(req.user);
    if (staffScope) {
      studentQuery.division = staffScope.division;
      if (staffScope.classes) studentQuery.class = { $in: staffScope.classes };
      applicationQuery.divisionApplied = staffScope.division;
    } else if (division) {
      studentQuery.division = division;
      applicationQuery.divisionApplied = division;
    }

    // Get counts
    const [
      totalStudents,
      pendingApplications,
      overdueInvoices,
      activeNotices,
      newApplicationsThisWeek,
      newMessages,
      pendingCareerApplications
    ] = await Promise.all([
      Student.countDocuments(studentQuery),
      Application.countDocuments({ ...applicationQuery, status: 'pending' }),
      // Not just status: 'overdue' — that field only ever gets set when
      // amountPaid is exactly 0 (see the pre-save hook in Invoice.js), so a
      // partially-paid invoice past its due date stays labelled 'partial'
      // forever. Any unpaid balance past the due date is genuinely overdue.
      Invoice.countDocuments({
        ...invoiceQuery,
        balance: { $gt: 0 },
        dueDate: { $lt: new Date() }
      }),
      Notice.countDocuments({
        isPublished: true,
        isActive: true,
        expiryDate: { $gte: new Date() }
      }),
      Application.countDocuments({
        ...applicationQuery,
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      }),
      ContactMessage.countDocuments({ isActive: true, status: 'new' }),
      CareerApplication.countDocuments({ isActive: true, status: 'pending' })
    ]);

    // Get revenue summary
    const revenueData = await Invoice.aggregate([
      { $match: { ...invoiceQuery, status: 'paid' } },
      { $group: { _id: null, totalRevenue: { $sum: '$amountPaid' } } }
    ]);

    // Breakdowns for charts — reuse the same scoped queries the headline
    // numbers above are built from, so a scoped staff member's charts never
    // show data outside their own division/classes.
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const [
      studentsByDivisionRaw,
      applicationsByStatusRaw,
      invoicesByStatusRaw,
      revenueByMonthRaw,
      recentApplications,
      defaultersRaw
    ] = await Promise.all([
      Student.aggregate([
        { $match: studentQuery },
        { $group: { _id: '$division', count: { $sum: 1 } } }
      ]),
      Application.aggregate([
        { $match: applicationQuery },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      Invoice.aggregate([
        { $match: invoiceQuery },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      Invoice.aggregate([
        { $match: invoiceQuery },
        { $unwind: '$paymentHistory' },
        { $match: { 'paymentHistory.paymentDate': { $gte: sixMonthsAgo } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$paymentHistory.paymentDate' } }, total: { $sum: '$paymentHistory.amount' } } },
        { $sort: { _id: 1 } }
      ]),
      Application.find(applicationQuery)
        .sort({ createdAt: -1 })
        .limit(5)
        .select('applicantName applicationNumber status divisionApplied createdAt'),
      // Parents/students who owe money past the due date, grouped per
      // student and joined against Student for name/class/contact info —
      // same broader "overdue" definition as the count above (balance > 0,
      // not the status field, which misses partial-but-late payments).
      Invoice.aggregate([
        { $match: { ...invoiceQuery, balance: { $gt: 0 }, dueDate: { $lt: new Date() } } },
        { $group: {
            _id: '$studentId',
            totalOwed: { $sum: '$balance' },
            invoiceCount: { $sum: 1 },
            oldestDueDate: { $min: '$dueDate' }
        } },
        { $lookup: { from: 'students', localField: '_id', foreignField: '_id', as: 'student' } },
        { $unwind: '$student' },
        ...(staffScope ? [{ $match: {
            'student.division': staffScope.division,
            ...(staffScope.classes ? { 'student.class': { $in: staffScope.classes } } : {})
        } }] : []),
        { $sort: { totalOwed: -1 } },
        { $limit: 15 },
        { $project: {
            _id: 0,
            studentId: '$_id',
            studentName: '$student.fullName',
            regNumber: '$student.regNumber',
            division: '$student.division',
            class: '$student.class',
            parentName: '$student.parentInfo.name',
            parentPhone: '$student.parentInfo.phone',
            parentEmail: '$student.parentInfo.email',
            totalOwed: 1,
            invoiceCount: 1,
            oldestDueDate: 1
        } }
      ])
    ]);

    // Fill in every division/month even where the count is zero, so the
    // frontend can render a consistent set of bars without special-casing gaps.
    const DIVISIONS = ['nursery', 'primary', 'secondary', 'college'];
    const studentsByDivision = DIVISIONS.map((d) => ({
      division: d,
      count: studentsByDivisionRaw.find((r) => r._id === d)?.count || 0
    }));

    const months = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(sixMonthsAgo);
      d.setMonth(d.getMonth() + i);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const revenueByMonth = months.map((m) => ({
      month: m,
      total: revenueByMonthRaw.find((r) => r._id === m)?.total || 0
    }));

    const applicationsByStatus = applicationsByStatusRaw.map((r) => ({ status: r._id, count: r.count }));
    const invoicesByStatus = invoicesByStatusRaw.map((r) => ({ status: r._id, count: r.count }));

    const stats = {
      students: {
        total: totalStudents,
        byDivision: studentsByDivision
      },
      applications: {
        pending: pendingApplications,
        thisWeek: newApplicationsThisWeek,
        byStatus: applicationsByStatus,
        recent: recentApplications
      },
      financial: {
        overdueInvoices,
        totalRevenue: revenueData[0]?.totalRevenue || 0,
        byStatus: invoicesByStatus,
        revenueByMonth,
        defaulters: defaultersRaw
      },
      notices: {
        active: activeNotices
      },
      messages: {
        new: newMessages
      },
      careerApplications: {
        pending: pendingCareerApplications
      }
    };

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching dashboard stats'
    });
  }
});

export default router;
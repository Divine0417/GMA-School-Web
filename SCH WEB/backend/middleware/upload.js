import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import cloudinary from '../config/cloudinary.js';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPG, PNG, WEBP, or PDF files are allowed'), false);
  }
};

const createStorage = (folder, formats = ['jpg', 'jpeg', 'png', 'webp', 'pdf']) => new CloudinaryStorage({
  cloudinary,
  params: {
    folder: `gma-school/${folder}`,
    resource_type: 'auto',
    allowed_formats: formats
  }
});

const admissionDocumentsUpload = multer({
  storage: createStorage('admissions'),
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE }
}).fields([
  { name: 'birthCertificate', maxCount: 1 },
  { name: 'previousSchoolRecords', maxCount: 1 },
  { name: 'passportPhoto', maxCount: 1 },
  { name: 'medicalCertificate', maxCount: 1 }
]);

const coverLetterUpload = multer({
  storage: createStorage('careers'),
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE }
}).single('coverLetter');

const reportCardUpload = multer({
  storage: createStorage('report-cards'),
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE }
}).single('reportCard');

const studentPhotoUpload = multer({
  storage: createStorage('student-photos'),
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE }
}).single('photo');

const noticeAttachmentsUpload = multer({
  storage: createStorage('notice-attachments'),
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE }
}).array('attachments', 5);

// Learning resources (study materials, past questions) also allow Word/PowerPoint
// files, unlike the other upload flows above which only ever handle images/PDFs.
const RESOURCE_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg', 'image/png', 'image/webp'
];
const resourceFileFilter = (req, file, cb) => {
  if (RESOURCE_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF, Word, PowerPoint, JPG, PNG, or WEBP files are allowed'), false);
  }
};
const resourceFileUpload = multer({
  storage: createStorage('learning-resources', ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'doc', 'docx', 'ppt', 'pptx']),
  fileFilter: resourceFileFilter,
  limits: { fileSize: MAX_FILE_SIZE }
}).single('file');

// Optional image attached to a single CBT exam question (e.g. a diagram the
// question refers to) — images only, no PDF, unlike the shared fileFilter above.
const questionImageFileFilter = (req, file, cb) => {
  if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
  else cb(new Error('Only JPG, PNG, or WEBP images are allowed'), false);
};
const questionImageUpload = multer({
  storage: createStorage('exam-question-images', ['jpg', 'jpeg', 'png', 'webp']),
  fileFilter: questionImageFileFilter,
  limits: { fileSize: MAX_FILE_SIZE }
}).single('image');

// Question-bank CSV bulk upload for the CBT exam builder — parsed in memory
// and discarded immediately, so unlike everything else above this never
// touches Cloudinary.
const csvUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const isCsv = file.mimetype === 'text/csv' || file.mimetype === 'application/vnd.ms-excel' || file.originalname.toLowerCase().endsWith('.csv');
    if (isCsv) cb(null, true);
    else cb(new Error('Only CSV files are allowed'), false);
  },
  limits: { fileSize: 1 * 1024 * 1024 } // 1MB is plenty for a question bank
}).single('file');

// Wraps multer middleware so upload errors (oversized/wrong-type files)
// return a clean JSON response instead of an unhandled error.
const withUploadErrorHandling = (uploadMiddleware) => (req, res, next) => {
  uploadMiddleware(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'File is too large. Maximum size is 5MB.'
        : err.message;
      return res.status(400).json({ success: false, message });
    }
    if (err) {
      return res.status(400).json({ success: false, message: err.message || 'File upload error' });
    }
    next();
  });
};

export const uploadAdmissionDocuments = withUploadErrorHandling(admissionDocumentsUpload);
export const uploadCoverLetter = withUploadErrorHandling(coverLetterUpload);
export const uploadReportCard = withUploadErrorHandling(reportCardUpload);
export const uploadStudentPhoto = withUploadErrorHandling(studentPhotoUpload);
export const uploadNoticeAttachments = withUploadErrorHandling(noticeAttachmentsUpload);
export const uploadResourceFile = withUploadErrorHandling(resourceFileUpload);
export const uploadQuestionsCsv = withUploadErrorHandling(csvUpload);
export const uploadQuestionImage = withUploadErrorHandling(questionImageUpload);
import { Router } from 'express';
import multer from 'multer';
import {
  createApplicant,
  updateApplicant,
  getApplicantById,
  deleteApplicant,
  deleteApplicantDocument,
  deleteSocialProfile,
  deleteWorkHistory,
  deleteReference,
  getAllApplicants,
} from '../../controllers/applicant/applicantProfileController';

const router = Router();

// Configure multer for file uploads (in-memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only PDF, DOC, DOCX files for resumes
    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOC, and DOCX files are allowed.'));
    }
  },
});

// ============================================
// APPLICANT ROUTES
// ============================================

/**
 * @route   GET /api/applicantsprofiles/
 * @desc    Get all applicantsprofiles with pagination and filters
 * @access  Private
 */
router.get('/', getAllApplicants);

/**
 * @route   POST /api/applicantsprofiles
 * @desc    Create a new applicant profile
 * @access  Private
 */
router.post('/', upload.single('resume'), createApplicant);

/**
 * @route   GET /api/applicantsprofiles/:applicantId
 * @desc    Get applicant by ID with all related data
 * @access  Private
 */
router.get('/:applicantId', getApplicantById);

/**
 * @route   PUT /api/applicantsprofiles/:applicantId
 * @desc    Update applicant profile
 * @access  Private
 */
router.put('/:applicantId', upload.single('resume'), updateApplicant);

/**
 * @route   DELETE /api/applicantsprofiles/:applicantId
 * @desc    Delete applicant and all related data
 * @access  Private
 */
router.delete('/:applicantId', deleteApplicant);

// ============================================
// APPLICANT DOCUMENT ROUTES
// ============================================

/**
 * @route   DELETE /api/applicantsprofiles/:applicantId/documents/:documentId
 * @desc    Delete specific applicant document (resume or cover letter)
 * @access  Private
 */
router.delete('/:applicantId/documents/:documentId', deleteApplicantDocument);

// ============================================
// APPLICANT SOCIAL PROFILE ROUTES
// ============================================

/**
 * @route   DELETE /api/applicantsprofiles/:applicantId/social-profiles/:profileId
 * @desc    Delete applicant social profile
 * @access  Private
 */
router.delete('/:applicantId/social-profiles/:profileId', deleteSocialProfile);

// ============================================
// APPLICANT WORK HISTORY ROUTES
// ============================================

/**
 * @route   DELETE /api/applicantsprofiles/:applicantId/work-history/:workHistoryId
 * @desc    Delete applicant work history entry
 * @access  Private
 */
router.delete('/:applicantId/work-history/:workHistoryId', deleteWorkHistory);

// ============================================
// APPLICANT REFERENCE ROUTES
// ============================================

/**
 * @route   DELETE /api/applicantsprofiles/:applicantId/references/:referenceId
 * @desc    Delete applicant reference
 * @access  Private
 */
router.delete('/:applicantId/references/:referenceId', deleteReference);

export default router;
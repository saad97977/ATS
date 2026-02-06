"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const applicantProfileController_1 = require("../../controllers/applicant/applicantProfileController");
const router = (0, express_1.Router)();
// Configure multer for file uploads (in-memory storage)
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
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
        }
        else {
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
router.get('/', applicantProfileController_1.getAllApplicants);
/**
 * @route   POST /api/applicantsprofiles
 * @desc    Create a new applicant profile
 * @access  Private
 */
router.post('/', upload.single('resume'), applicantProfileController_1.createApplicant);
/**
 * @route   GET /api/applicantsprofiles/:applicantId
 * @desc    Get applicant by ID with all related data
 * @access  Private
 */
router.get('/:applicantId', applicantProfileController_1.getApplicantById);
/**
 * @route   PUT /api/applicantsprofiles/:applicantId
 * @desc    Update applicant profile
 * @access  Private
 */
router.put('/:applicantId', upload.single('resume'), applicantProfileController_1.updateApplicant);
/**
 * @route   DELETE /api/applicantsprofiles/:applicantId
 * @desc    Delete applicant and all related data
 * @access  Private
 */
router.delete('/:applicantId', applicantProfileController_1.deleteApplicant);
// ============================================
// APPLICANT DOCUMENT ROUTES
// ============================================
/**
 * @route   DELETE /api/applicantsprofiles/:applicantId/documents/:documentId
 * @desc    Delete specific applicant document (resume or cover letter)
 * @access  Private
 */
router.delete('/:applicantId/documents/:documentId', applicantProfileController_1.deleteApplicantDocument);
// ============================================
// APPLICANT SOCIAL PROFILE ROUTES
// ============================================
/**
 * @route   DELETE /api/applicantsprofiles/:applicantId/social-profiles/:profileId
 * @desc    Delete applicant social profile
 * @access  Private
 */
router.delete('/:applicantId/social-profiles/:profileId', applicantProfileController_1.deleteSocialProfile);
// ============================================
// APPLICANT WORK HISTORY ROUTES
// ============================================
/**
 * @route   DELETE /api/applicantsprofiles/:applicantId/work-history/:workHistoryId
 * @desc    Delete applicant work history entry
 * @access  Private
 */
router.delete('/:applicantId/work-history/:workHistoryId', applicantProfileController_1.deleteWorkHistory);
// ============================================
// APPLICANT REFERENCE ROUTES
// ============================================
/**
 * @route   DELETE /api/applicantsprofiles/:applicantId/references/:referenceId
 * @desc    Delete applicant reference
 * @access  Private
 */
router.delete('/:applicantId/references/:referenceId', applicantProfileController_1.deleteReference);
exports.default = router;
//# sourceMappingURL=applicantProfileRoutes.js.map
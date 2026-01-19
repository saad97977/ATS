"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const fullJobController_1 = require("../../controllers/job/fullJobController");
const router = (0, express_1.Router)();
/**
 * Job Complete Routes
 * Handles creating job with all related data in a single transaction
 */
/**
 * @route   POST /api/jobs/complete
 * @desc    Create job with all related data (job_detail, job_notes, job_rates)
 * @access  Private (requires authentication)
 * @body    {
 *            organization_id: string (uuid),
 *            manager_id?: string (uuid),
 *            job_title: string,
 *            status?: 'DRAFT' | 'OPEN' | 'CLOSED',
 *            job_type: 'TEMPORARY' | 'PERMANENT',
 *            location: string,
 *            days_active?: number,
 *            days_inactive?: number,
 *            approved?: boolean,
 *            start_date?: datetime,
 *            end_date?: datetime,
 *            created_by_user_id: string (uuid),
 *            job_detail?: { description: string, skills?: json },
 *            job_notes?: [{ note: string }],
 *            job_rates?: [{ pay_rate?, bill_rate, markup_percentage?, overtime_rule?, hours, ot_pay_rate?, ot_bill_rate? }]
 *          }
 */
router.post('/', fullJobController_1.jobCompleteController.createJobComplete);
exports.default = router;
//# sourceMappingURL=fullJobRoutes.js.map
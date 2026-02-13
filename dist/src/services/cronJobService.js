"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeCronJobs = exports.manualTriggerJobAutoClose = exports.manualTriggerInterviewUpdate = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const axios_1 = __importDefault(require("axios"));
/**
 * CRON JOB CONFIGURATION
 *
 * 1. Auto-update completed interviews to COMPLETED_RESULT_PENDING status
 * 2. Auto-close jobs past their end_date
 */
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
/**
 * Schedule: Run every day at 9 AM
 * Cron Expression: '0 9 * * *'
 *
 * This job checks for any interviews with:
 * - status = PENDING
 * - interview_date < current time
 *
 * And updates them to:
 * - InterviewStatus = COMPLETED_RESULT_PENDING
 * - PipelineStageName = INTERVIEWED
 */
const scheduleInterviewAutoUpdate = () => {
    node_cron_1.default.schedule('0 9 * * *', async () => {
        const now = new Date();
        console.log(`[${now.toISOString()}] Running auto-update for completed interviews...`);
        try {
            const response = await axios_1.default.post(`${API_BASE_URL}/api/pipeline/auto-update-completed`, {}, {
                headers: {
                    'Content-Type': 'application/json',
                },
                timeout: 30000, // 30 second timeout
            });
            if (response.data.success) {
                const { updated_count } = response.data.data;
                console.log(`✓ Successfully updated ${updated_count} interview(s)`);
                if (updated_count > 0) {
                    console.log('Updated interviews:', response.data.data.updated_interviews);
                }
            }
            else {
                console.error('✗ Auto-update failed:', response.data.message);
            }
        }
        catch (error) {
            console.error('✗ Error during auto-update:', {
                message: error.message,
                code: error.code,
                response: error.response?.data,
            });
        }
    });
    console.log('✓ Cron job scheduled: Auto-update completed interviews (runs every day at 9 AM)');
};
/**
 * Schedule: Run every day at 12 AM (midnight)
 * Cron Expression: '0 0 * * *'
 *
 * This job checks for any jobs with:
 * - status = OPEN
 * - end_date < current time
 *
 * And updates them to:
 * - status = CLOSED
 * - approved = false
 */
const scheduleJobAutoClose = () => {
    node_cron_1.default.schedule('0 0 * * *', async () => {
        const now = new Date();
        console.log(`[${now.toISOString()}] Running auto-close for expired jobs...`);
        try {
            const response = await axios_1.default.patch(`${API_BASE_URL}/api/jobs/auto-close`, {}, {
                headers: {
                    'Content-Type': 'application/json',
                },
                timeout: 30000, // 30 second timeout
            });
            if (response.data.success) {
                const { closed_count, jobs_closed } = response.data.data;
                console.log(`✓ Successfully closed ${closed_count} expired job(s)`);
                if (closed_count > 0) {
                    console.log('Closed jobs:', jobs_closed);
                }
            }
            else {
                console.error('✗ Auto-close failed:', response.data.message);
            }
        }
        catch (error) {
            console.error('✗ Error during auto-close:', {
                message: error.message,
                code: error.code,
                response: error.response?.data,
            });
        }
    });
    console.log('✓ Cron job scheduled: Auto-close expired jobs (runs every day at 12 AM)');
};
/**
 * Manual trigger function for interview updates (for testing or admin use)
 */
const manualTriggerInterviewUpdate = async () => {
    console.log('Manually triggering interview auto-update...');
    try {
        const response = await axios_1.default.post(`${API_BASE_URL}/api/pipeline/auto-update-completed`);
        if (response.data.success) {
            console.log('✓ Manual trigger successful:', response.data.data);
        }
        else {
            console.error('✗ Manual trigger failed:', response.data.message);
        }
    }
    catch (error) {
        console.error('✗ Error during manual trigger:', error.message);
        throw error;
    }
};
exports.manualTriggerInterviewUpdate = manualTriggerInterviewUpdate;
/**
 * Manual trigger function for job auto-close (for testing or admin use)
 */
const manualTriggerJobAutoClose = async () => {
    console.log('Manually triggering job auto-close...');
    try {
        const response = await axios_1.default.patch(`${API_BASE_URL}/api/jobs/auto-close`);
        if (response.data.success) {
            console.log('✓ Manual trigger successful:', response.data.data);
        }
        else {
            console.error('✗ Manual trigger failed:', response.data.message);
        }
    }
    catch (error) {
        console.error('✗ Error during manual trigger:', error.message);
        throw error;
    }
};
exports.manualTriggerJobAutoClose = manualTriggerJobAutoClose;
// Initialize cron jobs
const initializeCronJobs = () => {
    console.log('='.repeat(60));
    console.log('INITIALIZING CRON JOBS');
    console.log('='.repeat(60));
    scheduleInterviewAutoUpdate();
    scheduleJobAutoClose();
    console.log('='.repeat(60));
    console.log('All cron jobs initialized successfully');
    console.log('='.repeat(60));
};
exports.initializeCronJobs = initializeCronJobs;
// Export for use in main application
exports.default = exports.initializeCronJobs;
/**
 * USAGE IN MAIN APPLICATION (server.ts or app.ts):
 *
 * import initializeCronJobs from './jobs/cronJobs';
 *
 * // After setting up Express app and routes
 * app.listen(PORT, () => {
 *   console.log(`Server running on port ${PORT}`);
 *   initializeCronJobs(); // Start cron jobs
 * });
 */ 
//# sourceMappingURL=cronJobService.js.map
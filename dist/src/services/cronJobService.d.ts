/**
 * Manual trigger function for interview updates (for testing or admin use)
 */
export declare const manualTriggerInterviewUpdate: () => Promise<void>;
/**
 * Manual trigger function for job auto-close (for testing or admin use)
 */
export declare const manualTriggerJobAutoClose: () => Promise<void>;
export declare const initializeCronJobs: () => void;
export default initializeCronJobs;
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
//# sourceMappingURL=cronJobService.d.ts.map
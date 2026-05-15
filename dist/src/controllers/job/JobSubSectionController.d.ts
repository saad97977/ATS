import { Request, Response } from 'express';
/**
 * Returns paginated applications for a specific job.
 *
 * Query filters:
 *   status         ApplicationStatus   (APPLIED | SCREENED | OFFERED | HIRED)
 *   source         string              partial match
 *   search         string              searches applicant full_name / email
 *   applied_from   ISO date            applied_at >= date
 *   applied_to     ISO date            applied_at <= date
 *   sort_by        field name          (applied_at | status | full_name) default: applied_at
 *   sort_dir       asc | desc          default: desc
 */
export declare const getJobApplications: (req: Request, res: Response) => Promise<void>;
/**
 * Returns aggregate counts broken down by ApplicationStatus.
 * Cheap widget-level call — no pagination needed.
 */
export declare const getJobApplicationsCounts: (req: Request, res: Response) => Promise<void>;
/**
 * Returns applicants who have a PipelineStage record linked to this job.
 *
 * Query filters:
 *   stage          PipelineStageName  (PIPELINED | INTERVIEWED | ONBOARDED)
 *   search         string             full_name / email
 *   from_date      ISO date           pipeline_date >=
 *   to_date        ISO date           pipeline_date <=
 *   sort_by        pipeline_date | full_name | stage_name   default: pipeline_date
 *   sort_dir       asc | desc         default: desc
 */
export declare const getJobPipelinedApplicants: (req: Request, res: Response) => Promise<void>;
export declare const getJobPipelineCounts: (req: Request, res: Response) => Promise<void>;
/**
 * Returns workers who have been placed (have an Assignment) for this job.
 *
 * Query filters:
 *   employment_type  EmploymentType  (W2 | 1099)
 *   search           string          full_name / email
 *   start_from       ISO date        start_date >=
 *   start_to         ISO date        start_date <=
 *   end_from         ISO date        end_date >=
 *   end_to           ISO date        end_date <=
 *   active_only      boolean         omit ended assignments
 *   falloff          boolean         filter by falloff flag
 *   sort_by          start_date | full_name | employment_type   default: start_date
 *   sort_dir         asc | desc      default: desc
 */
export declare const getJobAssignments: (req: Request, res: Response) => Promise<void>;
export declare const getJobAssignmentCounts: (req: Request, res: Response) => Promise<void>;
/**
 * Returns paginated timesheets for all assignments under this job.
 *
 * Query filters:
 *   status         TimesheetStatus   (DRAFT|SUBMITTED|UNDER_REVIEW|APPROVED|REJECTED|PROCESSED)
 *   search         string            applicant full_name / email
 *   week_from      ISO date          week_start_date >=
 *   week_to        ISO date          week_start_date <=
 *   assignment_id  UUID              narrow to one worker
 *   qb_synced      boolean
 *   sort_by        week_start_date | status | total_hours | total_bill_amount  default: week_start_date
 *   sort_dir       asc | desc        default: desc
 */
export declare const getJobTimesheets: (req: Request, res: Response) => Promise<void>;
export declare const getJobTimesheetCounts: (req: Request, res: Response) => Promise<void>;
/**
 * Returns day-level time entries for a specific timesheet,
 * verifying the timesheet belongs to this job.
 *
 * Query filters:
 *   work_type    WorkType   (REGULAR|OVERTIME|HOLIDAY|SICK|PTO|UNPAID)
 *   from_date    ISO date   work_date >=
 *   to_date      ISO date   work_date <=
 */
export declare const getTimesheetEntries: (req: Request, res: Response) => Promise<void>;
/**
 * Single call that returns all sub-section counts in parallel.
 * Ideal for populating badge numbers on tabs.
 */
export declare const getJobOverview: (req: Request, res: Response) => Promise<void>;
/**
 * Returns paginated interviews for all applications under this job.
 *
 * Query filters:
 *   status         InterviewStatus   (PENDING|COMPLETED_RESULT_PENDING|REJECTED|ACCEPTED)
 *   interview_type InterviewType     (ONLINE|OFFLINE)
 *   round          number
 *   search         string            applicant full_name / email
 *   from_date      ISO date          interview_date >=
 *   to_date        ISO date          interview_date <=
 *   sort_by        interview_date | round | status   default: interview_date
 *   sort_dir       asc | desc        default: desc
 */
export declare const getJobInterviews: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=JobSubSectionController.d.ts.map
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyEmailConfiguration = exports.sendOnboardingWelcomeEmail = exports.sendOfferLetterEmail = exports.sendInterviewRejectionEmail = exports.sendInterviewRescheduleEmail = exports.sendInterviewInvitationEmail = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
/**
 * Email Service
 *
 * ─── TIMEZONE CONFIGURATION ───────────────────────────────────────────────────
 * Change TIMEZONE_OFFSET_HOURS to shift all displayed dates in emails.
 * Examples:
 *   -5   → EST  (Eastern Standard Time)
 *   -4   → EDT  (Eastern Daylight Time)
 *    0   → UTC
 *   +5   → PKT  (Pakistan Standard Time)
 *   +5.5 → IST  (India Standard Time)
 * ─────────────────────────────────────────────────────────────────────────────
 */
const TIMEZONE_OFFSET_HOURS = -5;
/** Label appended to times in emails e.g. "EST", "UTC", "PKT" */
const TIMEZONE_LABEL = 'EST';
// ─────────────────────────────────────────────────────────────────────────────
const createTransporter = () => {
    return nodemailer_1.default.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: false,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD,
        },
    });
};
// ─── Date Formatting Helpers ──────────────────────────────────────────────────
const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const pad = (n) => String(n).padStart(2, '0');
/**
 * Shifts a UTC Date by TIMEZONE_OFFSET_HOURS and returns a plain object
 * with adjusted year / month / day / weekday / hours / minutes.
 * All arithmetic is done in UTC so the result is independent of the
 * server's local timezone.
 */
const toOffsetParts = (d) => {
    const offsetMs = TIMEZONE_OFFSET_HOURS * 60 * 60 * 1000;
    const shifted = new Date(d.getTime() + offsetMs);
    return {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth(), // 0-based
        day: shifted.getUTCDate(),
        weekday: shifted.getUTCDay(), // 0 = Sunday
        hours: shifted.getUTCHours(),
        minutes: shifted.getUTCMinutes(),
    };
};
/** "Monday, March 17, 2025" */
const fmtDate = (d) => {
    const p = toOffsetParts(d);
    return `${DAYS[p.weekday]}, ${MONTHS[p.month]} ${pad(p.day)}, ${p.year}`;
};
/** "10:26 PM (EST)" */
const fmtTime = (d) => {
    const p = toOffsetParts(d);
    const ampm = p.hours >= 12 ? 'PM' : 'AM';
    const h12 = p.hours % 12 || 12;
    return `${h12}:${pad(p.minutes)} ${ampm} (${TIMEZONE_LABEL})`;
};
/** "Monday, March 17, 2025 at 10:26 PM (EST)" */
const fmtDateTime = (d) => `${fmtDate(d)} at ${fmtTime(d)}`;
/** "W2 Employee" | "1099 Contractor" */
const fmtEmploymentType = (type) => ({ W2: 'W2 Employee', CONTRACTOR_1099: '1099 Contractor' }[type] ?? type);
// ─── Base Templates ──────────────────────────────────────────────────────────
const generateBaseEmailHTML = (data) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${data.subject}</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5; }
        .email-container { background-color: #ffffff; border: 1px solid #dddddd; }
        .header { background-color: #f8f9fa; padding: 20px; border-bottom: 2px solid #e9ecef; }
        .header h2 { margin: 0; font-size: 20px; color: #212529; font-weight: 600; }
        .content { padding: 30px 20px; }
        .content p { margin: 15px 0; font-size: 14px; color: #495057; }
        .info-box { background-color: #f8f9fa; border-left: 3px solid #6c757d; padding: 15px; margin: 20px 0; }
        .info-box p { margin: 8px 0; font-size: 14px; }
        .info-box strong { color: #212529; }
        .footer { background-color: #f8f9fa; padding: 20px; border-top: 1px solid #e9ecef; text-align: center; }
        .footer p { margin: 5px 0; font-size: 12px; color: #6c757d; }
        .signature { margin-top: 30px; font-size: 14px; }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header"><h2>${data.organizationName}</h2></div>
        <div class="content">
            <p>Dear ${data.applicantName},</p>
            ${data.content}
            <div class="signature">
                <p>Best regards,</p>
                <p><strong>${data.organizationName} Hiring Team</strong></p>
            </div>
        </div>
        <div class="footer">
            <p>This is an automated notification. Please do not reply to this email.</p>
            <p>© ${new Date().getUTCFullYear()} ${data.organizationName}. All rights reserved.</p>
        </div>
    </div>
</body>
</html>`;
const generateBaseEmailText = (data) => `Dear ${data.applicantName},

${data.content}

Best regards,
${data.organizationName} Hiring Team

---
This is an automated notification.
© ${new Date().getUTCFullYear()} ${data.organizationName}. All rights reserved.`;
// ─── Email Senders ───────────────────────────────────────────────────────────
const sendInterviewInvitationEmail = async (data) => {
    try {
        const content = `
      <p>We are pleased to invite you for an interview for the position of <strong>${data.jobTitle}</strong>.</p>

      <div class="info-box">
        <p><strong>Position:</strong> ${data.jobTitle}</p>
        <p><strong>Date:</strong> ${fmtDate(data.interviewDate)}</p>
        <p><strong>Time:</strong> ${fmtTime(data.interviewDate)}</p>
        <p><strong>Location:</strong> ${data.location}</p>
        ${data.organizationWebsite ? `<p><strong>Company Website:</strong> <a href="${data.organizationWebsite}">${data.organizationWebsite}</a></p>` : ''}
      </div>

      <p><strong>What to bring:</strong></p>
      <ul>
        <li>A copy of your resume</li>
        <li>Valid photo identification</li>
        <li>Any relevant certificates or portfolio materials</li>
      </ul>

      <p><strong>Please note:</strong></p>
      <ul>
        <li>Arrive 10–15 minutes early</li>
        <li>Dress professionally</li>
        <li>If you need to reschedule, contact us as soon as possible</li>
      </ul>

      ${data.contactEmail || data.contactPhone ? `
      <p><strong>Contact Information:</strong></p>
      <p>
        ${data.contactEmail ? `Email: ${data.contactEmail}<br>` : ''}
        ${data.contactPhone ? `Phone: ${data.contactPhone}` : ''}
      </p>` : ''}

      <p>We look forward to meeting you.</p>
    `;
        const transporter = createTransporter();
        const info = await transporter.sendMail({
            from: { name: data.organizationName, address: process.env.SMTP_USER || 'noreply@company.com' },
            to: data.applicantEmail,
            subject: `Interview Invitation - ${data.jobTitle}`,
            text: generateBaseEmailText({ applicantName: data.applicantName, organizationName: data.organizationName, content: content.replace(/<[^>]*>/g, '').trim() }),
            html: generateBaseEmailHTML({ applicantName: data.applicantName, organizationName: data.organizationName, subject: 'Interview Invitation', content }),
        });
        return { success: true, messageId: info.messageId };
    }
    catch (error) {
        console.error('Error sending interview invitation email:', error);
        return { success: false, error: error.message || 'Failed to send email' };
    }
};
exports.sendInterviewInvitationEmail = sendInterviewInvitationEmail;
const sendInterviewRescheduleEmail = async (data) => {
    try {
        const content = `
      <p>Your interview for the position of <strong>${data.jobTitle}</strong> has been rescheduled.</p>

      <div class="info-box">
        <p><strong>Previous Date:</strong> ${fmtDateTime(data.oldDate)}</p>
        <p style="color: #dc3545;"><strong>New Date:</strong> ${fmtDate(data.newDate)}</p>
        <p style="color: #dc3545;"><strong>New Time:</strong> ${fmtTime(data.newDate)}</p>
        <p><strong>Location:</strong> ${data.location}</p>
      </div>

      <p>We apologize for any inconvenience this may cause. If the new time does not work for you, please contact us immediately.</p>
      <p>We look forward to meeting you at the rescheduled time.</p>
    `;
        const transporter = createTransporter();
        const info = await transporter.sendMail({
            from: { name: data.organizationName, address: process.env.SMTP_USER || 'noreply@company.com' },
            to: data.applicantEmail,
            subject: `Interview Rescheduled - ${data.jobTitle}`,
            text: generateBaseEmailText({ applicantName: data.applicantName, organizationName: data.organizationName, content: content.replace(/<[^>]*>/g, '').trim() }),
            html: generateBaseEmailHTML({ applicantName: data.applicantName, organizationName: data.organizationName, subject: 'Interview Rescheduled', content }),
        });
        return { success: true, messageId: info.messageId };
    }
    catch (error) {
        console.error('Error sending reschedule email:', error);
        return { success: false, error: error.message || 'Failed to send email' };
    }
};
exports.sendInterviewRescheduleEmail = sendInterviewRescheduleEmail;
const sendInterviewRejectionEmail = async (data) => {
    try {
        const content = `
      <p>Thank you for your interest in the <strong>${data.jobTitle}</strong> position and for taking the time to interview with us.</p>
      <p>After careful consideration, we have decided to move forward with other candidates whose qualifications more closely match our current needs.</p>
      <p>We appreciate your interest in ${data.organizationName} and encourage you to apply for future openings that match your skills and experience.</p>
      <p>We wish you the best in your job search and future professional endeavors.</p>
    `;
        const transporter = createTransporter();
        const info = await transporter.sendMail({
            from: { name: data.organizationName, address: process.env.SMTP_USER || 'noreply@company.com' },
            to: data.applicantEmail,
            subject: `Application Status - ${data.jobTitle}`,
            text: generateBaseEmailText({ applicantName: data.applicantName, organizationName: data.organizationName, content: content.replace(/<[^>]*>/g, '').trim() }),
            html: generateBaseEmailHTML({ applicantName: data.applicantName, organizationName: data.organizationName, subject: 'Interview Status Update', content }),
        });
        return { success: true, messageId: info.messageId };
    }
    catch (error) {
        console.error('Error sending rejection email:', error);
        return { success: false, error: error.message || 'Failed to send email' };
    }
};
exports.sendInterviewRejectionEmail = sendInterviewRejectionEmail;
const sendOfferLetterEmail = async (data) => {
    try {
        const content = `
      <p>Congratulations! We are pleased to extend an offer for the position of <strong>${data.jobTitle}</strong> at ${data.organizationName}.</p>

      <div class="info-box">
        <p><strong>Position:</strong> ${data.jobTitle}</p>
        <p><strong>Company:</strong> ${data.organizationName}</p>
      </div>

      <p>Your skills and experience impressed us, and we believe you will be a valuable addition to our team.</p>
      <p>Our HR team will contact you shortly with the formal offer letter and next steps for onboarding.</p>
      <p>We look forward to having you join our team!</p>
    `;
        const transporter = createTransporter();
        const info = await transporter.sendMail({
            from: { name: data.organizationName, address: process.env.SMTP_USER || 'noreply@company.com' },
            to: data.applicantEmail,
            subject: `Job Offer - ${data.jobTitle} at ${data.organizationName}`,
            text: generateBaseEmailText({ applicantName: data.applicantName, organizationName: data.organizationName, content: content.replace(/<[^>]*>/g, '').trim() }),
            html: generateBaseEmailHTML({ applicantName: data.applicantName, organizationName: data.organizationName, subject: 'Job Offer', content }),
        });
        return { success: true, messageId: info.messageId };
    }
    catch (error) {
        console.error('Error sending offer email:', error);
        return { success: false, error: error.message || 'Failed to send email' };
    }
};
exports.sendOfferLetterEmail = sendOfferLetterEmail;
const sendOnboardingWelcomeEmail = async (data) => {
    try {
        const content = `
      <p>Welcome to ${data.organizationName}! We are thrilled to have you join our team as <strong>${data.jobTitle}</strong>.</p>

      <div class="info-box">
        <p><strong>Position:</strong> ${data.jobTitle}</p>
        <p><strong>Company:</strong> ${data.organizationName}</p>
        <p><strong>Employment Type:</strong> ${fmtEmploymentType(data.employmentType)}</p>
        <p><strong>Start Date:</strong> ${fmtDate(data.startDate)}</p>
        <p><strong>End Date:</strong> ${data.endDate ? fmtDate(data.endDate) : 'Open-ended'}</p>
        ${data.workersCompCode ? `<p><strong>Workers' Comp Code:</strong> ${data.workersCompCode}</p>` : ''}
      </div>

      <p><strong>Next Steps:</strong></p>
      <ul>
        <li>Our HR team will contact you with detailed onboarding instructions</li>
        <li>Documentation and paperwork will be sent separately before your start date</li>
        <li>Details about orientation and training will follow shortly</li>
        <li>Please ensure all required documents are ready prior to <strong>${fmtDate(data.startDate)}</strong></li>
      </ul>

      <p>If you have any questions before your start date, please don't hesitate to reach out to our HR department.</p>
      <p>We look forward to working with you!</p>
    `;
        const transporter = createTransporter();
        const info = await transporter.sendMail({
            from: { name: data.organizationName, address: process.env.SMTP_USER || 'noreply@company.com' },
            to: data.applicantEmail,
            subject: `Welcome to ${data.organizationName}!`,
            text: generateBaseEmailText({ applicantName: data.applicantName, organizationName: data.organizationName, content: content.replace(/<[^>]*>/g, '').trim() }),
            html: generateBaseEmailHTML({ applicantName: data.applicantName, organizationName: data.organizationName, subject: 'Welcome to the Team', content }),
        });
        return { success: true, messageId: info.messageId };
    }
    catch (error) {
        console.error('Error sending onboarding email:', error);
        return { success: false, error: error.message || 'Failed to send email' };
    }
};
exports.sendOnboardingWelcomeEmail = sendOnboardingWelcomeEmail;
const verifyEmailConfiguration = async () => {
    try {
        const transporter = createTransporter();
        await transporter.verify();
        console.log('✅ Email server is ready to send messages');
        return true;
    }
    catch (error) {
        console.error('❌ Email server configuration error:', error);
        return false;
    }
};
exports.verifyEmailConfiguration = verifyEmailConfiguration;
exports.default = {
    sendInterviewInvitationEmail: exports.sendInterviewInvitationEmail,
    sendInterviewRescheduleEmail: exports.sendInterviewRescheduleEmail,
    sendInterviewRejectionEmail: exports.sendInterviewRejectionEmail,
    sendOfferLetterEmail: exports.sendOfferLetterEmail,
    sendOnboardingWelcomeEmail: exports.sendOnboardingWelcomeEmail,
    verifyEmailConfiguration: exports.verifyEmailConfiguration,
};
//# sourceMappingURL=emailService.js.map
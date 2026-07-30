"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendClientInvoiceEmail = exports.sendCustomStageEmail = exports.sendNewApplicationEmail = exports.sendDocumentExpiryReminderEmail = exports.sendAssignmentNotificationEmail = exports.sendOnboardingWelcomeEmail = exports.verifyEmailConfiguration = exports.sendOfferLetterEmail = exports.sendInterviewRejectionEmail = exports.sendInterviewRescheduleEmail = exports.sendInterviewInvitationEmail = void 0;
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
const toOffsetParts = (d) => {
    const offsetMs = TIMEZONE_OFFSET_HOURS * 60 * 60 * 1000;
    const shifted = new Date(d.getTime() + offsetMs);
    return {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth(),
        day: shifted.getUTCDate(),
        weekday: shifted.getUTCDay(),
        hours: shifted.getUTCHours(),
        minutes: shifted.getUTCMinutes(),
    };
};
const fmtDate = (d) => {
    const p = toOffsetParts(d);
    return `${DAYS[p.weekday]}, ${MONTHS[p.month]} ${pad(p.day)}, ${p.year}`;
};
const fmtTime = (d) => {
    const p = toOffsetParts(d);
    const ampm = p.hours >= 12 ? 'PM' : 'AM';
    const h12 = p.hours % 12 || 12;
    return `${h12}:${pad(p.minutes)} ${ampm} (${TIMEZONE_LABEL})`;
};
const fmtDateTime = (d) => `${fmtDate(d)} at ${fmtTime(d)}`;
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
        .badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
        .badge-online { background-color: #dbeafe; color: #1d4ed8; }
        .badge-offline { background-color: #fef3c7; color: #92400e; }
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
        const roundLabel = data.round ? ` – Round ${data.round}` : '';
        const totalRounds = data.totalRounds ?? (data.round ? data.round : undefined);
        const roundNote = data.round
            ? `<p>This is your <strong>Round ${data.round}${totalRounds && totalRounds > 1 ? ` of ${totalRounds}` : ''}</strong> interview invitation.</p>`
            : '';
        const interviewType = data.interviewType || 'ONLINE';
        const typeLabel = interviewType === 'ONLINE' ? 'Online (Virtual)' : 'In-Person (On-site)';
        const typeBadgeClass = interviewType === 'ONLINE' ? 'badge-online' : 'badge-offline';
        const typeNote = interviewType === 'ONLINE'
            ? '<p>A video conference link or dial-in details will be shared separately.</p>'
            : '<p>Please arrive at the location on time. Parking or directions will be shared if needed.</p>';
        const content = `
      <p>We are pleased to invite you for an interview for the position of <strong>${data.jobTitle}</strong>.</p>

      ${roundNote}

      <div class="info-box">
        <p><strong>Position:</strong> ${data.jobTitle}</p>
        ${data.round ? `<p><strong>Interview Round:</strong> Round ${data.round}${totalRounds && totalRounds > 1 ? ` of ${totalRounds}` : ''}</p>` : ''}
        <p><strong>Format:</strong> <span class="badge ${typeBadgeClass}">${typeLabel}</span></p>
        <p><strong>Date:</strong> ${fmtDate(data.interviewDate)}</p>
        <p><strong>Time:</strong> ${fmtTime(data.interviewDate)}</p>
        ${interviewType === 'OFFLINE' ? `<p><strong>Location:</strong> ${data.location}</p>` : ''}
        ${data.organizationWebsite ? `<p><strong>Company Website:</strong> <a href="${data.organizationWebsite}">${data.organizationWebsite}</a></p>` : ''}
      </div>

      ${typeNote}

      <p><strong>What to prepare:</strong></p>
      <ul>
        <li>A copy of your resume</li>
        <li>Valid photo identification</li>
        <li>Any relevant certificates or portfolio materials</li>
      </ul>

      <p><strong>Please note:</strong></p>
      <ul>
        ${interviewType === 'OFFLINE' ? '<li>Arrive 10–15 minutes early</li>' : '<li>Join the video call 5 minutes early to test your connection</li>'}
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
            subject: `Interview Invitation${roundLabel} - ${data.jobTitle}`,
            text: generateBaseEmailText({ applicantName: data.applicantName, organizationName: data.organizationName, content: content.replace(/<[^>]*>/g, '').trim() }),
            html: generateBaseEmailHTML({ applicantName: data.applicantName, organizationName: data.organizationName, subject: `Interview Invitation${roundLabel}`, content }),
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
// ══════════════════════════════════════════════════════════════════════════════
//  sendOnboardingWelcomeEmail  (UPDATED — adds attachments + docs list)
// ══════════════════════════════════════════════════════════════════════════════
const sendOnboardingWelcomeEmail = async (data) => {
    try {
        const wcSection = data.workersCompCodes?.length
            ? `<p><strong>Workers' Comp Classification${data.workersCompCodes.length > 1 ? 's' : ''}:</strong>
         ${data.workersCompCodes.map(w => `<span style="display:inline-block;margin-right:8px;font-size:13px">
             <strong>${w.code}</strong>${w.description ? ` — ${w.description}` : ''} (${w.pct}%)
           </span>`).join('')}</p>`
            : '';
        const docsSection = data.uploadedDocuments?.length
            ? `
      <p style="margin-top:20px"><strong>Documents included with this email:</strong></p>
      <ul style="margin:8px 0 0;padding-left:20px">
        ${data.uploadedDocuments
                .map(d => `<li style="margin-bottom:4px;font-size:13px">
            <strong>${d.document_name}</strong>
            <span style="color:#6c757d;font-size:11px;margin-left:6px">${d.document_type.replace(/_/g, ' ')}</span>
          </li>`)
                .join('')}
      </ul>
      <p style="font-size:12px;color:#6c757d;margin-top:6px">
        Please review and complete any forms that require your signature.
        Contact our HR team if you have questions.
      </p>`
            : '';
        const content = `
      <p>Welcome to <strong>${data.organizationName}</strong>!
         We are thrilled to have you join our team as <strong>${data.jobTitle}</strong>.</p>

      <div class="info-box">
        <p><strong>Position:</strong> ${data.jobTitle}</p>
        <p><strong>Company:</strong> ${data.organizationName}</p>
        <p><strong>Employment Type:</strong> ${fmtEmploymentType(data.employmentType)}</p>
        <p><strong>Start Date:</strong> ${fmtDate(data.startDate)}</p>
        <p><strong>End Date:</strong> ${data.endDate ? fmtDate(data.endDate) : 'Open-ended'}</p>
      </div>

      ${wcSection}
      ${docsSection}

      <p style="margin-top:20px"><strong>Next Steps:</strong></p>
      <ul>
        <li>Review and complete any attached forms (W-4, I-9, direct deposit) and return them to HR</li>
        <li>Our HR team will contact you with detailed onboarding instructions</li>
        <li>Details about orientation and first-day logistics will follow shortly</li>
        <li>Ensure all required documents are ready before <strong>${fmtDate(data.startDate)}</strong></li>
      </ul>

      <p>If you have any questions before your start date, please reach out to our HR department.</p>
      <p>We look forward to working with you!</p>
    `;
        const transporter = createTransporter();
        const info = await transporter.sendMail({
            from: { name: data.organizationName, address: process.env.SMTP_USER || 'noreply@company.com' },
            to: data.applicantEmail,
            subject: `Welcome to ${data.organizationName} — ${data.jobTitle}`,
            text: generateBaseEmailText({ applicantName: data.applicantName, organizationName: data.organizationName, content: content.replace(/<[^>]*>/g, '').trim() }),
            html: generateBaseEmailHTML({ applicantName: data.applicantName, organizationName: data.organizationName, subject: 'Welcome to the Team', content }),
            attachments: (data.attachments || []).map(a => ({
                filename: a.filename,
                content: a.content,
                contentType: a.contentType,
            })),
        });
        return { success: true, messageId: info.messageId };
    }
    catch (error) {
        console.error('Error sending onboarding welcome email:', error);
        return { success: false, error: error.message || 'Failed to send email' };
    }
};
exports.sendOnboardingWelcomeEmail = sendOnboardingWelcomeEmail;
// ══════════════════════════════════════════════════════════════════════════════
//  sendAssignmentNotificationEmail  (NEW — credit user + representative)
// ══════════════════════════════════════════════════════════════════════════════
const sendAssignmentNotificationEmail = async (data) => {
    try {
        const codesTable = data.companyCodes.map(c => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #e9ecef;font-size:13px;font-weight:600">${c.code}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e9ecef;font-size:13px;color:#495057">${c.description || '—'}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e9ecef;font-size:13px;text-align:right">${c.allocation_pct}%</td>
      </tr>`).join('');
        const docsSection = data.uploadedDocuments.length
            ? `
      <p style="margin-top:20px"><strong>Onboarding Documents (${data.uploadedDocuments.length}):</strong></p>
      <ul style="margin:8px 0 0;padding-left:20px">
        ${data.uploadedDocuments.map(d => `
          <li style="margin-bottom:4px;font-size:13px">
            <strong>${d.document_name}</strong>
            <span style="color:#6c757d;font-size:11px;margin-left:6px">${d.document_type.replace(/_/g, ' ')}</span>
            ${d.send_to_candidate ? '<span style="color:#166534;font-size:10px;margin-left:4px">[sent to candidate]</span>' : ''}
          </li>`).join('')}
      </ul>`
            : '';
        // Build raw text content for plaintext fallback
        const rawContent = `
A new candidate has been onboarded. Here are the assignment details:

Candidate: ${data.applicantName} (${data.applicantEmail})
Position:  ${data.jobTitle} at ${data.organizationName}
Start Date: ${fmtDate(data.startDate)}
End Date:   ${data.endDate ? fmtDate(data.endDate) : 'Open-ended'}
Employment Type: ${fmtEmploymentType(data.employmentType)}

Company Codes:
${data.companyCodes.map(c => `  ${c.code} — ${c.description || 'N/A'} (${c.allocation_pct}%)`).join('\n')}

Your role: ${data.role}

${data.uploadedDocuments.length ? `Documents:\n${data.uploadedDocuments.map(d => `  • ${d.document_name} (${d.document_type})`).join('\n')}` : ''}
    `.trim();
        const htmlContent = `
      <p>A new candidate has been successfully onboarded. As the <strong>${data.role}</strong>
         for this assignment, please find the full details below.</p>

      <div class="info-box">
        <p><strong>Candidate:</strong>
           ${data.applicantName}
           ${data.applicantEmail ? `<a href="mailto:${data.applicantEmail}" style="color:#0369a1;font-size:12px;margin-left:4px">${data.applicantEmail}</a>` : ''}</p>
        <p><strong>Position:</strong> ${data.jobTitle}</p>
        <p><strong>Organization:</strong> ${data.organizationName}</p>
        <p><strong>Employment Type:</strong> ${fmtEmploymentType(data.employmentType)}</p>
        <p><strong>Start Date:</strong> ${fmtDate(data.startDate)}</p>
        <p><strong>End Date:</strong> ${data.endDate ? fmtDate(data.endDate) : 'Open-ended'}</p>
      </div>

      <p style="margin-top:20px"><strong>Company Code Allocation:</strong></p>
      <table style="width:100%;border-collapse:collapse;margin-top:8px;border:1px solid #e9ecef;border-radius:6px;overflow:hidden">
        <thead>
          <tr style="background:#f8f9fa">
            <th style="padding:8px 10px;text-align:left;font-size:12px;color:#6c757d;font-weight:700;border-bottom:2px solid #e9ecef">Code</th>
            <th style="padding:8px 10px;text-align:left;font-size:12px;color:#6c757d;font-weight:700;border-bottom:2px solid #e9ecef">Description</th>
            <th style="padding:8px 10px;text-align:right;font-size:12px;color:#6c757d;font-weight:700;border-bottom:2px solid #e9ecef">Allocation</th>
          </tr>
        </thead>
        <tbody>${codesTable}</tbody>
      </table>

      ${docsSection}

      <p style="margin-top:20px">All attached documents have been stored in the candidate's onboarding file.
         Please ensure payroll and billing are set up accordingly.</p>
    `;
        const transporter = createTransporter();
        const info = await transporter.sendMail({
            from: { name: data.organizationName, address: process.env.SMTP_USER || 'noreply@company.com' },
            to: data.recipientEmail,
            subject: `[Assignment Notification] ${data.applicantName} onboarded — ${data.jobTitle}`,
            text: generateBaseEmailText({
                applicantName: data.recipientName,
                organizationName: data.organizationName,
                content: rawContent,
            }),
            html: generateBaseEmailHTML({
                applicantName: data.recipientName,
                organizationName: data.organizationName,
                subject: `Assignment Notification — ${data.applicantName}`,
                content: htmlContent,
            }),
            attachments: (data.attachments || []).map(a => ({
                filename: a.filename,
                content: a.content,
                contentType: a.contentType,
            })),
        });
        return { success: true, messageId: info.messageId };
    }
    catch (error) {
        console.error('Error sending assignment notification email:', error);
        return { success: false, error: error.message || 'Failed to send email' };
    }
};
exports.sendAssignmentNotificationEmail = sendAssignmentNotificationEmail;
// ─── Document Expiry Reminder ────────────────────────────────────────────────
const sendDocumentExpiryReminderEmail = async (data) => {
    try {
        const isOverdue = data.daysLeft < 0;
        const absDays = Math.abs(data.daysLeft);
        // Urgency label & colors
        let urgencyLabel;
        let urgencyColor;
        let bannerBg;
        if (isOverdue) {
            urgencyLabel = `OVERDUE by ${absDays} day${absDays !== 1 ? 's' : ''}`;
            urgencyColor = '#991b1b';
            bannerBg = '#fee2e2';
        }
        else if (data.daysLeft <= 15) {
            urgencyLabel = `${data.daysLeft} day${data.daysLeft !== 1 ? 's' : ''} remaining`;
            urgencyColor = '#991b1b';
            bannerBg = '#fee2e2';
        }
        else if (data.daysLeft <= 45) {
            urgencyLabel = `${data.daysLeft} days remaining`;
            urgencyColor = '#9a3412';
            bannerBg = '#ffedd5';
        }
        else {
            urgencyLabel = `${data.daysLeft} days remaining`;
            urgencyColor = '#713f12';
            bannerBg = '#fef9c3';
        }
        const subject = isOverdue
            ? `[OVERDUE] Document expired: ${data.documentName}`
            : `[Action Required] Document expiring in ${data.daysLeft} days: ${data.documentName}`;
        const rawContent = `
${isOverdue ? 'URGENT: The following document has EXPIRED and requires immediate attention.' : 'This is a reminder that the following document is expiring soon.'}

Document:      ${data.documentName}
Type:          ${data.documentType}
Category:      ${data.documentTitle}
Organization:  ${data.organizationName}
Expiry Date:   ${fmtDate(data.expirationDate)}
Status:        ${urgencyLabel}
${data.expirationReason ? `Reason:        ${data.expirationReason}` : ''}

Please take action to renew this document as soon as possible.
    `.trim();
        const htmlContent = `
      <p>${isOverdue
            ? '<strong style="color:#991b1b">URGENT:</strong> The following document has <strong>expired</strong> and requires immediate attention.'
            : 'This is a reminder that the following document is expiring soon and requires renewal.'}</p>

      <div style="background:${bannerBg};border-left:4px solid ${urgencyColor};padding:14px 18px;margin:20px 0;border-radius:4px">
        <p style="margin:0;font-size:16px;font-weight:700;color:${urgencyColor}">${urgencyLabel}</p>
      </div>

      <div class="info-box">
        <p><strong>Document:</strong> ${data.documentName}</p>
        <p><strong>Type:</strong> ${data.documentType}</p>
        <p><strong>Category:</strong> ${data.documentTitle}</p>
        <p><strong>Organization:</strong> ${data.organizationName}</p>
        <p><strong>Expiry Date:</strong> ${fmtDate(data.expirationDate)}</p>
        ${data.expirationReason ? `<p><strong>Reason / Notes:</strong> ${data.expirationReason}</p>` : ''}
      </div>

      <p>Please log in to the portal and upload the renewed document at your earliest convenience${isOverdue ? ' — this document is already past its expiry date' : ''}.</p>
    `;
        const transporter = createTransporter();
        const info = await transporter.sendMail({
            from: { name: data.organizationName, address: process.env.SMTP_USER || 'noreply@company.com' },
            to: data.recipientEmail,
            subject,
            text: generateBaseEmailText({
                applicantName: data.recipientName,
                organizationName: data.organizationName,
                content: rawContent,
            }),
            html: generateBaseEmailHTML({
                applicantName: data.recipientName,
                organizationName: data.organizationName,
                subject,
                content: htmlContent,
            }),
        });
        return { success: true, messageId: info.messageId };
    }
    catch (error) {
        console.error('Error sending document expiry reminder email:', error);
        return { success: false, error: error.message || 'Failed to send email' };
    }
};
exports.sendDocumentExpiryReminderEmail = sendDocumentExpiryReminderEmail;
// ─── New Application Submitted — Manager Notification ────────────────────────
const sendNewApplicationEmail = async (data) => {
    try {
        const htmlContent = `
      <p>A new application has been submitted for the position of <strong>${data.jobTitle}</strong>.</p>

      <div class="info-box">
        <p><strong>Applicant:</strong> ${data.applicantName}</p>
        <p><strong>Applicant Email:</strong> <a href="mailto:${data.applicantEmail}">${data.applicantEmail}</a></p>
        <p><strong>Position:</strong> ${data.jobTitle}</p>
        <p><strong>Organization:</strong> ${data.organizationName}</p>
        <p><strong>Application ID:</strong> ${data.applicationId}</p>
        <p><strong>Submitted At:</strong> ${fmtDateTime(new Date())}</p>
      </div>

      <p>Please log in to the ATS portal to review this application and take appropriate action.</p>
    `;
        const rawContent = `
A new application has been submitted for the position of ${data.jobTitle}.

Applicant:       ${data.applicantName}
Applicant Email: ${data.applicantEmail}
Position:        ${data.jobTitle}
Organization:    ${data.organizationName}
Application ID:  ${data.applicationId}
Submitted At:    ${fmtDateTime(new Date())}

Please log in to the ATS portal to review this application.
    `.trim();
        const transporter = createTransporter();
        const info = await transporter.sendMail({
            from: { name: data.organizationName, address: process.env.SMTP_USER || 'noreply@company.com' },
            to: data.managerEmail,
            subject: `New Application Received — ${data.jobTitle}`,
            text: generateBaseEmailText({
                applicantName: data.managerName,
                organizationName: data.organizationName,
                content: rawContent,
            }),
            html: generateBaseEmailHTML({
                applicantName: data.managerName,
                organizationName: data.organizationName,
                subject: `New Application — ${data.jobTitle}`,
                content: htmlContent,
            }),
        });
        return { success: true, messageId: info.messageId };
    }
    catch (error) {
        console.error('Error sending new application notification email:', error);
        return { success: false, error: error.message || 'Failed to send email' };
    }
};
exports.sendNewApplicationEmail = sendNewApplicationEmail;
const sendCustomStageEmail = async ({ to, subject, body, }) => {
    try {
        const transporter = createTransporter();
        const info = await transporter.sendMail({
            from: process.env.SMTP_USER,
            to,
            subject,
            html: body,
        });
        return { success: true, messageId: info.messageId };
    }
    catch (error) {
        return { success: false, error: error.message };
    }
};
exports.sendCustomStageEmail = sendCustomStageEmail;
// ─── Client Invoice Email ────────────────────────────────────────────────────
const sendClientInvoiceEmail = async (data) => {
    try {
        const money = (n) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const htmlContent = `
      <p>Please find your invoice from <strong>${data.organizationName}</strong> below.</p>
      <div class="info-box">
        <p><strong>Invoice Number:</strong> ${data.invoiceNumber}</p>
        <p><strong>Invoice Date:</strong> ${fmtDate(data.invoiceDate)}</p>
        <p><strong>Due Date:</strong> ${fmtDate(data.dueDate)}</p>
        <p><strong>Total Amount Due:</strong> ${money(data.totalAmount)}</p>
      </div>
      ${data.pdfUrl
            ? `<p><a href="${data.pdfUrl}" style="color:#0369a1;font-weight:600">View / Download Invoice PDF</a></p>`
            : '<p>Your invoice PDF is being finalized and will be available shortly.</p>'}
      <p>Please remit payment by the due date above. Contact us with any questions.</p>
    `;
        const rawContent = `
Invoice Number: ${data.invoiceNumber}
Invoice Date:   ${fmtDate(data.invoiceDate)}
Due Date:       ${fmtDate(data.dueDate)}
Total Due:      ${money(data.totalAmount)}
${data.pdfUrl ? `\nDownload: ${data.pdfUrl}` : ''}
    `.trim();
        const transporter = createTransporter();
        const info = await transporter.sendMail({
            from: { name: data.organizationName, address: process.env.SMTP_USER || 'noreply@company.com' },
            to: data.organizationEmail,
            subject: `Invoice ${data.invoiceNumber} from ${data.organizationName}`,
            text: generateBaseEmailText({ applicantName: data.organizationName, organizationName: data.organizationName, content: rawContent }),
            html: generateBaseEmailHTML({ applicantName: data.organizationName, organizationName: data.organizationName, subject: `Invoice ${data.invoiceNumber}`, content: htmlContent }),
        });
        return { success: true, messageId: info.messageId };
    }
    catch (error) {
        console.error('Error sending client invoice email:', error);
        return { success: false, error: error.message || 'Failed to send email' };
    }
};
exports.sendClientInvoiceEmail = sendClientInvoiceEmail;
exports.default = {
    sendInterviewInvitationEmail: exports.sendInterviewInvitationEmail,
    sendInterviewRescheduleEmail: exports.sendInterviewRescheduleEmail,
    sendInterviewRejectionEmail: exports.sendInterviewRejectionEmail,
    sendCustomStageEmail: exports.sendCustomStageEmail,
    sendOfferLetterEmail: exports.sendOfferLetterEmail,
    sendOnboardingWelcomeEmail: exports.sendOnboardingWelcomeEmail,
    sendAssignmentNotificationEmail: exports.sendAssignmentNotificationEmail,
    sendDocumentExpiryReminderEmail: exports.sendDocumentExpiryReminderEmail,
    sendNewApplicationEmail: exports.sendNewApplicationEmail,
    verifyEmailConfiguration: exports.verifyEmailConfiguration,
    sendClientInvoiceEmail: exports.sendClientInvoiceEmail
};
//# sourceMappingURL=emailService.js.map
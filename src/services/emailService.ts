import nodemailer from 'nodemailer';
import { formatInTimeZone } from 'date-fns-tz';

/**
 * Email Service for sending professional notifications
 *
 * TIMEZONE FIX: All dates are formatted using formatInTimeZone(..., 'UTC', ...)
 * to ensure the displayed time always matches what was stored — regardless of
 * the server's local TZ setting.
 *
 * Install dependency if not present:
 *   npm install date-fns-tz
 */

// Email configuration
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Format a Date in UTC so the output always matches the stored value,
 * regardless of what TZ the server is running in.
 */
const formatUTC = (date: Date, fmt: string): string =>
  formatInTimeZone(date, 'UTC', fmt);

/** e.g. "Monday, March 15, 2025" */
const formatDateUTC = (date: Date): string =>
  formatUTC(date, 'EEEE, MMMM dd, yyyy');

/** e.g. "9:00 AM" */
const formatTimeUTC = (date: Date): string => formatUTC(date, 'h:mm a');

/** e.g. "Monday, March 15, 2025 at 9:00 AM (UTC)" */
const formatDateTimeUTC = (date: Date): string =>
  formatUTC(date, "EEEE, MMMM dd, yyyy 'at' h:mm a '(UTC)'");

/** Human-readable employment type */
const formatEmploymentType = (type: string): string => {
  const map: Record<string, string> = {
    W2: 'W2 Employee',
    CONTRACTOR_1099: '1099 Contractor',
  };
  return map[type] ?? type;
};

// ─── Base Templates ──────────────────────────────────────────────────────────

const generateBaseEmailHTML = (data: {
  applicantName: string;
  organizationName: string;
  subject: string;
  content: string;
}) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${data.subject}</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .email-container {
            background-color: #ffffff;
            border: 1px solid #dddddd;
        }
        .header {
            background-color: #f8f9fa;
            padding: 20px;
            border-bottom: 2px solid #e9ecef;
        }
        .header h2 {
            margin: 0;
            font-size: 20px;
            color: #212529;
            font-weight: 600;
        }
        .content {
            padding: 30px 20px;
        }
        .content p {
            margin: 15px 0;
            font-size: 14px;
            color: #495057;
        }
        .info-box {
            background-color: #f8f9fa;
            border-left: 3px solid #6c757d;
            padding: 15px;
            margin: 20px 0;
        }
        .info-box p {
            margin: 8px 0;
            font-size: 14px;
        }
        .info-box strong {
            color: #212529;
        }
        .footer {
            background-color: #f8f9fa;
            padding: 20px;
            border-top: 1px solid #e9ecef;
            text-align: center;
        }
        .footer p {
            margin: 5px 0;
            font-size: 12px;
            color: #6c757d;
        }
        .signature {
            margin-top: 30px;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            <h2>${data.organizationName}</h2>
        </div>
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
            <p>© ${new Date().getFullYear()} ${data.organizationName}. All rights reserved.</p>
        </div>
    </div>
</body>
</html>`;

const generateBaseEmailText = (data: {
  applicantName: string;
  organizationName: string;
  content: string;
}) => `
Dear ${data.applicantName},

${data.content}

Best regards,
${data.organizationName} Hiring Team

---
This is an automated notification.
© ${new Date().getFullYear()} ${data.organizationName}. All rights reserved.
`;

// ─── Email Senders ───────────────────────────────────────────────────────────

/**
 * Send interview invitation email
 */
export const sendInterviewInvitationEmail = async (interviewData: {
  applicantEmail: string;
  applicantName: string;
  jobTitle: string;
  organizationName: string;
  organizationWebsite?: string;
  interviewDate: Date;
  location: string;
  contactEmail?: string;
  contactPhone?: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> => {
  try {
    // ✅ FIX: Use UTC formatting — no more +4h offset
    const formattedDate = formatDateUTC(interviewData.interviewDate);
    const formattedTime = formatTimeUTC(interviewData.interviewDate);

    const content = `
      <p>We are pleased to invite you for an interview for the position of <strong>${interviewData.jobTitle}</strong>.</p>
      
      <div class="info-box">
        <p><strong>Position:</strong> ${interviewData.jobTitle}</p>
        <p><strong>Date:</strong> ${formattedDate}</p>
        <p><strong>Time:</strong> ${formattedTime} (UTC)</p>
        <p><strong>Location:</strong> ${interviewData.location}</p>
        ${interviewData.organizationWebsite ? `<p><strong>Company Website:</strong> <a href="${interviewData.organizationWebsite}">${interviewData.organizationWebsite}</a></p>` : ''}
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

      ${interviewData.contactEmail || interviewData.contactPhone ? `
      <p><strong>Contact Information:</strong></p>
      <p>
        ${interviewData.contactEmail ? `Email: ${interviewData.contactEmail}<br>` : ''}
        ${interviewData.contactPhone ? `Phone: ${interviewData.contactPhone}` : ''}
      </p>
      ` : ''}

      <p>We look forward to meeting you.</p>
    `;

    const htmlContent = generateBaseEmailHTML({
      applicantName: interviewData.applicantName,
      organizationName: interviewData.organizationName,
      subject: 'Interview Invitation',
      content,
    });

    const textContent = generateBaseEmailText({
      applicantName: interviewData.applicantName,
      organizationName: interviewData.organizationName,
      content: content.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' '),
    });

    const transporter = createTransporter();
    const info = await transporter.sendMail({
      from: { name: interviewData.organizationName, address: process.env.SMTP_USER || 'noreply@company.com' },
      to: interviewData.applicantEmail,
      subject: `Interview Invitation - ${interviewData.jobTitle}`,
      text: textContent,
      html: htmlContent,
    });

    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error('Error sending interview invitation email:', error);
    return { success: false, error: error.message || 'Failed to send email' };
  }
};

/**
 * Send interview reschedule email
 */
export const sendInterviewRescheduleEmail = async (data: {
  applicantEmail: string;
  applicantName: string;
  jobTitle: string;
  organizationName: string;
  oldDate: Date;
  newDate: Date;
  location: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> => {
  try {
    // ✅ FIX: Use UTC formatting for both old and new dates
    const formattedOldDate = formatDateTimeUTC(data.oldDate);
    const formattedNewDate = formatDateUTC(data.newDate);
    const formattedNewTime = formatTimeUTC(data.newDate);

    const content = `
      <p>Your interview for the position of <strong>${data.jobTitle}</strong> has been rescheduled.</p>
      
      <div class="info-box">
        <p><strong>Previous Date:</strong> ${formattedOldDate}</p>
        <p style="color: #dc3545;"><strong>New Date:</strong> ${formattedNewDate}</p>
        <p style="color: #dc3545;"><strong>New Time:</strong> ${formattedNewTime} (UTC)</p>
        <p><strong>Location:</strong> ${data.location}</p>
      </div>

      <p>We apologize for any inconvenience this may cause. If the new time does not work for you, please contact us immediately.</p>
      <p>We look forward to meeting you at the rescheduled time.</p>
    `;

    const htmlContent = generateBaseEmailHTML({
      applicantName: data.applicantName,
      organizationName: data.organizationName,
      subject: 'Interview Rescheduled',
      content,
    });

    const textContent = generateBaseEmailText({
      applicantName: data.applicantName,
      organizationName: data.organizationName,
      content: content.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' '),
    });

    const transporter = createTransporter();
    const info = await transporter.sendMail({
      from: { name: data.organizationName, address: process.env.SMTP_USER || 'noreply@company.com' },
      to: data.applicantEmail,
      subject: `Interview Rescheduled - ${data.jobTitle}`,
      text: textContent,
      html: htmlContent,
    });

    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error('Error sending reschedule email:', error);
    return { success: false, error: error.message || 'Failed to send email' };
  }
};

/**
 * Send interview rejection email
 */
export const sendInterviewRejectionEmail = async (data: {
  applicantEmail: string;
  applicantName: string;
  jobTitle: string;
  organizationName: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> => {
  try {
    const content = `
      <p>Thank you for your interest in the <strong>${data.jobTitle}</strong> position and for taking the time to interview with us.</p>
      
      <p>After careful consideration, we have decided to move forward with other candidates whose qualifications more closely match our current needs.</p>

      <p>We appreciate your interest in ${data.organizationName} and encourage you to apply for future openings that match your skills and experience.</p>

      <p>We wish you the best in your job search and future professional endeavors.</p>
    `;

    const htmlContent = generateBaseEmailHTML({
      applicantName: data.applicantName,
      organizationName: data.organizationName,
      subject: 'Interview Status Update',
      content,
    });

    const textContent = generateBaseEmailText({
      applicantName: data.applicantName,
      organizationName: data.organizationName,
      content: content.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' '),
    });

    const transporter = createTransporter();
    const info = await transporter.sendMail({
      from: { name: data.organizationName, address: process.env.SMTP_USER || 'noreply@company.com' },
      to: data.applicantEmail,
      subject: `Application Status - ${data.jobTitle}`,
      text: textContent,
      html: htmlContent,
    });

    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error('Error sending rejection email:', error);
    return { success: false, error: error.message || 'Failed to send email' };
  }
};

/**
 * Send offer letter email
 */
export const sendOfferLetterEmail = async (data: {
  applicantEmail: string;
  applicantName: string;
  jobTitle: string;
  organizationName: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> => {
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

    const htmlContent = generateBaseEmailHTML({
      applicantName: data.applicantName,
      organizationName: data.organizationName,
      subject: 'Job Offer',
      content,
    });

    const textContent = generateBaseEmailText({
      applicantName: data.applicantName,
      organizationName: data.organizationName,
      content: content.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' '),
    });

    const transporter = createTransporter();
    const info = await transporter.sendMail({
      from: { name: data.organizationName, address: process.env.SMTP_USER || 'noreply@company.com' },
      to: data.applicantEmail,
      subject: `Job Offer - ${data.jobTitle} at ${data.organizationName}`,
      text: textContent,
      html: htmlContent,
    });

    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error('Error sending offer email:', error);
    return { success: false, error: error.message || 'Failed to send email' };
  }
};

/**
 * Send onboarding welcome email
 *
 * Now includes full assignment details:
 * start_date, end_date, employment_type, workers_comp_code
 */
export const sendOnboardingWelcomeEmail = async (data: {
  applicantEmail: string;
  applicantName: string;
  jobTitle: string;
  organizationName: string;
  // ✅ NEW: Assignment fields passed from onboardCandidate controller
  startDate: Date;
  endDate?: Date | null;
  employmentType: string;
  workersCompCode?: string | null;
}): Promise<{ success: boolean; messageId?: string; error?: string }> => {
  try {
    // ✅ FIX: Format assignment dates in UTC
    const formattedStartDate = formatDateUTC(data.startDate);
    const formattedEndDate = data.endDate ? formatDateUTC(data.endDate) : 'Open-ended';
    const formattedEmploymentType = formatEmploymentType(data.employmentType);

    const content = `
      <p>Welcome to ${data.organizationName}! We are thrilled to have you join our team as <strong>${data.jobTitle}</strong>.</p>
      
      <div class="info-box">
        <p><strong>Position:</strong> ${data.jobTitle}</p>
        <p><strong>Company:</strong> ${data.organizationName}</p>
        <p><strong>Employment Type:</strong> ${formattedEmploymentType}</p>
        <p><strong>Start Date:</strong> ${formattedStartDate}</p>
        <p><strong>End Date:</strong> ${formattedEndDate}</p>
        ${data.workersCompCode ? `<p><strong>Workers' Comp Code:</strong> ${data.workersCompCode}</p>` : ''}
      </div>

      <p><strong>Next Steps:</strong></p>
      <ul>
        <li>Our HR team will contact you with detailed onboarding instructions</li>
        <li>Documentation and paperwork will be sent separately before your start date</li>
        <li>Details about orientation and training will follow shortly</li>
        <li>Please ensure all required documents are ready prior to <strong>${formattedStartDate}</strong></li>
      </ul>

      <p>If you have any questions before your start date, please don't hesitate to reach out to our HR department.</p>

      <p>We look forward to working with you!</p>
    `;

    const htmlContent = generateBaseEmailHTML({
      applicantName: data.applicantName,
      organizationName: data.organizationName,
      subject: 'Welcome to the Team',
      content,
    });

    const textContent = generateBaseEmailText({
      applicantName: data.applicantName,
      organizationName: data.organizationName,
      content: content.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' '),
    });

    const transporter = createTransporter();
    const info = await transporter.sendMail({
      from: { name: data.organizationName, address: process.env.SMTP_USER || 'noreply@company.com' },
      to: data.applicantEmail,
      subject: `Welcome to ${data.organizationName}!`,
      text: textContent,
      html: htmlContent,
    });

    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error('Error sending onboarding email:', error);
    return { success: false, error: error.message || 'Failed to send email' };
  }
};

/**
 * Verify email configuration
 */
export const verifyEmailConfiguration = async (): Promise<boolean> => {
  try {
    const transporter = createTransporter();
    await transporter.verify();
    console.log('✅ Email server is ready to send messages');
    return true;
  } catch (error) {
    console.error('❌ Email server configuration error:', error);
    return false;
  }
};

export default {
  sendInterviewInvitationEmail,
  sendInterviewRescheduleEmail,
  sendInterviewRejectionEmail,
  sendOfferLetterEmail,
  sendOnboardingWelcomeEmail,
  verifyEmailConfiguration,
};
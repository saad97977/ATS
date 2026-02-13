import nodemailer from 'nodemailer';
import { format } from 'date-fns';

/**
 * Email Service for sending professional notifications
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

/**
 * Base professional email template
 */
const generateBaseEmailHTML = (data: {
  applicantName: string;
  organizationName: string;
  subject: string;
  content: string;
}) => {
  return `
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
</html>
  `;
};

/**
 * Generate plain text version
 */
const generateBaseEmailText = (data: {
  applicantName: string;
  organizationName: string;
  content: string;
}) => {
  return `
Dear ${data.applicantName},

${data.content}

Best regards,
${data.organizationName} Hiring Team

---
This is an automated notification.
© ${new Date().getFullYear()} ${data.organizationName}. All rights reserved.
  `;
};

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
    const formattedDate = format(interviewData.interviewDate, 'EEEE, MMMM dd, yyyy');
    const formattedTime = format(interviewData.interviewDate, 'h:mm a');

    const content = `
      <p>We are pleased to invite you for an interview for the position of <strong>${interviewData.jobTitle}</strong>.</p>
      
      <div class="info-box">
        <p><strong>Position:</strong> ${interviewData.jobTitle}</p>
        <p><strong>Date:</strong> ${formattedDate}</p>
        <p><strong>Time:</strong> ${formattedTime}</p>
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
        <li>Arrive 10-15 minutes early</li>
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
      from: {
        name: interviewData.organizationName,
        address: process.env.SMTP_USER || 'noreply@company.com',
      },
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
    const formattedOldDate = format(data.oldDate, 'EEEE, MMMM dd, yyyy \'at\' h:mm a');
    const formattedNewDate = format(data.newDate, 'EEEE, MMMM dd, yyyy');
    const formattedNewTime = format(data.newDate, 'h:mm a');

    const content = `
      <p>Your interview for the position of <strong>${data.jobTitle}</strong> has been rescheduled.</p>
      
      <div class="info-box">
        <p><strong>Previous Date:</strong> ${formattedOldDate}</p>
        <p style="color: #dc3545;"><strong>New Date:</strong> ${formattedNewDate}</p>
        <p style="color: #dc3545;"><strong>New Time:</strong> ${formattedNewTime}</p>
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
      from: {
        name: data.organizationName,
        address: process.env.SMTP_USER || 'noreply@company.com',
      },
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
      from: {
        name: data.organizationName,
        address: process.env.SMTP_USER || 'noreply@company.com',
      },
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
      from: {
        name: data.organizationName,
        address: process.env.SMTP_USER || 'noreply@company.com',
      },
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
 */
export const sendOnboardingWelcomeEmail = async (data: {
  applicantEmail: string;
  applicantName: string;
  jobTitle: string;
  organizationName: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> => {
  try {
    const content = `
      <p>Welcome to ${data.organizationName}! We are excited to have you join our team as <strong>${data.jobTitle}</strong>.</p>
      
      <div class="info-box">
        <p><strong>Position:</strong> ${data.jobTitle}</p>
        <p><strong>Company:</strong> ${data.organizationName}</p>
      </div>

      <p><strong>Next Steps:</strong></p>
      <ul>
        <li>Our HR team will contact you with onboarding details</li>
        <li>You will receive information about your start date</li>
        <li>Documentation and paperwork instructions will be sent separately</li>
        <li>Details about orientation and training will follow</li>
      </ul>

      <p>If you have any questions in the meantime, please don't hesitate to reach out to our HR department.</p>

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
      from: {
        name: data.organizationName,
        address: process.env.SMTP_USER || 'noreply@company.com',
      },
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
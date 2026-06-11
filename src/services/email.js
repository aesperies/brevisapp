// Unified outbound email: prefer SendGrid API (works on Railway), fallback to SMTP.
// Moved verbatim from server.js during the 2026-06 architecture refactor.

import nodemailer from 'nodemailer';
import sgMail from '@sendgrid/mail';

// Determined once at startup, never reassigned afterwards (same lifecycle as
// the original server.js `let emailEnabled`).
let _emailEnabled = false;
export const EMAIL_FROM = process.env.SMTP_FROM || process.env.SMTP_USER || 'info@brevisapp.com';

// SMTP transporter created once at startup and reused for all emails
let smtpTransporter = null;

if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    _emailEnabled = true;
    console.log('✅ Email configured via SendGrid API (verification, password reset, Kindle)');
} else if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
    smtpTransporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: false,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
    });
    _emailEnabled = true;
    console.log('✅ Email configured via SMTP (verification, password reset, Kindle)');
} else {
    console.log('⚠️  Email not configured — set SENDGRID_API_KEY or SMTP_HOST/SMTP_USER/SMTP_PASSWORD');
    console.log('   Email verification, password reset, and Kindle features will be disabled');
}

export const emailEnabled = _emailEnabled;

// Unified email sender: uses SendGrid API or SMTP
export async function sendEmail({ to, subject, html, text }) {
    if (!_emailEnabled) throw new Error('Email service not configured');

    if (process.env.SENDGRID_API_KEY) {
        await sgMail.send({
            to,
            from: EMAIL_FROM,
            subject,
            html: html || undefined,
            text: text || undefined
        });
    } else {
        await smtpTransporter.sendMail({ from: EMAIL_FROM, to, subject, html, text });
    }
}

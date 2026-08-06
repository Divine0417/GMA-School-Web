// Sendchamp (https://sendchamp.com) — SMS delivery for Nigerian phone numbers.
// Defaults to "SAlert", Sendchamp's default shared sender name (works
// immediately, no approval needed) — swap SENDCHAMP_SENDER_NAME for a custom
// registered/approved sender name once one exists, for GMA-branded messages.
const SENDCHAMP_API_KEY = process.env.SENDCHAMP_API_KEY;
const SENDCHAMP_SENDER_NAME = process.env.SENDCHAMP_SENDER_NAME || 'SAlert';
const SENDCHAMP_BASE_URL = 'https://api.sendchamp.com/api/v1/sms/send';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Numbers in this DB show up in mixed formats ("+234-701-234-5678", plain
// "08136903219", etc.) — Sendchamp wants a bare international number with no
// leading zero, +, or separators (e.g. "2348136903219").
const normalizePhone = (phone) => {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('234')) return digits;
  if (digits.startsWith('0')) return `234${digits.slice(1)}`;
  return `234${digits}`;
};

const sendSMS = async ({ to, message }) => {
  if (!SENDCHAMP_API_KEY) {
    console.error(`SMS not sent to ${to}: SENDCHAMP_API_KEY is not configured`);
    return;
  }

  try {
    const response = await fetch(SENDCHAMP_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SENDCHAMP_API_KEY}`
      },
      body: JSON.stringify({
        to: [normalizePhone(to)],
        message,
        sender_name: SENDCHAMP_SENDER_NAME,
        route: 'dnd' // delivers even to DND-active lines, which most Nigerian numbers are
      })
    });

    const result = await response.json();
    if (!response.ok) {
      console.error(`Failed to send SMS to ${to}:`, result);
    }
  } catch (error) {
    console.error(`Failed to send SMS to ${to}:`, error);
  }
};

export const sendCredentialsSMS = async ({ phone, identifier, password, role }) => {
  await sendSMS({
    to: phone,
    message: `Welcome to GMA School! Your ${role} portal account is ready.\nLogin: ${identifier}\nPassword: ${password}\n${FRONTEND_URL}/login\nPlease change your password after logging in.`
  });
};

export const sendPasswordResetSMS = async ({ phone, resetUrl }) => {
  await sendSMS({
    to: phone,
    message: `GMA School password reset requested. Tap to reset (expires in 1 hour): ${resetUrl}\nIf you didn't request this, ignore this message.`
  });
};

export const sendAdmissionConfirmationSMS = async ({ phone, studentName, applicationNumber }) => {
  await sendSMS({
    to: phone,
    message: `GMA School: We've received ${studentName}'s application. Your application number is ${applicationNumber} — keep this for your records. We'll contact you soon.`
  });
};

const DECISION_LABELS_SMS = { admitted: 'admitted', rejected: 'not admitted', waitlisted: 'waitlisted' };

export const sendAdmissionDecisionSMS = async ({ phone, studentName, applicationNumber, decision }) => {
  await sendSMS({
    to: phone,
    message: `GMA School: ${studentName}'s application (${applicationNumber}) has been ${DECISION_LABELS_SMS[decision] || decision}. Check your email or contact the school for details.`
  });
};

import { google } from 'googleapis';

const queue = [];
let processing = false;

const getGmailClient = () => {
  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = process.env;
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN || !process.env.GMAIL_USER) {
    throw new Error('Gmail API email configuration is incomplete');
  }

  const oauth2Client = new google.auth.OAuth2(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET);
  oauth2Client.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });
  return google.gmail({ version: 'v1', auth: oauth2Client });
};

const isInvalidGrant = (error) => {
  const apiError = error?.response?.data?.error;
  const apiReasons = Array.isArray(apiError?.errors) ? apiError.errors : [];
  const reasons = [
    typeof apiError === 'string' ? apiError : apiError?.status,
    ...apiReasons.map((item) => item?.reason),
    error?.message,
  ];
  return reasons.some((reason) => typeof reason === 'string' && reason.includes('invalid_grant'));
};

const sendWithGmail = async (mailOptions) => {
  const gmail = getGmailClient();
  const from = `IITK Marketplace <${process.env.GMAIL_USER}>`;
  const message = [
    `To: ${mailOptions.to}`,
    `From: ${from}`,
    `Subject: ${mailOptions.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    mailOptions.html,
  ].join('\r\n');

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: Buffer.from(message, 'utf8').toString('base64url') },
  });
};

const formatDeliveryError = (error) => {
  if (isInvalidGrant(error)) {
    return 'Gmail OAuth refresh token rejected (invalid_grant). Re-authorize the sending account and update GMAIL_REFRESH_TOKEN.';
  }

  let message = error?.response?.data?.error?.message || error?.message || 'Unknown Gmail API error';
  for (const secret of [
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REFRESH_TOKEN,
  ]) {
    if (secret) message = message.split(secret).join('[REDACTED]');
  }
  return `${error?.code || error?.response?.status || 'Gmail API'}: ${message}`;
};

export const enqueueEmail = (mailOptions) => {
  return new Promise((resolve, reject) => {
    queue.push({ mailOptions, attempts: 0, createdAt: Date.now(), resolve, reject });
    processQueue().catch((error) => {
      console.error('Email queue failed:', formatDeliveryError(error));
      reject(new Error('Email delivery is temporarily unavailable.'));
    });
  });
};

const processQueue = async () => {
  if (processing) return;
  processing = true;

  try {
    while (queue.length > 0) {
      const job = queue.shift();
      try {
        await sendWithGmail(job.mailOptions);
        console.log(`Email delivered to ${job.mailOptions.to}`);
        job.resolve();
      } catch (error) {
        job.attempts += 1;
        console.error('Email delivery failed:', formatDeliveryError(error));
        if (job.attempts < 2 && !isInvalidGrant(error)) {
          queue.push(job);
        } else {
          job.reject(new Error('Email delivery is temporarily unavailable.'));
        }
      }
    }
  } finally {
    processing = false;
    if (queue.length > 0) {
      processQueue().catch((error) => {
        console.error('Email queue failed:', formatDeliveryError(error));
      });
    }
  }
};

export const isMailerConfigured = () => Boolean(
  process.env.GMAIL_CLIENT_ID &&
  process.env.GMAIL_CLIENT_SECRET &&
  process.env.GMAIL_REFRESH_TOKEN &&
  process.env.GMAIL_USER
);

export default { enqueueEmail, isMailerConfigured };

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const queue = [];
let processing = false;

const sendWithResend = async (mailOptions) => {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not configured');

  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || mailOptions.from,
      to: [mailOptions.to],
      subject: mailOptions.subject,
      html: mailOptions.html,
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || `Resend request failed with ${response.status}`);
  }
};

export const enqueueEmail = (mailOptions) => {
  queue.push({ mailOptions, attempts: 0, createdAt: Date.now() });
  processQueue().catch(() => {});
};

const processQueue = async () => {
  if (processing) return;
  processing = true;

  try {
    while (queue.length > 0) {
      const job = queue.shift();
      try {
        await sendWithResend(job.mailOptions);
        console.log(`Email delivered to ${job.mailOptions.to}`);
      } catch (error) {
        job.attempts += 1;
        console.error('Email delivery failed:', error.message);
        if (job.attempts < 2) {
          queue.push(job);
        }
      }
    }
  } finally {
    processing = false;
  }
};

export const isMailerConfigured = () => Boolean(process.env.RESEND_API_KEY);

export default { enqueueEmail, isMailerConfigured };

import nodemailer from 'nodemailer';
let transporter = null;
const queue = [];
let processing = false;

export const createTransporter = () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return null;
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: Number(process.env.EMAIL_PORT || 465),
    secure: process.env.EMAIL_SECURE ? process.env.EMAIL_SECURE === 'true' : true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    // keepAlive and connection timeout guards
    socketTimeout: 10000,
    connectionTimeout: 10000,
  });

  return transporter;
};

export const enqueueEmail = (mailOptions) => {
  queue.push({ mailOptions, attempts: 0, createdAt: Date.now() });
  // kick the processor
  processQueue().catch(() => {});
};

const processQueue = async () => {
  if (processing) return;
  processing = true;

  try {
    while (queue.length > 0) {
      const job = queue.shift();
      const t = createTransporter();
      if (!t) {
        // transporter not configured; log and skip sending but keep job for debugging
        console.warn('Mailer not configured — skipping email send:', job.mailOptions.to);
        continue;
      }

      try {
        await t.sendMail(job.mailOptions);
        console.log(`Mail sent to ${job.mailOptions.to}`);
      } catch (err) {
        job.attempts += 1;
        console.error('Mailer send failed:', err.message || err);
        // retry once after a short delay
        if (job.attempts < 2) {
          queue.push(job);
          await new Promise((r) => setTimeout(r, 1000));
        } else {
          console.error('Mailer job failed permanently for', job.mailOptions.to);
        }
      }
    }
  } finally {
    processing = false;
  }
};

export const verifyTransporter = async () => {
  const t = createTransporter();
  if (!t) {
    console.warn('EMAIL_USER or EMAIL_PASS not set — mailer disabled');
    return false;
  }
  try {
    await t.verify();
    console.log('Mail transporter verified');
    return true;
  } catch (err) {
    console.warn('Mail transporter verification failed:', err.message || err);
    return false;
  }
};

export default { createTransporter, enqueueEmail, verifyTransporter };

const https = require('https');

function postJson(url, headers, body) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const data = JSON.stringify(body);

    const req = https.request(
      {
        hostname: target.hostname,
        path: target.pathname + target.search,
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      },
      (res) => {
        let response = '';

        res.setEncoding('utf8');
        res.on('data', chunk => response += chunk);

        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(response);
          } else {
            reject(
              new Error(
                `Brevo returned HTTP ${res.statusCode}: ${response.slice(0, 300)}`
              )
            );
          }
        });
      }
    );

    req.on('error', reject);

    req.setTimeout(15000, () => {
      req.destroy(new Error('Brevo request timed out'));
    });

    req.write(data);
    req.end();
  });
}


// Send password reset OTP using Brevo
async function sendPasswordResetEmail({ to, name, otp }) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || 'Hirely Job Portal';

  if (!apiKey || !senderEmail) {
    throw new Error(
      'BREVO_API_KEY and BREVO_SENDER_EMAIL must be configured.'
    );
  }

  const safeName = String(name || 'there').replace(/[<>]/g, '');

  const body = {
    sender: {
      name: senderName,
      email: senderEmail
    },
    to: [
      {
        email: to,
        name: safeName
      }
    ],
    subject: 'Your Hirely Password Reset OTP',
    textContent:
      `Hi ${safeName},\n\n` +
      `Your Hirely password reset OTP is: ${otp}\n\n` +
      `This OTP expires in 3 minutes. Do not share this code with anyone.`,
    htmlContent: `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>Hirely Job Portal</h2>
        <p>Hello ${safeName},</p>
        <p>Your password reset OTP is:</p>

        <h1 style="letter-spacing: 8px; color: #2563eb;">
          ${otp}
        </h1>

        <p>This OTP expires in <b>3 minutes</b>.</p>
        <p>Please do not share this OTP with anyone.</p>
        <p>If you did not request this, ignore this email.</p>
      </div>
    `
  };

  return postJson(
    'https://api.brevo.com/v3/smtp/email',
    {
      'api-key': apiKey
    },
    body
  );
}

module.exports = {
  sendPasswordResetEmail
};
import nodemailer from 'nodemailer'

function shortAddress(addr) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function buildEmailHtml({ recipientName, amount, token, address, senderName, explorerBaseUrl, date }) {
  const firstName = (recipientName || '').split(' ')[0] || 'there'
  const shortAddr = shortAddress(address)
  const explorerLink = `${explorerBaseUrl}/address/${address}`

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Received</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);max-width:560px;">
        <tr>
          <td style="background:#0f172a;padding:28px 40px;">
            <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">&#10022; ${senderName}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px 0;">
            <p style="margin:0;font-size:16px;color:#374151;">Hi ${firstName},</p>
            <p style="margin:12px 0 0;font-size:16px;color:#374151;line-height:1.6;">A payment has been sent to your wallet. Here are the details:</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 40px;">
            <div style="background:#f0fdf4;border:2px solid #16a34a;border-radius:10px;padding:24px 28px;text-align:center;">
              <div style="font-size:13px;font-weight:600;color:#15803d;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Payment Received</div>
              <div style="font-size:40px;font-weight:800;color:#0f172a;letter-spacing:-1px;line-height:1;">${Number(amount).toLocaleString()} ${token}</div>
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:0 40px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
              <tr style="background:#f9fafb;">
                <td style="padding:12px 16px;font-size:13px;font-weight:600;color:#6b7280;width:38%;border-bottom:1px solid #e5e7eb;">Paid by</td>
                <td style="padding:12px 16px;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb;">${senderName}</td>
              </tr>
              <tr>
                <td style="padding:12px 16px;font-size:13px;font-weight:600;color:#6b7280;border-bottom:1px solid #e5e7eb;">Amount</td>
                <td style="padding:12px 16px;font-size:14px;color:#111827;font-weight:600;border-bottom:1px solid #e5e7eb;">${Number(amount).toLocaleString()} ${token}</td>
              </tr>
              <tr style="background:#f9fafb;">
                <td style="padding:12px 16px;font-size:13px;font-weight:600;color:#6b7280;border-bottom:1px solid #e5e7eb;">Paid to</td>
                <td style="padding:12px 16px;font-size:13px;color:#111827;font-family:monospace;letter-spacing:0.02em;border-bottom:1px solid #e5e7eb;">${shortAddr}</td>
              </tr>
              <tr>
                <td style="padding:12px 16px;font-size:13px;font-weight:600;color:#6b7280;">Date</td>
                <td style="padding:12px 16px;font-size:14px;color:#111827;">${date}</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 40px 36px;text-align:center;">
            <a href="${explorerLink}" style="display:inline-block;background:#0f172a;color:#ffffff;font-size:14px;font-weight:600;padding:14px 28px;border-radius:8px;text-decoration:none;letter-spacing:0.02em;">View My Payment on Explorer &rarr;</a>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;">
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.6;">
              This payment was sent via ${senderName}. You received this email because your wallet address was included in a payment batch.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

let transporter = null
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    })
  }
  return transporter
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return res.status(503).json({ error: 'Email service not configured' })
  }

  const { recipients, explorerBaseUrl, date, senderName = 'NovaPay' } = req.body

  if (!Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ error: 'recipients array required' })
  }

  res.json({ queued: recipients.filter((r) => r.email).length })

  for (const r of recipients) {
    if (!r.email) continue
    getTransporter()
      .sendMail({
        from: `"${senderName}" <${process.env.GMAIL_USER}>`,
        to: r.email,
        subject: `You've been paid — ${Number(r.amount).toLocaleString()} ${r.token} from ${senderName}`,
        html: buildEmailHtml({
          recipientName: r.name,
          amount: r.amount,
          token: r.token,
          address: r.address,
          senderName,
          explorerBaseUrl,
          date,
        }),
      })
      .catch((err) => console.error(`[email] failed for ${r.email}:`, err.message))
  }
}

const crypto = require("crypto");
const { supabaseAdmin } = require("./_lib/supabaseAdmin");

function json(res, status, payload) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function makeOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed" });
  }

  try {
    const { email } = req.body || {};
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      return json(res, 400, { error: "Valid email is required" });
    }

    const otpTtlMinutes = Number(process.env.OTP_TTL_MINUTES || 10);
    const code = makeOtp();
    const codeHash = crypto.createHash("sha256").update(code).digest("hex");
    const expiresAt = new Date(Date.now() + otpTtlMinutes * 60 * 1000).toISOString();

    const { error: upsertError } = await supabaseAdmin
      .from("otp_codes")
      .upsert(
        [
          {
            email: normalizedEmail,
            code_hash: codeHash,
            expires_at: expiresAt,
            used: false,
            updated_at: new Date().toISOString()
          }
        ],
        { onConflict: "email" }
      );

    if (upsertError) {
      return json(res, 500, { error: `OTP save failed: ${upsertError.message}` });
    }

    const brevoApiKey = process.env.BREVO_API_KEY;
    const senderEmail = process.env.BREVO_SENDER_EMAIL;
    const senderName = process.env.BREVO_SENDER_NAME || "NowTech AI";

    if (!brevoApiKey || !senderEmail) {
      return json(res, 500, {
        error: "Brevo configuration missing. Check BREVO_API_KEY and BREVO_SENDER_EMAIL."
      });
    }

    const subject = "Your Trade Offer Control login code";
    const bodyText = `Your login code is ${code}. It expires in ${otpTtlMinutes} minutes.`;
    const bodyHtml = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
        <h2 style="margin-bottom:8px;">Trade Offer Control Login</h2>
        <p>Your 6-digit login code is:</p>
        <div style="font-size:28px;font-weight:700;letter-spacing:4px;margin:16px 0;">${code}</div>
        <p>This code expires in ${otpTtlMinutes} minutes.</p>
        <p>If you did not request this code, you can ignore this email.</p>
      </div>
    `;

    const brevoResp = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": brevoApiKey
      },
      body: JSON.stringify({
        sender: {
          email: senderEmail,
          name: senderName
        },
        to: [{ email: normalizedEmail }],
        subject,
        htmlContent: bodyHtml,
        textContent: bodyText
      })
    });

    const brevoText = await brevoResp.text();

    let brevoJson = null;
    try {
      brevoJson = brevoText ? JSON.parse(brevoText) : null;
    } catch {
      brevoJson = null;
    }

    if (!brevoResp.ok) {
      return json(res, 500, {
        error: `Brevo send failed: ${brevoResp.status} ${brevoText}`
      });
    }

    await supabaseAdmin.from("outbound_emails").insert([
      {
        to_email: normalizedEmail,
        subject,
        body_text: bodyText,
        email_type: "otp_login",
        status: "sent"
      }
    ]);

    return json(res, 200, {
      ok: true,
      messageId: brevoJson?.messageId || null
    });
  } catch (err) {
    return json(res, 500, { error: err.message || "Unexpected error" });
  }
};

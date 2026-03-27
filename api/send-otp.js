const crypto = require("crypto");
const { supabaseAdmin } = require("./_lib/supabaseAdmin");
const { OTP_TTL_MINUTES } = require("./_lib/env");

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

    const code = makeOtp();
    const codeHash = crypto.createHash("sha256").update(code).digest("hex");
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();

    const { error: upsertError } = await supabaseAdmin
      .from("otp_codes")
      .upsert(
        [{
          email: normalizedEmail,
          code_hash: codeHash,
          expires_at: expiresAt,
          used: false,
          updated_at: new Date().toISOString()
        }],
        { onConflict: "email" }
      );

    if (upsertError) {
      return json(res, 500, { error: `OTP save failed: ${upsertError.message}` });
    }

    const { error: mailError } = await supabaseAdmin
      .from("outbound_emails")
      .insert([{
        to_email: normalizedEmail,
        subject: "Your Trade Offer Control login code",
        body_text: `Your login code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.`,
        email_type: "otp_login",
        status: "queued"
      }]);

    if (mailError) {
      return json(res, 500, { error: `OTP email queue failed: ${mailError.message}` });
    }

    return json(res, 200, { ok: true });
  } catch (err) {
    return json(res, 500, { error: err.message || "Unexpected error" });
  }
};

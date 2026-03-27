const crypto = require("crypto");
const { supabaseAdmin } = require("./_lib/supabaseAdmin");
const { buildSessionCookie } = require("./_lib/session");

function json(res, status, payload, extraHeaders = {}) {
  res.status(status);
  res.setHeader("Content-Type", "application/json");
  Object.entries(extraHeaders).forEach(([k, v]) => res.setHeader(k, v));
  res.end(JSON.stringify(payload));
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed" });
  }

  try {
    const { email, code } = req.body || {};
    const normalizedEmail = normalizeEmail(email);
    const normalizedCode = String(code || "").trim();

    if (!normalizedEmail || !normalizedCode) {
      return json(res, 400, { error: "Email and code are required" });
    }

    const { data: otpRow, error: otpError } = await supabaseAdmin
      .from("otp_codes")
      .select("*")
      .eq("email", normalizedEmail)
      .single();

    if (otpError || !otpRow) {
      return json(res, 400, { error: "Invalid or expired code" });
    }

    if (otpRow.used) {
      return json(res, 400, { error: "Code already used" });
    }

    if (new Date(otpRow.expires_at).getTime() < Date.now()) {
      return json(res, 400, { error: "Code expired" });
    }

    const incomingHash = crypto.createHash("sha256").update(normalizedCode).digest("hex");
    if (incomingHash !== otpRow.code_hash) {
      return json(res, 400, { error: "Invalid or expired code" });
    }

    const { error: markUsedError } = await supabaseAdmin
      .from("otp_codes")
      .update({ used: true, updated_at: new Date().toISOString() })
      .eq("email", normalizedEmail);

    if (markUsedError) {
      return json(res, 500, { error: `OTP update failed: ${markUsedError.message}` });
    }

    let { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (!profile) {
      const pseudoId = crypto.randomUUID();

      const { error: insertProfileError } = await supabaseAdmin
        .from("profiles")
        .insert([{
          id: pseudoId,
          email: normalizedEmail,
          full_name: normalizedEmail,
          role: "maker",
          active: true
        }]);

      if (insertProfileError) {
        return json(res, 500, { error: `Profile create failed: ${insertProfileError.message}` });
      }

      const profileRes = await supabaseAdmin
        .from("profiles")
        .select("*")
        .eq("email", normalizedEmail)
        .single();

      if (profileRes.error || !profileRes.data) {
        return json(res, 500, { error: "Profile fetch failed after create" });
      }

      profile = profileRes.data;
    }

    if (!profile.active) {
      return json(res, 403, { error: "User is inactive" });
    }

    const user = {
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name || profile.email,
      role: profile.role || "maker"
    };

    const cookie = buildSessionCookie(user);

    return json(
      res,
      200,
      { ok: true, user },
      { "Set-Cookie": cookie }
    );
  } catch (err) {
    return json(res, 500, { error: err.message || "Unexpected error" });
  }
};

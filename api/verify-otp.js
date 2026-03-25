export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const { email, code } = req.body || {};

    if (!email || !code) {
      return res.status(400).json({ ok: false, error: "Email and code required" });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({ ok: false, error: "Missing Supabase env vars" });
    }

    // 1. Find matching unused OTP
    const otpResp = await fetch(
      `${supabaseUrl}/rest/v1/otp_codes?email=eq.${encodeURIComponent(email)}&code=eq.${encodeURIComponent(code)}&used=eq.false&select=id,email,code,expires_at,used`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    const otpRows = await otpResp.json();

    if (!otpResp.ok) {
      return res.status(500).json({ ok: false, error: "Failed to verify code", details: otpRows });
    }

    if (!Array.isArray(otpRows) || otpRows.length === 0) {
      return res.status(400).json({ ok: false, error: "Invalid code" });
    }

    const otpRow = otpRows[0];

    if (new Date(otpRow.expires_at) < new Date()) {
      return res.status(400).json({ ok: false, error: "Code expired" });
    }

    // 2. Mark OTP used
    const markResp = await fetch(`${supabaseUrl}/rest/v1/otp_codes?id=eq.${otpRow.id}`, {
      method: "PATCH",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ used: true }),
    });

    if (!markResp.ok) {
      return res.status(500).json({ ok: false, error: "Failed to mark code used" });
    }

    // 3. Load user
    const userResp = await fetch(
      `${supabaseUrl}/rest/v1/app_users?email=eq.${encodeURIComponent(email)}&select=email,full_name,role,is_active`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    const users = await userResp.json();

    if (!userResp.ok) {
      return res.status(500).json({ ok: false, error: "Failed to load user", details: users });
    }

    if (!Array.isArray(users) || users.length === 0 || users[0].is_active === false) {
      return res.status(403).json({ ok: false, error: "User not allowed" });
    }

    return res.status(200).json({
      ok: true,
      user: users[0],
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "Unexpected server error",
    });
  }
}

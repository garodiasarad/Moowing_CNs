export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const { email } = req.body || {};

    if (!email) {
      return res.status(400).json({ ok: false, error: "Email required" });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_KEY;
    const apiKey = process.env.BREVO_API_KEY;
    const senderEmail = process.env.BREVO_SENDER_EMAIL;
    const senderName = process.env.BREVO_SENDER_NAME || "NowTech AI";

    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({ ok: false, error: "Missing Supabase env vars" });
    }

    if (!apiKey || !senderEmail) {
      return res.status(500).json({ ok: false, error: "Missing Brevo env vars" });
    }

    // 1. Check allowed user
    const userResp = await fetch(
      `${supabaseUrl}/rest/v1/app_users?email=eq.${encodeURIComponent(email)}&select=email,role,is_active`,
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
      return res.status(500).json({ ok: false, error: "Failed to check app user", details: users });
    }

    if (!Array.isArray(users) || users.length === 0 || users[0].is_active === false) {
      return res.status(403).json({ ok: false, error: "User not allowed" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    // 2. Invalidate old unused OTPs for that email
    await fetch(
      `${supabaseUrl}/rest/v1/otp_codes?email=eq.${encodeURIComponent(email)}&used=eq.false`,
      {
        method: "PATCH",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ used: true }),
      }
    );

    // 3. Save new OTP
    const otpSaveResp = await fetch(`${supabaseUrl}/rest/v1/otp_codes`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify([
        {
          email,
          code: otp,
          expires_at: expiresAt,
          used: false,
        },
      ]),
    });

    const otpSaveData = await otpSaveResp.json().catch(() => ({}));

    if (!otpSaveResp.ok) {
      return res.status(500).json({ ok: false, error: "Failed to save OTP", details: otpSaveData });
    }

    // 4. Send OTP email
    const emailResp = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: {
          email: senderEmail,
          name: senderName,
        },
        to: [{ email }],
        subject: "Your Login Code",
        htmlContent: `
          <div style="font-family: Arial, sans-serif; line-height:1.5;">
            <h2>Your login code is: ${otp}</h2>
            <p>Use this 6-digit code to sign in to NowTech AI - Trade Offer Control.</p>
            <p>This code will expire in 10 minutes.</p>
          </div>
        `,
      }),
    });

    const emailData = await emailResp.json().catch(() => ({}));

    if (!emailResp.ok) {
      return res.status(500).json({
        ok: false,
        error: emailData?.message || "Brevo send failed",
        details: emailData,
      });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "Unexpected server error",
    });
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const { email } = req.body || {};

    if (!email) {
      return res.status(400).json({ ok: false, error: "Email required" });
    }

    const apiKey = process.env.BREVO_API_KEY;
    const senderEmail = process.env.BREVO_SENDER_EMAIL;
    const senderName = process.env.BREVO_SENDER_NAME || "NowTech AI";

    if (!apiKey || !senderEmail) {
      return res.status(500).json({
        ok: false,
        error: "Missing Brevo environment variables",
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
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
            <p>This is a temporary testing version.</p>
          </div>
        `,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(500).json({
        ok: false,
        error: data?.message || "Brevo send failed",
        details: data,
      });
    }

    return res.status(200).json({
      ok: true,
      otp, // temporary for testing only
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "Unexpected server error",
    });
  }
}

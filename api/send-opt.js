import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  // check user exists
  const { data: user } = await supabase
    .from('app_users')
    .select('*')
    .eq('email', email)
    .single();

  if (!user) {
    return res.status(403).json({ error: 'User not allowed' });
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();

  await supabase.from('otp_codes').insert({
    email,
    code,
    expires_at: new Date(Date.now() + 10 * 60 * 1000) // 10 min
  });

  // send email via Brevo
  await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": process.env.BREVO_API_KEY
    },
    body: JSON.stringify({
      sender: {
        email: process.env.BREVO_SENDER_EMAIL,
        name: process.env.BREVO_SENDER_NAME
      },
      to: [{ email }],
      subject: "Your Login Code",
      htmlContent: `<h2>Your login code is: ${code}</h2>`
    })
  });

  res.json({ success: true });
}

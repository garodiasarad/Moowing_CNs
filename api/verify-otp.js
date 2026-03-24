import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, code } = req.body;

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  const { data } = await supabase
    .from('otp_codes')
    .select('*')
    .eq('email', email)
    .eq('code', code)
    .eq('used', false)
    .single();

  if (!data) {
    return res.status(400).json({ error: 'Invalid code' });
  }

  if (new Date(data.expires_at) < new Date()) {
    return res.status(400).json({ error: 'Code expired' });
  }

  await supabase
    .from('otp_codes')
    .update({ used: true })
    .eq('id', data.id);

  const { data: user } = await supabase
    .from('app_users')
    .select('*')
    .eq('email', email)
    .single();

  res.json({
    success: true,
    user
  });
}

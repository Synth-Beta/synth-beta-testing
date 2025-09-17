// Test API route to check environment variables
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  return res.status(200).json({
    success: true,
    env: {
      JAMBASE_API_KEY: process.env.JAMBASE_API_KEY ? 'Set' : 'Not set',
      SUPABASE_URL: process.env.SUPABASE_URL ? 'Set' : 'Not set',
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ? 'Set' : 'Not set'
    }
  });
}

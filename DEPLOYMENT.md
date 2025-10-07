# Deployment Guide

This guide covers deploying the PlusOne Event Crew application to production environments.

## Vercel Deployment (Recommended)

### Prerequisites
- GitHub repository connected to Vercel
- Environment variables configured
- Supabase project set up

### Environment Variables

Configure these in your Vercel dashboard (Settings → Environment Variables):

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://glpiolbrafqikqhnseto.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdscGlvbGJyYWZxaWtxaG5zZXRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5Mzc4MjQsImV4cCI6MjA3MjUxMzgyNH0.O5G3fW-YFtpACNqNfo_lsLK44F-3L3p69Ka-G2lSTLE

# JamBase API
VITE_JAMBASE_API_KEY=e7ed3a9b-e73a-446e-b7c6-a96d1c53a030

# Backend Configuration
VITE_BACKEND_URL=http://localhost:3001

# Apple Music Integration (Optional)
VITE_APPLE_MUSIC_DEVELOPER_TOKEN=your_jwt_token_here
```

### Deployment Steps

1. **Connect Repository**
   - Go to Vercel dashboard
   - Click "New Project"
   - Import your GitHub repository

2. **Configure Build Settings**
   - Framework: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`

3. **Set Environment Variables**
   - Add all required environment variables
   - Ensure `VITE_` prefix for client-side variables

4. **Deploy**
   - Click "Deploy"
   - Monitor build logs for any issues
   - Test deployed application

### Build Configuration

The `vercel.json` file handles:
- Vite build framework detection
- Environment variable mapping
- Client-side routing with rewrites
- Static file serving

## Database Setup

### Supabase Migration

1. **Run Migrations**
   ```bash
   supabase migration up
   ```

2. **Verify Tables**
   - Check that all tables are created
   - Verify RLS policies are enabled
   - Test database connections

3. **Seed Data (Optional)**
   ```bash
   # Run seed scripts if available
   npm run seed
   ```

## Production Checklist

### Pre-Deployment
- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] API keys valid and active
- [ ] Build passes locally (`npm run build`)
- [ ] Tests pass (`npm run test`)

### Post-Deployment
- [ ] Application loads correctly
- [ ] User authentication works
- [ ] API endpoints respond
- [ ] Database connections stable
- [ ] Error monitoring configured

## Troubleshooting

### Common Issues

1. **Build Failures**
   - Check environment variables
   - Verify Node.js version compatibility
   - Review build logs for specific errors

2. **API Issues**
   - Verify API keys are correct
   - Check CORS configuration
   - Monitor API rate limits

3. **Database Connection**
   - Verify Supabase URL and keys
   - Check RLS policies
   - Test database queries

### Debug Steps

1. **Check Vercel Logs**
   - Go to Functions tab in Vercel dashboard
   - Review function logs for errors

2. **Test Environment Variables**
   ```bash
   # In Vercel dashboard, check environment variables are set
   ```

3. **Verify API Endpoints**
   - Test JamBase API directly
   - Check Supabase connection
   - Verify backend services

## Alternative Deployment Platforms

### Netlify
- Similar to Vercel
- Supports Vite builds
- Environment variables in dashboard

### AWS S3 + CloudFront
- Static hosting on S3
- CDN with CloudFront
- Custom domain configuration

### GitHub Pages
- Free hosting for public repos
- Limited to static sites
- Custom domain support

## Monitoring & Maintenance

### Performance Monitoring
- Set up Vercel Analytics
- Monitor Core Web Vitals
- Track API response times

### Error Tracking
- Configure error monitoring (Sentry, etc.)
- Set up alerts for critical failures
- Monitor user feedback

### Regular Maintenance
- Update dependencies monthly
- Monitor API key expiration
- Review and rotate secrets
- Backup database regularly

## Security Considerations

### Environment Variables
- Never commit secrets to repository
- Use Vercel's environment variable system
- Rotate API keys regularly

### Database Security
- Enable RLS policies
- Use service role keys only server-side
- Monitor database access logs

### API Security
- Implement rate limiting
- Validate all inputs
- Use HTTPS everywhere

## Scaling Considerations

### Performance Optimization
- Enable Vercel Edge Functions
- Implement caching strategies
- Optimize images and assets

### Database Scaling
- Monitor query performance
- Add database indexes as needed
- Consider read replicas for heavy traffic

### CDN Configuration
- Use Vercel's global CDN
- Optimize static assets
- Implement proper caching headers

## Support

For deployment issues:
1. Check Vercel documentation
2. Review build logs
3. Test locally first
4. Contact support if needed

## Related Documentation

- [Development Setup](./DEV_SETUP.md)
- [Features Guide](./FEATURES.md)
- [Integrations](./INTEGRATIONS.md)

# Vercel Deployment Guide

## ✅ Pre-Deployment Checklist

### 1. Environment Variables
Ensure these environment variables are set in your Vercel project settings:

**Required Environment Variables:**
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Your Supabase anonymous key
- `JAMBASE_API_KEY` - Your JamBase API key

**Vite Environment Variables (automatically mapped):**
- `VITE_SUPABASE_URL` ← `SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` ← `SUPABASE_ANON_KEY`
- `VITE_JAMBASE_API_KEY` ← `JAMBASE_API_KEY`

### 2. API Routes Configuration
✅ **Already Configured:**
- `/api/jambase/artists.js` - JamBase artists search
- `/api/jambase/events.js` - JamBase events search
- Both routes configured with Node.js 18.x runtime
- 30-second maximum duration
- Proper CORS headers
- Timeout protection (25s)

### 3. Build Configuration
✅ **Already Optimized:**
- Vite build system
- Output directory: `dist`
- Framework: Vite
- Build command: `npm run build`

### 4. Performance Optimizations
✅ **Implemented:**
- API response caching (5 minutes)
- Stale-while-revalidate strategy
- Timeout protection
- Error handling
- CORS headers

## 🚀 Deployment Steps

### 1. Connect to Vercel
```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy from project root
vercel --prod
```

### 2. Set Environment Variables
In Vercel dashboard:
1. Go to Project Settings
2. Navigate to Environment Variables
3. Add the three required variables listed above

### 3. Deploy
```bash
# Deploy to production
vercel --prod

# Or push to main branch (if auto-deploy is enabled)
git push origin main
```

## 🔧 Troubleshooting

### Common Issues:

1. **API Routes Not Working**
   - Check environment variables are set
   - Verify API routes are in `/api/` directory
   - Check Vercel function logs

2. **CORS Errors**
   - CORS headers are already configured
   - Check if requests are going to correct endpoints

3. **Timeout Issues**
   - API routes have 25s timeout protection
   - Vercel functions have 30s max duration
   - Check JamBase API response times

4. **Build Failures**
   - Ensure all dependencies are in `package.json`
   - Check for TypeScript errors
   - Verify Vite configuration

### Debug Commands:
```bash
# Check build locally
npm run build

# Preview production build
npm run preview

# Check Vercel logs
vercel logs
```

## 📊 Performance Monitoring

### Vercel Analytics
- Enable Vercel Analytics in dashboard
- Monitor API response times
- Check error rates

### Key Metrics to Watch:
- API response times (should be < 5s)
- Error rates (should be < 1%)
- Cache hit rates
- Function execution times

## 🔄 Updates and Maintenance

### Regular Updates:
1. Monitor API performance
2. Check for JamBase API changes
3. Update dependencies as needed
4. Monitor error logs

### Scaling Considerations:
- Vercel functions auto-scale
- Database queries are optimized
- API responses are cached
- CDN handles static assets

## ✅ Verification Checklist

After deployment, verify:
- [ ] Homepage loads correctly
- [ ] Search functionality works
- [ ] Artist selection works
- [ ] Events display correctly
- [ ] Show More/Less buttons work
- [ ] API routes respond correctly
- [ ] No console errors
- [ ] Mobile responsiveness
- [ ] Performance is acceptable

## 🎯 Success Criteria

The deployment is successful when:
1. All functionality works as in development
2. API responses are fast (< 5s)
3. No CORS or timeout errors
4. Search results are accurate
5. Events display properly
6. Show More functionality works
7. Mobile experience is smooth

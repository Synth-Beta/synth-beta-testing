# PlusOne - Find Friends for Local Events

Never go to shows, concerts, or activities alone again! PlusOne helps you discover local events and find others to attend with.

## Features

- 🎵 Discover local events and concerts
- 👥 Find like-minded people to attend events with
- 💬 Chat with potential event buddies
- 🎯 Swipe-based matching system
- 📱 Mobile-friendly interface

## Tech Stack

- **Frontend**: React 18 + TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **Backend**: Supabase
- **Build Tool**: Vite
- **Routing**: React Router

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <YOUR_GIT_URL>
cd plusone-event-crew
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

Add your Supabase credentials to `.env.local`:
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

**Optional**: To enable Spotify integration for music preferences:
```
VITE_SPOTIFY_CLIENT_ID=your_spotify_client_id
VITE_SPOTIFY_REDIRECT_URI=http://localhost:8080/auth/spotify/callback
```
Create a Spotify app at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) to get credentials. The app works perfectly fine without Spotify configured.

4. Start the development server:
```bash
npm run dev
```

5. Open [http://localhost:8080](http://localhost:8080) in your browser.

## Deployment

### Vercel (Recommended)

1. Connect your GitHub repository to Vercel
2. Add environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

### Other Platforms

The app can be deployed to any platform that supports static React apps:
- Netlify
- AWS S3 + CloudFront
- GitHub Pages

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

If you have any questions or need help, please open an issue on GitHub.# Vercel rebuild Wed Oct  1 12:16:32 CEST 2025
# Force rebuild 1759314178

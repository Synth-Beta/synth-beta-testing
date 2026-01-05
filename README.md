# PlusOne - Find Friends for Local Events

Never go to shows, concerts, or activities alone again! PlusOne helps you discover local events and find others to attend with.

## Features

- 🎵 Discover local events and concerts
- 👥 Find like-minded people to attend events with
- 💬 Chat with potential event buddies
- ⭐ Rate and review concerts and venues
- 🎧 Connect your music streaming services
- 📱 Mobile-friendly interface

## Tech Stack

- **Frontend**: React 18 + TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **Backend**: Express.js + Node.js
- **Database**: Supabase (PostgreSQL)
- **Build Tool**: Vite
- **Routing**: React Router
- **APIs**: JamBase, Spotify, Apple Music, Setlist.fm

## Security

This application implements comprehensive security measures following OWASP best practices:

- **Rate Limiting**: IP + user-based rate limiting on all public endpoints (10-100 req/min depending on endpoint)
- **Input Validation**: Schema-based validation with type checking, length limits, and pattern validation
- **Input Sanitization**: XSS and injection prevention through input sanitization
- **API Key Security**: Secure key management with rotation support, no hard-coded keys
- **CORS Protection**: Strict origin validation in production
- **Error Sanitization**: Prevents information disclosure through error messages
- **Request Size Limits**: Prevents DoS attacks via large payloads (1MB limit)

See [SECURITY.md](SECURITY.md) for detailed security policies and configuration.

## Quick Start

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

Add your credentials to `.env.local`:
```env
# Supabase Configuration
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# JamBase API
VITE_JAMBASE_API_KEY=your_jambase_api_key

# Optional: Music Streaming
VITE_SPOTIFY_CLIENT_ID=your_spotify_client_id
VITE_SPOTIFY_REDIRECT_URI=http://localhost:8080/auth/spotify/callback
VITE_APPLE_MUSIC_DEVELOPER_TOKEN=your_apple_music_token
```

4. Start the development server:
```bash
npm run dev
```

5. Open [http://localhost:8080](http://localhost:8080) in your browser.

## Documentation

### 📚 Core Documentation
- **[Development Setup](./DEV_SETUP.md)** - Complete development environment setup
- **[Features Guide](./FEATURES.md)** - Comprehensive feature documentation
- **[Integrations](./INTEGRATIONS.md)** - External API integrations and services
- **[Deployment Guide](./DEPLOYMENT.md)** - Production deployment instructions
- **[Brand Guide](./BRAND_GUIDE.md)** - Design system and brand guidelines

### 🔧 Specialized Guides
- **[Photo Integration](./PHOTO_INTEGRATION_GUIDE.md)** - Photo upload and management
- **[Database Documentation](./sql/README.md)** - Database schema and migrations

## Project Structure

```
src/
├── components/          # React components
│   ├── ui/             # Reusable UI components
│   ├── reviews/        # Review system components
│   ├── streaming/      # Music streaming components
│   └── ...
├── services/           # API services and business logic
├── hooks/              # Custom React hooks
├── types/              # TypeScript type definitions
├── utils/              # Utility functions
└── pages/              # Page components

supabase/
├── migrations/         # Database migrations
└── config.toml         # Supabase configuration

backend/                # Express.js backend (optional)
├── server.js          # Main server file
└── routes/            # API routes
```

## Key Features

### 🎵 Event Discovery
- Real-time concert search via JamBase API
- Location-based event discovery
- Artist and venue information
- Event filtering and sorting

### ⭐ Review System
- Rate concerts and venues
- Post-submit ranking for nuanced preferences
- Social engagement (likes, comments, shares)
- Photo and video support

### 🎧 Music Integration
- Spotify and Apple Music connectivity
- Music preference analysis
- Personalized recommendations
- Streaming profile sync

### 👥 Social Features
- User profiles and connections
- Friend system
- Event interest tracking
- Chat and messaging

## Development

### Available Scripts

```bash
# Development
npm run dev              # Start development server
npm run dev:full         # Start both frontend and backend
npm run backend:dev      # Start backend only

# Building
npm run build            # Build for production
npm run preview          # Preview production build

# Database
npm run supabase:start   # Start Supabase locally
npm run supabase:stop    # Stop Supabase
npm run supabase:reset   # Reset database
```

### Environment Setup

For detailed setup instructions, see [Development Setup](./DEV_SETUP.md).

## Deployment

### Vercel (Recommended)

1. Connect your GitHub repository to Vercel
2. Add environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

For detailed deployment instructions, see [Deployment Guide](./DEPLOYMENT.md).

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

### Development Guidelines

- Follow the [Brand Guide](./BRAND_GUIDE.md) for UI/UX consistency
- Use TypeScript for all new code
- Write tests for new features
- Update documentation as needed
- Follow the existing code style

## API Keys & Services

### Required
- **Supabase**: Database and authentication
- **JamBase**: Concert and artist data

### Optional
- **Spotify**: Music streaming integration
- **Apple Music**: Music streaming integration
- **Cities API**: Location services

For detailed integration setup, see [Integrations](./INTEGRATIONS.md).

## Support

### Getting Help
1. Check the documentation above
2. Review existing issues on GitHub
3. Open a new issue with detailed information

### Common Issues
- **Build errors**: Check environment variables
- **API issues**: Verify API keys and network connectivity
- **Database errors**: Ensure Supabase is running and migrations applied

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Roadmap

### Upcoming Features
- AI-powered event recommendations
- Enhanced social features
- Mobile app development
- Advanced analytics dashboard

### Recent Updates
- Post-submit review ranking system
- Apple Music integration
- Enhanced venue review system
- Improved mobile responsiveness

---

**Built with ❤️ for music lovers everywhere**

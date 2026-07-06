# Project Setup & Commands

## Quick Start

### Prerequisites
- Node.js installed
- npm or yarn

### Installation
```bash
cd app
npm install
```

### Running the Application

**Development (Full Stack - Frontend + Backend):**
```bash
npm run dev:all
```
This runs:
- Frontend (Vite): http://localhost:3000
- Backend (Express): http://localhost:3001

**Frontend Only:**
```bash
npm run dev
```
Opens: http://localhost:3000

**Backend Only:**
```bash
npm run dev:server
```
Runs on: http://localhost:3001

### Other Commands
```bash
npm run build    # Production build
npm run preview  # Preview production build
npm run lint     # Run ESLint
```

## Architecture

- **Frontend**: React + TypeScript + Vite + TailwindCSS
- **Backend**: Express.js (Node.js)
- **API**: NSE (National Stock Exchange) data integration
- **UI Components**: Radix UI + custom components

## Project Structure
```
app/
├── src/
│   ├── components/       # React components
│   ├── pages/           # Page components
│   ├── hooks/           # Custom React hooks
│   ├── lib/             # Utilities
│   ├── types/           # TypeScript types
│   ├── App.tsx          # Main app component
│   └── main.tsx         # Entry point
├── public/
│   └── data/           # Static data (quarterly.json)
├── server.js           # Express backend
├── vite.config.ts      # Vite configuration
├── tailwind.config.js  # TailwindCSS config
├── tsconfig.json       # TypeScript config
└── package.json        # Dependencies
```

## Features

- Financial data dashboard
- Real-time stock prices via NSE
- Charts and visualizations
- EPS analysis
- Tax analysis
- Revenue tracking
- Expense breakdown

## API Endpoints

Backend runs on port 3001 and provides:
- `/api/nse/quote/:symbol` - Get stock quotes
- Other NSE data endpoints

Frontend on port 3000 proxies these calls automatically.

## Notes

- Ensure both ports 3000 and 3001 are available
- Backend handles NSE session/cookie management
- Response caching: 5 minutes TTL
- CORS enabled for development

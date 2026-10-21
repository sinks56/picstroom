# PicStroom

A Progressive Web App recreation of PicStroom, the beloved iPad app (c. 2011-2014) that pulled images from RSS feeds for visual inspiration browsing.

![PicStroom](public/icons/icon-192.png)

## Features

- **RSS Feed Support**: Add feeds by pasting site URLs or direct RSS/Atom URLs. Auto-discovers feeds from site `<link rel="alternate">` tags.
- **Multiple Feed Formats**: Supports RSS 2.0, Atom, `media:content`, `media:thumbnail`, enclosures, and images embedded in HTML content.
- **Beautiful Views**:
  - **Row View**: Horizontal swipeable rows per feed (the classic PicStroom look)
  - **Grid View**: Combined masonry grid of all feeds
- **Full-Screen Viewer**: Tap any image for full-screen view with swipe navigation and pinch-to-zoom
- **Favorites**: Star images to save them for later
- **Feed Management**: Rename, reorder, delete feeds, organize into folders
- **OPML Import/Export**: Easily migrate your feeds
- **Starter Directory**: Curated collection of design, architecture, photography, and illustration feeds
- **Offline Support**: Service worker caches images for offline viewing
- **Dark/Light Themes**: Matches your system preference or set manually
- **Works Everywhere**: Pure static site that can be hosted anywhere

## Install on iPad

PicStroom is a Progressive Web App (PWA) that can be installed on your iPad home screen for a native app-like experience.

### Installation Steps

1. **Open Safari** on your iPad (must be Safari, not Chrome or other browsers)
2. **Navigate** to your PicStroom URL
3. **Tap the Share button** (the square with arrow pointing up)
4. **Scroll down** and tap **"Add to Home Screen"**
5. **Name the app** "PicStroom" (or keep the suggested name)
6. **Tap "Add"**

The app will now appear on your home screen with the PicStroom icon. When launched, it opens in full-screen standalone mode without Safari's browser chrome.

### Tips for iPad

- **Swipe horizontally** on feed rows to browse images
- **Pull down** to refresh feeds
- **Tap and hold** an image for quick actions
- **Pinch to zoom** in the full-screen viewer
- **Swipe left/right** in the viewer to navigate between images

## Development

### Prerequisites

- Node.js 18+
- npm

### Setup

```bash
# Install dependencies
npm install

# Generate icons (run once after cloning)
node scripts/generate-icons.mjs

# Start development server
npm run dev
```

The app will be available at `http://localhost:5847`

### Build for Production

```bash
npm run build
```

Output will be in the `dist` folder.

## Deployment

### GitHub Pages (Recommended)

1. Push this repo to GitHub
2. Go to **Settings** → **Pages**
3. Under "Build and deployment", select **GitHub Actions**
4. The included workflow (`.github/workflows/deploy.yml`) will automatically deploy on push to `main`

Your app will be available at `https://<username>.github.io/<repo-name>/`

### Other Static Hosts

The built `dist` folder can be deployed to any static hosting service:

- **Netlify**: Drag and drop the `dist` folder or connect your repo
- **Vercel**: `npx vercel --prod`
- **Cloudflare Pages**: Connect your repo and set build command to `npm run build`, output to `dist`

## CORS Proxy

Most RSS feeds don't include CORS headers, so the app uses a CORS proxy to fetch them. The app ships with a default proxy at `https://picstroom-proxy.pages.dev`.

### Deploying Your Own Proxy (Cloudflare Pages)

To deploy your own relay using Cloudflare Pages:

```bash
cd cloudflare-worker
mkdir dist && cp worker.js dist/_worker.js
npx wrangler pages deploy dist --project-name picstroom-proxy
```

Then set `VITE_CORS_PROXY_URL` in your build environment or update `src/config.ts`.

### Alternative: Cloudflare Workers

You can also deploy as a traditional Worker:

1. Go to the `cloudflare-worker` folder
2. Follow the instructions in `cloudflare-worker/README.md`
3. Add your worker URL in PicStroom **Settings** → **Proxy** → **Custom Proxy URL**

Template format: `https://your-worker.workers.dev/?url={url}`

## Project Structure

```
├── src/
│   ├── components/     # React components
│   ├── lib/           # Utility functions (RSS parser, CORS proxy, storage)
│   ├── store/         # Zustand state management
│   ├── types/         # TypeScript types
│   ├── App.tsx        # Main app component
│   └── main.tsx       # Entry point
├── public/
│   ├── icons/         # App icons (generated)
│   └── splash/        # Splash screens (generated)
├── cloudflare-worker/ # Optional CORS proxy worker
├── scripts/           # Build scripts
└── .github/workflows/ # GitHub Actions deployment
```

## Technology Stack

- **React 18** with TypeScript
- **Vite** for bundling
- **Tailwind CSS** for styling
- **Zustand** for state management
- **IndexedDB** (via idb) for local storage
- **Framer Motion** for animations
- **Workbox** for service worker/PWA

## Browser Support

- Safari (iOS/iPadOS) 14+
- Chrome 90+
- Firefox 90+
- Edge 90+

## License

MIT

## Acknowledgments

Inspired by the original PicStroom app by Pocket Pixels, which was a beloved tool for designers and visual creatives during the iPad's early years.

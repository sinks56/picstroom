# PicStroom CORS Proxy Worker

A simple Cloudflare Worker that proxies RSS feed requests to bypass CORS restrictions in the browser.

## Why do I need this?

Most RSS feeds don't include CORS headers, which means browsers block direct requests from web apps. This worker acts as a proxy, fetching the feed on behalf of your browser and adding the necessary CORS headers.

PicStroom includes several public CORS proxies, but they can be unreliable. Deploying your own worker gives you better reliability and control.

## Deployment

### Prerequisites

1. A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works)
2. [Node.js](https://nodejs.org/) installed locally
3. [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed

### Steps

1. **Install Wrangler** (if not already installed):
   ```bash
   npm install -g wrangler
   ```

2. **Authenticate with Cloudflare**:
   ```bash
   wrangler login
   ```

3. **Deploy the worker**:
   ```bash
   cd cloudflare-worker
   wrangler deploy
   ```

4. **Note your worker URL** - it will be something like:
   ```
   https://picstroom-proxy.<your-subdomain>.workers.dev
   ```

### Configure PicStroom

1. Open PicStroom
2. Go to **Settings** → **Proxy**
3. In **Custom Proxy URL**, enter:
   ```
   https://picstroom-proxy.<your-subdomain>.workers.dev/?url={url}
   ```
4. Save settings

## Usage

The worker accepts GET requests with a `url` query parameter:

```
GET https://your-worker.workers.dev/?url=https://example.com/feed.xml
```

The worker will:
1. Fetch the target URL
2. Add CORS headers to the response
3. Return the content

## Configuration

Edit `wrangler.toml` to customize:

- `name`: Change the worker name
- Add environment variables for rate limiting

## Limits

- **Request timeout**: 15 seconds
- **Response size**: 10 MB max
- **Cloudflare free tier**: 100,000 requests/day

## Security Notes

- The worker allows any origin (`*`) for simplicity
- Consider adding domain restrictions for production use
- The worker doesn't cache responses (relies on Cloudflare's edge caching)

## Troubleshooting

### "Failed to fetch"
- Check that the target URL is accessible
- Verify the URL is properly encoded

### "Request timeout"
- The target server is slow or unresponsive
- Try again later

### Rate limited
- You've exceeded Cloudflare's free tier limits
- Upgrade to a paid plan or reduce usage

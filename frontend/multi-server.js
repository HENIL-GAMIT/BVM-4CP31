/**
 * Smart Dispatch single-port UI server
 * Serves the citizen landing page and role-based dashboards on port 3000.
 * Automatically proxies all /api/* requests to backend at http://localhost:5000
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';
const parsedBackend = new url.URL(BACKEND_URL);

// Locate the current Expo web export.
const DIST_DIR = path.resolve(__dirname, 'dist-web');
const STATIC_DIR = DIST_DIR;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.map': 'application/json'
};

const PORT_CONFIGS = [
  {
    port: 3000,
    role: 'emergency',
    label: 'Smart Dispatch 108'
  }
];

function proxyToBackend(req, res) {
  const options = {
    hostname: parsedBackend.hostname,
    port: parsedBackend.port || 5000,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: `${parsedBackend.hostname}:${parsedBackend.port || 5000}`,
      'x-forwarded-host': req.headers.host,
      'x-forwarded-proto': 'http'
    }
  };

  const proxyReq = http.request(options, (proxyRes) => {
    // Add CORS headers to allow cross-port requests seamlessly
    const headers = { ...proxyRes.headers };
    headers['access-control-allow-origin'] = '*';
    headers['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
    headers['access-control-allow-headers'] = 'Content-Type, Authorization, X-Request-Token';

    res.writeHead(proxyRes.statusCode, headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    res.writeHead(503, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(
      JSON.stringify({
        status: 503,
        error: 'Backend API Offline',
        message: 'Could not connect to .NET API at ' + BACKEND_URL + '. Please start it with: cd backend && dotnet run'
      })
    );
  });

  req.pipe(proxyReq);
}

function createServerForPort(config) {
  const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url);
    const pathname = decodeURIComponent(parsedUrl.pathname);

    // Handle CORS pre-flight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-Token'
      });
      res.end();
      return;
    }

    // Proxy API requests directly to .NET backend
    if (pathname.startsWith('/api')) {
      proxyToBackend(req, res);
      return;
    }

    // Attempt to serve static asset
    let filePath = path.join(STATIC_DIR, pathname);

    // If it's root or directory or file doesn't exist, serve SPA index.html with injected port
    if (pathname === '/' || !path.extname(pathname) || !fs.existsSync(filePath)) {
      const indexPath = path.join(STATIC_DIR, 'index.html');
      if (fs.existsSync(indexPath)) {
        fs.readFile(indexPath, 'utf8', (err, html) => {
          if (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Error loading index.html');
            return;
          }

          // Inject active port and default role
          const injection = `
  <script>
    window.__SMART_DISPATCH_PORT__ = "${config.port}";
    window.__SMART_DISPATCH_DEFAULT_ROLE__ = "${config.role}";
  </script>
`;
          const modifiedHtml = html.replace('</head>', `${injection}\n</head>`);
          res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Access-Control-Allow-Origin': '*'
          });
          res.end(modifiedHtml);
        });
        return;
      } else {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end(`<h3>Build files not found. Run "npm run build" to export web assets.</h3>`);
        return;
      }
    }

    // Serve static asset file
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('File not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=31536000'
      });
      res.end(content);
    });
  });

  server.listen(config.port, '0.0.0.0', () => {
    // Port listener started
  });

  return server;
}

// Start the single UI server.
console.log('\n================================================================');
console.log('              SMART DISPATCH 108 - SINGLE UI                  ');
console.log('================================================================');
console.log(`Web Assets Directory: ${STATIC_DIR}`);
console.log(`Backend Reverse Proxy: ${BACKEND_URL}\n`);

PORT_CONFIGS.forEach((cfg) => {
  createServerForPort(cfg);
  console.log(`  Port ${cfg.port} -> http://localhost:${cfg.port}  [${cfg.label}]`);
});

console.log('================================================================');
console.log('Emergency requests and role-based dashboards share this UI port.\n');

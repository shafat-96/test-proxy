import https from "node:https";
import http from "node:http";
import { domainTemplates } from "./domainTemplates.js";

// Proxies MP4 (and similar byte-range assets) with Range support and domain-based headers
export async function proxyMp4(url, headers, req, res) {
  const isHttps = url.startsWith("https://");

  // Merge domain template headers with incoming headers and client's Range header
  const resolveHeaders = (targetUrl, incoming = {}) => {
    try {
      const u = new URL(targetUrl);
      const hn = u.hostname;
      const template = domainTemplates.find((t) => t.pattern.test(hn));
      const base = template?.headers ? { ...template.headers } : {};
      const dyn = typeof template?.headersFn === "function" ? template.headersFn(targetUrl) : {};
      const merged = { ...base, ...dyn, ...incoming };
      // Ensure Range (if any) is forwarded
      if (req.headers["range"]) {
        merged["range"] = req.headers["range"]; // preserve client's Range
      }
      return merged;
    } catch {
      const merged = { ...incoming };
      if (req.headers["range"]) merged["range"] = req.headers["range"]; 
      return merged;
    }
  };

  let effectiveHeaders = resolveHeaders(url, headers);

  // Follow redirects (up to 5), updating headers per final host each time
  const maxRedirects = 5;
  let currentUrl = url;
  let redirects = 0;

  const doRequest = (targetUrl) =>
    new Promise((resolve, reject) => {
      try {
        const u = new URL(targetUrl);
        const options = {
          hostname: u.hostname,
          port: u.port || (u.protocol === "https:" ? 443 : 80),
          path: u.pathname + u.search,
          method: req.method || "GET",
          headers: {
            "User-Agent":
              req.headers["user-agent"] ||
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
            ...effectiveHeaders,
          },
        };
        const client = u.protocol === "https:" ? https : http;
        const upstream = client.request(options, (r) => resolve({ r, protocol: u.protocol }));
        upstream.on("error", reject);
        // Forward body for non-GET if needed
        if (req.method && req.method !== "GET" && req.method !== "HEAD") {
          req.pipe(upstream);
        } else {
          upstream.end();
        }
      } catch (e) {
        reject(e);
      }
    });

  try {
    while (redirects <= maxRedirects) {
      // Update headers for current host before each hop
      effectiveHeaders = resolveHeaders(currentUrl, headers);
      const { r } = await doRequest(currentUrl);

      // Handle redirects
      if ([301, 302, 303, 307, 308].includes(r.statusCode || 0)) {
        const loc = r.headers.location;
        if (!loc) {
          // No location header, treat like normal response
        } else {
          redirects += 1;
          if (redirects > maxRedirects) {
            res.writeHead(508, "Loop Detected");
            res.end("Too many redirects");
            return;
          }
          currentUrl = new URL(loc, currentUrl).href;
          // Drain and continue
          r.resume();
          continue;
        }
      }

      // Success or passthrough
      const headersOut = { ...r.headers };
      // Enforce CORS + MP4 headers
      headersOut["access-control-allow-origin"] = "*";
      headersOut["access-control-allow-headers"] = "*";
      headersOut["access-control-allow-methods"] = "*";
      headersOut["accept-ranges"] = headersOut["accept-ranges"] || "bytes";
      headersOut["content-type"] = headersOut["content-type"] || "video/mp4";

      // Honor upstream status (handles 200/206 for Range)
      res.writeHead(r.statusCode || 200, headersOut);
      r.pipe(res, { end: true });
      return;
    }
  } catch (e) {
    res.writeHead(500);
    res.end(e.message);
    return;
  }
}

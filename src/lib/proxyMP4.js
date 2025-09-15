import https from "node:https";
import http from "node:http";

// Proxies MP4 files with Range support and permissive CORS
export async function proxyMp4(url, headers, req, res) {
  const isHttps = url.startsWith("https://");

  const uri = new URL(url);
  const defaultPort = isHttps ? 443 : 80;

  const options = {
    hostname: uri.hostname,
    port: uri.port || defaultPort,
    path: uri.pathname + uri.search,
    method: req.method,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.132 Safari/537.36",
      Accept: "*/*",
      ...headers,
    },
  };

  // Forward common request headers if present
  if (req.headers["range"]) {
    options.headers["Range"] = req.headers["range"];
  }
  if (req.headers["origin"] && !options.headers["Origin"]) {
    options.headers["Origin"] = req.headers["origin"];
  }
  if (req.headers["referer"] && !options.headers["Referer"]) {
    options.headers["Referer"] = req.headers["referer"];
  }

  // Basic CORS on our response
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "*");
  res.setHeader(
    "Access-Control-Expose-Headers",
    "Content-Length, Content-Range, Accept-Ranges, Content-Type"
  );

  const client = isHttps ? https : http;

  try {
    const proxyReq = client.request(options, (upstream) => {
      // Default content-type to video/mp4 if upstream didn't send one
      if (!("content-type" in upstream.headers)) {
        upstream.headers["content-type"] = "video/mp4";
      }
      // Ensure Accept-Ranges header is visible to browser
      if (!("accept-ranges" in upstream.headers)) {
        upstream.headers["accept-ranges"] = "bytes";
      }

      res.writeHead(upstream.statusCode ?? 200, upstream.headers);
      upstream.pipe(res, { end: true });
    });

    proxyReq.on("error", (e) => {
      res.writeHead(502);
      res.end(e.message);
    });

    // Pipe request body if any (rare for GET but safe)
    req.pipe(proxyReq, { end: true });
  } catch (e) {
    res.writeHead(500);
    res.end(e.message);
    return null;
  }
}

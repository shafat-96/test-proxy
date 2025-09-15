import https from "node:https";
import http from "node:http";

export async function proxyTs(url, headers, req, res) {
  let forceHTTPS = false;

  if (url.startsWith("https://")) {
    forceHTTPS = true;
  }

  const uri = new URL(url);
  const defaultPort = forceHTTPS ? 443 : 80;
  const options = {
    hostname: uri.hostname,
    port: uri.port || defaultPort,
    path: uri.pathname + uri.search,
    method: req.method,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.132 Safari/537.36",
      ...headers,
    },
  };
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "*");
  res.setHeader(
    "Access-Control-Expose-Headers",
    "Content-Length, Content-Range, Accept-Ranges, Content-Type"
  );

  // Forward Range header for partial content requests
  if (req.headers["range"]) {
    options.headers["Range"] = req.headers["range"];
  }
  if (req.headers["origin"] && !options.headers["Origin"]) {
    options.headers["Origin"] = req.headers["origin"];
  }
  if (req.headers["referer"] && !options.headers["Referer"]) {
    options.headers["Referer"] = req.headers["referer"];
  }

  try {
    if (forceHTTPS) {
      const proxy = https.request(options, (r) => {
        res.writeHead(r.statusCode ?? 200, r.headers);

        r.pipe(res, {
          end: true,
        });
      });

      req.pipe(proxy, {
        end: true,
      });
      proxy.on("error", (e) => {
        res.writeHead(502);
        res.end(e.message);
      });
    } else {
      const proxy = http.request(options, (r) => {
        res.writeHead(r.statusCode ?? 200, r.headers);

        r.pipe(res, {
          end: true,
        });
      });
      req.pipe(proxy, {
        end: true,
      });
      proxy.on("error", (e) => {
        res.writeHead(502);
        res.end(e.message);
      });
    }
  } catch (e) {
    res.writeHead(500);
    res.end(e.message);
    return null;
  }
}

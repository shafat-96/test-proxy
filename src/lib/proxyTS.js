import https from "node:https";
import http from "node:http";
import { domainTemplates } from "./domainTemplates.js";

export async function proxyTs(url, headers, req, res) {
  let forceHTTPS = false;

  if (url.startsWith("https://")) {
    forceHTTPS = true;
  }

  const uri = new URL(url);
  // Merge domain template headers with incoming headers
  const resolveHeaders = (targetUrl, incoming = {}) => {
    try {
      const u = new URL(targetUrl);
      const hn = u.hostname;
      const template = domainTemplates.find((t) => t.pattern.test(hn));
      if (!template) return { ...incoming };
      const base = { ...(template.headers || {}) };
      const dyn = typeof template.headersFn === "function" ? template.headersFn(targetUrl) : {};
      return { ...base, ...dyn, ...incoming };
    } catch {
      return { ...incoming };
    }
  };
  const effectiveHeaders = resolveHeaders(url, headers);
  const options = {
    hostname: uri.hostname,
    port: uri.port,
    path: uri.pathname + uri.search,
    method: req.method,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.132 Safari/537.36",
      ...effectiveHeaders,
    },
  };
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "*");

  try {
    if (forceHTTPS) {
      const proxy = https.request(options, (r) => {
        r.headers["content-type"] = "video/mp2t";
        res.writeHead(r.statusCode ?? 200, r.headers);

        r.pipe(res, {
          end: true,
        });
      });

      req.pipe(proxy, {
        end: true,
      });
    } else {
      const proxy = http.request(options, (r) => {
        r.headers["content-type"] = "video/mp2t";
        res.writeHead(r.statusCode ?? 200, r.headers);

        r.pipe(res, {
          end: true,
        });
      });
      req.pipe(proxy, {
        end: true,
      });
    }
  } catch (e) {
    res.writeHead(500);
    res.end(e.message);
    return null;
  }
}

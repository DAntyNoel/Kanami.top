import http from "node:http";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Local QA only. Publish dist/ with the server's existing static-site setup.
const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".ogg": "audio/ogg", ".png": "image/png" };
const server = http.createServer(async (request, response) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  if (!["GET", "HEAD"].includes(request.method)) {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const file = path.resolve(dist, `.${pathname === "/" ? "/index.html" : pathname}`);
    const relative = path.relative(dist, file);
    if (relative.startsWith("..") || path.isAbsolute(relative) || relative.split(path.sep).some((part) => part.startsWith("."))) throw new Error("Invalid path");
    const body = await readFile(file);
    response.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    response.end(request.method === "HEAD" ? undefined : await readFile(path.join(dist, "404.html")));
  }
});
server.listen(12705, "127.0.0.1", () => console.log("本机验证：http://127.0.0.1:12705/"));

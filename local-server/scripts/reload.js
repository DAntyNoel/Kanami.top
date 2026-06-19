const DEFAULT_HOST = process.env.LOCAL_SERVER_HOST || "127.0.0.1";
const DEFAULT_PORT = process.env.LOCAL_SERVER_PORT || "12700";

function parseArgs(argv) {
  const options = {
    next: "",
    url: `http://${DEFAULT_HOST}:${DEFAULT_PORT}`
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--next" && argv[index + 1]) {
      options.next = argv[index + 1];
      index += 1;
    } else if (arg.startsWith("--next=")) {
      options.next = arg.slice("--next=".length);
    } else if (arg === "--url" && argv[index + 1]) {
      options.url = argv[index + 1];
      index += 1;
    } else if (arg.startsWith("--url=")) {
      options.url = arg.slice("--url=".length);
    } else if (!arg.startsWith("-") && !options.next) {
      options.next = arg;
    }
  }

  return options;
}

function triggerUrl(baseUrl, nextPath) {
  const url = new URL("/__reload/trigger", baseUrl);
  if (nextPath) {
    url.searchParams.set("next", nextPath);
  }
  return url;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const url = triggerUrl(options.url, options.next);
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`reload request failed: HTTP ${response.status}`);
  }

  const payload = await response.json();
  console.log(`Kanami local-server reload triggered: ${payload.token}`);
  if (payload.next) {
    console.log(`Target: ${payload.next}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

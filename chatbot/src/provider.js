import net from "node:net";
import { config } from "./env.js";

let localProbeCache = {
  checkedAt: 0,
  available: false
};

function localCliProxyBaseUrl() {
  return `http://${config.localCliProxyHost}:${config.localCliProxyPort}/v1`;
}

function probeTcpPort(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;

    function finish(available) {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(available);
    }

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

export async function isLocalCliProxyAvailable({ force = false } = {}) {
  if (!config.localCliProxyPort) return false;

  const now = Date.now();
  if (!force && config.localCliProxyCacheMs > 0 && now - localProbeCache.checkedAt < config.localCliProxyCacheMs) {
    return localProbeCache.available;
  }

  const available = await probeTcpPort(
    config.localCliProxyHost,
    config.localCliProxyPort,
    config.localCliProxyProbeMs
  );

  localProbeCache = {
    checkedAt: Date.now(),
    available
  };

  return available;
}

export async function resolveProvider({ forceLocalProbe = false } = {}) {
  const localAvailable = await isLocalCliProxyAvailable({ force: forceLocalProbe });
  if (localAvailable) {
    return {
      source: "local-cliproxy",
      baseUrl: localCliProxyBaseUrl(),
      localAvailable
    };
  }

  return {
    source: "base-url",
    baseUrl: config.baseUrl,
    localAvailable
  };
}

export function providerHeaders() {
  const headers = {
    "Content-Type": "application/json"
  };

  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }

  return headers;
}

export function isApiKeyRequired(provider) {
  return provider.source === "base-url" && !config.apiKey;
}

import fs from "node:fs";
import { paths } from "./env.js";

let cache = {
  mtimeMs: 0,
  text: ""
};

export function getKanamiPrompt() {
  const stat = fs.statSync(paths.prompt);
  if (cache.text && cache.mtimeMs === stat.mtimeMs) {
    return cache.text;
  }

  const text = fs.readFileSync(paths.prompt, "utf8").trim();
  cache = {
    mtimeMs: stat.mtimeMs,
    text
  };

  return text;
}

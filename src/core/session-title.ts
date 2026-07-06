import { randomInt } from "node:crypto";

const SESSION_ADJECTIVES = ["amber", "black", "blue", "bright", "calm", "crimson", "dark", "gold", "green", "quiet", "red", "silver", "swift", "violet", "white"] as const;
const SESSION_NOUNS = ["aleph", "atlas", "beacon", "cipher", "comet", "delta", "ember", "falcon", "lambda", "nova", "orbit", "pixel", "quartz", "vector", "zenith"] as const;

export function randomSessionTitle(): string {
  const adjective = SESSION_ADJECTIVES[randomInt(SESSION_ADJECTIVES.length)];
  const noun = SESSION_NOUNS[randomInt(SESSION_NOUNS.length)];
  return `${adjective}-${noun}`;
}

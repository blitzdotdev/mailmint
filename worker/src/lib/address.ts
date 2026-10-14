// Address parsing, validation and generation. An inbox is `local@domain`;
// mail to `local+tag@domain` lands in the same inbox with `tag` recorded, so one
// inbox can sign up to many sites and filter by tag.

export interface ParsedAddress {
  /** Inbox address, lowercased, without the +tag. */
  address: string;
  local: string;
  domain: string;
  tag: string | null;
}

const LOCAL = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
const TAG = /^[a-z0-9._-]{1,64}$/;

export function isValidLocal(local: string): boolean {
  return LOCAL.test(local) && !local.includes("..");
}

/** Parse a recipient. Returns null for anything that isn't a plain address we could own. */
export function parseAddress(raw: string): ParsedAddress | null {
  const value = raw.trim().toLowerCase();
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1) return null;
  const domain = value.slice(at + 1);
  const full = value.slice(0, at);
  const plus = full.indexOf("+");
  const local = plus === -1 ? full : full.slice(0, plus);
  const tagRaw = plus === -1 ? null : full.slice(plus + 1);
  if (!isValidLocal(local)) return null;
  const tag = tagRaw && TAG.test(tagRaw) ? tagRaw : null;
  return { address: `${local}@${domain}`, local, domain, tag };
}

const ADJECTIVES = [
  "amber", "brave", "brisk", "calm", "clever", "cosmic", "crisp", "dapper", "eager", "fancy",
  "gentle", "glad", "golden", "happy", "hazel", "honest", "jolly", "keen", "kind", "lively",
  "lucky", "mellow", "merry", "mighty", "misty", "nimble", "noble", "olive", "plucky", "polite",
  "proud", "quick", "quiet", "rapid", "rosy", "rustic", "sandy", "sharp", "shiny", "silver",
  "sleepy", "smooth", "snappy", "solar", "steady", "sunny", "swift", "tidy", "vivid", "witty",
  "young", "zesty", "breezy", "cheery", "dusky", "fuzzy", "humble", "jazzy", "lunar", "minty",
  "peppy", "rainy", "snowy", "spry",
];
const NOUNS = [
  "otter", "falcon", "badger", "beaver", "bison", "cobra", "condor", "coyote", "crane", "dingo",
  "dolphin", "eagle", "ferret", "finch", "gecko", "heron", "ibis", "jackal", "koala", "lemur",
  "lynx", "magpie", "marmot", "moose", "newt", "ocelot", "orca", "osprey", "panda", "parrot",
  "pelican", "penguin", "puffin", "quail", "rabbit", "raven", "robin", "salmon", "seal", "shrew",
  "sparrow", "squid", "stork", "swan", "tapir", "tiger", "toucan", "trout", "turtle", "walrus",
  "weasel", "whale", "wombat", "yak", "zebra", "alpaca", "bobcat", "camel", "dove", "egret",
  "gopher", "hippo", "iguana", "kiwi",
];
const SUFFIX_ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

function pick<T>(list: readonly T[], byte: number): T {
  return list[byte % list.length] as T;
}

/** `quiet-otter-4k7m`: readable, 32 bits of randomness. Not a secret (reading needs a token). */
export function randomLocal(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const suffix = Array.from(bytes.slice(2), (b) => pick([...SUFFIX_ALPHABET], b)).join("");
  return `${pick(ADJECTIVES, bytes[0] ?? 0)}-${pick(NOUNS, bytes[1] ?? 0)}-${suffix}`;
}

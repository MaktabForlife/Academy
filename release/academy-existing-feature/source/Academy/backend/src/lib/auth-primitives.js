// Storage independent cryptography. Keep formats stable across deployments.
const PIN_HASH_VERSION = "v2";
const PIN_HASH_ALGORITHM = "pbkdf2-sha256";
const PIN_HASH_ITERATIONS = 100000;
const PIN_SALT_BYTES = 16;
const PIN_DERIVED_KEY_BYTES = 32;
export const CREDENTIAL_SESSION_VERSION = 2;

export async function createSessionToken(payload, env) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const {
    credentialHash = "",
    authrow = 0,
    ...sessionPayload
  } = payload || {};

  if (credentialHash) {
    const normalizedAuthRow = Number(authrow);

    if (!Number.isInteger(normalizedAuthRow) || normalizedAuthRow < 2) {
      throw new Error("Credential-bound session requires a valid authentication row");
    }

    sessionPayload.authrow = normalizedAuthRow;
    sessionPayload.cv = await createCredentialVersion(credentialHash, env.SESSION_SECRET);
    sessionPayload.sv = CREDENTIAL_SESSION_VERSION;
  }

  const body = {
    ...sessionPayload,
    iat: now,
    exp: now + 60 * 60 * 24 * 7
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedBody = base64url(JSON.stringify(body));
  const data = `${encodedHeader}.${encodedBody}`;
  const signature = await sign(data, env.SESSION_SECRET);

  return `${data}.${signature}`;
}

export async function verifySessionToken(token, env) {
  try {
    const parts = String(token || "").split(".");

    if (parts.length !== 3) {
      return null;
    }

    const [header, body, signature] = parts;
    const data = `${header}.${body}`;
    const expectedSignature = await sign(data, env.SESSION_SECRET);

    if (!constantTimeEqual(signature, expectedSignature)) {
      return null;
    }

    const payload = JSON.parse(decodeBase64urlText(body));
    const now = Math.floor(Date.now() / 1000);

    if (!payload || !Number.isFinite(payload.exp) || payload.exp < now) {
      return null;
    }

    return payload;
  } catch (error) {
    return null;
  }
}

async function sign(data, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(requireSecret(secret, "SESSION_SECRET")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data)
  );

  return bytesToHex(new Uint8Array(signature));
}

function base64url(input) {
  return btoa(input)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function hashPin(pin, secret) {
  const data = new TextEncoder().encode(
    String(pin) + requireSecret(secret, "PIN_SECRET")
  );
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);

  return bytesToHex(new Uint8Array(hashBuffer));
}

export async function createSaltedPinHash(pin, secret, options = {}) {
  if (!isValidFourDigitPin(pin)) {
    throw new Error("PIN must be exactly four digits");
  }

  const iterations = Number(options.iterations || PIN_HASH_ITERATIONS);

  if (!Number.isInteger(iterations) || iterations < 10000 || iterations > 1000000) {
    throw new Error("Invalid PIN hashing iteration count");
  }

  const salt = options.salt instanceof Uint8Array
    ? options.salt
    : crypto.getRandomValues(new Uint8Array(PIN_SALT_BYTES));

  if (salt.length < PIN_SALT_BYTES) {
    throw new Error("PIN salt must be at least 16 bytes");
  }

  const derivedKey = await derivePinKey(pin, secret, salt, iterations);

  return [
    PIN_HASH_VERSION,
    PIN_HASH_ALGORITHM,
    iterations,
    base64urlBytes(salt),
    bytesToHex(derivedKey)
  ].join("$");
}

export async function verifyPin(pin, storedHash, secret) {
  if (!isValidFourDigitPin(pin)) {
    return { valid: false, needsMigration: false, upgradedHash: "" };
  }

  const normalizedStoredHash = String(storedHash || "").trim();

  if (!normalizedStoredHash) {
    return { valid: false, needsMigration: false, upgradedHash: "" };
  }

  const saltedHash = parseSaltedPinHash(normalizedStoredHash);

  if (saltedHash) {
    const derivedKey = await derivePinKey(
      pin,
      secret,
      saltedHash.salt,
      saltedHash.iterations
    );
    const valid = constantTimeEqual(
      bytesToHex(derivedKey),
      saltedHash.derivedKeyHex
    );

    return { valid, needsMigration: false, upgradedHash: "" };
  }

  const legacyHash = await hashPin(pin, secret);
  const valid = constantTimeEqual(legacyHash, normalizedStoredHash);

  return {
    valid,
    needsMigration: valid,
    upgradedHash: valid ? await createSaltedPinHash(pin, secret) : ""
  };
}

export function isSaltedPinHash(value) {
  return parseSaltedPinHash(String(value || "").trim()) !== null;
}

export function isValidFourDigitPin(pin) {
  return typeof pin === "string" && /^\d{4}$/.test(pin);
}

export async function createAuthRateLimitKey(accountType, uniqueid, env) {
  const type = String(accountType || "unknown").trim().toLowerCase();
  const account = String(uniqueid || "").trim();
  const keyMaterial = `m4l-login:${type}:${account}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(requireSecret(env.PIN_SECRET, "PIN_SECRET")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(keyMaterial)
  );

  return `${type}:${bytesToHex(new Uint8Array(signature)).slice(0, 40)}`;
}

export function normalizeWhatsapp6(value) {
  const digits = String(value || "").replace(/\D/g, "");

  if (!digits) {
    return "999999";
  }

  return digits.slice(-6).padStart(6, "0");
}

async function derivePinKey(pin, secret, salt, iterations) {
  const passwordMaterial = new TextEncoder().encode(
    `${pin}\u0000${requireSecret(secret, "PIN_SECRET")}`
  );
  const key = await crypto.subtle.importKey(
    "raw",
    passwordMaterial,
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations
    },
    key,
    PIN_DERIVED_KEY_BYTES * 8
  );

  return new Uint8Array(derivedBits);
}

function parseSaltedPinHash(value) {
  const parts = String(value || "").split("$");

  if (
    parts.length !== 5 ||
    parts[0] !== PIN_HASH_VERSION ||
    parts[1] !== PIN_HASH_ALGORITHM
  ) {
    return null;
  }

  const iterations = Number(parts[2]);

  if (!Number.isInteger(iterations) || iterations < 10000 || iterations > 1000000) {
    return null;
  }

  let salt;

  try {
    salt = base64urlToBytes(parts[3]);
  } catch (error) {
    return null;
  }

  if (salt.length < PIN_SALT_BYTES || !/^[0-9a-f]{64}$/i.test(parts[4])) {
    return null;
  }

  return {
    iterations,
    salt,
    derivedKeyHex: parts[4].toLowerCase()
  };
}

export async function createCredentialVersion(credentialHash, sessionSecret) {
  return sign(`credential:${String(credentialHash || "")}`, sessionSecret);
}

export function constantTimeEqual(left, right) {
  const leftText = String(left || "");
  const rightText = String(right || "");
  const maxLength = Math.max(leftText.length, rightText.length);
  let difference = leftText.length ^ rightText.length;

  for (let index = 0; index < maxLength; index += 1) {
    difference |= (leftText.charCodeAt(index) || 0) ^ (rightText.charCodeAt(index) || 0);
  }

  return difference === 0;
}

function bytesToHex(bytes) {
  return [...bytes]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

function base64urlBytes(bytes) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlToBytes(value) {
  const normalized = String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function decodeBase64urlText(value) {
  const normalized = String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return atob(padded);
}

function requireSecret(value, name) {
  const secret = String(value || "");

  if (!secret) {
    throw new Error(`Missing ${name} Worker secret`);
  }

  return secret;
}

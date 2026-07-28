'use strict';

// Minimal local adapter for the vendored Meituan signing core.
//
// The upstream 1.3.0 entrypoint starts a background device-fingerprint daemon
// as soon as the module is loaded and can load replacement code from a
// user-writable ~/.cliguard/cliguard-updates directory. The Passport CLI used by
// this Skill only performs requests through global fetch. Keep that required
// signing path, but deliberately omit the daemon, dynamic updater and http/https
// monkey patches.

const crypto = require('node:crypto');
const { addCommonParams: addParams, signRequest } = require('./core/cliguard');

const EMPTY_BODY_MD5 = 'd41d8cd98f00b204e9800998ecf8427e';
const SIGNED_BODY_PREFIX_BYTES = 0x3f48;
const originalFetch = globalThis.fetch?.bind(globalThis);

function addCommonParams(url) {
  return addParams(String(url)).url;
}

async function bodyHash(body) {
  if (body === undefined || body === null) return EMPTY_BODY_MD5;

  let bytes;
  if (typeof body === 'string') {
    bytes = Buffer.from(body);
  } else if (Buffer.isBuffer(body)) {
    bytes = body;
  } else if (body instanceof ArrayBuffer) {
    bytes = Buffer.from(body);
  } else if (ArrayBuffer.isView(body)) {
    bytes = Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  } else if (body instanceof URLSearchParams) {
    bytes = Buffer.from(body.toString());
  } else if (typeof Blob !== 'undefined' && body instanceof Blob) {
    bytes = Buffer.from(await body.arrayBuffer());
  } else {
    return null;
  }

  return crypto
    .createHash('md5')
    .update(bytes.subarray(0, SIGNED_BODY_PREFIX_BYTES))
    .digest('hex');
}

function withSignedHeaders(headers, signature) {
  if (headers instanceof Headers) {
    const next = new Headers(headers);
    for (const [name, value] of Object.entries(signature)) next.set(name, value);
    return next;
  }
  return { ...(headers || {}), ...signature };
}

if (originalFetch) {
  globalThis.fetch = async function jinguyuanSignedFetch(input, init) {
    try {
      const sourceUrl = typeof input === 'string' || input instanceof URL
        ? String(input)
        : input?.url;
      if (!sourceUrl) return originalFetch(input, init);

      const signedUrl = addCommonParams(sourceUrl);
      const method = String(init?.method || input?.method || 'GET').toUpperCase();
      const hash = await bodyHash(init?.body);
      const nextInput = input instanceof URL ? new URL(signedUrl) : signedUrl;

      if (hash === null) return originalFetch(nextInput, init);

      const signature = signRequest(method, signedUrl, hash);
      const sourceHeaders = init?.headers || input?.headers;
      const nextInit = { ...(init || {}), headers: withSignedHeaders(sourceHeaders, signature) };
      return originalFetch(nextInput, nextInit);
    } catch {
      // Preserve the upstream fail-open behavior: signing failures must surface
      // as the original request result, not crash the Passport process.
      return originalFetch(input, init);
    }
  };
}

module.exports = {
  sign: signRequest,
  addCommonParams,
};

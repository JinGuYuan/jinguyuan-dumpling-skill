#!/usr/bin/env node
/* 构建产物：由 build.mjs 从 scripts/ 松散模块融合生成，严禁手改。 */
"use strict";
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// scripts/passport.js
var require_passport = __commonJS({
  "scripts/passport.js"(exports2, module2) {
    var childProcess = require("node:child_process");
    var fs = require("node:fs");
    var os = require("node:os");
    var path = require("node:path");
    var CLIENT_ID = "170f5f2dbbde4048bd4a5e4ed28209cc";
    var PASSPORT_ENV = "prod";
    var CLI_PATH = path.resolve(__dirname, "vendor/pt-passport/dist/index.js");
    var PASSPORT_BUNDLED = path.resolve(__dirname, "vendor/pt-passport/bundled_modules");
    function defaultRun(args, options) {
      return new Promise((resolve) => {
        childProcess.execFile(
          options.executable,
          [options.cliPath, ...args],
          { env: options.env, encoding: "utf8" },
          (error, stdout, stderr) => {
            resolve({ code: error?.code ?? 0, stdout: stdout ?? "", stderr: stderr ?? "" });
          }
        );
      });
    }
    function parseJson(output) {
      const candidates = [String(output ?? "").trim(), ...String(output ?? "").trim().split(/\r?\n/).reverse()];
      for (const candidate of candidates) {
        if (!candidate) continue;
        try {
          return JSON.parse(candidate);
        } catch {
        }
      }
      return null;
    }
    function tokenResult(token) {
      const result = {};
      Object.defineProperty(result, "token", {
        value: token,
        enumerable: false
      });
      return result;
    }
    function parseToken(output) {
      const json = parseJson(output);
      if (typeof json?.token === "string" && json.token) return json.token;
      const labelled = String(output ?? "").match(/Token:\s*([^\s]+)/i);
      if (labelled) return labelled[1];
      const plain = String(output ?? "").trim();
      if (/^[A-Za-z0-9_-]{16,}$/.test(plain)) return plain;
      return null;
    }
    function normalizeAuthLink(link) {
      if (typeof link !== "string") return null;
      const trimmed = link.trim();
      if (!/^https?:\/\//i.test(trimmed)) return null;
      return trimmed.replace(/^http:\/\//i, "https://");
    }
    function parseAuthLink(output) {
      const json = parseJson(output);
      if (typeof json?.auth_link === "string") {
        const normalized = normalizeAuthLink(json.auth_link);
        if (normalized) return normalized;
      }
      const labelled = String(output ?? "").match(/AUTH_LINK:\s*(https?:\/\/[^\s]+)/i)?.[1];
      return normalizeAuthLink(labelled);
    }
    function passportError(output) {
      const text = String(output ?? "");
      let code = "PASSPORT_FAILED";
      let message = "Passport command failed";
      if (/PollTimeoutError|timeout|timed out|超时/i.test(text)) {
        code = "PASSPORT_TIMEOUT";
        message = "Passport authorization timed out";
      } else if (/UserCancelError|cancel(?:led)?|取消/i.test(text)) {
        code = "PASSPORT_CANCELLED";
        message = "Passport authorization was cancelled";
      } else if (/RiskDenyError|risk.?deny|风控.*拒绝|拒绝.*授权/i.test(text)) {
        code = "PASSPORT_RISK_DENIED";
        message = "Passport authorization was denied by risk control";
      }
      const error = new Error(message);
      error.code = code;
      return error;
    }
    function createPassport({ run = defaultRun, homeDir = os.homedir(), tmpDir = os.tmpdir() } = {}) {
      const cacheDir = path.join(homeDir, ".jinguyuan");
      const authFile = path.join(cacheDir, "passport-auth.json");
      const env = {
        ...process.env,
        PT_PASSPORT_AUTH_FILE: authFile,
        TMPDIR: tmpDir,
        TEMP: tmpDir,
        TMP: tmpDir,
        NODE_PATH: [PASSPORT_BUNDLED, process.env.NODE_PATH].filter(Boolean).join(path.delimiter)
      };
      async function invoke(args, { missingCacheIsNull = false } = {}) {
        fs.mkdirSync(cacheDir, { recursive: true, mode: 448 });
        if (process.platform !== "win32") fs.chmodSync(cacheDir, 448);
        let completed;
        try {
          completed = await run(args, {
            executable: process.execPath,
            cliPath: CLI_PATH,
            env
          });
        } catch (error) {
          throw passportError(error?.message);
        }
        const output = [completed?.stdout, completed?.stderr].filter(Boolean).join("\n");
        if (completed?.code !== 0) {
          if (missingCacheIsNull && completed?.code === 1) {
            if (!parseToken(output)) return null;
            return output;
          }
          throw passportError(output);
        }
        return output;
      }
      return {
        async getToken() {
          const output = await invoke([
            "get-token",
            "--client_id",
            CLIENT_ID,
            "--env",
            PASSPORT_ENV,
            "--json"
          ], { missingCacheIsNull: true });
          if (output === null) return null;
          const token = parseToken(output);
          if (!token) throw passportError(output);
          return tokenResult(token);
        },
        async startAuth({ force = false } = {}) {
          const args = [
            "auth",
            "get-code",
            "--client_id",
            CLIENT_ID,
            "--env",
            PASSPORT_ENV,
            "--json"
          ];
          if (force) args.push("--force");
          const output = await invoke(args);
          const authLink = parseAuthLink(output);
          if (authLink) return { authLink };
          const token = parseToken(output);
          if (token) return tokenResult(token);
          throw passportError(output);
        },
        async pollAuth() {
          const output = await invoke([
            "auth",
            "poll-token",
            "--client_id",
            CLIENT_ID,
            "--json"
          ]);
          const token = parseToken(output);
          if (!token) throw passportError(output);
          return tokenResult(token);
        },
        async logout() {
          await invoke([
            "logout",
            "--client_id",
            CLIENT_ID,
            "--env",
            PASSPORT_ENV
          ]);
          return {};
        }
      };
    }
    module2.exports = { createPassport, PASSPORT_BUNDLED };
  }
});

// scripts/lib/auth-run.js
var require_auth_run = __commonJS({
  "scripts/lib/auth-run.js"(exports2, module2) {
    "use strict";
    var crypto = require("node:crypto");
    var AUTH_RUN_ID_PATTERN = /^[0-9a-f]{12}$/;
    function createAuthRunId() {
      return crypto.randomUUID().replaceAll("-", "").slice(0, 12);
    }
    function isAuthRunId(value) {
      return typeof value === "string" && AUTH_RUN_ID_PATTERN.test(value);
    }
    module2.exports = { AUTH_RUN_ID_PATTERN, createAuthRunId, isAuthRunId };
  }
});

// scripts/vendor/bundled_modules/qrcode/lib/can-promise.js
var require_can_promise = __commonJS({
  "scripts/vendor/bundled_modules/qrcode/lib/can-promise.js"(exports2, module2) {
    module2.exports = function() {
      return typeof Promise === "function" && Promise.prototype && Promise.prototype.then;
    };
  }
});

// scripts/vendor/bundled_modules/qrcode/lib/core/utils.js
var require_utils = __commonJS({
  "scripts/vendor/bundled_modules/qrcode/lib/core/utils.js"(exports2) {
    var toSJISFunction;
    var CODEWORDS_COUNT = [
      0,
      // Not used
      26,
      44,
      70,
      100,
      134,
      172,
      196,
      242,
      292,
      346,
      404,
      466,
      532,
      581,
      655,
      733,
      815,
      901,
      991,
      1085,
      1156,
      1258,
      1364,
      1474,
      1588,
      1706,
      1828,
      1921,
      2051,
      2185,
      2323,
      2465,
      2611,
      2761,
      2876,
      3034,
      3196,
      3362,
      3532,
      3706
    ];
    exports2.getSymbolSize = function getSymbolSize(version) {
      if (!version) throw new Error('"version" cannot be null or undefined');
      if (version < 1 || version > 40) throw new Error('"version" should be in range from 1 to 40');
      return version * 4 + 17;
    };
    exports2.getSymbolTotalCodewords = function getSymbolTotalCodewords(version) {
      return CODEWORDS_COUNT[version];
    };
    exports2.getBCHDigit = function(data) {
      let digit = 0;
      while (data !== 0) {
        digit++;
        data >>>= 1;
      }
      return digit;
    };
    exports2.setToSJISFunction = function setToSJISFunction(f) {
      if (typeof f !== "function") {
        throw new Error('"toSJISFunc" is not a valid function.');
      }
      toSJISFunction = f;
    };
    exports2.isKanjiModeEnabled = function() {
      return typeof toSJISFunction !== "undefined";
    };
    exports2.toSJIS = function toSJIS(kanji) {
      return toSJISFunction(kanji);
    };
  }
});

// scripts/vendor/bundled_modules/qrcode/lib/core/error-correction-level.js
var require_error_correction_level = __commonJS({
  "scripts/vendor/bundled_modules/qrcode/lib/core/error-correction-level.js"(exports2) {
    exports2.L = { bit: 1 };
    exports2.M = { bit: 0 };
    exports2.Q = { bit: 3 };
    exports2.H = { bit: 2 };
    function fromString(string) {
      if (typeof string !== "string") {
        throw new Error("Param is not a string");
      }
      const lcStr = string.toLowerCase();
      switch (lcStr) {
        case "l":
        case "low":
          return exports2.L;
        case "m":
        case "medium":
          return exports2.M;
        case "q":
        case "quartile":
          return exports2.Q;
        case "h":
        case "high":
          return exports2.H;
        default:
          throw new Error("Unknown EC Level: " + string);
      }
    }
    exports2.isValid = function isValid(level) {
      return level && typeof level.bit !== "undefined" && level.bit >= 0 && level.bit < 4;
    };
    exports2.from = function from(value, defaultValue) {
      if (exports2.isValid(value)) {
        return value;
      }
      try {
        return fromString(value);
      } catch (e) {
        return defaultValue;
      }
    };
  }
});

// scripts/vendor/bundled_modules/qrcode/lib/core/bit-buffer.js
var require_bit_buffer = __commonJS({
  "scripts/vendor/bundled_modules/qrcode/lib/core/bit-buffer.js"(exports2, module2) {
    function BitBuffer() {
      this.buffer = [];
      this.length = 0;
    }
    BitBuffer.prototype = {
      get: function(index) {
        const bufIndex = Math.floor(index / 8);
        return (this.buffer[bufIndex] >>> 7 - index % 8 & 1) === 1;
      },
      put: function(num, length) {
        for (let i = 0; i < length; i++) {
          this.putBit((num >>> length - i - 1 & 1) === 1);
        }
      },
      getLengthInBits: function() {
        return this.length;
      },
      putBit: function(bit) {
        const bufIndex = Math.floor(this.length / 8);
        if (this.buffer.length <= bufIndex) {
          this.buffer.push(0);
        }
        if (bit) {
          this.buffer[bufIndex] |= 128 >>> this.length % 8;
        }
        this.length++;
      }
    };
    module2.exports = BitBuffer;
  }
});

// scripts/vendor/bundled_modules/qrcode/lib/core/bit-matrix.js
var require_bit_matrix = __commonJS({
  "scripts/vendor/bundled_modules/qrcode/lib/core/bit-matrix.js"(exports2, module2) {
    function BitMatrix(size) {
      if (!size || size < 1) {
        throw new Error("BitMatrix size must be defined and greater than 0");
      }
      this.size = size;
      this.data = new Uint8Array(size * size);
      this.reservedBit = new Uint8Array(size * size);
    }
    BitMatrix.prototype.set = function(row, col, value, reserved) {
      const index = row * this.size + col;
      this.data[index] = value;
      if (reserved) this.reservedBit[index] = true;
    };
    BitMatrix.prototype.get = function(row, col) {
      return this.data[row * this.size + col];
    };
    BitMatrix.prototype.xor = function(row, col, value) {
      this.data[row * this.size + col] ^= value;
    };
    BitMatrix.prototype.isReserved = function(row, col) {
      return this.reservedBit[row * this.size + col];
    };
    module2.exports = BitMatrix;
  }
});

// scripts/vendor/bundled_modules/qrcode/lib/core/alignment-pattern.js
var require_alignment_pattern = __commonJS({
  "scripts/vendor/bundled_modules/qrcode/lib/core/alignment-pattern.js"(exports2) {
    var getSymbolSize = require_utils().getSymbolSize;
    exports2.getRowColCoords = function getRowColCoords(version) {
      if (version === 1) return [];
      const posCount = Math.floor(version / 7) + 2;
      const size = getSymbolSize(version);
      const intervals = size === 145 ? 26 : Math.ceil((size - 13) / (2 * posCount - 2)) * 2;
      const positions = [size - 7];
      for (let i = 1; i < posCount - 1; i++) {
        positions[i] = positions[i - 1] - intervals;
      }
      positions.push(6);
      return positions.reverse();
    };
    exports2.getPositions = function getPositions(version) {
      const coords = [];
      const pos = exports2.getRowColCoords(version);
      const posLength = pos.length;
      for (let i = 0; i < posLength; i++) {
        for (let j = 0; j < posLength; j++) {
          if (i === 0 && j === 0 || // top-left
          i === 0 && j === posLength - 1 || // bottom-left
          i === posLength - 1 && j === 0) {
            continue;
          }
          coords.push([pos[i], pos[j]]);
        }
      }
      return coords;
    };
  }
});

// scripts/vendor/bundled_modules/qrcode/lib/core/finder-pattern.js
var require_finder_pattern = __commonJS({
  "scripts/vendor/bundled_modules/qrcode/lib/core/finder-pattern.js"(exports2) {
    var getSymbolSize = require_utils().getSymbolSize;
    var FINDER_PATTERN_SIZE = 7;
    exports2.getPositions = function getPositions(version) {
      const size = getSymbolSize(version);
      return [
        // top-left
        [0, 0],
        // top-right
        [size - FINDER_PATTERN_SIZE, 0],
        // bottom-left
        [0, size - FINDER_PATTERN_SIZE]
      ];
    };
  }
});

// scripts/vendor/bundled_modules/qrcode/lib/core/mask-pattern.js
var require_mask_pattern = __commonJS({
  "scripts/vendor/bundled_modules/qrcode/lib/core/mask-pattern.js"(exports2) {
    exports2.Patterns = {
      PATTERN000: 0,
      PATTERN001: 1,
      PATTERN010: 2,
      PATTERN011: 3,
      PATTERN100: 4,
      PATTERN101: 5,
      PATTERN110: 6,
      PATTERN111: 7
    };
    var PenaltyScores = {
      N1: 3,
      N2: 3,
      N3: 40,
      N4: 10
    };
    exports2.isValid = function isValid(mask) {
      return mask != null && mask !== "" && !isNaN(mask) && mask >= 0 && mask <= 7;
    };
    exports2.from = function from(value) {
      return exports2.isValid(value) ? parseInt(value, 10) : void 0;
    };
    exports2.getPenaltyN1 = function getPenaltyN1(data) {
      const size = data.size;
      let points = 0;
      let sameCountCol = 0;
      let sameCountRow = 0;
      let lastCol = null;
      let lastRow = null;
      for (let row = 0; row < size; row++) {
        sameCountCol = sameCountRow = 0;
        lastCol = lastRow = null;
        for (let col = 0; col < size; col++) {
          let module3 = data.get(row, col);
          if (module3 === lastCol) {
            sameCountCol++;
          } else {
            if (sameCountCol >= 5) points += PenaltyScores.N1 + (sameCountCol - 5);
            lastCol = module3;
            sameCountCol = 1;
          }
          module3 = data.get(col, row);
          if (module3 === lastRow) {
            sameCountRow++;
          } else {
            if (sameCountRow >= 5) points += PenaltyScores.N1 + (sameCountRow - 5);
            lastRow = module3;
            sameCountRow = 1;
          }
        }
        if (sameCountCol >= 5) points += PenaltyScores.N1 + (sameCountCol - 5);
        if (sameCountRow >= 5) points += PenaltyScores.N1 + (sameCountRow - 5);
      }
      return points;
    };
    exports2.getPenaltyN2 = function getPenaltyN2(data) {
      const size = data.size;
      let points = 0;
      for (let row = 0; row < size - 1; row++) {
        for (let col = 0; col < size - 1; col++) {
          const last = data.get(row, col) + data.get(row, col + 1) + data.get(row + 1, col) + data.get(row + 1, col + 1);
          if (last === 4 || last === 0) points++;
        }
      }
      return points * PenaltyScores.N2;
    };
    exports2.getPenaltyN3 = function getPenaltyN3(data) {
      const size = data.size;
      let points = 0;
      let bitsCol = 0;
      let bitsRow = 0;
      for (let row = 0; row < size; row++) {
        bitsCol = bitsRow = 0;
        for (let col = 0; col < size; col++) {
          bitsCol = bitsCol << 1 & 2047 | data.get(row, col);
          if (col >= 10 && (bitsCol === 1488 || bitsCol === 93)) points++;
          bitsRow = bitsRow << 1 & 2047 | data.get(col, row);
          if (col >= 10 && (bitsRow === 1488 || bitsRow === 93)) points++;
        }
      }
      return points * PenaltyScores.N3;
    };
    exports2.getPenaltyN4 = function getPenaltyN4(data) {
      let darkCount = 0;
      const modulesCount = data.data.length;
      for (let i = 0; i < modulesCount; i++) darkCount += data.data[i];
      const k = Math.abs(Math.ceil(darkCount * 100 / modulesCount / 5) - 10);
      return k * PenaltyScores.N4;
    };
    function getMaskAt(maskPattern, i, j) {
      switch (maskPattern) {
        case exports2.Patterns.PATTERN000:
          return (i + j) % 2 === 0;
        case exports2.Patterns.PATTERN001:
          return i % 2 === 0;
        case exports2.Patterns.PATTERN010:
          return j % 3 === 0;
        case exports2.Patterns.PATTERN011:
          return (i + j) % 3 === 0;
        case exports2.Patterns.PATTERN100:
          return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
        case exports2.Patterns.PATTERN101:
          return i * j % 2 + i * j % 3 === 0;
        case exports2.Patterns.PATTERN110:
          return (i * j % 2 + i * j % 3) % 2 === 0;
        case exports2.Patterns.PATTERN111:
          return (i * j % 3 + (i + j) % 2) % 2 === 0;
        default:
          throw new Error("bad maskPattern:" + maskPattern);
      }
    }
    exports2.applyMask = function applyMask(pattern, data) {
      const size = data.size;
      for (let col = 0; col < size; col++) {
        for (let row = 0; row < size; row++) {
          if (data.isReserved(row, col)) continue;
          data.xor(row, col, getMaskAt(pattern, row, col));
        }
      }
    };
    exports2.getBestMask = function getBestMask(data, setupFormatFunc) {
      const numPatterns = Object.keys(exports2.Patterns).length;
      let bestPattern = 0;
      let lowerPenalty = Infinity;
      for (let p = 0; p < numPatterns; p++) {
        setupFormatFunc(p);
        exports2.applyMask(p, data);
        const penalty = exports2.getPenaltyN1(data) + exports2.getPenaltyN2(data) + exports2.getPenaltyN3(data) + exports2.getPenaltyN4(data);
        exports2.applyMask(p, data);
        if (penalty < lowerPenalty) {
          lowerPenalty = penalty;
          bestPattern = p;
        }
      }
      return bestPattern;
    };
  }
});

// scripts/vendor/bundled_modules/qrcode/lib/core/error-correction-code.js
var require_error_correction_code = __commonJS({
  "scripts/vendor/bundled_modules/qrcode/lib/core/error-correction-code.js"(exports2) {
    var ECLevel = require_error_correction_level();
    var EC_BLOCKS_TABLE = [
      // L  M  Q  H
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      2,
      2,
      1,
      2,
      2,
      4,
      1,
      2,
      4,
      4,
      2,
      4,
      4,
      4,
      2,
      4,
      6,
      5,
      2,
      4,
      6,
      6,
      2,
      5,
      8,
      8,
      4,
      5,
      8,
      8,
      4,
      5,
      8,
      11,
      4,
      8,
      10,
      11,
      4,
      9,
      12,
      16,
      4,
      9,
      16,
      16,
      6,
      10,
      12,
      18,
      6,
      10,
      17,
      16,
      6,
      11,
      16,
      19,
      6,
      13,
      18,
      21,
      7,
      14,
      21,
      25,
      8,
      16,
      20,
      25,
      8,
      17,
      23,
      25,
      9,
      17,
      23,
      34,
      9,
      18,
      25,
      30,
      10,
      20,
      27,
      32,
      12,
      21,
      29,
      35,
      12,
      23,
      34,
      37,
      12,
      25,
      34,
      40,
      13,
      26,
      35,
      42,
      14,
      28,
      38,
      45,
      15,
      29,
      40,
      48,
      16,
      31,
      43,
      51,
      17,
      33,
      45,
      54,
      18,
      35,
      48,
      57,
      19,
      37,
      51,
      60,
      19,
      38,
      53,
      63,
      20,
      40,
      56,
      66,
      21,
      43,
      59,
      70,
      22,
      45,
      62,
      74,
      24,
      47,
      65,
      77,
      25,
      49,
      68,
      81
    ];
    var EC_CODEWORDS_TABLE = [
      // L  M  Q  H
      7,
      10,
      13,
      17,
      10,
      16,
      22,
      28,
      15,
      26,
      36,
      44,
      20,
      36,
      52,
      64,
      26,
      48,
      72,
      88,
      36,
      64,
      96,
      112,
      40,
      72,
      108,
      130,
      48,
      88,
      132,
      156,
      60,
      110,
      160,
      192,
      72,
      130,
      192,
      224,
      80,
      150,
      224,
      264,
      96,
      176,
      260,
      308,
      104,
      198,
      288,
      352,
      120,
      216,
      320,
      384,
      132,
      240,
      360,
      432,
      144,
      280,
      408,
      480,
      168,
      308,
      448,
      532,
      180,
      338,
      504,
      588,
      196,
      364,
      546,
      650,
      224,
      416,
      600,
      700,
      224,
      442,
      644,
      750,
      252,
      476,
      690,
      816,
      270,
      504,
      750,
      900,
      300,
      560,
      810,
      960,
      312,
      588,
      870,
      1050,
      336,
      644,
      952,
      1110,
      360,
      700,
      1020,
      1200,
      390,
      728,
      1050,
      1260,
      420,
      784,
      1140,
      1350,
      450,
      812,
      1200,
      1440,
      480,
      868,
      1290,
      1530,
      510,
      924,
      1350,
      1620,
      540,
      980,
      1440,
      1710,
      570,
      1036,
      1530,
      1800,
      570,
      1064,
      1590,
      1890,
      600,
      1120,
      1680,
      1980,
      630,
      1204,
      1770,
      2100,
      660,
      1260,
      1860,
      2220,
      720,
      1316,
      1950,
      2310,
      750,
      1372,
      2040,
      2430
    ];
    exports2.getBlocksCount = function getBlocksCount(version, errorCorrectionLevel) {
      switch (errorCorrectionLevel) {
        case ECLevel.L:
          return EC_BLOCKS_TABLE[(version - 1) * 4 + 0];
        case ECLevel.M:
          return EC_BLOCKS_TABLE[(version - 1) * 4 + 1];
        case ECLevel.Q:
          return EC_BLOCKS_TABLE[(version - 1) * 4 + 2];
        case ECLevel.H:
          return EC_BLOCKS_TABLE[(version - 1) * 4 + 3];
        default:
          return void 0;
      }
    };
    exports2.getTotalCodewordsCount = function getTotalCodewordsCount(version, errorCorrectionLevel) {
      switch (errorCorrectionLevel) {
        case ECLevel.L:
          return EC_CODEWORDS_TABLE[(version - 1) * 4 + 0];
        case ECLevel.M:
          return EC_CODEWORDS_TABLE[(version - 1) * 4 + 1];
        case ECLevel.Q:
          return EC_CODEWORDS_TABLE[(version - 1) * 4 + 2];
        case ECLevel.H:
          return EC_CODEWORDS_TABLE[(version - 1) * 4 + 3];
        default:
          return void 0;
      }
    };
  }
});

// scripts/vendor/bundled_modules/qrcode/lib/core/galois-field.js
var require_galois_field = __commonJS({
  "scripts/vendor/bundled_modules/qrcode/lib/core/galois-field.js"(exports2) {
    var EXP_TABLE = new Uint8Array(512);
    var LOG_TABLE = new Uint8Array(256);
    (function initTables() {
      let x = 1;
      for (let i = 0; i < 255; i++) {
        EXP_TABLE[i] = x;
        LOG_TABLE[x] = i;
        x <<= 1;
        if (x & 256) {
          x ^= 285;
        }
      }
      for (let i = 255; i < 512; i++) {
        EXP_TABLE[i] = EXP_TABLE[i - 255];
      }
    })();
    exports2.log = function log(n) {
      if (n < 1) throw new Error("log(" + n + ")");
      return LOG_TABLE[n];
    };
    exports2.exp = function exp(n) {
      return EXP_TABLE[n];
    };
    exports2.mul = function mul(x, y) {
      if (x === 0 || y === 0) return 0;
      return EXP_TABLE[LOG_TABLE[x] + LOG_TABLE[y]];
    };
  }
});

// scripts/vendor/bundled_modules/qrcode/lib/core/polynomial.js
var require_polynomial = __commonJS({
  "scripts/vendor/bundled_modules/qrcode/lib/core/polynomial.js"(exports2) {
    var GF = require_galois_field();
    exports2.mul = function mul(p1, p2) {
      const coeff = new Uint8Array(p1.length + p2.length - 1);
      for (let i = 0; i < p1.length; i++) {
        for (let j = 0; j < p2.length; j++) {
          coeff[i + j] ^= GF.mul(p1[i], p2[j]);
        }
      }
      return coeff;
    };
    exports2.mod = function mod(divident, divisor) {
      let result = new Uint8Array(divident);
      while (result.length - divisor.length >= 0) {
        const coeff = result[0];
        for (let i = 0; i < divisor.length; i++) {
          result[i] ^= GF.mul(divisor[i], coeff);
        }
        let offset = 0;
        while (offset < result.length && result[offset] === 0) offset++;
        result = result.slice(offset);
      }
      return result;
    };
    exports2.generateECPolynomial = function generateECPolynomial(degree) {
      let poly = new Uint8Array([1]);
      for (let i = 0; i < degree; i++) {
        poly = exports2.mul(poly, new Uint8Array([1, GF.exp(i)]));
      }
      return poly;
    };
  }
});

// scripts/vendor/bundled_modules/qrcode/lib/core/reed-solomon-encoder.js
var require_reed_solomon_encoder = __commonJS({
  "scripts/vendor/bundled_modules/qrcode/lib/core/reed-solomon-encoder.js"(exports2, module2) {
    var Polynomial = require_polynomial();
    function ReedSolomonEncoder(degree) {
      this.genPoly = void 0;
      this.degree = degree;
      if (this.degree) this.initialize(this.degree);
    }
    ReedSolomonEncoder.prototype.initialize = function initialize(degree) {
      this.degree = degree;
      this.genPoly = Polynomial.generateECPolynomial(this.degree);
    };
    ReedSolomonEncoder.prototype.encode = function encode(data) {
      if (!this.genPoly) {
        throw new Error("Encoder not initialized");
      }
      const paddedData = new Uint8Array(data.length + this.degree);
      paddedData.set(data);
      const remainder = Polynomial.mod(paddedData, this.genPoly);
      const start = this.degree - remainder.length;
      if (start > 0) {
        const buff = new Uint8Array(this.degree);
        buff.set(remainder, start);
        return buff;
      }
      return remainder;
    };
    module2.exports = ReedSolomonEncoder;
  }
});

// scripts/vendor/bundled_modules/qrcode/lib/core/version-check.js
var require_version_check = __commonJS({
  "scripts/vendor/bundled_modules/qrcode/lib/core/version-check.js"(exports2) {
    exports2.isValid = function isValid(version) {
      return !isNaN(version) && version >= 1 && version <= 40;
    };
  }
});

// scripts/vendor/bundled_modules/qrcode/lib/core/regex.js
var require_regex = __commonJS({
  "scripts/vendor/bundled_modules/qrcode/lib/core/regex.js"(exports2) {
    var numeric = "[0-9]+";
    var alphanumeric = "[A-Z $%*+\\-./:]+";
    var kanji = "(?:[u3000-u303F]|[u3040-u309F]|[u30A0-u30FF]|[uFF00-uFFEF]|[u4E00-u9FAF]|[u2605-u2606]|[u2190-u2195]|u203B|[u2010u2015u2018u2019u2025u2026u201Cu201Du2225u2260]|[u0391-u0451]|[u00A7u00A8u00B1u00B4u00D7u00F7])+";
    kanji = kanji.replace(/u/g, "\\u");
    var byte = "(?:(?![A-Z0-9 $%*+\\-./:]|" + kanji + ")(?:.|[\r\n]))+";
    exports2.KANJI = new RegExp(kanji, "g");
    exports2.BYTE_KANJI = new RegExp("[^A-Z0-9 $%*+\\-./:]+", "g");
    exports2.BYTE = new RegExp(byte, "g");
    exports2.NUMERIC = new RegExp(numeric, "g");
    exports2.ALPHANUMERIC = new RegExp(alphanumeric, "g");
    var TEST_KANJI = new RegExp("^" + kanji + "$");
    var TEST_NUMERIC = new RegExp("^" + numeric + "$");
    var TEST_ALPHANUMERIC = new RegExp("^[A-Z0-9 $%*+\\-./:]+$");
    exports2.testKanji = function testKanji(str) {
      return TEST_KANJI.test(str);
    };
    exports2.testNumeric = function testNumeric(str) {
      return TEST_NUMERIC.test(str);
    };
    exports2.testAlphanumeric = function testAlphanumeric(str) {
      return TEST_ALPHANUMERIC.test(str);
    };
  }
});

// scripts/vendor/bundled_modules/qrcode/lib/core/mode.js
var require_mode = __commonJS({
  "scripts/vendor/bundled_modules/qrcode/lib/core/mode.js"(exports2) {
    var VersionCheck = require_version_check();
    var Regex = require_regex();
    exports2.NUMERIC = {
      id: "Numeric",
      bit: 1 << 0,
      ccBits: [10, 12, 14]
    };
    exports2.ALPHANUMERIC = {
      id: "Alphanumeric",
      bit: 1 << 1,
      ccBits: [9, 11, 13]
    };
    exports2.BYTE = {
      id: "Byte",
      bit: 1 << 2,
      ccBits: [8, 16, 16]
    };
    exports2.KANJI = {
      id: "Kanji",
      bit: 1 << 3,
      ccBits: [8, 10, 12]
    };
    exports2.MIXED = {
      bit: -1
    };
    exports2.getCharCountIndicator = function getCharCountIndicator(mode, version) {
      if (!mode.ccBits) throw new Error("Invalid mode: " + mode);
      if (!VersionCheck.isValid(version)) {
        throw new Error("Invalid version: " + version);
      }
      if (version >= 1 && version < 10) return mode.ccBits[0];
      else if (version < 27) return mode.ccBits[1];
      return mode.ccBits[2];
    };
    exports2.getBestModeForData = function getBestModeForData(dataStr) {
      if (Regex.testNumeric(dataStr)) return exports2.NUMERIC;
      else if (Regex.testAlphanumeric(dataStr)) return exports2.ALPHANUMERIC;
      else if (Regex.testKanji(dataStr)) return exports2.KANJI;
      else return exports2.BYTE;
    };
    exports2.toString = function toString(mode) {
      if (mode && mode.id) return mode.id;
      throw new Error("Invalid mode");
    };
    exports2.isValid = function isValid(mode) {
      return mode && mode.bit && mode.ccBits;
    };
    function fromString(string) {
      if (typeof string !== "string") {
        throw new Error("Param is not a string");
      }
      const lcStr = string.toLowerCase();
      switch (lcStr) {
        case "numeric":
          return exports2.NUMERIC;
        case "alphanumeric":
          return exports2.ALPHANUMERIC;
        case "kanji":
          return exports2.KANJI;
        case "byte":
          return exports2.BYTE;
        default:
          throw new Error("Unknown mode: " + string);
      }
    }
    exports2.from = function from(value, defaultValue) {
      if (exports2.isValid(value)) {
        return value;
      }
      try {
        return fromString(value);
      } catch (e) {
        return defaultValue;
      }
    };
  }
});

// scripts/vendor/bundled_modules/qrcode/lib/core/version.js
var require_version = __commonJS({
  "scripts/vendor/bundled_modules/qrcode/lib/core/version.js"(exports2) {
    var Utils = require_utils();
    var ECCode = require_error_correction_code();
    var ECLevel = require_error_correction_level();
    var Mode = require_mode();
    var VersionCheck = require_version_check();
    var G18 = 1 << 12 | 1 << 11 | 1 << 10 | 1 << 9 | 1 << 8 | 1 << 5 | 1 << 2 | 1 << 0;
    var G18_BCH = Utils.getBCHDigit(G18);
    function getBestVersionForDataLength(mode, length, errorCorrectionLevel) {
      for (let currentVersion = 1; currentVersion <= 40; currentVersion++) {
        if (length <= exports2.getCapacity(currentVersion, errorCorrectionLevel, mode)) {
          return currentVersion;
        }
      }
      return void 0;
    }
    function getReservedBitsCount(mode, version) {
      return Mode.getCharCountIndicator(mode, version) + 4;
    }
    function getTotalBitsFromDataArray(segments, version) {
      let totalBits = 0;
      segments.forEach(function(data) {
        const reservedBits = getReservedBitsCount(data.mode, version);
        totalBits += reservedBits + data.getBitsLength();
      });
      return totalBits;
    }
    function getBestVersionForMixedData(segments, errorCorrectionLevel) {
      for (let currentVersion = 1; currentVersion <= 40; currentVersion++) {
        const length = getTotalBitsFromDataArray(segments, currentVersion);
        if (length <= exports2.getCapacity(currentVersion, errorCorrectionLevel, Mode.MIXED)) {
          return currentVersion;
        }
      }
      return void 0;
    }
    exports2.from = function from(value, defaultValue) {
      if (VersionCheck.isValid(value)) {
        return parseInt(value, 10);
      }
      return defaultValue;
    };
    exports2.getCapacity = function getCapacity(version, errorCorrectionLevel, mode) {
      if (!VersionCheck.isValid(version)) {
        throw new Error("Invalid QR Code version");
      }
      if (typeof mode === "undefined") mode = Mode.BYTE;
      const totalCodewords = Utils.getSymbolTotalCodewords(version);
      const ecTotalCodewords = ECCode.getTotalCodewordsCount(version, errorCorrectionLevel);
      const dataTotalCodewordsBits = (totalCodewords - ecTotalCodewords) * 8;
      if (mode === Mode.MIXED) return dataTotalCodewordsBits;
      const usableBits = dataTotalCodewordsBits - getReservedBitsCount(mode, version);
      switch (mode) {
        case Mode.NUMERIC:
          return Math.floor(usableBits / 10 * 3);
        case Mode.ALPHANUMERIC:
          return Math.floor(usableBits / 11 * 2);
        case Mode.KANJI:
          return Math.floor(usableBits / 13);
        case Mode.BYTE:
        default:
          return Math.floor(usableBits / 8);
      }
    };
    exports2.getBestVersionForData = function getBestVersionForData(data, errorCorrectionLevel) {
      let seg;
      const ecl = ECLevel.from(errorCorrectionLevel, ECLevel.M);
      if (Array.isArray(data)) {
        if (data.length > 1) {
          return getBestVersionForMixedData(data, ecl);
        }
        if (data.length === 0) {
          return 1;
        }
        seg = data[0];
      } else {
        seg = data;
      }
      return getBestVersionForDataLength(seg.mode, seg.getLength(), ecl);
    };
    exports2.getEncodedBits = function getEncodedBits(version) {
      if (!VersionCheck.isValid(version) || version < 7) {
        throw new Error("Invalid QR Code version");
      }
      let d = version << 12;
      while (Utils.getBCHDigit(d) - G18_BCH >= 0) {
        d ^= G18 << Utils.getBCHDigit(d) - G18_BCH;
      }
      return version << 12 | d;
    };
  }
});

// scripts/vendor/bundled_modules/qrcode/lib/core/format-info.js
var require_format_info = __commonJS({
  "scripts/vendor/bundled_modules/qrcode/lib/core/format-info.js"(exports2) {
    var Utils = require_utils();
    var G15 = 1 << 10 | 1 << 8 | 1 << 5 | 1 << 4 | 1 << 2 | 1 << 1 | 1 << 0;
    var G15_MASK = 1 << 14 | 1 << 12 | 1 << 10 | 1 << 4 | 1 << 1;
    var G15_BCH = Utils.getBCHDigit(G15);
    exports2.getEncodedBits = function getEncodedBits(errorCorrectionLevel, mask) {
      const data = errorCorrectionLevel.bit << 3 | mask;
      let d = data << 10;
      while (Utils.getBCHDigit(d) - G15_BCH >= 0) {
        d ^= G15 << Utils.getBCHDigit(d) - G15_BCH;
      }
      return (data << 10 | d) ^ G15_MASK;
    };
  }
});

// scripts/vendor/bundled_modules/qrcode/lib/core/numeric-data.js
var require_numeric_data = __commonJS({
  "scripts/vendor/bundled_modules/qrcode/lib/core/numeric-data.js"(exports2, module2) {
    var Mode = require_mode();
    function NumericData(data) {
      this.mode = Mode.NUMERIC;
      this.data = data.toString();
    }
    NumericData.getBitsLength = function getBitsLength(length) {
      return 10 * Math.floor(length / 3) + (length % 3 ? length % 3 * 3 + 1 : 0);
    };
    NumericData.prototype.getLength = function getLength() {
      return this.data.length;
    };
    NumericData.prototype.getBitsLength = function getBitsLength() {
      return NumericData.getBitsLength(this.data.length);
    };
    NumericData.prototype.write = function write(bitBuffer) {
      let i, group, value;
      for (i = 0; i + 3 <= this.data.length; i += 3) {
        group = this.data.substr(i, 3);
        value = parseInt(group, 10);
        bitBuffer.put(value, 10);
      }
      const remainingNum = this.data.length - i;
      if (remainingNum > 0) {
        group = this.data.substr(i);
        value = parseInt(group, 10);
        bitBuffer.put(value, remainingNum * 3 + 1);
      }
    };
    module2.exports = NumericData;
  }
});

// scripts/vendor/bundled_modules/qrcode/lib/core/alphanumeric-data.js
var require_alphanumeric_data = __commonJS({
  "scripts/vendor/bundled_modules/qrcode/lib/core/alphanumeric-data.js"(exports2, module2) {
    var Mode = require_mode();
    var ALPHA_NUM_CHARS = [
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
      "G",
      "H",
      "I",
      "J",
      "K",
      "L",
      "M",
      "N",
      "O",
      "P",
      "Q",
      "R",
      "S",
      "T",
      "U",
      "V",
      "W",
      "X",
      "Y",
      "Z",
      " ",
      "$",
      "%",
      "*",
      "+",
      "-",
      ".",
      "/",
      ":"
    ];
    function AlphanumericData(data) {
      this.mode = Mode.ALPHANUMERIC;
      this.data = data;
    }
    AlphanumericData.getBitsLength = function getBitsLength(length) {
      return 11 * Math.floor(length / 2) + 6 * (length % 2);
    };
    AlphanumericData.prototype.getLength = function getLength() {
      return this.data.length;
    };
    AlphanumericData.prototype.getBitsLength = function getBitsLength() {
      return AlphanumericData.getBitsLength(this.data.length);
    };
    AlphanumericData.prototype.write = function write(bitBuffer) {
      let i;
      for (i = 0; i + 2 <= this.data.length; i += 2) {
        let value = ALPHA_NUM_CHARS.indexOf(this.data[i]) * 45;
        value += ALPHA_NUM_CHARS.indexOf(this.data[i + 1]);
        bitBuffer.put(value, 11);
      }
      if (this.data.length % 2) {
        bitBuffer.put(ALPHA_NUM_CHARS.indexOf(this.data[i]), 6);
      }
    };
    module2.exports = AlphanumericData;
  }
});

// scripts/vendor/bundled_modules/qrcode/lib/core/byte-data.js
var require_byte_data = __commonJS({
  "scripts/vendor/bundled_modules/qrcode/lib/core/byte-data.js"(exports2, module2) {
    var Mode = require_mode();
    function ByteData(data) {
      this.mode = Mode.BYTE;
      if (typeof data === "string") {
        this.data = new TextEncoder().encode(data);
      } else {
        this.data = new Uint8Array(data);
      }
    }
    ByteData.getBitsLength = function getBitsLength(length) {
      return length * 8;
    };
    ByteData.prototype.getLength = function getLength() {
      return this.data.length;
    };
    ByteData.prototype.getBitsLength = function getBitsLength() {
      return ByteData.getBitsLength(this.data.length);
    };
    ByteData.prototype.write = function(bitBuffer) {
      for (let i = 0, l = this.data.length; i < l; i++) {
        bitBuffer.put(this.data[i], 8);
      }
    };
    module2.exports = ByteData;
  }
});

// scripts/vendor/bundled_modules/qrcode/lib/core/kanji-data.js
var require_kanji_data = __commonJS({
  "scripts/vendor/bundled_modules/qrcode/lib/core/kanji-data.js"(exports2, module2) {
    var Mode = require_mode();
    var Utils = require_utils();
    function KanjiData(data) {
      this.mode = Mode.KANJI;
      this.data = data;
    }
    KanjiData.getBitsLength = function getBitsLength(length) {
      return length * 13;
    };
    KanjiData.prototype.getLength = function getLength() {
      return this.data.length;
    };
    KanjiData.prototype.getBitsLength = function getBitsLength() {
      return KanjiData.getBitsLength(this.data.length);
    };
    KanjiData.prototype.write = function(bitBuffer) {
      let i;
      for (i = 0; i < this.data.length; i++) {
        let value = Utils.toSJIS(this.data[i]);
        if (value >= 33088 && value <= 40956) {
          value -= 33088;
        } else if (value >= 57408 && value <= 60351) {
          value -= 49472;
        } else {
          throw new Error(
            "Invalid SJIS character: " + this.data[i] + "\nMake sure your charset is UTF-8"
          );
        }
        value = (value >>> 8 & 255) * 192 + (value & 255);
        bitBuffer.put(value, 13);
      }
    };
    module2.exports = KanjiData;
  }
});

// scripts/vendor/bundled_modules/dijkstrajs/dijkstra.js
var require_dijkstra = __commonJS({
  "scripts/vendor/bundled_modules/dijkstrajs/dijkstra.js"(exports2, module2) {
    "use strict";
    var dijkstra = {
      single_source_shortest_paths: function(graph, s, d) {
        var predecessors = {};
        var costs = {};
        costs[s] = 0;
        var open = dijkstra.PriorityQueue.make();
        open.push(s, 0);
        var closest, u, v, cost_of_s_to_u, adjacent_nodes, cost_of_e, cost_of_s_to_u_plus_cost_of_e, cost_of_s_to_v, first_visit;
        while (!open.empty()) {
          closest = open.pop();
          u = closest.value;
          cost_of_s_to_u = closest.cost;
          adjacent_nodes = graph[u] || {};
          for (v in adjacent_nodes) {
            if (adjacent_nodes.hasOwnProperty(v)) {
              cost_of_e = adjacent_nodes[v];
              cost_of_s_to_u_plus_cost_of_e = cost_of_s_to_u + cost_of_e;
              cost_of_s_to_v = costs[v];
              first_visit = typeof costs[v] === "undefined";
              if (first_visit || cost_of_s_to_v > cost_of_s_to_u_plus_cost_of_e) {
                costs[v] = cost_of_s_to_u_plus_cost_of_e;
                open.push(v, cost_of_s_to_u_plus_cost_of_e);
                predecessors[v] = u;
              }
            }
          }
        }
        if (typeof d !== "undefined" && typeof costs[d] === "undefined") {
          var msg = ["Could not find a path from ", s, " to ", d, "."].join("");
          throw new Error(msg);
        }
        return predecessors;
      },
      extract_shortest_path_from_predecessor_list: function(predecessors, d) {
        var nodes = [];
        var u = d;
        var predecessor;
        while (u) {
          nodes.push(u);
          predecessor = predecessors[u];
          u = predecessors[u];
        }
        nodes.reverse();
        return nodes;
      },
      find_path: function(graph, s, d) {
        var predecessors = dijkstra.single_source_shortest_paths(graph, s, d);
        return dijkstra.extract_shortest_path_from_predecessor_list(
          predecessors,
          d
        );
      },
      /**
       * A very naive priority queue implementation.
       */
      PriorityQueue: {
        make: function(opts) {
          var T = dijkstra.PriorityQueue, t = {}, key;
          opts = opts || {};
          for (key in T) {
            if (T.hasOwnProperty(key)) {
              t[key] = T[key];
            }
          }
          t.queue = [];
          t.sorter = opts.sorter || T.default_sorter;
          return t;
        },
        default_sorter: function(a, b) {
          return a.cost - b.cost;
        },
        /**
         * Add a new item to the queue and ensure the highest priority element
         * is at the front of the queue.
         */
        push: function(value, cost) {
          var item = { value, cost };
          this.queue.push(item);
          this.queue.sort(this.sorter);
        },
        /**
         * Return the highest priority element in the queue.
         */
        pop: function() {
          return this.queue.shift();
        },
        empty: function() {
          return this.queue.length === 0;
        }
      }
    };
    if (typeof module2 !== "undefined") {
      module2.exports = dijkstra;
    }
  }
});

// scripts/vendor/bundled_modules/qrcode/lib/core/segments.js
var require_segments = __commonJS({
  "scripts/vendor/bundled_modules/qrcode/lib/core/segments.js"(exports2) {
    var Mode = require_mode();
    var NumericData = require_numeric_data();
    var AlphanumericData = require_alphanumeric_data();
    var ByteData = require_byte_data();
    var KanjiData = require_kanji_data();
    var Regex = require_regex();
    var Utils = require_utils();
    var dijkstra = require_dijkstra();
    function getStringByteLength(str) {
      return unescape(encodeURIComponent(str)).length;
    }
    function getSegments(regex, mode, str) {
      const segments = [];
      let result;
      while ((result = regex.exec(str)) !== null) {
        segments.push({
          data: result[0],
          index: result.index,
          mode,
          length: result[0].length
        });
      }
      return segments;
    }
    function getSegmentsFromString(dataStr) {
      const numSegs = getSegments(Regex.NUMERIC, Mode.NUMERIC, dataStr);
      const alphaNumSegs = getSegments(Regex.ALPHANUMERIC, Mode.ALPHANUMERIC, dataStr);
      let byteSegs;
      let kanjiSegs;
      if (Utils.isKanjiModeEnabled()) {
        byteSegs = getSegments(Regex.BYTE, Mode.BYTE, dataStr);
        kanjiSegs = getSegments(Regex.KANJI, Mode.KANJI, dataStr);
      } else {
        byteSegs = getSegments(Regex.BYTE_KANJI, Mode.BYTE, dataStr);
        kanjiSegs = [];
      }
      const segs = numSegs.concat(alphaNumSegs, byteSegs, kanjiSegs);
      return segs.sort(function(s1, s2) {
        return s1.index - s2.index;
      }).map(function(obj) {
        return {
          data: obj.data,
          mode: obj.mode,
          length: obj.length
        };
      });
    }
    function getSegmentBitsLength(length, mode) {
      switch (mode) {
        case Mode.NUMERIC:
          return NumericData.getBitsLength(length);
        case Mode.ALPHANUMERIC:
          return AlphanumericData.getBitsLength(length);
        case Mode.KANJI:
          return KanjiData.getBitsLength(length);
        case Mode.BYTE:
          return ByteData.getBitsLength(length);
      }
    }
    function mergeSegments(segs) {
      return segs.reduce(function(acc, curr) {
        const prevSeg = acc.length - 1 >= 0 ? acc[acc.length - 1] : null;
        if (prevSeg && prevSeg.mode === curr.mode) {
          acc[acc.length - 1].data += curr.data;
          return acc;
        }
        acc.push(curr);
        return acc;
      }, []);
    }
    function buildNodes(segs) {
      const nodes = [];
      for (let i = 0; i < segs.length; i++) {
        const seg = segs[i];
        switch (seg.mode) {
          case Mode.NUMERIC:
            nodes.push([
              seg,
              { data: seg.data, mode: Mode.ALPHANUMERIC, length: seg.length },
              { data: seg.data, mode: Mode.BYTE, length: seg.length }
            ]);
            break;
          case Mode.ALPHANUMERIC:
            nodes.push([
              seg,
              { data: seg.data, mode: Mode.BYTE, length: seg.length }
            ]);
            break;
          case Mode.KANJI:
            nodes.push([
              seg,
              { data: seg.data, mode: Mode.BYTE, length: getStringByteLength(seg.data) }
            ]);
            break;
          case Mode.BYTE:
            nodes.push([
              { data: seg.data, mode: Mode.BYTE, length: getStringByteLength(seg.data) }
            ]);
        }
      }
      return nodes;
    }
    function buildGraph(nodes, version) {
      const table = {};
      const graph = { start: {} };
      let prevNodeIds = ["start"];
      for (let i = 0; i < nodes.length; i++) {
        const nodeGroup = nodes[i];
        const currentNodeIds = [];
        for (let j = 0; j < nodeGroup.length; j++) {
          const node = nodeGroup[j];
          const key = "" + i + j;
          currentNodeIds.push(key);
          table[key] = { node, lastCount: 0 };
          graph[key] = {};
          for (let n = 0; n < prevNodeIds.length; n++) {
            const prevNodeId = prevNodeIds[n];
            if (table[prevNodeId] && table[prevNodeId].node.mode === node.mode) {
              graph[prevNodeId][key] = getSegmentBitsLength(table[prevNodeId].lastCount + node.length, node.mode) - getSegmentBitsLength(table[prevNodeId].lastCount, node.mode);
              table[prevNodeId].lastCount += node.length;
            } else {
              if (table[prevNodeId]) table[prevNodeId].lastCount = node.length;
              graph[prevNodeId][key] = getSegmentBitsLength(node.length, node.mode) + 4 + Mode.getCharCountIndicator(node.mode, version);
            }
          }
        }
        prevNodeIds = currentNodeIds;
      }
      for (let n = 0; n < prevNodeIds.length; n++) {
        graph[prevNodeIds[n]].end = 0;
      }
      return { map: graph, table };
    }
    function buildSingleSegment(data, modesHint) {
      let mode;
      const bestMode = Mode.getBestModeForData(data);
      mode = Mode.from(modesHint, bestMode);
      if (mode !== Mode.BYTE && mode.bit < bestMode.bit) {
        throw new Error('"' + data + '" cannot be encoded with mode ' + Mode.toString(mode) + ".\n Suggested mode is: " + Mode.toString(bestMode));
      }
      if (mode === Mode.KANJI && !Utils.isKanjiModeEnabled()) {
        mode = Mode.BYTE;
      }
      switch (mode) {
        case Mode.NUMERIC:
          return new NumericData(data);
        case Mode.ALPHANUMERIC:
          return new AlphanumericData(data);
        case Mode.KANJI:
          return new KanjiData(data);
        case Mode.BYTE:
          return new ByteData(data);
      }
    }
    exports2.fromArray = function fromArray(array) {
      return array.reduce(function(acc, seg) {
        if (typeof seg === "string") {
          acc.push(buildSingleSegment(seg, null));
        } else if (seg.data) {
          acc.push(buildSingleSegment(seg.data, seg.mode));
        }
        return acc;
      }, []);
    };
    exports2.fromString = function fromString(data, version) {
      const segs = getSegmentsFromString(data, Utils.isKanjiModeEnabled());
      const nodes = buildNodes(segs);
      const graph = buildGraph(nodes, version);
      const path = dijkstra.find_path(graph.map, "start", "end");
      const optimizedSegs = [];
      for (let i = 1; i < path.length - 1; i++) {
        optimizedSegs.push(graph.table[path[i]].node);
      }
      return exports2.fromArray(mergeSegments(optimizedSegs));
    };
    exports2.rawSplit = function rawSplit(data) {
      return exports2.fromArray(
        getSegmentsFromString(data, Utils.isKanjiModeEnabled())
      );
    };
  }
});

// scripts/vendor/bundled_modules/qrcode/lib/core/qrcode.js
var require_qrcode = __commonJS({
  "scripts/vendor/bundled_modules/qrcode/lib/core/qrcode.js"(exports2) {
    var Utils = require_utils();
    var ECLevel = require_error_correction_level();
    var BitBuffer = require_bit_buffer();
    var BitMatrix = require_bit_matrix();
    var AlignmentPattern = require_alignment_pattern();
    var FinderPattern = require_finder_pattern();
    var MaskPattern = require_mask_pattern();
    var ECCode = require_error_correction_code();
    var ReedSolomonEncoder = require_reed_solomon_encoder();
    var Version = require_version();
    var FormatInfo = require_format_info();
    var Mode = require_mode();
    var Segments = require_segments();
    function setupFinderPattern(matrix, version) {
      const size = matrix.size;
      const pos = FinderPattern.getPositions(version);
      for (let i = 0; i < pos.length; i++) {
        const row = pos[i][0];
        const col = pos[i][1];
        for (let r = -1; r <= 7; r++) {
          if (row + r <= -1 || size <= row + r) continue;
          for (let c = -1; c <= 7; c++) {
            if (col + c <= -1 || size <= col + c) continue;
            if (r >= 0 && r <= 6 && (c === 0 || c === 6) || c >= 0 && c <= 6 && (r === 0 || r === 6) || r >= 2 && r <= 4 && c >= 2 && c <= 4) {
              matrix.set(row + r, col + c, true, true);
            } else {
              matrix.set(row + r, col + c, false, true);
            }
          }
        }
      }
    }
    function setupTimingPattern(matrix) {
      const size = matrix.size;
      for (let r = 8; r < size - 8; r++) {
        const value = r % 2 === 0;
        matrix.set(r, 6, value, true);
        matrix.set(6, r, value, true);
      }
    }
    function setupAlignmentPattern(matrix, version) {
      const pos = AlignmentPattern.getPositions(version);
      for (let i = 0; i < pos.length; i++) {
        const row = pos[i][0];
        const col = pos[i][1];
        for (let r = -2; r <= 2; r++) {
          for (let c = -2; c <= 2; c++) {
            if (r === -2 || r === 2 || c === -2 || c === 2 || r === 0 && c === 0) {
              matrix.set(row + r, col + c, true, true);
            } else {
              matrix.set(row + r, col + c, false, true);
            }
          }
        }
      }
    }
    function setupVersionInfo(matrix, version) {
      const size = matrix.size;
      const bits = Version.getEncodedBits(version);
      let row, col, mod;
      for (let i = 0; i < 18; i++) {
        row = Math.floor(i / 3);
        col = i % 3 + size - 8 - 3;
        mod = (bits >> i & 1) === 1;
        matrix.set(row, col, mod, true);
        matrix.set(col, row, mod, true);
      }
    }
    function setupFormatInfo(matrix, errorCorrectionLevel, maskPattern) {
      const size = matrix.size;
      const bits = FormatInfo.getEncodedBits(errorCorrectionLevel, maskPattern);
      let i, mod;
      for (i = 0; i < 15; i++) {
        mod = (bits >> i & 1) === 1;
        if (i < 6) {
          matrix.set(i, 8, mod, true);
        } else if (i < 8) {
          matrix.set(i + 1, 8, mod, true);
        } else {
          matrix.set(size - 15 + i, 8, mod, true);
        }
        if (i < 8) {
          matrix.set(8, size - i - 1, mod, true);
        } else if (i < 9) {
          matrix.set(8, 15 - i - 1 + 1, mod, true);
        } else {
          matrix.set(8, 15 - i - 1, mod, true);
        }
      }
      matrix.set(size - 8, 8, 1, true);
    }
    function setupData(matrix, data) {
      const size = matrix.size;
      let inc = -1;
      let row = size - 1;
      let bitIndex = 7;
      let byteIndex = 0;
      for (let col = size - 1; col > 0; col -= 2) {
        if (col === 6) col--;
        while (true) {
          for (let c = 0; c < 2; c++) {
            if (!matrix.isReserved(row, col - c)) {
              let dark = false;
              if (byteIndex < data.length) {
                dark = (data[byteIndex] >>> bitIndex & 1) === 1;
              }
              matrix.set(row, col - c, dark);
              bitIndex--;
              if (bitIndex === -1) {
                byteIndex++;
                bitIndex = 7;
              }
            }
          }
          row += inc;
          if (row < 0 || size <= row) {
            row -= inc;
            inc = -inc;
            break;
          }
        }
      }
    }
    function createData(version, errorCorrectionLevel, segments) {
      const buffer = new BitBuffer();
      segments.forEach(function(data) {
        buffer.put(data.mode.bit, 4);
        buffer.put(data.getLength(), Mode.getCharCountIndicator(data.mode, version));
        data.write(buffer);
      });
      const totalCodewords = Utils.getSymbolTotalCodewords(version);
      const ecTotalCodewords = ECCode.getTotalCodewordsCount(version, errorCorrectionLevel);
      const dataTotalCodewordsBits = (totalCodewords - ecTotalCodewords) * 8;
      if (buffer.getLengthInBits() + 4 <= dataTotalCodewordsBits) {
        buffer.put(0, 4);
      }
      while (buffer.getLengthInBits() % 8 !== 0) {
        buffer.putBit(0);
      }
      const remainingByte = (dataTotalCodewordsBits - buffer.getLengthInBits()) / 8;
      for (let i = 0; i < remainingByte; i++) {
        buffer.put(i % 2 ? 17 : 236, 8);
      }
      return createCodewords(buffer, version, errorCorrectionLevel);
    }
    function createCodewords(bitBuffer, version, errorCorrectionLevel) {
      const totalCodewords = Utils.getSymbolTotalCodewords(version);
      const ecTotalCodewords = ECCode.getTotalCodewordsCount(version, errorCorrectionLevel);
      const dataTotalCodewords = totalCodewords - ecTotalCodewords;
      const ecTotalBlocks = ECCode.getBlocksCount(version, errorCorrectionLevel);
      const blocksInGroup2 = totalCodewords % ecTotalBlocks;
      const blocksInGroup1 = ecTotalBlocks - blocksInGroup2;
      const totalCodewordsInGroup1 = Math.floor(totalCodewords / ecTotalBlocks);
      const dataCodewordsInGroup1 = Math.floor(dataTotalCodewords / ecTotalBlocks);
      const dataCodewordsInGroup2 = dataCodewordsInGroup1 + 1;
      const ecCount = totalCodewordsInGroup1 - dataCodewordsInGroup1;
      const rs = new ReedSolomonEncoder(ecCount);
      let offset = 0;
      const dcData = new Array(ecTotalBlocks);
      const ecData = new Array(ecTotalBlocks);
      let maxDataSize = 0;
      const buffer = new Uint8Array(bitBuffer.buffer);
      for (let b = 0; b < ecTotalBlocks; b++) {
        const dataSize = b < blocksInGroup1 ? dataCodewordsInGroup1 : dataCodewordsInGroup2;
        dcData[b] = buffer.slice(offset, offset + dataSize);
        ecData[b] = rs.encode(dcData[b]);
        offset += dataSize;
        maxDataSize = Math.max(maxDataSize, dataSize);
      }
      const data = new Uint8Array(totalCodewords);
      let index = 0;
      let i, r;
      for (i = 0; i < maxDataSize; i++) {
        for (r = 0; r < ecTotalBlocks; r++) {
          if (i < dcData[r].length) {
            data[index++] = dcData[r][i];
          }
        }
      }
      for (i = 0; i < ecCount; i++) {
        for (r = 0; r < ecTotalBlocks; r++) {
          data[index++] = ecData[r][i];
        }
      }
      return data;
    }
    function createSymbol(data, version, errorCorrectionLevel, maskPattern) {
      let segments;
      if (Array.isArray(data)) {
        segments = Segments.fromArray(data);
      } else if (typeof data === "string") {
        let estimatedVersion = version;
        if (!estimatedVersion) {
          const rawSegments = Segments.rawSplit(data);
          estimatedVersion = Version.getBestVersionForData(rawSegments, errorCorrectionLevel);
        }
        segments = Segments.fromString(data, estimatedVersion || 40);
      } else {
        throw new Error("Invalid data");
      }
      const bestVersion = Version.getBestVersionForData(segments, errorCorrectionLevel);
      if (!bestVersion) {
        throw new Error("The amount of data is too big to be stored in a QR Code");
      }
      if (!version) {
        version = bestVersion;
      } else if (version < bestVersion) {
        throw new Error(
          "\nThe chosen QR Code version cannot contain this amount of data.\nMinimum version required to store current data is: " + bestVersion + ".\n"
        );
      }
      const dataBits = createData(version, errorCorrectionLevel, segments);
      const moduleCount = Utils.getSymbolSize(version);
      const modules = new BitMatrix(moduleCount);
      setupFinderPattern(modules, version);
      setupTimingPattern(modules);
      setupAlignmentPattern(modules, version);
      setupFormatInfo(modules, errorCorrectionLevel, 0);
      if (version >= 7) {
        setupVersionInfo(modules, version);
      }
      setupData(modules, dataBits);
      if (isNaN(maskPattern)) {
        maskPattern = MaskPattern.getBestMask(
          modules,
          setupFormatInfo.bind(null, modules, errorCorrectionLevel)
        );
      }
      MaskPattern.applyMask(maskPattern, modules);
      setupFormatInfo(modules, errorCorrectionLevel, maskPattern);
      return {
        modules,
        version,
        errorCorrectionLevel,
        maskPattern,
        segments
      };
    }
    exports2.create = function create(data, options) {
      if (typeof data === "undefined" || data === "") {
        throw new Error("No input text");
      }
      let errorCorrectionLevel = ECLevel.M;
      let version;
      let mask;
      if (typeof options !== "undefined") {
        errorCorrectionLevel = ECLevel.from(options.errorCorrectionLevel, ECLevel.M);
        version = Version.from(options.version);
        mask = MaskPattern.from(options.maskPattern);
        if (options.toSJISFunc) {
          Utils.setToSJISFunction(options.toSJISFunc);
        }
      }
      return createSymbol(data, version, errorCorrectionLevel, mask);
    };
  }
});

// scripts/vendor/bundled_modules/pngjs/lib/chunkstream.js
var require_chunkstream = __commonJS({
  "scripts/vendor/bundled_modules/pngjs/lib/chunkstream.js"(exports2, module2) {
    "use strict";
    var util = require("util");
    var Stream = require("stream");
    var ChunkStream = module2.exports = function() {
      Stream.call(this);
      this._buffers = [];
      this._buffered = 0;
      this._reads = [];
      this._paused = false;
      this._encoding = "utf8";
      this.writable = true;
    };
    util.inherits(ChunkStream, Stream);
    ChunkStream.prototype.read = function(length, callback) {
      this._reads.push({
        length: Math.abs(length),
        // if length < 0 then at most this length
        allowLess: length < 0,
        func: callback
      });
      process.nextTick(
        function() {
          this._process();
          if (this._paused && this._reads && this._reads.length > 0) {
            this._paused = false;
            this.emit("drain");
          }
        }.bind(this)
      );
    };
    ChunkStream.prototype.write = function(data, encoding) {
      if (!this.writable) {
        this.emit("error", new Error("Stream not writable"));
        return false;
      }
      let dataBuffer;
      if (Buffer.isBuffer(data)) {
        dataBuffer = data;
      } else {
        dataBuffer = Buffer.from(data, encoding || this._encoding);
      }
      this._buffers.push(dataBuffer);
      this._buffered += dataBuffer.length;
      this._process();
      if (this._reads && this._reads.length === 0) {
        this._paused = true;
      }
      return this.writable && !this._paused;
    };
    ChunkStream.prototype.end = function(data, encoding) {
      if (data) {
        this.write(data, encoding);
      }
      this.writable = false;
      if (!this._buffers) {
        return;
      }
      if (this._buffers.length === 0) {
        this._end();
      } else {
        this._buffers.push(null);
        this._process();
      }
    };
    ChunkStream.prototype.destroySoon = ChunkStream.prototype.end;
    ChunkStream.prototype._end = function() {
      if (this._reads.length > 0) {
        this.emit("error", new Error("Unexpected end of input"));
      }
      this.destroy();
    };
    ChunkStream.prototype.destroy = function() {
      if (!this._buffers) {
        return;
      }
      this.writable = false;
      this._reads = null;
      this._buffers = null;
      this.emit("close");
    };
    ChunkStream.prototype._processReadAllowingLess = function(read) {
      this._reads.shift();
      let smallerBuf = this._buffers[0];
      if (smallerBuf.length > read.length) {
        this._buffered -= read.length;
        this._buffers[0] = smallerBuf.slice(read.length);
        read.func.call(this, smallerBuf.slice(0, read.length));
      } else {
        this._buffered -= smallerBuf.length;
        this._buffers.shift();
        read.func.call(this, smallerBuf);
      }
    };
    ChunkStream.prototype._processRead = function(read) {
      this._reads.shift();
      let pos = 0;
      let count = 0;
      let data = Buffer.alloc(read.length);
      while (pos < read.length) {
        let buf = this._buffers[count++];
        let len = Math.min(buf.length, read.length - pos);
        buf.copy(data, pos, 0, len);
        pos += len;
        if (len !== buf.length) {
          this._buffers[--count] = buf.slice(len);
        }
      }
      if (count > 0) {
        this._buffers.splice(0, count);
      }
      this._buffered -= read.length;
      read.func.call(this, data);
    };
    ChunkStream.prototype._process = function() {
      try {
        while (this._buffered > 0 && this._reads && this._reads.length > 0) {
          let read = this._reads[0];
          if (read.allowLess) {
            this._processReadAllowingLess(read);
          } else if (this._buffered >= read.length) {
            this._processRead(read);
          } else {
            break;
          }
        }
        if (this._buffers && !this.writable) {
          this._end();
        }
      } catch (ex) {
        this.emit("error", ex);
      }
    };
  }
});

// scripts/vendor/bundled_modules/pngjs/lib/interlace.js
var require_interlace = __commonJS({
  "scripts/vendor/bundled_modules/pngjs/lib/interlace.js"(exports2) {
    "use strict";
    var imagePasses = [
      {
        // pass 1 - 1px
        x: [0],
        y: [0]
      },
      {
        // pass 2 - 1px
        x: [4],
        y: [0]
      },
      {
        // pass 3 - 2px
        x: [0, 4],
        y: [4]
      },
      {
        // pass 4 - 4px
        x: [2, 6],
        y: [0, 4]
      },
      {
        // pass 5 - 8px
        x: [0, 2, 4, 6],
        y: [2, 6]
      },
      {
        // pass 6 - 16px
        x: [1, 3, 5, 7],
        y: [0, 2, 4, 6]
      },
      {
        // pass 7 - 32px
        x: [0, 1, 2, 3, 4, 5, 6, 7],
        y: [1, 3, 5, 7]
      }
    ];
    exports2.getImagePasses = function(width, height) {
      let images = [];
      let xLeftOver = width % 8;
      let yLeftOver = height % 8;
      let xRepeats = (width - xLeftOver) / 8;
      let yRepeats = (height - yLeftOver) / 8;
      for (let i = 0; i < imagePasses.length; i++) {
        let pass = imagePasses[i];
        let passWidth = xRepeats * pass.x.length;
        let passHeight = yRepeats * pass.y.length;
        for (let j = 0; j < pass.x.length; j++) {
          if (pass.x[j] < xLeftOver) {
            passWidth++;
          } else {
            break;
          }
        }
        for (let j = 0; j < pass.y.length; j++) {
          if (pass.y[j] < yLeftOver) {
            passHeight++;
          } else {
            break;
          }
        }
        if (passWidth > 0 && passHeight > 0) {
          images.push({ width: passWidth, height: passHeight, index: i });
        }
      }
      return images;
    };
    exports2.getInterlaceIterator = function(width) {
      return function(x, y, pass) {
        let outerXLeftOver = x % imagePasses[pass].x.length;
        let outerX = (x - outerXLeftOver) / imagePasses[pass].x.length * 8 + imagePasses[pass].x[outerXLeftOver];
        let outerYLeftOver = y % imagePasses[pass].y.length;
        let outerY = (y - outerYLeftOver) / imagePasses[pass].y.length * 8 + imagePasses[pass].y[outerYLeftOver];
        return outerX * 4 + outerY * width * 4;
      };
    };
  }
});

// scripts/vendor/bundled_modules/pngjs/lib/paeth-predictor.js
var require_paeth_predictor = __commonJS({
  "scripts/vendor/bundled_modules/pngjs/lib/paeth-predictor.js"(exports2, module2) {
    "use strict";
    module2.exports = function paethPredictor(left, above, upLeft) {
      let paeth = left + above - upLeft;
      let pLeft = Math.abs(paeth - left);
      let pAbove = Math.abs(paeth - above);
      let pUpLeft = Math.abs(paeth - upLeft);
      if (pLeft <= pAbove && pLeft <= pUpLeft) {
        return left;
      }
      if (pAbove <= pUpLeft) {
        return above;
      }
      return upLeft;
    };
  }
});

// scripts/vendor/bundled_modules/pngjs/lib/filter-parse.js
var require_filter_parse = __commonJS({
  "scripts/vendor/bundled_modules/pngjs/lib/filter-parse.js"(exports2, module2) {
    "use strict";
    var interlaceUtils = require_interlace();
    var paethPredictor = require_paeth_predictor();
    function getByteWidth(width, bpp, depth) {
      let byteWidth = width * bpp;
      if (depth !== 8) {
        byteWidth = Math.ceil(byteWidth / (8 / depth));
      }
      return byteWidth;
    }
    var Filter = module2.exports = function(bitmapInfo, dependencies) {
      let width = bitmapInfo.width;
      let height = bitmapInfo.height;
      let interlace = bitmapInfo.interlace;
      let bpp = bitmapInfo.bpp;
      let depth = bitmapInfo.depth;
      this.read = dependencies.read;
      this.write = dependencies.write;
      this.complete = dependencies.complete;
      this._imageIndex = 0;
      this._images = [];
      if (interlace) {
        let passes = interlaceUtils.getImagePasses(width, height);
        for (let i = 0; i < passes.length; i++) {
          this._images.push({
            byteWidth: getByteWidth(passes[i].width, bpp, depth),
            height: passes[i].height,
            lineIndex: 0
          });
        }
      } else {
        this._images.push({
          byteWidth: getByteWidth(width, bpp, depth),
          height,
          lineIndex: 0
        });
      }
      if (depth === 8) {
        this._xComparison = bpp;
      } else if (depth === 16) {
        this._xComparison = bpp * 2;
      } else {
        this._xComparison = 1;
      }
    };
    Filter.prototype.start = function() {
      this.read(
        this._images[this._imageIndex].byteWidth + 1,
        this._reverseFilterLine.bind(this)
      );
    };
    Filter.prototype._unFilterType1 = function(rawData, unfilteredLine, byteWidth) {
      let xComparison = this._xComparison;
      let xBiggerThan = xComparison - 1;
      for (let x = 0; x < byteWidth; x++) {
        let rawByte = rawData[1 + x];
        let f1Left = x > xBiggerThan ? unfilteredLine[x - xComparison] : 0;
        unfilteredLine[x] = rawByte + f1Left;
      }
    };
    Filter.prototype._unFilterType2 = function(rawData, unfilteredLine, byteWidth) {
      let lastLine = this._lastLine;
      for (let x = 0; x < byteWidth; x++) {
        let rawByte = rawData[1 + x];
        let f2Up = lastLine ? lastLine[x] : 0;
        unfilteredLine[x] = rawByte + f2Up;
      }
    };
    Filter.prototype._unFilterType3 = function(rawData, unfilteredLine, byteWidth) {
      let xComparison = this._xComparison;
      let xBiggerThan = xComparison - 1;
      let lastLine = this._lastLine;
      for (let x = 0; x < byteWidth; x++) {
        let rawByte = rawData[1 + x];
        let f3Up = lastLine ? lastLine[x] : 0;
        let f3Left = x > xBiggerThan ? unfilteredLine[x - xComparison] : 0;
        let f3Add = Math.floor((f3Left + f3Up) / 2);
        unfilteredLine[x] = rawByte + f3Add;
      }
    };
    Filter.prototype._unFilterType4 = function(rawData, unfilteredLine, byteWidth) {
      let xComparison = this._xComparison;
      let xBiggerThan = xComparison - 1;
      let lastLine = this._lastLine;
      for (let x = 0; x < byteWidth; x++) {
        let rawByte = rawData[1 + x];
        let f4Up = lastLine ? lastLine[x] : 0;
        let f4Left = x > xBiggerThan ? unfilteredLine[x - xComparison] : 0;
        let f4UpLeft = x > xBiggerThan && lastLine ? lastLine[x - xComparison] : 0;
        let f4Add = paethPredictor(f4Left, f4Up, f4UpLeft);
        unfilteredLine[x] = rawByte + f4Add;
      }
    };
    Filter.prototype._reverseFilterLine = function(rawData) {
      let filter = rawData[0];
      let unfilteredLine;
      let currentImage = this._images[this._imageIndex];
      let byteWidth = currentImage.byteWidth;
      if (filter === 0) {
        unfilteredLine = rawData.slice(1, byteWidth + 1);
      } else {
        unfilteredLine = Buffer.alloc(byteWidth);
        switch (filter) {
          case 1:
            this._unFilterType1(rawData, unfilteredLine, byteWidth);
            break;
          case 2:
            this._unFilterType2(rawData, unfilteredLine, byteWidth);
            break;
          case 3:
            this._unFilterType3(rawData, unfilteredLine, byteWidth);
            break;
          case 4:
            this._unFilterType4(rawData, unfilteredLine, byteWidth);
            break;
          default:
            throw new Error("Unrecognised filter type - " + filter);
        }
      }
      this.write(unfilteredLine);
      currentImage.lineIndex++;
      if (currentImage.lineIndex >= currentImage.height) {
        this._lastLine = null;
        this._imageIndex++;
        currentImage = this._images[this._imageIndex];
      } else {
        this._lastLine = unfilteredLine;
      }
      if (currentImage) {
        this.read(currentImage.byteWidth + 1, this._reverseFilterLine.bind(this));
      } else {
        this._lastLine = null;
        this.complete();
      }
    };
  }
});

// scripts/vendor/bundled_modules/pngjs/lib/filter-parse-async.js
var require_filter_parse_async = __commonJS({
  "scripts/vendor/bundled_modules/pngjs/lib/filter-parse-async.js"(exports2, module2) {
    "use strict";
    var util = require("util");
    var ChunkStream = require_chunkstream();
    var Filter = require_filter_parse();
    var FilterAsync = module2.exports = function(bitmapInfo) {
      ChunkStream.call(this);
      let buffers = [];
      let that = this;
      this._filter = new Filter(bitmapInfo, {
        read: this.read.bind(this),
        write: function(buffer) {
          buffers.push(buffer);
        },
        complete: function() {
          that.emit("complete", Buffer.concat(buffers));
        }
      });
      this._filter.start();
    };
    util.inherits(FilterAsync, ChunkStream);
  }
});

// scripts/vendor/bundled_modules/pngjs/lib/constants.js
var require_constants = __commonJS({
  "scripts/vendor/bundled_modules/pngjs/lib/constants.js"(exports2, module2) {
    "use strict";
    module2.exports = {
      PNG_SIGNATURE: [137, 80, 78, 71, 13, 10, 26, 10],
      TYPE_IHDR: 1229472850,
      TYPE_IEND: 1229278788,
      TYPE_IDAT: 1229209940,
      TYPE_PLTE: 1347179589,
      TYPE_tRNS: 1951551059,
      // eslint-disable-line camelcase
      TYPE_gAMA: 1732332865,
      // eslint-disable-line camelcase
      // color-type bits
      COLORTYPE_GRAYSCALE: 0,
      COLORTYPE_PALETTE: 1,
      COLORTYPE_COLOR: 2,
      COLORTYPE_ALPHA: 4,
      // e.g. grayscale and alpha
      // color-type combinations
      COLORTYPE_PALETTE_COLOR: 3,
      COLORTYPE_COLOR_ALPHA: 6,
      COLORTYPE_TO_BPP_MAP: {
        0: 1,
        2: 3,
        3: 1,
        4: 2,
        6: 4
      },
      GAMMA_DIVISION: 1e5
    };
  }
});

// scripts/vendor/bundled_modules/pngjs/lib/crc.js
var require_crc = __commonJS({
  "scripts/vendor/bundled_modules/pngjs/lib/crc.js"(exports2, module2) {
    "use strict";
    var crcTable = [];
    (function() {
      for (let i = 0; i < 256; i++) {
        let currentCrc = i;
        for (let j = 0; j < 8; j++) {
          if (currentCrc & 1) {
            currentCrc = 3988292384 ^ currentCrc >>> 1;
          } else {
            currentCrc = currentCrc >>> 1;
          }
        }
        crcTable[i] = currentCrc;
      }
    })();
    var CrcCalculator = module2.exports = function() {
      this._crc = -1;
    };
    CrcCalculator.prototype.write = function(data) {
      for (let i = 0; i < data.length; i++) {
        this._crc = crcTable[(this._crc ^ data[i]) & 255] ^ this._crc >>> 8;
      }
      return true;
    };
    CrcCalculator.prototype.crc32 = function() {
      return this._crc ^ -1;
    };
    CrcCalculator.crc32 = function(buf) {
      let crc = -1;
      for (let i = 0; i < buf.length; i++) {
        crc = crcTable[(crc ^ buf[i]) & 255] ^ crc >>> 8;
      }
      return crc ^ -1;
    };
  }
});

// scripts/vendor/bundled_modules/pngjs/lib/parser.js
var require_parser = __commonJS({
  "scripts/vendor/bundled_modules/pngjs/lib/parser.js"(exports2, module2) {
    "use strict";
    var constants = require_constants();
    var CrcCalculator = require_crc();
    var Parser = module2.exports = function(options, dependencies) {
      this._options = options;
      options.checkCRC = options.checkCRC !== false;
      this._hasIHDR = false;
      this._hasIEND = false;
      this._emittedHeadersFinished = false;
      this._palette = [];
      this._colorType = 0;
      this._chunks = {};
      this._chunks[constants.TYPE_IHDR] = this._handleIHDR.bind(this);
      this._chunks[constants.TYPE_IEND] = this._handleIEND.bind(this);
      this._chunks[constants.TYPE_IDAT] = this._handleIDAT.bind(this);
      this._chunks[constants.TYPE_PLTE] = this._handlePLTE.bind(this);
      this._chunks[constants.TYPE_tRNS] = this._handleTRNS.bind(this);
      this._chunks[constants.TYPE_gAMA] = this._handleGAMA.bind(this);
      this.read = dependencies.read;
      this.error = dependencies.error;
      this.metadata = dependencies.metadata;
      this.gamma = dependencies.gamma;
      this.transColor = dependencies.transColor;
      this.palette = dependencies.palette;
      this.parsed = dependencies.parsed;
      this.inflateData = dependencies.inflateData;
      this.finished = dependencies.finished;
      this.simpleTransparency = dependencies.simpleTransparency;
      this.headersFinished = dependencies.headersFinished || function() {
      };
    };
    Parser.prototype.start = function() {
      this.read(constants.PNG_SIGNATURE.length, this._parseSignature.bind(this));
    };
    Parser.prototype._parseSignature = function(data) {
      let signature = constants.PNG_SIGNATURE;
      for (let i = 0; i < signature.length; i++) {
        if (data[i] !== signature[i]) {
          this.error(new Error("Invalid file signature"));
          return;
        }
      }
      this.read(8, this._parseChunkBegin.bind(this));
    };
    Parser.prototype._parseChunkBegin = function(data) {
      let length = data.readUInt32BE(0);
      let type = data.readUInt32BE(4);
      let name = "";
      for (let i = 4; i < 8; i++) {
        name += String.fromCharCode(data[i]);
      }
      let ancillary = Boolean(data[4] & 32);
      if (!this._hasIHDR && type !== constants.TYPE_IHDR) {
        this.error(new Error("Expected IHDR on beggining"));
        return;
      }
      this._crc = new CrcCalculator();
      this._crc.write(Buffer.from(name));
      if (this._chunks[type]) {
        return this._chunks[type](length);
      }
      if (!ancillary) {
        this.error(new Error("Unsupported critical chunk type " + name));
        return;
      }
      this.read(length + 4, this._skipChunk.bind(this));
    };
    Parser.prototype._skipChunk = function() {
      this.read(8, this._parseChunkBegin.bind(this));
    };
    Parser.prototype._handleChunkEnd = function() {
      this.read(4, this._parseChunkEnd.bind(this));
    };
    Parser.prototype._parseChunkEnd = function(data) {
      let fileCrc = data.readInt32BE(0);
      let calcCrc = this._crc.crc32();
      if (this._options.checkCRC && calcCrc !== fileCrc) {
        this.error(new Error("Crc error - " + fileCrc + " - " + calcCrc));
        return;
      }
      if (!this._hasIEND) {
        this.read(8, this._parseChunkBegin.bind(this));
      }
    };
    Parser.prototype._handleIHDR = function(length) {
      this.read(length, this._parseIHDR.bind(this));
    };
    Parser.prototype._parseIHDR = function(data) {
      this._crc.write(data);
      let width = data.readUInt32BE(0);
      let height = data.readUInt32BE(4);
      let depth = data[8];
      let colorType = data[9];
      let compr = data[10];
      let filter = data[11];
      let interlace = data[12];
      if (depth !== 8 && depth !== 4 && depth !== 2 && depth !== 1 && depth !== 16) {
        this.error(new Error("Unsupported bit depth " + depth));
        return;
      }
      if (!(colorType in constants.COLORTYPE_TO_BPP_MAP)) {
        this.error(new Error("Unsupported color type"));
        return;
      }
      if (compr !== 0) {
        this.error(new Error("Unsupported compression method"));
        return;
      }
      if (filter !== 0) {
        this.error(new Error("Unsupported filter method"));
        return;
      }
      if (interlace !== 0 && interlace !== 1) {
        this.error(new Error("Unsupported interlace method"));
        return;
      }
      this._colorType = colorType;
      let bpp = constants.COLORTYPE_TO_BPP_MAP[this._colorType];
      this._hasIHDR = true;
      this.metadata({
        width,
        height,
        depth,
        interlace: Boolean(interlace),
        palette: Boolean(colorType & constants.COLORTYPE_PALETTE),
        color: Boolean(colorType & constants.COLORTYPE_COLOR),
        alpha: Boolean(colorType & constants.COLORTYPE_ALPHA),
        bpp,
        colorType
      });
      this._handleChunkEnd();
    };
    Parser.prototype._handlePLTE = function(length) {
      this.read(length, this._parsePLTE.bind(this));
    };
    Parser.prototype._parsePLTE = function(data) {
      this._crc.write(data);
      let entries = Math.floor(data.length / 3);
      for (let i = 0; i < entries; i++) {
        this._palette.push([data[i * 3], data[i * 3 + 1], data[i * 3 + 2], 255]);
      }
      this.palette(this._palette);
      this._handleChunkEnd();
    };
    Parser.prototype._handleTRNS = function(length) {
      this.simpleTransparency();
      this.read(length, this._parseTRNS.bind(this));
    };
    Parser.prototype._parseTRNS = function(data) {
      this._crc.write(data);
      if (this._colorType === constants.COLORTYPE_PALETTE_COLOR) {
        if (this._palette.length === 0) {
          this.error(new Error("Transparency chunk must be after palette"));
          return;
        }
        if (data.length > this._palette.length) {
          this.error(new Error("More transparent colors than palette size"));
          return;
        }
        for (let i = 0; i < data.length; i++) {
          this._palette[i][3] = data[i];
        }
        this.palette(this._palette);
      }
      if (this._colorType === constants.COLORTYPE_GRAYSCALE) {
        this.transColor([data.readUInt16BE(0)]);
      }
      if (this._colorType === constants.COLORTYPE_COLOR) {
        this.transColor([
          data.readUInt16BE(0),
          data.readUInt16BE(2),
          data.readUInt16BE(4)
        ]);
      }
      this._handleChunkEnd();
    };
    Parser.prototype._handleGAMA = function(length) {
      this.read(length, this._parseGAMA.bind(this));
    };
    Parser.prototype._parseGAMA = function(data) {
      this._crc.write(data);
      this.gamma(data.readUInt32BE(0) / constants.GAMMA_DIVISION);
      this._handleChunkEnd();
    };
    Parser.prototype._handleIDAT = function(length) {
      if (!this._emittedHeadersFinished) {
        this._emittedHeadersFinished = true;
        this.headersFinished();
      }
      this.read(-length, this._parseIDAT.bind(this, length));
    };
    Parser.prototype._parseIDAT = function(length, data) {
      this._crc.write(data);
      if (this._colorType === constants.COLORTYPE_PALETTE_COLOR && this._palette.length === 0) {
        throw new Error("Expected palette not found");
      }
      this.inflateData(data);
      let leftOverLength = length - data.length;
      if (leftOverLength > 0) {
        this._handleIDAT(leftOverLength);
      } else {
        this._handleChunkEnd();
      }
    };
    Parser.prototype._handleIEND = function(length) {
      this.read(length, this._parseIEND.bind(this));
    };
    Parser.prototype._parseIEND = function(data) {
      this._crc.write(data);
      this._hasIEND = true;
      this._handleChunkEnd();
      if (this.finished) {
        this.finished();
      }
    };
  }
});

// scripts/vendor/bundled_modules/pngjs/lib/bitmapper.js
var require_bitmapper = __commonJS({
  "scripts/vendor/bundled_modules/pngjs/lib/bitmapper.js"(exports2) {
    "use strict";
    var interlaceUtils = require_interlace();
    var pixelBppMapper = [
      // 0 - dummy entry
      function() {
      },
      // 1 - L
      // 0: 0, 1: 0, 2: 0, 3: 0xff
      function(pxData, data, pxPos, rawPos) {
        if (rawPos === data.length) {
          throw new Error("Ran out of data");
        }
        let pixel = data[rawPos];
        pxData[pxPos] = pixel;
        pxData[pxPos + 1] = pixel;
        pxData[pxPos + 2] = pixel;
        pxData[pxPos + 3] = 255;
      },
      // 2 - LA
      // 0: 0, 1: 0, 2: 0, 3: 1
      function(pxData, data, pxPos, rawPos) {
        if (rawPos + 1 >= data.length) {
          throw new Error("Ran out of data");
        }
        let pixel = data[rawPos];
        pxData[pxPos] = pixel;
        pxData[pxPos + 1] = pixel;
        pxData[pxPos + 2] = pixel;
        pxData[pxPos + 3] = data[rawPos + 1];
      },
      // 3 - RGB
      // 0: 0, 1: 1, 2: 2, 3: 0xff
      function(pxData, data, pxPos, rawPos) {
        if (rawPos + 2 >= data.length) {
          throw new Error("Ran out of data");
        }
        pxData[pxPos] = data[rawPos];
        pxData[pxPos + 1] = data[rawPos + 1];
        pxData[pxPos + 2] = data[rawPos + 2];
        pxData[pxPos + 3] = 255;
      },
      // 4 - RGBA
      // 0: 0, 1: 1, 2: 2, 3: 3
      function(pxData, data, pxPos, rawPos) {
        if (rawPos + 3 >= data.length) {
          throw new Error("Ran out of data");
        }
        pxData[pxPos] = data[rawPos];
        pxData[pxPos + 1] = data[rawPos + 1];
        pxData[pxPos + 2] = data[rawPos + 2];
        pxData[pxPos + 3] = data[rawPos + 3];
      }
    ];
    var pixelBppCustomMapper = [
      // 0 - dummy entry
      function() {
      },
      // 1 - L
      // 0: 0, 1: 0, 2: 0, 3: 0xff
      function(pxData, pixelData, pxPos, maxBit) {
        let pixel = pixelData[0];
        pxData[pxPos] = pixel;
        pxData[pxPos + 1] = pixel;
        pxData[pxPos + 2] = pixel;
        pxData[pxPos + 3] = maxBit;
      },
      // 2 - LA
      // 0: 0, 1: 0, 2: 0, 3: 1
      function(pxData, pixelData, pxPos) {
        let pixel = pixelData[0];
        pxData[pxPos] = pixel;
        pxData[pxPos + 1] = pixel;
        pxData[pxPos + 2] = pixel;
        pxData[pxPos + 3] = pixelData[1];
      },
      // 3 - RGB
      // 0: 0, 1: 1, 2: 2, 3: 0xff
      function(pxData, pixelData, pxPos, maxBit) {
        pxData[pxPos] = pixelData[0];
        pxData[pxPos + 1] = pixelData[1];
        pxData[pxPos + 2] = pixelData[2];
        pxData[pxPos + 3] = maxBit;
      },
      // 4 - RGBA
      // 0: 0, 1: 1, 2: 2, 3: 3
      function(pxData, pixelData, pxPos) {
        pxData[pxPos] = pixelData[0];
        pxData[pxPos + 1] = pixelData[1];
        pxData[pxPos + 2] = pixelData[2];
        pxData[pxPos + 3] = pixelData[3];
      }
    ];
    function bitRetriever(data, depth) {
      let leftOver = [];
      let i = 0;
      function split() {
        if (i === data.length) {
          throw new Error("Ran out of data");
        }
        let byte = data[i];
        i++;
        let byte8, byte7, byte6, byte5, byte4, byte3, byte2, byte1;
        switch (depth) {
          default:
            throw new Error("unrecognised depth");
          case 16:
            byte2 = data[i];
            i++;
            leftOver.push((byte << 8) + byte2);
            break;
          case 4:
            byte2 = byte & 15;
            byte1 = byte >> 4;
            leftOver.push(byte1, byte2);
            break;
          case 2:
            byte4 = byte & 3;
            byte3 = byte >> 2 & 3;
            byte2 = byte >> 4 & 3;
            byte1 = byte >> 6 & 3;
            leftOver.push(byte1, byte2, byte3, byte4);
            break;
          case 1:
            byte8 = byte & 1;
            byte7 = byte >> 1 & 1;
            byte6 = byte >> 2 & 1;
            byte5 = byte >> 3 & 1;
            byte4 = byte >> 4 & 1;
            byte3 = byte >> 5 & 1;
            byte2 = byte >> 6 & 1;
            byte1 = byte >> 7 & 1;
            leftOver.push(byte1, byte2, byte3, byte4, byte5, byte6, byte7, byte8);
            break;
        }
      }
      return {
        get: function(count) {
          while (leftOver.length < count) {
            split();
          }
          let returner = leftOver.slice(0, count);
          leftOver = leftOver.slice(count);
          return returner;
        },
        resetAfterLine: function() {
          leftOver.length = 0;
        },
        end: function() {
          if (i !== data.length) {
            throw new Error("extra data found");
          }
        }
      };
    }
    function mapImage8Bit(image, pxData, getPxPos, bpp, data, rawPos) {
      let imageWidth = image.width;
      let imageHeight = image.height;
      let imagePass = image.index;
      for (let y = 0; y < imageHeight; y++) {
        for (let x = 0; x < imageWidth; x++) {
          let pxPos = getPxPos(x, y, imagePass);
          pixelBppMapper[bpp](pxData, data, pxPos, rawPos);
          rawPos += bpp;
        }
      }
      return rawPos;
    }
    function mapImageCustomBit(image, pxData, getPxPos, bpp, bits, maxBit) {
      let imageWidth = image.width;
      let imageHeight = image.height;
      let imagePass = image.index;
      for (let y = 0; y < imageHeight; y++) {
        for (let x = 0; x < imageWidth; x++) {
          let pixelData = bits.get(bpp);
          let pxPos = getPxPos(x, y, imagePass);
          pixelBppCustomMapper[bpp](pxData, pixelData, pxPos, maxBit);
        }
        bits.resetAfterLine();
      }
    }
    exports2.dataToBitMap = function(data, bitmapInfo) {
      let width = bitmapInfo.width;
      let height = bitmapInfo.height;
      let depth = bitmapInfo.depth;
      let bpp = bitmapInfo.bpp;
      let interlace = bitmapInfo.interlace;
      let bits;
      if (depth !== 8) {
        bits = bitRetriever(data, depth);
      }
      let pxData;
      if (depth <= 8) {
        pxData = Buffer.alloc(width * height * 4);
      } else {
        pxData = new Uint16Array(width * height * 4);
      }
      let maxBit = Math.pow(2, depth) - 1;
      let rawPos = 0;
      let images;
      let getPxPos;
      if (interlace) {
        images = interlaceUtils.getImagePasses(width, height);
        getPxPos = interlaceUtils.getInterlaceIterator(width, height);
      } else {
        let nonInterlacedPxPos = 0;
        getPxPos = function() {
          let returner = nonInterlacedPxPos;
          nonInterlacedPxPos += 4;
          return returner;
        };
        images = [{ width, height }];
      }
      for (let imageIndex = 0; imageIndex < images.length; imageIndex++) {
        if (depth === 8) {
          rawPos = mapImage8Bit(
            images[imageIndex],
            pxData,
            getPxPos,
            bpp,
            data,
            rawPos
          );
        } else {
          mapImageCustomBit(
            images[imageIndex],
            pxData,
            getPxPos,
            bpp,
            bits,
            maxBit
          );
        }
      }
      if (depth === 8) {
        if (rawPos !== data.length) {
          throw new Error("extra data found");
        }
      } else {
        bits.end();
      }
      return pxData;
    };
  }
});

// scripts/vendor/bundled_modules/pngjs/lib/format-normaliser.js
var require_format_normaliser = __commonJS({
  "scripts/vendor/bundled_modules/pngjs/lib/format-normaliser.js"(exports2, module2) {
    "use strict";
    function dePalette(indata, outdata, width, height, palette) {
      let pxPos = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let color = palette[indata[pxPos]];
          if (!color) {
            throw new Error("index " + indata[pxPos] + " not in palette");
          }
          for (let i = 0; i < 4; i++) {
            outdata[pxPos + i] = color[i];
          }
          pxPos += 4;
        }
      }
    }
    function replaceTransparentColor(indata, outdata, width, height, transColor) {
      let pxPos = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let makeTrans = false;
          if (transColor.length === 1) {
            if (transColor[0] === indata[pxPos]) {
              makeTrans = true;
            }
          } else if (transColor[0] === indata[pxPos] && transColor[1] === indata[pxPos + 1] && transColor[2] === indata[pxPos + 2]) {
            makeTrans = true;
          }
          if (makeTrans) {
            for (let i = 0; i < 4; i++) {
              outdata[pxPos + i] = 0;
            }
          }
          pxPos += 4;
        }
      }
    }
    function scaleDepth(indata, outdata, width, height, depth) {
      let maxOutSample = 255;
      let maxInSample = Math.pow(2, depth) - 1;
      let pxPos = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          for (let i = 0; i < 4; i++) {
            outdata[pxPos + i] = Math.floor(
              indata[pxPos + i] * maxOutSample / maxInSample + 0.5
            );
          }
          pxPos += 4;
        }
      }
    }
    module2.exports = function(indata, imageData) {
      let depth = imageData.depth;
      let width = imageData.width;
      let height = imageData.height;
      let colorType = imageData.colorType;
      let transColor = imageData.transColor;
      let palette = imageData.palette;
      let outdata = indata;
      if (colorType === 3) {
        dePalette(indata, outdata, width, height, palette);
      } else {
        if (transColor) {
          replaceTransparentColor(indata, outdata, width, height, transColor);
        }
        if (depth !== 8) {
          if (depth === 16) {
            outdata = Buffer.alloc(width * height * 4);
          }
          scaleDepth(indata, outdata, width, height, depth);
        }
      }
      return outdata;
    };
  }
});

// scripts/vendor/bundled_modules/pngjs/lib/parser-async.js
var require_parser_async = __commonJS({
  "scripts/vendor/bundled_modules/pngjs/lib/parser-async.js"(exports2, module2) {
    "use strict";
    var util = require("util");
    var zlib = require("zlib");
    var ChunkStream = require_chunkstream();
    var FilterAsync = require_filter_parse_async();
    var Parser = require_parser();
    var bitmapper = require_bitmapper();
    var formatNormaliser = require_format_normaliser();
    var ParserAsync = module2.exports = function(options) {
      ChunkStream.call(this);
      this._parser = new Parser(options, {
        read: this.read.bind(this),
        error: this._handleError.bind(this),
        metadata: this._handleMetaData.bind(this),
        gamma: this.emit.bind(this, "gamma"),
        palette: this._handlePalette.bind(this),
        transColor: this._handleTransColor.bind(this),
        finished: this._finished.bind(this),
        inflateData: this._inflateData.bind(this),
        simpleTransparency: this._simpleTransparency.bind(this),
        headersFinished: this._headersFinished.bind(this)
      });
      this._options = options;
      this.writable = true;
      this._parser.start();
    };
    util.inherits(ParserAsync, ChunkStream);
    ParserAsync.prototype._handleError = function(err) {
      this.emit("error", err);
      this.writable = false;
      this.destroy();
      if (this._inflate && this._inflate.destroy) {
        this._inflate.destroy();
      }
      if (this._filter) {
        this._filter.destroy();
        this._filter.on("error", function() {
        });
      }
      this.errord = true;
    };
    ParserAsync.prototype._inflateData = function(data) {
      if (!this._inflate) {
        if (this._bitmapInfo.interlace) {
          this._inflate = zlib.createInflate();
          this._inflate.on("error", this.emit.bind(this, "error"));
          this._filter.on("complete", this._complete.bind(this));
          this._inflate.pipe(this._filter);
        } else {
          let rowSize = (this._bitmapInfo.width * this._bitmapInfo.bpp * this._bitmapInfo.depth + 7 >> 3) + 1;
          let imageSize = rowSize * this._bitmapInfo.height;
          let chunkSize = Math.max(imageSize, zlib.Z_MIN_CHUNK);
          this._inflate = zlib.createInflate({ chunkSize });
          let leftToInflate = imageSize;
          let emitError = this.emit.bind(this, "error");
          this._inflate.on("error", function(err) {
            if (!leftToInflate) {
              return;
            }
            emitError(err);
          });
          this._filter.on("complete", this._complete.bind(this));
          let filterWrite = this._filter.write.bind(this._filter);
          this._inflate.on("data", function(chunk) {
            if (!leftToInflate) {
              return;
            }
            if (chunk.length > leftToInflate) {
              chunk = chunk.slice(0, leftToInflate);
            }
            leftToInflate -= chunk.length;
            filterWrite(chunk);
          });
          this._inflate.on("end", this._filter.end.bind(this._filter));
        }
      }
      this._inflate.write(data);
    };
    ParserAsync.prototype._handleMetaData = function(metaData) {
      this._metaData = metaData;
      this._bitmapInfo = Object.create(metaData);
      this._filter = new FilterAsync(this._bitmapInfo);
    };
    ParserAsync.prototype._handleTransColor = function(transColor) {
      this._bitmapInfo.transColor = transColor;
    };
    ParserAsync.prototype._handlePalette = function(palette) {
      this._bitmapInfo.palette = palette;
    };
    ParserAsync.prototype._simpleTransparency = function() {
      this._metaData.alpha = true;
    };
    ParserAsync.prototype._headersFinished = function() {
      this.emit("metadata", this._metaData);
    };
    ParserAsync.prototype._finished = function() {
      if (this.errord) {
        return;
      }
      if (!this._inflate) {
        this.emit("error", "No Inflate block");
      } else {
        this._inflate.end();
      }
    };
    ParserAsync.prototype._complete = function(filteredData) {
      if (this.errord) {
        return;
      }
      let normalisedBitmapData;
      try {
        let bitmapData = bitmapper.dataToBitMap(filteredData, this._bitmapInfo);
        normalisedBitmapData = formatNormaliser(bitmapData, this._bitmapInfo);
        bitmapData = null;
      } catch (ex) {
        this._handleError(ex);
        return;
      }
      this.emit("parsed", normalisedBitmapData);
    };
  }
});

// scripts/vendor/bundled_modules/pngjs/lib/bitpacker.js
var require_bitpacker = __commonJS({
  "scripts/vendor/bundled_modules/pngjs/lib/bitpacker.js"(exports2, module2) {
    "use strict";
    var constants = require_constants();
    module2.exports = function(dataIn, width, height, options) {
      let outHasAlpha = [constants.COLORTYPE_COLOR_ALPHA, constants.COLORTYPE_ALPHA].indexOf(
        options.colorType
      ) !== -1;
      if (options.colorType === options.inputColorType) {
        let bigEndian = function() {
          let buffer = new ArrayBuffer(2);
          new DataView(buffer).setInt16(
            0,
            256,
            true
            /* littleEndian */
          );
          return new Int16Array(buffer)[0] !== 256;
        }();
        if (options.bitDepth === 8 || options.bitDepth === 16 && bigEndian) {
          return dataIn;
        }
      }
      let data = options.bitDepth !== 16 ? dataIn : new Uint16Array(dataIn.buffer);
      let maxValue = 255;
      let inBpp = constants.COLORTYPE_TO_BPP_MAP[options.inputColorType];
      if (inBpp === 4 && !options.inputHasAlpha) {
        inBpp = 3;
      }
      let outBpp = constants.COLORTYPE_TO_BPP_MAP[options.colorType];
      if (options.bitDepth === 16) {
        maxValue = 65535;
        outBpp *= 2;
      }
      let outData = Buffer.alloc(width * height * outBpp);
      let inIndex = 0;
      let outIndex = 0;
      let bgColor = options.bgColor || {};
      if (bgColor.red === void 0) {
        bgColor.red = maxValue;
      }
      if (bgColor.green === void 0) {
        bgColor.green = maxValue;
      }
      if (bgColor.blue === void 0) {
        bgColor.blue = maxValue;
      }
      function getRGBA() {
        let red;
        let green;
        let blue;
        let alpha = maxValue;
        switch (options.inputColorType) {
          case constants.COLORTYPE_COLOR_ALPHA:
            alpha = data[inIndex + 3];
            red = data[inIndex];
            green = data[inIndex + 1];
            blue = data[inIndex + 2];
            break;
          case constants.COLORTYPE_COLOR:
            red = data[inIndex];
            green = data[inIndex + 1];
            blue = data[inIndex + 2];
            break;
          case constants.COLORTYPE_ALPHA:
            alpha = data[inIndex + 1];
            red = data[inIndex];
            green = red;
            blue = red;
            break;
          case constants.COLORTYPE_GRAYSCALE:
            red = data[inIndex];
            green = red;
            blue = red;
            break;
          default:
            throw new Error(
              "input color type:" + options.inputColorType + " is not supported at present"
            );
        }
        if (options.inputHasAlpha) {
          if (!outHasAlpha) {
            alpha /= maxValue;
            red = Math.min(
              Math.max(Math.round((1 - alpha) * bgColor.red + alpha * red), 0),
              maxValue
            );
            green = Math.min(
              Math.max(Math.round((1 - alpha) * bgColor.green + alpha * green), 0),
              maxValue
            );
            blue = Math.min(
              Math.max(Math.round((1 - alpha) * bgColor.blue + alpha * blue), 0),
              maxValue
            );
          }
        }
        return { red, green, blue, alpha };
      }
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let rgba = getRGBA(data, inIndex);
          switch (options.colorType) {
            case constants.COLORTYPE_COLOR_ALPHA:
            case constants.COLORTYPE_COLOR:
              if (options.bitDepth === 8) {
                outData[outIndex] = rgba.red;
                outData[outIndex + 1] = rgba.green;
                outData[outIndex + 2] = rgba.blue;
                if (outHasAlpha) {
                  outData[outIndex + 3] = rgba.alpha;
                }
              } else {
                outData.writeUInt16BE(rgba.red, outIndex);
                outData.writeUInt16BE(rgba.green, outIndex + 2);
                outData.writeUInt16BE(rgba.blue, outIndex + 4);
                if (outHasAlpha) {
                  outData.writeUInt16BE(rgba.alpha, outIndex + 6);
                }
              }
              break;
            case constants.COLORTYPE_ALPHA:
            case constants.COLORTYPE_GRAYSCALE: {
              let grayscale = (rgba.red + rgba.green + rgba.blue) / 3;
              if (options.bitDepth === 8) {
                outData[outIndex] = grayscale;
                if (outHasAlpha) {
                  outData[outIndex + 1] = rgba.alpha;
                }
              } else {
                outData.writeUInt16BE(grayscale, outIndex);
                if (outHasAlpha) {
                  outData.writeUInt16BE(rgba.alpha, outIndex + 2);
                }
              }
              break;
            }
            default:
              throw new Error("unrecognised color Type " + options.colorType);
          }
          inIndex += inBpp;
          outIndex += outBpp;
        }
      }
      return outData;
    };
  }
});

// scripts/vendor/bundled_modules/pngjs/lib/filter-pack.js
var require_filter_pack = __commonJS({
  "scripts/vendor/bundled_modules/pngjs/lib/filter-pack.js"(exports2, module2) {
    "use strict";
    var paethPredictor = require_paeth_predictor();
    function filterNone(pxData, pxPos, byteWidth, rawData, rawPos) {
      for (let x = 0; x < byteWidth; x++) {
        rawData[rawPos + x] = pxData[pxPos + x];
      }
    }
    function filterSumNone(pxData, pxPos, byteWidth) {
      let sum = 0;
      let length = pxPos + byteWidth;
      for (let i = pxPos; i < length; i++) {
        sum += Math.abs(pxData[i]);
      }
      return sum;
    }
    function filterSub(pxData, pxPos, byteWidth, rawData, rawPos, bpp) {
      for (let x = 0; x < byteWidth; x++) {
        let left = x >= bpp ? pxData[pxPos + x - bpp] : 0;
        let val = pxData[pxPos + x] - left;
        rawData[rawPos + x] = val;
      }
    }
    function filterSumSub(pxData, pxPos, byteWidth, bpp) {
      let sum = 0;
      for (let x = 0; x < byteWidth; x++) {
        let left = x >= bpp ? pxData[pxPos + x - bpp] : 0;
        let val = pxData[pxPos + x] - left;
        sum += Math.abs(val);
      }
      return sum;
    }
    function filterUp(pxData, pxPos, byteWidth, rawData, rawPos) {
      for (let x = 0; x < byteWidth; x++) {
        let up = pxPos > 0 ? pxData[pxPos + x - byteWidth] : 0;
        let val = pxData[pxPos + x] - up;
        rawData[rawPos + x] = val;
      }
    }
    function filterSumUp(pxData, pxPos, byteWidth) {
      let sum = 0;
      let length = pxPos + byteWidth;
      for (let x = pxPos; x < length; x++) {
        let up = pxPos > 0 ? pxData[x - byteWidth] : 0;
        let val = pxData[x] - up;
        sum += Math.abs(val);
      }
      return sum;
    }
    function filterAvg(pxData, pxPos, byteWidth, rawData, rawPos, bpp) {
      for (let x = 0; x < byteWidth; x++) {
        let left = x >= bpp ? pxData[pxPos + x - bpp] : 0;
        let up = pxPos > 0 ? pxData[pxPos + x - byteWidth] : 0;
        let val = pxData[pxPos + x] - (left + up >> 1);
        rawData[rawPos + x] = val;
      }
    }
    function filterSumAvg(pxData, pxPos, byteWidth, bpp) {
      let sum = 0;
      for (let x = 0; x < byteWidth; x++) {
        let left = x >= bpp ? pxData[pxPos + x - bpp] : 0;
        let up = pxPos > 0 ? pxData[pxPos + x - byteWidth] : 0;
        let val = pxData[pxPos + x] - (left + up >> 1);
        sum += Math.abs(val);
      }
      return sum;
    }
    function filterPaeth(pxData, pxPos, byteWidth, rawData, rawPos, bpp) {
      for (let x = 0; x < byteWidth; x++) {
        let left = x >= bpp ? pxData[pxPos + x - bpp] : 0;
        let up = pxPos > 0 ? pxData[pxPos + x - byteWidth] : 0;
        let upleft = pxPos > 0 && x >= bpp ? pxData[pxPos + x - (byteWidth + bpp)] : 0;
        let val = pxData[pxPos + x] - paethPredictor(left, up, upleft);
        rawData[rawPos + x] = val;
      }
    }
    function filterSumPaeth(pxData, pxPos, byteWidth, bpp) {
      let sum = 0;
      for (let x = 0; x < byteWidth; x++) {
        let left = x >= bpp ? pxData[pxPos + x - bpp] : 0;
        let up = pxPos > 0 ? pxData[pxPos + x - byteWidth] : 0;
        let upleft = pxPos > 0 && x >= bpp ? pxData[pxPos + x - (byteWidth + bpp)] : 0;
        let val = pxData[pxPos + x] - paethPredictor(left, up, upleft);
        sum += Math.abs(val);
      }
      return sum;
    }
    var filters = {
      0: filterNone,
      1: filterSub,
      2: filterUp,
      3: filterAvg,
      4: filterPaeth
    };
    var filterSums = {
      0: filterSumNone,
      1: filterSumSub,
      2: filterSumUp,
      3: filterSumAvg,
      4: filterSumPaeth
    };
    module2.exports = function(pxData, width, height, options, bpp) {
      let filterTypes;
      if (!("filterType" in options) || options.filterType === -1) {
        filterTypes = [0, 1, 2, 3, 4];
      } else if (typeof options.filterType === "number") {
        filterTypes = [options.filterType];
      } else {
        throw new Error("unrecognised filter types");
      }
      if (options.bitDepth === 16) {
        bpp *= 2;
      }
      let byteWidth = width * bpp;
      let rawPos = 0;
      let pxPos = 0;
      let rawData = Buffer.alloc((byteWidth + 1) * height);
      let sel = filterTypes[0];
      for (let y = 0; y < height; y++) {
        if (filterTypes.length > 1) {
          let min = Infinity;
          for (let i = 0; i < filterTypes.length; i++) {
            let sum = filterSums[filterTypes[i]](pxData, pxPos, byteWidth, bpp);
            if (sum < min) {
              sel = filterTypes[i];
              min = sum;
            }
          }
        }
        rawData[rawPos] = sel;
        rawPos++;
        filters[sel](pxData, pxPos, byteWidth, rawData, rawPos, bpp);
        rawPos += byteWidth;
        pxPos += byteWidth;
      }
      return rawData;
    };
  }
});

// scripts/vendor/bundled_modules/pngjs/lib/packer.js
var require_packer = __commonJS({
  "scripts/vendor/bundled_modules/pngjs/lib/packer.js"(exports2, module2) {
    "use strict";
    var constants = require_constants();
    var CrcStream = require_crc();
    var bitPacker = require_bitpacker();
    var filter = require_filter_pack();
    var zlib = require("zlib");
    var Packer = module2.exports = function(options) {
      this._options = options;
      options.deflateChunkSize = options.deflateChunkSize || 32 * 1024;
      options.deflateLevel = options.deflateLevel != null ? options.deflateLevel : 9;
      options.deflateStrategy = options.deflateStrategy != null ? options.deflateStrategy : 3;
      options.inputHasAlpha = options.inputHasAlpha != null ? options.inputHasAlpha : true;
      options.deflateFactory = options.deflateFactory || zlib.createDeflate;
      options.bitDepth = options.bitDepth || 8;
      options.colorType = typeof options.colorType === "number" ? options.colorType : constants.COLORTYPE_COLOR_ALPHA;
      options.inputColorType = typeof options.inputColorType === "number" ? options.inputColorType : constants.COLORTYPE_COLOR_ALPHA;
      if ([
        constants.COLORTYPE_GRAYSCALE,
        constants.COLORTYPE_COLOR,
        constants.COLORTYPE_COLOR_ALPHA,
        constants.COLORTYPE_ALPHA
      ].indexOf(options.colorType) === -1) {
        throw new Error(
          "option color type:" + options.colorType + " is not supported at present"
        );
      }
      if ([
        constants.COLORTYPE_GRAYSCALE,
        constants.COLORTYPE_COLOR,
        constants.COLORTYPE_COLOR_ALPHA,
        constants.COLORTYPE_ALPHA
      ].indexOf(options.inputColorType) === -1) {
        throw new Error(
          "option input color type:" + options.inputColorType + " is not supported at present"
        );
      }
      if (options.bitDepth !== 8 && options.bitDepth !== 16) {
        throw new Error(
          "option bit depth:" + options.bitDepth + " is not supported at present"
        );
      }
    };
    Packer.prototype.getDeflateOptions = function() {
      return {
        chunkSize: this._options.deflateChunkSize,
        level: this._options.deflateLevel,
        strategy: this._options.deflateStrategy
      };
    };
    Packer.prototype.createDeflate = function() {
      return this._options.deflateFactory(this.getDeflateOptions());
    };
    Packer.prototype.filterData = function(data, width, height) {
      let packedData = bitPacker(data, width, height, this._options);
      let bpp = constants.COLORTYPE_TO_BPP_MAP[this._options.colorType];
      let filteredData = filter(packedData, width, height, this._options, bpp);
      return filteredData;
    };
    Packer.prototype._packChunk = function(type, data) {
      let len = data ? data.length : 0;
      let buf = Buffer.alloc(len + 12);
      buf.writeUInt32BE(len, 0);
      buf.writeUInt32BE(type, 4);
      if (data) {
        data.copy(buf, 8);
      }
      buf.writeInt32BE(
        CrcStream.crc32(buf.slice(4, buf.length - 4)),
        buf.length - 4
      );
      return buf;
    };
    Packer.prototype.packGAMA = function(gamma) {
      let buf = Buffer.alloc(4);
      buf.writeUInt32BE(Math.floor(gamma * constants.GAMMA_DIVISION), 0);
      return this._packChunk(constants.TYPE_gAMA, buf);
    };
    Packer.prototype.packIHDR = function(width, height) {
      let buf = Buffer.alloc(13);
      buf.writeUInt32BE(width, 0);
      buf.writeUInt32BE(height, 4);
      buf[8] = this._options.bitDepth;
      buf[9] = this._options.colorType;
      buf[10] = 0;
      buf[11] = 0;
      buf[12] = 0;
      return this._packChunk(constants.TYPE_IHDR, buf);
    };
    Packer.prototype.packIDAT = function(data) {
      return this._packChunk(constants.TYPE_IDAT, data);
    };
    Packer.prototype.packIEND = function() {
      return this._packChunk(constants.TYPE_IEND, null);
    };
  }
});

// scripts/vendor/bundled_modules/pngjs/lib/packer-async.js
var require_packer_async = __commonJS({
  "scripts/vendor/bundled_modules/pngjs/lib/packer-async.js"(exports2, module2) {
    "use strict";
    var util = require("util");
    var Stream = require("stream");
    var constants = require_constants();
    var Packer = require_packer();
    var PackerAsync = module2.exports = function(opt) {
      Stream.call(this);
      let options = opt || {};
      this._packer = new Packer(options);
      this._deflate = this._packer.createDeflate();
      this.readable = true;
    };
    util.inherits(PackerAsync, Stream);
    PackerAsync.prototype.pack = function(data, width, height, gamma) {
      this.emit("data", Buffer.from(constants.PNG_SIGNATURE));
      this.emit("data", this._packer.packIHDR(width, height));
      if (gamma) {
        this.emit("data", this._packer.packGAMA(gamma));
      }
      let filteredData = this._packer.filterData(data, width, height);
      this._deflate.on("error", this.emit.bind(this, "error"));
      this._deflate.on(
        "data",
        function(compressedData) {
          this.emit("data", this._packer.packIDAT(compressedData));
        }.bind(this)
      );
      this._deflate.on(
        "end",
        function() {
          this.emit("data", this._packer.packIEND());
          this.emit("end");
        }.bind(this)
      );
      this._deflate.end(filteredData);
    };
  }
});

// scripts/vendor/bundled_modules/pngjs/lib/sync-inflate.js
var require_sync_inflate = __commonJS({
  "scripts/vendor/bundled_modules/pngjs/lib/sync-inflate.js"(exports2, module2) {
    "use strict";
    var assert = require("assert").ok;
    var zlib = require("zlib");
    var util = require("util");
    var kMaxLength = require("buffer").kMaxLength;
    function Inflate(opts) {
      if (!(this instanceof Inflate)) {
        return new Inflate(opts);
      }
      if (opts && opts.chunkSize < zlib.Z_MIN_CHUNK) {
        opts.chunkSize = zlib.Z_MIN_CHUNK;
      }
      zlib.Inflate.call(this, opts);
      this._offset = this._offset === void 0 ? this._outOffset : this._offset;
      this._buffer = this._buffer || this._outBuffer;
      if (opts && opts.maxLength != null) {
        this._maxLength = opts.maxLength;
      }
    }
    function createInflate(opts) {
      return new Inflate(opts);
    }
    function _close(engine, callback) {
      if (callback) {
        process.nextTick(callback);
      }
      if (!engine._handle) {
        return;
      }
      engine._handle.close();
      engine._handle = null;
    }
    Inflate.prototype._processChunk = function(chunk, flushFlag, asyncCb) {
      if (typeof asyncCb === "function") {
        return zlib.Inflate._processChunk.call(this, chunk, flushFlag, asyncCb);
      }
      let self = this;
      let availInBefore = chunk && chunk.length;
      let availOutBefore = this._chunkSize - this._offset;
      let leftToInflate = this._maxLength;
      let inOff = 0;
      let buffers = [];
      let nread = 0;
      let error;
      this.on("error", function(err) {
        error = err;
      });
      function handleChunk(availInAfter, availOutAfter) {
        if (self._hadError) {
          return;
        }
        let have = availOutBefore - availOutAfter;
        assert(have >= 0, "have should not go down");
        if (have > 0) {
          let out = self._buffer.slice(self._offset, self._offset + have);
          self._offset += have;
          if (out.length > leftToInflate) {
            out = out.slice(0, leftToInflate);
          }
          buffers.push(out);
          nread += out.length;
          leftToInflate -= out.length;
          if (leftToInflate === 0) {
            return false;
          }
        }
        if (availOutAfter === 0 || self._offset >= self._chunkSize) {
          availOutBefore = self._chunkSize;
          self._offset = 0;
          self._buffer = Buffer.allocUnsafe(self._chunkSize);
        }
        if (availOutAfter === 0) {
          inOff += availInBefore - availInAfter;
          availInBefore = availInAfter;
          return true;
        }
        return false;
      }
      assert(this._handle, "zlib binding closed");
      let res;
      do {
        res = this._handle.writeSync(
          flushFlag,
          chunk,
          // in
          inOff,
          // in_off
          availInBefore,
          // in_len
          this._buffer,
          // out
          this._offset,
          //out_off
          availOutBefore
        );
        res = res || this._writeState;
      } while (!this._hadError && handleChunk(res[0], res[1]));
      if (this._hadError) {
        throw error;
      }
      if (nread >= kMaxLength) {
        _close(this);
        throw new RangeError(
          "Cannot create final Buffer. It would be larger than 0x" + kMaxLength.toString(16) + " bytes"
        );
      }
      let buf = Buffer.concat(buffers, nread);
      _close(this);
      return buf;
    };
    util.inherits(Inflate, zlib.Inflate);
    function zlibBufferSync(engine, buffer) {
      if (typeof buffer === "string") {
        buffer = Buffer.from(buffer);
      }
      if (!(buffer instanceof Buffer)) {
        throw new TypeError("Not a string or buffer");
      }
      let flushFlag = engine._finishFlushFlag;
      if (flushFlag == null) {
        flushFlag = zlib.Z_FINISH;
      }
      return engine._processChunk(buffer, flushFlag);
    }
    function inflateSync(buffer, opts) {
      return zlibBufferSync(new Inflate(opts), buffer);
    }
    module2.exports = exports2 = inflateSync;
    exports2.Inflate = Inflate;
    exports2.createInflate = createInflate;
    exports2.inflateSync = inflateSync;
  }
});

// scripts/vendor/bundled_modules/pngjs/lib/sync-reader.js
var require_sync_reader = __commonJS({
  "scripts/vendor/bundled_modules/pngjs/lib/sync-reader.js"(exports2, module2) {
    "use strict";
    var SyncReader = module2.exports = function(buffer) {
      this._buffer = buffer;
      this._reads = [];
    };
    SyncReader.prototype.read = function(length, callback) {
      this._reads.push({
        length: Math.abs(length),
        // if length < 0 then at most this length
        allowLess: length < 0,
        func: callback
      });
    };
    SyncReader.prototype.process = function() {
      while (this._reads.length > 0 && this._buffer.length) {
        let read = this._reads[0];
        if (this._buffer.length && (this._buffer.length >= read.length || read.allowLess)) {
          this._reads.shift();
          let buf = this._buffer;
          this._buffer = buf.slice(read.length);
          read.func.call(this, buf.slice(0, read.length));
        } else {
          break;
        }
      }
      if (this._reads.length > 0) {
        return new Error("There are some read requests waitng on finished stream");
      }
      if (this._buffer.length > 0) {
        return new Error("unrecognised content at end of stream");
      }
    };
  }
});

// scripts/vendor/bundled_modules/pngjs/lib/filter-parse-sync.js
var require_filter_parse_sync = __commonJS({
  "scripts/vendor/bundled_modules/pngjs/lib/filter-parse-sync.js"(exports2) {
    "use strict";
    var SyncReader = require_sync_reader();
    var Filter = require_filter_parse();
    exports2.process = function(inBuffer, bitmapInfo) {
      let outBuffers = [];
      let reader = new SyncReader(inBuffer);
      let filter = new Filter(bitmapInfo, {
        read: reader.read.bind(reader),
        write: function(bufferPart) {
          outBuffers.push(bufferPart);
        },
        complete: function() {
        }
      });
      filter.start();
      reader.process();
      return Buffer.concat(outBuffers);
    };
  }
});

// scripts/vendor/bundled_modules/pngjs/lib/parser-sync.js
var require_parser_sync = __commonJS({
  "scripts/vendor/bundled_modules/pngjs/lib/parser-sync.js"(exports2, module2) {
    "use strict";
    var hasSyncZlib = true;
    var zlib = require("zlib");
    var inflateSync = require_sync_inflate();
    if (!zlib.deflateSync) {
      hasSyncZlib = false;
    }
    var SyncReader = require_sync_reader();
    var FilterSync = require_filter_parse_sync();
    var Parser = require_parser();
    var bitmapper = require_bitmapper();
    var formatNormaliser = require_format_normaliser();
    module2.exports = function(buffer, options) {
      if (!hasSyncZlib) {
        throw new Error(
          "To use the sync capability of this library in old node versions, please pin pngjs to v2.3.0"
        );
      }
      let err;
      function handleError(_err_) {
        err = _err_;
      }
      let metaData;
      function handleMetaData(_metaData_) {
        metaData = _metaData_;
      }
      function handleTransColor(transColor) {
        metaData.transColor = transColor;
      }
      function handlePalette(palette) {
        metaData.palette = palette;
      }
      function handleSimpleTransparency() {
        metaData.alpha = true;
      }
      let gamma;
      function handleGamma(_gamma_) {
        gamma = _gamma_;
      }
      let inflateDataList = [];
      function handleInflateData(inflatedData2) {
        inflateDataList.push(inflatedData2);
      }
      let reader = new SyncReader(buffer);
      let parser = new Parser(options, {
        read: reader.read.bind(reader),
        error: handleError,
        metadata: handleMetaData,
        gamma: handleGamma,
        palette: handlePalette,
        transColor: handleTransColor,
        inflateData: handleInflateData,
        simpleTransparency: handleSimpleTransparency
      });
      parser.start();
      reader.process();
      if (err) {
        throw err;
      }
      let inflateData = Buffer.concat(inflateDataList);
      inflateDataList.length = 0;
      let inflatedData;
      if (metaData.interlace) {
        inflatedData = zlib.inflateSync(inflateData);
      } else {
        let rowSize = (metaData.width * metaData.bpp * metaData.depth + 7 >> 3) + 1;
        let imageSize = rowSize * metaData.height;
        inflatedData = inflateSync(inflateData, {
          chunkSize: imageSize,
          maxLength: imageSize
        });
      }
      inflateData = null;
      if (!inflatedData || !inflatedData.length) {
        throw new Error("bad png - invalid inflate data response");
      }
      let unfilteredData = FilterSync.process(inflatedData, metaData);
      inflateData = null;
      let bitmapData = bitmapper.dataToBitMap(unfilteredData, metaData);
      unfilteredData = null;
      let normalisedBitmapData = formatNormaliser(bitmapData, metaData);
      metaData.data = normalisedBitmapData;
      metaData.gamma = gamma || 0;
      return metaData;
    };
  }
});

// scripts/vendor/bundled_modules/pngjs/lib/packer-sync.js
var require_packer_sync = __commonJS({
  "scripts/vendor/bundled_modules/pngjs/lib/packer-sync.js"(exports2, module2) {
    "use strict";
    var hasSyncZlib = true;
    var zlib = require("zlib");
    if (!zlib.deflateSync) {
      hasSyncZlib = false;
    }
    var constants = require_constants();
    var Packer = require_packer();
    module2.exports = function(metaData, opt) {
      if (!hasSyncZlib) {
        throw new Error(
          "To use the sync capability of this library in old node versions, please pin pngjs to v2.3.0"
        );
      }
      let options = opt || {};
      let packer = new Packer(options);
      let chunks = [];
      chunks.push(Buffer.from(constants.PNG_SIGNATURE));
      chunks.push(packer.packIHDR(metaData.width, metaData.height));
      if (metaData.gamma) {
        chunks.push(packer.packGAMA(metaData.gamma));
      }
      let filteredData = packer.filterData(
        metaData.data,
        metaData.width,
        metaData.height
      );
      let compressedData = zlib.deflateSync(
        filteredData,
        packer.getDeflateOptions()
      );
      filteredData = null;
      if (!compressedData || !compressedData.length) {
        throw new Error("bad png - invalid compressed data response");
      }
      chunks.push(packer.packIDAT(compressedData));
      chunks.push(packer.packIEND());
      return Buffer.concat(chunks);
    };
  }
});

// scripts/vendor/bundled_modules/pngjs/lib/png-sync.js
var require_png_sync = __commonJS({
  "scripts/vendor/bundled_modules/pngjs/lib/png-sync.js"(exports2) {
    "use strict";
    var parse = require_parser_sync();
    var pack = require_packer_sync();
    exports2.read = function(buffer, options) {
      return parse(buffer, options || {});
    };
    exports2.write = function(png, options) {
      return pack(png, options);
    };
  }
});

// scripts/vendor/bundled_modules/pngjs/lib/png.js
var require_png = __commonJS({
  "scripts/vendor/bundled_modules/pngjs/lib/png.js"(exports2) {
    "use strict";
    var util = require("util");
    var Stream = require("stream");
    var Parser = require_parser_async();
    var Packer = require_packer_async();
    var PNGSync = require_png_sync();
    var PNG = exports2.PNG = function(options) {
      Stream.call(this);
      options = options || {};
      this.width = options.width | 0;
      this.height = options.height | 0;
      this.data = this.width > 0 && this.height > 0 ? Buffer.alloc(4 * this.width * this.height) : null;
      if (options.fill && this.data) {
        this.data.fill(0);
      }
      this.gamma = 0;
      this.readable = this.writable = true;
      this._parser = new Parser(options);
      this._parser.on("error", this.emit.bind(this, "error"));
      this._parser.on("close", this._handleClose.bind(this));
      this._parser.on("metadata", this._metadata.bind(this));
      this._parser.on("gamma", this._gamma.bind(this));
      this._parser.on(
        "parsed",
        function(data) {
          this.data = data;
          this.emit("parsed", data);
        }.bind(this)
      );
      this._packer = new Packer(options);
      this._packer.on("data", this.emit.bind(this, "data"));
      this._packer.on("end", this.emit.bind(this, "end"));
      this._parser.on("close", this._handleClose.bind(this));
      this._packer.on("error", this.emit.bind(this, "error"));
    };
    util.inherits(PNG, Stream);
    PNG.sync = PNGSync;
    PNG.prototype.pack = function() {
      if (!this.data || !this.data.length) {
        this.emit("error", "No data provided");
        return this;
      }
      process.nextTick(
        function() {
          this._packer.pack(this.data, this.width, this.height, this.gamma);
        }.bind(this)
      );
      return this;
    };
    PNG.prototype.parse = function(data, callback) {
      if (callback) {
        let onParsed, onError;
        onParsed = function(parsedData) {
          this.removeListener("error", onError);
          this.data = parsedData;
          callback(null, this);
        }.bind(this);
        onError = function(err) {
          this.removeListener("parsed", onParsed);
          callback(err, null);
        }.bind(this);
        this.once("parsed", onParsed);
        this.once("error", onError);
      }
      this.end(data);
      return this;
    };
    PNG.prototype.write = function(data) {
      this._parser.write(data);
      return true;
    };
    PNG.prototype.end = function(data) {
      this._parser.end(data);
    };
    PNG.prototype._metadata = function(metadata) {
      this.width = metadata.width;
      this.height = metadata.height;
      this.emit("metadata", metadata);
    };
    PNG.prototype._gamma = function(gamma) {
      this.gamma = gamma;
    };
    PNG.prototype._handleClose = function() {
      if (!this._parser.writable && !this._packer.readable) {
        this.emit("close");
      }
    };
    PNG.bitblt = function(src, dst, srcX, srcY, width, height, deltaX, deltaY) {
      srcX |= 0;
      srcY |= 0;
      width |= 0;
      height |= 0;
      deltaX |= 0;
      deltaY |= 0;
      if (srcX > src.width || srcY > src.height || srcX + width > src.width || srcY + height > src.height) {
        throw new Error("bitblt reading outside image");
      }
      if (deltaX > dst.width || deltaY > dst.height || deltaX + width > dst.width || deltaY + height > dst.height) {
        throw new Error("bitblt writing outside image");
      }
      for (let y = 0; y < height; y++) {
        src.data.copy(
          dst.data,
          (deltaY + y) * dst.width + deltaX << 2,
          (srcY + y) * src.width + srcX << 2,
          (srcY + y) * src.width + srcX + width << 2
        );
      }
    };
    PNG.prototype.bitblt = function(dst, srcX, srcY, width, height, deltaX, deltaY) {
      PNG.bitblt(this, dst, srcX, srcY, width, height, deltaX, deltaY);
      return this;
    };
    PNG.adjustGamma = function(src) {
      if (src.gamma) {
        for (let y = 0; y < src.height; y++) {
          for (let x = 0; x < src.width; x++) {
            let idx = src.width * y + x << 2;
            for (let i = 0; i < 3; i++) {
              let sample = src.data[idx + i] / 255;
              sample = Math.pow(sample, 1 / 2.2 / src.gamma);
              src.data[idx + i] = Math.round(sample * 255);
            }
          }
        }
        src.gamma = 0;
      }
    };
    PNG.prototype.adjustGamma = function() {
      PNG.adjustGamma(this);
    };
  }
});

// scripts/vendor/bundled_modules/qrcode/lib/renderer/utils.js
var require_utils2 = __commonJS({
  "scripts/vendor/bundled_modules/qrcode/lib/renderer/utils.js"(exports2) {
    function hex2rgba(hex) {
      if (typeof hex === "number") {
        hex = hex.toString();
      }
      if (typeof hex !== "string") {
        throw new Error("Color should be defined as hex string");
      }
      let hexCode = hex.slice().replace("#", "").split("");
      if (hexCode.length < 3 || hexCode.length === 5 || hexCode.length > 8) {
        throw new Error("Invalid hex color: " + hex);
      }
      if (hexCode.length === 3 || hexCode.length === 4) {
        hexCode = Array.prototype.concat.apply([], hexCode.map(function(c) {
          return [c, c];
        }));
      }
      if (hexCode.length === 6) hexCode.push("F", "F");
      const hexValue = parseInt(hexCode.join(""), 16);
      return {
        r: hexValue >> 24 & 255,
        g: hexValue >> 16 & 255,
        b: hexValue >> 8 & 255,
        a: hexValue & 255,
        hex: "#" + hexCode.slice(0, 6).join("")
      };
    }
    exports2.getOptions = function getOptions(options) {
      if (!options) options = {};
      if (!options.color) options.color = {};
      const margin = typeof options.margin === "undefined" || options.margin === null || options.margin < 0 ? 4 : options.margin;
      const width = options.width && options.width >= 21 ? options.width : void 0;
      const scale = options.scale || 4;
      return {
        width,
        scale: width ? 4 : scale,
        margin,
        color: {
          dark: hex2rgba(options.color.dark || "#000000ff"),
          light: hex2rgba(options.color.light || "#ffffffff")
        },
        type: options.type,
        rendererOpts: options.rendererOpts || {}
      };
    };
    exports2.getScale = function getScale(qrSize, opts) {
      return opts.width && opts.width >= qrSize + opts.margin * 2 ? opts.width / (qrSize + opts.margin * 2) : opts.scale;
    };
    exports2.getImageWidth = function getImageWidth(qrSize, opts) {
      const scale = exports2.getScale(qrSize, opts);
      return Math.floor((qrSize + opts.margin * 2) * scale);
    };
    exports2.qrToImageData = function qrToImageData(imgData, qr, opts) {
      const size = qr.modules.size;
      const data = qr.modules.data;
      const scale = exports2.getScale(size, opts);
      const symbolSize = Math.floor((size + opts.margin * 2) * scale);
      const scaledMargin = opts.margin * scale;
      const palette = [opts.color.light, opts.color.dark];
      for (let i = 0; i < symbolSize; i++) {
        for (let j = 0; j < symbolSize; j++) {
          let posDst = (i * symbolSize + j) * 4;
          let pxColor = opts.color.light;
          if (i >= scaledMargin && j >= scaledMargin && i < symbolSize - scaledMargin && j < symbolSize - scaledMargin) {
            const iSrc = Math.floor((i - scaledMargin) / scale);
            const jSrc = Math.floor((j - scaledMargin) / scale);
            pxColor = palette[data[iSrc * size + jSrc] ? 1 : 0];
          }
          imgData[posDst++] = pxColor.r;
          imgData[posDst++] = pxColor.g;
          imgData[posDst++] = pxColor.b;
          imgData[posDst] = pxColor.a;
        }
      }
    };
  }
});

// scripts/vendor/bundled_modules/qrcode/lib/renderer/png.js
var require_png2 = __commonJS({
  "scripts/vendor/bundled_modules/qrcode/lib/renderer/png.js"(exports2) {
    var fs = require("fs");
    var PNG = require_png().PNG;
    var Utils = require_utils2();
    exports2.render = function render(qrData, options) {
      const opts = Utils.getOptions(options);
      const pngOpts = opts.rendererOpts;
      const size = Utils.getImageWidth(qrData.modules.size, opts);
      pngOpts.width = size;
      pngOpts.height = size;
      const pngImage = new PNG(pngOpts);
      Utils.qrToImageData(pngImage.data, qrData, opts);
      return pngImage;
    };
    exports2.renderToDataURL = function renderToDataURL(qrData, options, cb) {
      if (typeof cb === "undefined") {
        cb = options;
        options = void 0;
      }
      exports2.renderToBuffer(qrData, options, function(err, output) {
        if (err) cb(err);
        let url = "data:image/png;base64,";
        url += output.toString("base64");
        cb(null, url);
      });
    };
    exports2.renderToBuffer = function renderToBuffer(qrData, options, cb) {
      if (typeof cb === "undefined") {
        cb = options;
        options = void 0;
      }
      const png = exports2.render(qrData, options);
      const buffer = [];
      png.on("error", cb);
      png.on("data", function(data) {
        buffer.push(data);
      });
      png.on("end", function() {
        cb(null, Buffer.concat(buffer));
      });
      png.pack();
    };
    exports2.renderToFile = function renderToFile(path, qrData, options, cb) {
      if (typeof cb === "undefined") {
        cb = options;
        options = void 0;
      }
      let called = false;
      const done = (...args) => {
        if (called) return;
        called = true;
        cb.apply(null, args);
      };
      const stream = fs.createWriteStream(path);
      stream.on("error", done);
      stream.on("close", done);
      exports2.renderToFileStream(stream, qrData, options);
    };
    exports2.renderToFileStream = function renderToFileStream(stream, qrData, options) {
      const png = exports2.render(qrData, options);
      png.pack().pipe(stream);
    };
  }
});

// scripts/vendor/bundled_modules/qrcode/lib/renderer/utf8.js
var require_utf8 = __commonJS({
  "scripts/vendor/bundled_modules/qrcode/lib/renderer/utf8.js"(exports2) {
    var Utils = require_utils2();
    var BLOCK_CHAR = {
      WW: " ",
      WB: "\u2584",
      BB: "\u2588",
      BW: "\u2580"
    };
    var INVERTED_BLOCK_CHAR = {
      BB: " ",
      BW: "\u2584",
      WW: "\u2588",
      WB: "\u2580"
    };
    function getBlockChar(top, bottom, blocks) {
      if (top && bottom) return blocks.BB;
      if (top && !bottom) return blocks.BW;
      if (!top && bottom) return blocks.WB;
      return blocks.WW;
    }
    exports2.render = function(qrData, options, cb) {
      const opts = Utils.getOptions(options);
      let blocks = BLOCK_CHAR;
      if (opts.color.dark.hex === "#ffffff" || opts.color.light.hex === "#000000") {
        blocks = INVERTED_BLOCK_CHAR;
      }
      const size = qrData.modules.size;
      const data = qrData.modules.data;
      let output = "";
      let hMargin = Array(size + opts.margin * 2 + 1).join(blocks.WW);
      hMargin = Array(opts.margin / 2 + 1).join(hMargin + "\n");
      const vMargin = Array(opts.margin + 1).join(blocks.WW);
      output += hMargin;
      for (let i = 0; i < size; i += 2) {
        output += vMargin;
        for (let j = 0; j < size; j++) {
          const topModule = data[i * size + j];
          const bottomModule = data[(i + 1) * size + j];
          output += getBlockChar(topModule, bottomModule, blocks);
        }
        output += vMargin + "\n";
      }
      output += hMargin.slice(0, -1);
      if (typeof cb === "function") {
        cb(null, output);
      }
      return output;
    };
    exports2.renderToFile = function renderToFile(path, qrData, options, cb) {
      if (typeof cb === "undefined") {
        cb = options;
        options = void 0;
      }
      const fs = require("fs");
      const utf8 = exports2.render(qrData, options);
      fs.writeFile(path, utf8, cb);
    };
  }
});

// scripts/vendor/bundled_modules/qrcode/lib/renderer/terminal/terminal.js
var require_terminal = __commonJS({
  "scripts/vendor/bundled_modules/qrcode/lib/renderer/terminal/terminal.js"(exports2) {
    exports2.render = function(qrData, options, cb) {
      const size = qrData.modules.size;
      const data = qrData.modules.data;
      const black = "\x1B[40m  \x1B[0m";
      const white = "\x1B[47m  \x1B[0m";
      let output = "";
      const hMargin = Array(size + 3).join(white);
      const vMargin = Array(2).join(white);
      output += hMargin + "\n";
      for (let i = 0; i < size; ++i) {
        output += white;
        for (let j = 0; j < size; j++) {
          output += data[i * size + j] ? black : white;
        }
        output += vMargin + "\n";
      }
      output += hMargin + "\n";
      if (typeof cb === "function") {
        cb(null, output);
      }
      return output;
    };
  }
});

// scripts/vendor/bundled_modules/qrcode/lib/renderer/terminal/terminal-small.js
var require_terminal_small = __commonJS({
  "scripts/vendor/bundled_modules/qrcode/lib/renderer/terminal/terminal-small.js"(exports2) {
    var backgroundWhite = "\x1B[47m";
    var backgroundBlack = "\x1B[40m";
    var foregroundWhite = "\x1B[37m";
    var foregroundBlack = "\x1B[30m";
    var reset = "\x1B[0m";
    var lineSetupNormal = backgroundWhite + foregroundBlack;
    var lineSetupInverse = backgroundBlack + foregroundWhite;
    var createPalette = function(lineSetup, foregroundWhite2, foregroundBlack2) {
      return {
        // 1 ... white, 2 ... black, 0 ... transparent (default)
        "00": reset + " " + lineSetup,
        "01": reset + foregroundWhite2 + "\u2584" + lineSetup,
        "02": reset + foregroundBlack2 + "\u2584" + lineSetup,
        10: reset + foregroundWhite2 + "\u2580" + lineSetup,
        11: " ",
        12: "\u2584",
        20: reset + foregroundBlack2 + "\u2580" + lineSetup,
        21: "\u2580",
        22: "\u2588"
      };
    };
    var mkCodePixel = function(modules, size, x, y) {
      const sizePlus = size + 1;
      if (x >= sizePlus || y >= sizePlus || y < -1 || x < -1) return "0";
      if (x >= size || y >= size || y < 0 || x < 0) return "1";
      const idx = y * size + x;
      return modules[idx] ? "2" : "1";
    };
    var mkCode = function(modules, size, x, y) {
      return mkCodePixel(modules, size, x, y) + mkCodePixel(modules, size, x, y + 1);
    };
    exports2.render = function(qrData, options, cb) {
      const size = qrData.modules.size;
      const data = qrData.modules.data;
      const inverse = !!(options && options.inverse);
      const lineSetup = options && options.inverse ? lineSetupInverse : lineSetupNormal;
      const white = inverse ? foregroundBlack : foregroundWhite;
      const black = inverse ? foregroundWhite : foregroundBlack;
      const palette = createPalette(lineSetup, white, black);
      const newLine = reset + "\n" + lineSetup;
      let output = lineSetup;
      for (let y = -1; y < size + 1; y += 2) {
        for (let x = -1; x < size; x++) {
          output += palette[mkCode(data, size, x, y)];
        }
        output += palette[mkCode(data, size, size, y)] + newLine;
      }
      output += reset;
      if (typeof cb === "function") {
        cb(null, output);
      }
      return output;
    };
  }
});

// scripts/vendor/bundled_modules/qrcode/lib/renderer/terminal.js
var require_terminal2 = __commonJS({
  "scripts/vendor/bundled_modules/qrcode/lib/renderer/terminal.js"(exports2) {
    var big = require_terminal();
    var small = require_terminal_small();
    exports2.render = function(qrData, options, cb) {
      if (options && options.small) {
        return small.render(qrData, options, cb);
      }
      return big.render(qrData, options, cb);
    };
  }
});

// scripts/vendor/bundled_modules/qrcode/lib/renderer/svg-tag.js
var require_svg_tag = __commonJS({
  "scripts/vendor/bundled_modules/qrcode/lib/renderer/svg-tag.js"(exports2) {
    var Utils = require_utils2();
    function getColorAttrib(color, attrib) {
      const alpha = color.a / 255;
      const str = attrib + '="' + color.hex + '"';
      return alpha < 1 ? str + " " + attrib + '-opacity="' + alpha.toFixed(2).slice(1) + '"' : str;
    }
    function svgCmd(cmd, x, y) {
      let str = cmd + x;
      if (typeof y !== "undefined") str += " " + y;
      return str;
    }
    function qrToPath(data, size, margin) {
      let path = "";
      let moveBy = 0;
      let newRow = false;
      let lineLength = 0;
      for (let i = 0; i < data.length; i++) {
        const col = Math.floor(i % size);
        const row = Math.floor(i / size);
        if (!col && !newRow) newRow = true;
        if (data[i]) {
          lineLength++;
          if (!(i > 0 && col > 0 && data[i - 1])) {
            path += newRow ? svgCmd("M", col + margin, 0.5 + row + margin) : svgCmd("m", moveBy, 0);
            moveBy = 0;
            newRow = false;
          }
          if (!(col + 1 < size && data[i + 1])) {
            path += svgCmd("h", lineLength);
            lineLength = 0;
          }
        } else {
          moveBy++;
        }
      }
      return path;
    }
    exports2.render = function render(qrData, options, cb) {
      const opts = Utils.getOptions(options);
      const size = qrData.modules.size;
      const data = qrData.modules.data;
      const qrcodesize = size + opts.margin * 2;
      const bg = !opts.color.light.a ? "" : "<path " + getColorAttrib(opts.color.light, "fill") + ' d="M0 0h' + qrcodesize + "v" + qrcodesize + 'H0z"/>';
      const path = "<path " + getColorAttrib(opts.color.dark, "stroke") + ' d="' + qrToPath(data, size, opts.margin) + '"/>';
      const viewBox = 'viewBox="0 0 ' + qrcodesize + " " + qrcodesize + '"';
      const width = !opts.width ? "" : 'width="' + opts.width + '" height="' + opts.width + '" ';
      const svgTag = '<svg xmlns="http://www.w3.org/2000/svg" ' + width + viewBox + ' shape-rendering="crispEdges">' + bg + path + "</svg>\n";
      if (typeof cb === "function") {
        cb(null, svgTag);
      }
      return svgTag;
    };
  }
});

// scripts/vendor/bundled_modules/qrcode/lib/renderer/svg.js
var require_svg = __commonJS({
  "scripts/vendor/bundled_modules/qrcode/lib/renderer/svg.js"(exports2) {
    var svgTagRenderer = require_svg_tag();
    exports2.render = svgTagRenderer.render;
    exports2.renderToFile = function renderToFile(path, qrData, options, cb) {
      if (typeof cb === "undefined") {
        cb = options;
        options = void 0;
      }
      const fs = require("fs");
      const svgTag = exports2.render(qrData, options);
      const xmlStr = '<?xml version="1.0" encoding="utf-8"?><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">' + svgTag;
      fs.writeFile(path, xmlStr, cb);
    };
  }
});

// scripts/vendor/bundled_modules/qrcode/lib/renderer/canvas.js
var require_canvas = __commonJS({
  "scripts/vendor/bundled_modules/qrcode/lib/renderer/canvas.js"(exports2) {
    var Utils = require_utils2();
    function clearCanvas(ctx, canvas, size) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!canvas.style) canvas.style = {};
      canvas.height = size;
      canvas.width = size;
      canvas.style.height = size + "px";
      canvas.style.width = size + "px";
    }
    function getCanvasElement() {
      try {
        return document.createElement("canvas");
      } catch (e) {
        throw new Error("You need to specify a canvas element");
      }
    }
    exports2.render = function render(qrData, canvas, options) {
      let opts = options;
      let canvasEl = canvas;
      if (typeof opts === "undefined" && (!canvas || !canvas.getContext)) {
        opts = canvas;
        canvas = void 0;
      }
      if (!canvas) {
        canvasEl = getCanvasElement();
      }
      opts = Utils.getOptions(opts);
      const size = Utils.getImageWidth(qrData.modules.size, opts);
      const ctx = canvasEl.getContext("2d");
      const image = ctx.createImageData(size, size);
      Utils.qrToImageData(image.data, qrData, opts);
      clearCanvas(ctx, canvasEl, size);
      ctx.putImageData(image, 0, 0);
      return canvasEl;
    };
    exports2.renderToDataURL = function renderToDataURL(qrData, canvas, options) {
      let opts = options;
      if (typeof opts === "undefined" && (!canvas || !canvas.getContext)) {
        opts = canvas;
        canvas = void 0;
      }
      if (!opts) opts = {};
      const canvasEl = exports2.render(qrData, canvas, opts);
      const type = opts.type || "image/png";
      const rendererOpts = opts.rendererOpts || {};
      return canvasEl.toDataURL(type, rendererOpts.quality);
    };
  }
});

// scripts/vendor/bundled_modules/qrcode/lib/browser.js
var require_browser = __commonJS({
  "scripts/vendor/bundled_modules/qrcode/lib/browser.js"(exports2) {
    var canPromise = require_can_promise();
    var QRCode = require_qrcode();
    var CanvasRenderer = require_canvas();
    var SvgRenderer = require_svg_tag();
    function renderCanvas(renderFunc, canvas, text, opts, cb) {
      const args = [].slice.call(arguments, 1);
      const argsNum = args.length;
      const isLastArgCb = typeof args[argsNum - 1] === "function";
      if (!isLastArgCb && !canPromise()) {
        throw new Error("Callback required as last argument");
      }
      if (isLastArgCb) {
        if (argsNum < 2) {
          throw new Error("Too few arguments provided");
        }
        if (argsNum === 2) {
          cb = text;
          text = canvas;
          canvas = opts = void 0;
        } else if (argsNum === 3) {
          if (canvas.getContext && typeof cb === "undefined") {
            cb = opts;
            opts = void 0;
          } else {
            cb = opts;
            opts = text;
            text = canvas;
            canvas = void 0;
          }
        }
      } else {
        if (argsNum < 1) {
          throw new Error("Too few arguments provided");
        }
        if (argsNum === 1) {
          text = canvas;
          canvas = opts = void 0;
        } else if (argsNum === 2 && !canvas.getContext) {
          opts = text;
          text = canvas;
          canvas = void 0;
        }
        return new Promise(function(resolve, reject) {
          try {
            const data = QRCode.create(text, opts);
            resolve(renderFunc(data, canvas, opts));
          } catch (e) {
            reject(e);
          }
        });
      }
      try {
        const data = QRCode.create(text, opts);
        cb(null, renderFunc(data, canvas, opts));
      } catch (e) {
        cb(e);
      }
    }
    exports2.create = QRCode.create;
    exports2.toCanvas = renderCanvas.bind(null, CanvasRenderer.render);
    exports2.toDataURL = renderCanvas.bind(null, CanvasRenderer.renderToDataURL);
    exports2.toString = renderCanvas.bind(null, function(data, _, opts) {
      return SvgRenderer.render(data, opts);
    });
  }
});

// scripts/vendor/bundled_modules/qrcode/lib/server.js
var require_server = __commonJS({
  "scripts/vendor/bundled_modules/qrcode/lib/server.js"(exports2) {
    var canPromise = require_can_promise();
    var QRCode = require_qrcode();
    var PngRenderer = require_png2();
    var Utf8Renderer = require_utf8();
    var TerminalRenderer = require_terminal2();
    var SvgRenderer = require_svg();
    function checkParams(text, opts, cb) {
      if (typeof text === "undefined") {
        throw new Error("String required as first argument");
      }
      if (typeof cb === "undefined") {
        cb = opts;
        opts = {};
      }
      if (typeof cb !== "function") {
        if (!canPromise()) {
          throw new Error("Callback required as last argument");
        } else {
          opts = cb || {};
          cb = null;
        }
      }
      return {
        opts,
        cb
      };
    }
    function getTypeFromFilename(path) {
      return path.slice((path.lastIndexOf(".") - 1 >>> 0) + 2).toLowerCase();
    }
    function getRendererFromType(type) {
      switch (type) {
        case "svg":
          return SvgRenderer;
        case "txt":
        case "utf8":
          return Utf8Renderer;
        case "png":
        case "image/png":
        default:
          return PngRenderer;
      }
    }
    function getStringRendererFromType(type) {
      switch (type) {
        case "svg":
          return SvgRenderer;
        case "terminal":
          return TerminalRenderer;
        case "utf8":
        default:
          return Utf8Renderer;
      }
    }
    function render(renderFunc, text, params) {
      if (!params.cb) {
        return new Promise(function(resolve, reject) {
          try {
            const data = QRCode.create(text, params.opts);
            return renderFunc(data, params.opts, function(err, data2) {
              return err ? reject(err) : resolve(data2);
            });
          } catch (e) {
            reject(e);
          }
        });
      }
      try {
        const data = QRCode.create(text, params.opts);
        return renderFunc(data, params.opts, params.cb);
      } catch (e) {
        params.cb(e);
      }
    }
    exports2.create = QRCode.create;
    exports2.toCanvas = require_browser().toCanvas;
    exports2.toString = function toString(text, opts, cb) {
      const params = checkParams(text, opts, cb);
      const type = params.opts ? params.opts.type : void 0;
      const renderer = getStringRendererFromType(type);
      return render(renderer.render, text, params);
    };
    exports2.toDataURL = function toDataURL(text, opts, cb) {
      const params = checkParams(text, opts, cb);
      const renderer = getRendererFromType(params.opts.type);
      return render(renderer.renderToDataURL, text, params);
    };
    exports2.toBuffer = function toBuffer(text, opts, cb) {
      const params = checkParams(text, opts, cb);
      const renderer = getRendererFromType(params.opts.type);
      return render(renderer.renderToBuffer, text, params);
    };
    exports2.toFile = function toFile(path, text, opts, cb) {
      if (typeof path !== "string" || !(typeof text === "string" || typeof text === "object")) {
        throw new Error("Invalid argument");
      }
      if (arguments.length < 3 && !canPromise()) {
        throw new Error("Too few arguments provided");
      }
      const params = checkParams(text, opts, cb);
      const type = params.opts.type || getTypeFromFilename(path);
      const renderer = getRendererFromType(type);
      const renderToFile = renderer.renderToFile.bind(null, path);
      return render(renderToFile, text, params);
    };
    exports2.toFileStream = function toFileStream(stream, text, opts) {
      if (arguments.length < 2) {
        throw new Error("Too few arguments provided");
      }
      const params = checkParams(text, opts, stream.emit.bind(stream, "error"));
      const renderer = getRendererFromType("png");
      const renderToFileStream = renderer.renderToFileStream.bind(null, stream);
      render(renderToFileStream, text, params);
    };
  }
});

// scripts/vendor/bundled_modules/qrcode/lib/index.js
var require_lib = __commonJS({
  "scripts/vendor/bundled_modules/qrcode/lib/index.js"(exports2, module2) {
    module2.exports = require_server();
  }
});

// scripts/auth-qr.js
var require_auth_qr = __commonJS({
  "scripts/auth-qr.js"(exports2, module2) {
    "use strict";
    var crypto = require("node:crypto");
    var fs = require("node:fs/promises");
    var path = require("node:path");
    var Module = require("node:module");
    var { isAuthRunId } = require_auth_run();
    var QR_BUNDLED = path.resolve(__dirname, "vendor/bundled_modules");
    process.env.NODE_PATH = [QR_BUNDLED, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
    Module._initPaths();
    var qrcode = require_lib();
    var QR_FILE_PATTERN = /^jinguyuan-auth-qr-([0-9a-f]{12})\.png$/;
    var STALE_QR_MAX_AGE_MS = 30 * 60 * 1e3;
    var LEGACY_QR_FILE_NAMES = ["jinguyuan-auth-qr.png", ".jinguyuan-auth-qr.png"];
    function isMissing(error) {
      return error.code === "ENOENT";
    }
    function defaultQrRootDir(workspaceDir = process.cwd()) {
      return path.resolve(workspaceDir);
    }
    function toWorkspaceRelativePath(imagePath, workspaceDir = process.cwd()) {
      if (typeof imagePath !== "string" || !imagePath) {
        return imagePath;
      }
      const resolved = path.resolve(imagePath);
      const root = path.resolve(workspaceDir);
      const rel = resolved === root || resolved.startsWith(root + path.sep) ? path.relative(root, resolved) : resolved;
      return rel.split(path.sep).join("/");
    }
    function qrFileName(authRunId) {
      if (!isAuthRunId(authRunId)) {
        throw new TypeError("authRunId must be 12 lowercase hex characters");
      }
      return `jinguyuan-auth-qr-${authRunId}.png`;
    }
    async function cleanupStaleAuthQrs(root, { nowMs = Date.now() } = {}) {
      let entries;
      try {
        entries = await fs.readdir(root, { withFileTypes: true });
      } catch {
        return;
      }
      await Promise.all(entries.map(async (entry) => {
        if (!entry.isFile() || !QR_FILE_PATTERN.test(entry.name)) return;
        const file = path.join(root, entry.name);
        try {
          const stat = await fs.lstat(file);
          if (stat.isFile() && nowMs - stat.mtimeMs > STALE_QR_MAX_AGE_MS) {
            await fs.unlink(file);
          }
        } catch {
        }
      }));
      await Promise.all(LEGACY_QR_FILE_NAMES.map(async (name) => {
        const file = path.join(root, name);
        try {
          const stat = await fs.lstat(file);
          if (stat.isFile()) await fs.unlink(file);
        } catch {
        }
      }));
    }
    async function createAuthQr(authLink, { tmpDir, authRunId, clientId: _clientId }) {
      const root = path.resolve(tmpDir);
      const imagePath = path.join(root, qrFileName(authRunId));
      const stagingPath = path.join(
        root,
        `jinguyuan-auth-qr-${authRunId}.${crypto.randomUUID()}.tmp`
      );
      try {
        await cleanupStaleAuthQrs(root);
        const png = await qrcode.toBuffer(authLink, {
          width: 300,
          margin: 2,
          errorCorrectionLevel: "M"
        });
        await fs.writeFile(stagingPath, png, { mode: 384 });
        await fs.rename(stagingPath, imagePath);
      } catch (error) {
        try {
          await fs.unlink(stagingPath);
        } catch {
        }
        throw error;
      }
      return { imagePath };
    }
    function validateAuthQrPath({ imagePath, tmpDir }) {
      if (typeof imagePath !== "string" || typeof tmpDir !== "string") {
        throw new TypeError("imagePath and tmpDir must be strings");
      }
      const resolvedTmpDir = path.resolve(tmpDir);
      const resolvedImagePath = path.resolve(imagePath);
      if (path.dirname(resolvedImagePath) !== resolvedTmpDir || !QR_FILE_PATTERN.test(path.basename(resolvedImagePath))) {
        throw new Error("imagePath is not an owned authorization QR path");
      }
      return { imagePath: resolvedImagePath };
    }
    async function cleanupAuthQr(options) {
      const owned = validateAuthQrPath(options);
      try {
        const st = await fs.lstat(owned.imagePath);
        if (st.isSymbolicLink() || st.isFile()) {
          await fs.unlink(owned.imagePath);
        } else {
          throw new Error("owned QR path is not a regular file");
        }
      } catch (error) {
        if (!isMissing(error)) {
          throw error;
        }
      }
    }
    module2.exports = {
      createAuthQr,
      cleanupAuthQr,
      validateAuthQrPath,
      defaultQrRootDir,
      toWorkspaceRelativePath,
      qrFileName,
      cleanupStaleAuthQrs,
      QR_FILE_PATTERN,
      STALE_QR_MAX_AGE_MS
    };
  }
});

// scripts/lib/result.js
var require_result = __commonJS({
  "scripts/lib/result.js"(exports2, module2) {
    function success(code, message, data = {}) {
      return { ok: true, code, message, data };
    }
    function failure(code, message, data = {}) {
      return { ok: false, code, message, data };
    }
    function redact(value) {
      return String(value ?? "").replace(/([?&](?:token|key|sendkey)=)[^\s&]+/gi, "$1[redacted]").replace(/((?:token|key|sendkey)[:=]\s*)[A-Za-z0-9_-]{16,}/gi, "$1[redacted]");
    }
    module2.exports = { success, failure, redact };
  }
});

// scripts/lib/queue-api.js
var require_queue_api = __commonJS({
  "scripts/lib/queue-api.js"(exports2, module2) {
    var { failure, success, redact } = require_result();
    var BASE_URL = "https://m.dianping.com/queue/mdp/ajax/";
    var REQUEST_TIMEOUT_MS = 3e4;
    var TRACE_HEADERS = ["M-TraceId", "X-Trace-Id", "traceid"];
    var QueueRequestError = class extends Error {
      constructor(result) {
        super(result.code);
        this.result = result;
      }
    };
    function parseCapacity(description) {
      const range = /^(\d+)-(\d+)/.exec(description || "");
      if (range) return { min: Number(range[1]), max: Number(range[2]), description };
      const exact = /^(\d+)/.exec(description || "");
      if (exact) {
        const count = Number(exact[1]);
        return { min: count, max: count, description };
      }
      return { min: null, max: null, description: description || "" };
    }
    function createQueueApi({
      token,
      fetchImpl = globalThis.fetch,
      sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      requestTimeoutMs = REQUEST_TIMEOUT_MS,
      setTimeoutImpl = setTimeout,
      clearTimeoutImpl = clearTimeout
    }) {
      const headers = {
        "User-Agent": "MeituanQueue-Skill/2.0",
        Accept: "application/json",
        enterchannel: "2",
        token
      };
      function safeValue(value) {
        const withoutToken = token ? String(value ?? "").split(token).join("[redacted]") : String(value ?? "");
        return redact(withoutToken);
      }
      function isSensitiveKey(key) {
        return /token|authorization|cookie|password|secret|credential|api[-_]?key|session[-_]?id/i.test(key);
      }
      function deepSanitize(value, key = "") {
        if (key && isSensitiveKey(key)) return "[redacted]";
        if (typeof value === "string") return safeValue(value);
        if (Array.isArray(value)) return value.map((item) => deepSanitize(item));
        if (value && typeof value === "object") {
          return Object.fromEntries(
            Object.entries(value).map(([entryKey, entryValue]) => [entryKey, deepSanitize(entryValue, entryKey)])
          );
        }
        return value;
      }
      function failureData(response, data = {}) {
        return response && response._traceId ? { ...data, traceId: response._traceId } : data;
      }
      function traceIdFrom(response) {
        for (const name of TRACE_HEADERS) {
          const value = response.headers && response.headers.get(name);
          if (value) return safeValue(value);
        }
        return null;
      }
      function throwResult(code, message, traceId) {
        throw new QueueRequestError(failure(code, message, traceId ? { traceId } : {}));
      }
      async function request(endpoint, { method = "GET", params, form } = {}) {
        const url = new URL(endpoint, BASE_URL);
        if (params) url.search = new URLSearchParams(params).toString();
        const requestHeaders = form ? { ...headers, "Content-Type": "application/x-www-form-urlencoded" } : headers;
        const controller = new AbortController();
        const timeout = setTimeoutImpl(() => controller.abort(), requestTimeoutMs);
        try {
          const response = await fetchImpl(url, {
            method,
            headers: requestHeaders,
            signal: controller.signal,
            ...form ? { body: new URLSearchParams(form) } : {}
          });
          const traceId = traceIdFrom(response);
          if (response.status === 401 || response.status === 403) {
            throwResult("AUTH_REQUIRED", "\u767B\u5F55\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u6388\u6743\u3002", traceId);
          }
          if (!response.ok) {
            throwResult("HTTP_ERROR", `\u6392\u961F\u670D\u52A1\u8BF7\u6C42\u5931\u8D25\uFF08HTTP ${response.status}\uFF09\u3002`, traceId);
          }
          let body;
          try {
            body = await response.json();
          } catch {
            throwResult("INVALID_RESPONSE", "\u670D\u52A1\u7AEF\u8FD4\u56DE\u4E86\u65E0\u6CD5\u89E3\u6790\u7684\u54CD\u5E94\u3002", traceId);
          }
          if (body && [302, 401, 403].includes(body.code)) {
            throwResult("AUTH_REQUIRED", "\u767B\u5F55\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u6388\u6743\u3002", traceId);
          }
          if (body && typeof body === "object" && traceId) body._traceId = traceId;
          return body;
        } catch (error) {
          if (error instanceof QueueRequestError) throw error;
          if (error && error.name === "AbortError") {
            throw new QueueRequestError(failure("REQUEST_TIMEOUT", "\u8BF7\u6C42\u8D85\u65F6\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5\u3002"));
          }
          throw new QueueRequestError(failure("NETWORK_ERROR", "\u7F51\u7EDC\u5F02\u5E38\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002"));
        } finally {
          clearTimeoutImpl(timeout);
        }
      }
      async function index(shopId) {
        const response = await request("queueIndexV2", { params: { dpShopId: shopId } });
        if (response.code !== 200) {
          return failure(
            "QUEUE_INDEX_FAILED",
            safeValue(response.errMsg || `\u8BF7\u6C42\u5931\u8D25\uFF08code=${response.code}\uFF09`),
            failureData(response)
          );
        }
        const data = response.data || {};
        const shop = data.queueIndexShopVO || {};
        const tables = (shop.queueTableInfos || []).map((table) => ({
          tableTypeId: table.tableTypeId,
          tableTypeName: table.tableTypeName || "\u672A\u77E5",
          capacity: parseCapacity(table.tableCapacityDesc),
          waitCount: table.waitCount || 0
        }));
        return success("QUEUE_INDEX", "\u6392\u961F\u72B6\u6001\u67E5\u8BE2\u6210\u529F\u3002", {
          shopId,
          shopName: shop.shopName || `\u95E8\u5E97${shopId}`,
          supportQueue: Boolean(shop.supportQueue),
          supportFirstQueue: Boolean(shop.supportFirstQueue),
          tables,
          orders: data.userQueueOrders || [],
          ...response._traceId ? { traceId: response._traceId } : {}
        });
      }
      async function takeNumber(shopId, peopleCount, tableTypeId) {
        const indexResponse = await request("queueIndexV2", { params: { dpShopId: shopId } });
        if (indexResponse.code !== 200) {
          return failure(
            "QUEUE_INDEX_FAILED",
            safeValue(indexResponse.errMsg || `\u8BF7\u6C42\u5931\u8D25\uFF08code=${indexResponse.code}\uFF09`),
            failureData(indexResponse)
          );
        }
        const data = indexResponse.data || {};
        const orders = data.userQueueOrders || [];
        if (orders.length > 0) {
          return failure("QUEUE_ORDER_EXISTS", "\u4F60\u5DF2\u6709\u6392\u961F\u8BA2\u5355\uFF0C\u65E0\u9700\u91CD\u590D\u53D6\u53F7\u3002", { order: orders[0] });
        }
        const shop = data.queueIndexShopVO || {};
        if (!shop.supportQueue) {
          return failure("QUEUE_UNSUPPORTED", "\u8BE5\u95E8\u5E97\u6682\u4E0D\u652F\u6301\u5728\u7EBF\u6392\u961F\u3002", { shopId });
        }
        const tableInfos = shop.queueTableInfos || [];
        const selected = tableInfos.find((table) => table.tableTypeId === tableTypeId);
        if (!selected) {
          const tables = tableInfos.map((table) => ({
            tableTypeId: table.tableTypeId,
            tableTypeName: table.tableTypeName || "\u672A\u77E5"
          }));
          return failure("TABLE_NOT_FOUND", `\u684C\u578B ${tableTypeId} \u4E0D\u5B58\u5728\u3002`, { tables });
        }
        if (!shop.supportFirstQueue && (selected.waitCount || 0) === 0) {
          return failure("QUEUE_NOT_NEEDED", `${selected.tableTypeName || "\u8BE5\u684C\u578B"}\u5F53\u524D\u65E0\u9700\u6392\u961F\u3002`, {
            tableTypeId,
            waitCount: selected.waitCount || 0
          });
        }
        const capacity = parseCapacity(selected.tableCapacityDesc);
        if (capacity.min !== null && (peopleCount < capacity.min || peopleCount > capacity.max)) {
          return failure(
            "TABLE_CAPACITY_MISMATCH",
            `\u5C31\u9910\u4EBA\u6570 ${peopleCount} \u4E0E\u684C\u578B ${selected.tableTypeName}(${capacity.description})\u4E0D\u5339\u914D\u3002`,
            { peopleCount, tableTypeId, capacity }
          );
        }
        const form = {
          dpShopId: shopId,
          peopleCount,
          tableTypeId,
          tableTypeName: selected.tableTypeName || ""
        };
        if (data.phone) form.phone = data.phone;
        const createResponse = await request("queue", { method: "POST", form });
        const orderId = createResponse.data && createResponse.data.queueOrderViewId;
        if (createResponse.code !== 200 || !orderId) {
          return failure(
            "QUEUE_CREATE_FAILED",
            safeValue(createResponse.errMsg || "\u53D6\u53F7\u5931\u8D25\u3002"),
            failureData(createResponse)
          );
        }
        let detail = null;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          if (attempt > 0) await sleep(1e3);
          try {
            const detailResponse = await request("queueOrderDetail", {
              params: { queueOrderViewId: orderId }
            });
            if (detailResponse.code === 200 && detailResponse.data) {
              detail = detailResponse.data;
              if (detail.queueOrderStatus !== 1) break;
            }
          } catch {
            break;
          }
        }
        return success("QUEUE_NUMBER_TAKEN", "\u53D6\u53F7\u6210\u529F\u3002", {
          orderId,
          tableTypeId,
          tableTypeName: selected.tableTypeName || "",
          peopleCount,
          order: detail,
          ...createResponse._traceId ? { traceId: createResponse._traceId } : {}
        });
      }
      async function latestOrder(shopId) {
        const response = await request("queueIndexV2", { params: { dpShopId: shopId } });
        if (response.code !== 200) {
          return {
            error: failure(
              "QUEUE_INDEX_FAILED",
              safeValue(response.errMsg || `\u8BF7\u6C42\u5931\u8D25\uFF08code=${response.code}\uFF09`),
              failureData(response)
            )
          };
        }
        const order = (response.data && response.data.userQueueOrders || [])[0];
        if (!order || !order.queueOrderViewId) {
          return { error: failure("QUEUE_ORDER_NOT_FOUND", "\u5F53\u524D\u65E0\u6392\u961F\u8BA2\u5355\u3002", failureData(response)) };
        }
        return { order };
      }
      async function orderDetail(shopId) {
        const latest = await latestOrder(shopId);
        if (latest.error) return latest.error;
        const response = await request("queueOrderDetail", {
          params: { queueOrderViewId: latest.order.queueOrderViewId }
        });
        if (response.code !== 200 || !response.data) {
          return failure(
            "QUEUE_ORDER_DETAIL_FAILED",
            safeValue(response.errMsg || "\u67E5\u8BE2\u8BA2\u5355\u8BE6\u60C5\u5931\u8D25\u3002"),
            failureData(response)
          );
        }
        return success("QUEUE_ORDER_DETAIL", "\u6392\u961F\u8BA2\u5355\u8BE6\u60C5\u67E5\u8BE2\u6210\u529F\u3002", {
          order: response.data,
          ...response._traceId ? { traceId: response._traceId } : {}
        });
      }
      async function orderCancel(shopId) {
        const latest = await latestOrder(shopId);
        if (latest.error) return latest.error;
        const orderId = latest.order.queueOrderViewId;
        const response = await request("cancelQueue", {
          method: "POST",
          form: { queueOrderViewId: orderId }
        });
        if (response.code !== 200) {
          return failure(
            "QUEUE_CANCEL_FAILED",
            safeValue(response.errMsg || "\u53D6\u6D88\u6392\u961F\u5931\u8D25\u3002"),
            failureData(response, { orderId })
          );
        }
        return success("QUEUE_CANCELLED", "\u6392\u961F\u5DF2\u53D6\u6D88\u3002", {
          orderId,
          order: response.data || null,
          ...response._traceId ? { traceId: response._traceId } : {}
        });
      }
      function stable(operation) {
        return async (...args) => {
          try {
            return deepSanitize(await operation(...args));
          } catch (error) {
            if (error instanceof QueueRequestError) return deepSanitize(error.result);
            return deepSanitize(failure("QUEUE_API_ERROR", "\u6392\u961F\u64CD\u4F5C\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002"));
          }
        };
      }
      return {
        index: stable(index),
        takeNumber: stable(takeNumber),
        orderDetail: stable(orderDetail),
        orderCancel: stable(orderCancel)
      };
    }
    module2.exports = { createQueueApi };
  }
});

// scripts/lib/auth-poll-bg.js
var require_auth_poll_bg = __commonJS({
  "scripts/lib/auth-poll-bg.js"(exports2, module2) {
    "use strict";
    var crypto = require("node:crypto");
    var fs = require("node:fs");
    var path = require("node:path");
    var { spawn } = require("node:child_process");
    var { PASSPORT_BUNDLED } = require_passport();
    var { isAuthRunId } = require_auth_run();
    var CURRENT_BASENAME = "auth-poll-current.json";
    var LEGACY_STATE_BASENAME = "auth-poll-state.json";
    var RUN_STATE_PATTERN = /^auth-poll-state-([0-9a-f]{12})\.json$/;
    var STALE_RUN_MAX_AGE_MS = 24 * 60 * 60 * 1e3;
    function jinguyuanDir(homeDir) {
      return path.join(homeDir, ".jinguyuan");
    }
    function statePath(homeDir) {
      return path.join(jinguyuanDir(homeDir), LEGACY_STATE_BASENAME);
    }
    function currentPath(homeDir) {
      return path.join(jinguyuanDir(homeDir), CURRENT_BASENAME);
    }
    function runStatePath(homeDir, authRunId) {
      if (!isAuthRunId(authRunId)) {
        throw new TypeError("authRunId must be 12 lowercase hex characters");
      }
      return path.join(jinguyuanDir(homeDir), `auth-poll-state-${authRunId}.json`);
    }
    function ensureJinguyuanDir(homeDir) {
      const dir = jinguyuanDir(homeDir);
      fs.mkdirSync(dir, { recursive: true, mode: 448 });
      if (process.platform !== "win32") {
        try {
          fs.chmodSync(dir, 448);
        } catch {
        }
      }
      return dir;
    }
    function readJson(file) {
      try {
        const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
        return parsed && typeof parsed === "object" ? parsed : null;
      } catch {
        return null;
      }
    }
    function writeJsonAtomic(file, value) {
      const tmp = `${file}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
      const payload = { ...value, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
      fs.writeFileSync(tmp, `${JSON.stringify(payload)}
`, { encoding: "utf8", mode: 384 });
      fs.renameSync(tmp, file);
      return payload;
    }
    function writeRunState(homeDir, authRunId, state) {
      ensureJinguyuanDir(homeDir);
      return writeJsonAtomic(runStatePath(homeDir, authRunId), { ...state, authRunId });
    }
    function writeCurrentRun(homeDir, authRunId) {
      if (!isAuthRunId(authRunId)) {
        throw new TypeError("authRunId must be 12 lowercase hex characters");
      }
      ensureJinguyuanDir(homeDir);
      return writeJsonAtomic(currentPath(homeDir), { authRunId });
    }
    function readRunState(homeDir, authRunId) {
      if (!isAuthRunId(authRunId)) return null;
      const state = readJson(runStatePath(homeDir, authRunId));
      return state?.authRunId === authRunId ? state : null;
    }
    function readState(homeDir) {
      const pointerFile = currentPath(homeDir);
      if (fs.existsSync(pointerFile)) {
        const pointer = readJson(pointerFile);
        if (!isAuthRunId(pointer?.authRunId)) return null;
        return readRunState(homeDir, pointer.authRunId);
      }
      return readJson(statePath(homeDir));
    }
    function clearState(homeDir) {
      const pointer = readJson(currentPath(homeDir));
      const files = [currentPath(homeDir), statePath(homeDir)];
      if (isAuthRunId(pointer?.authRunId)) files.push(runStatePath(homeDir, pointer.authRunId));
      for (const file of files) {
        try {
          fs.unlinkSync(file);
        } catch (error) {
          if (error?.code !== "ENOENT") throw error;
        }
      }
    }
    function cleanupStaleRunStates(homeDir, { nowMs = Date.now() } = {}) {
      const dir = ensureJinguyuanDir(homeDir);
      const current = readJson(currentPath(homeDir));
      const currentRunId = isAuthRunId(current?.authRunId) ? current.authRunId : null;
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const match = RUN_STATE_PATTERN.exec(entry.name);
        if (!entry.isFile() || !match || match[1] === currentRunId) continue;
        const file = path.join(dir, entry.name);
        try {
          const stat = fs.lstatSync(file);
          if (stat.isFile() && nowMs - stat.mtimeMs > STALE_RUN_MAX_AGE_MS) {
            fs.unlinkSync(file);
          }
        } catch {
        }
      }
    }
    function startBackgroundPoll({
      homeDir,
      authRunId,
      qrImagePath = null,
      execPath = process.execPath,
      scriptPath,
      env = process.env,
      spawnImpl = spawn
    } = {}) {
      if (typeof scriptPath !== "string" || !scriptPath) {
        throw new TypeError("scriptPath is required");
      }
      if (!isAuthRunId(authRunId)) {
        throw new TypeError("authRunId must be 12 lowercase hex characters");
      }
      cleanupStaleRunStates(homeDir);
      writeRunState(homeDir, authRunId, {
        status: "pending",
        code: "AUTH_PENDING",
        message: "\u540E\u53F0\u7B49\u5F85\u7F8E\u56E2\u6388\u6743\u786E\u8BA4\u4E2D\u3002\u8BF7\u5148\u5411\u7528\u6237\u5C55\u793A\u6388\u6743\u94FE\u63A5\u4E0E\u4E8C\u7EF4\u7801\u56FE\uFF0C\u518D\u7528 auth-status \u67E5\u8BE2\u3002",
        qrImagePath: typeof qrImagePath === "string" ? qrImagePath : null,
        startedAt: (/* @__PURE__ */ new Date()).toISOString(),
        pid: null
      });
      writeCurrentRun(homeDir, authRunId);
      const args = [scriptPath, "auth-poll-worker", "--auth-run-id", authRunId];
      if (typeof qrImagePath === "string" && qrImagePath) {
        args.push("--qr-image-path", qrImagePath);
      }
      const existingNodePath = typeof env.NODE_PATH === "string" ? env.NODE_PATH : "";
      const nodePathParts = existingNodePath ? existingNodePath.split(path.delimiter) : [];
      if (!nodePathParts.includes(PASSPORT_BUNDLED)) nodePathParts.unshift(PASSPORT_BUNDLED);
      const workerEnv = { ...env, NODE_PATH: nodePathParts.join(path.delimiter) };
      const child = spawnImpl(execPath, args, {
        detached: true,
        stdio: "ignore",
        env: workerEnv,
        windowsHide: true
      });
      if (typeof child.unref === "function") child.unref();
      return {
        pid: child.pid ?? null,
        statePath: runStatePath(homeDir, authRunId),
        authRunId
      };
    }
    function recordPollResult(homeDir, result, { authRunId, qrImagePath = null } = {}) {
      if (!isAuthRunId(authRunId)) {
        throw new TypeError("authRunId must be 12 lowercase hex characters");
      }
      const code = result?.code || "PASSPORT_FAILED";
      const ok = Boolean(result?.ok);
      let status = "failed";
      if (code === "AUTH_SUCCESS") status = "success";
      else if (code === "AUTH_PENDING" || code === "PASSPORT_PENDING") status = "pending";
      else if (code === "AUTH_CANCELLED" || code === "PASSPORT_CANCELLED") status = "cancelled";
      else if (code === "AUTH_TIMEOUT" || code === "PASSPORT_TIMEOUT") status = "timeout";
      else if (code === "AUTH_RISK_DENIED" || code === "PASSPORT_RISK_DENIED") status = "risk";
      else if (code === "QR_CLEANUP_FAILED") status = ok ? "success" : "failed";
      const prior = readRunState(homeDir, authRunId);
      return writeRunState(homeDir, authRunId, {
        status,
        code,
        message: result?.message || "",
        ok,
        qrImagePath: typeof result?.data?.qrImagePath === "string" && result.data.qrImagePath || qrImagePath || prior?.qrImagePath || null,
        startedAt: prior?.startedAt,
        finishedAt: status === "pending" ? void 0 : (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    module2.exports = {
      CURRENT_BASENAME,
      LEGACY_STATE_BASENAME,
      RUN_STATE_PATTERN,
      STALE_RUN_MAX_AGE_MS,
      statePath,
      currentPath,
      runStatePath,
      readState,
      readRunState,
      clearState,
      cleanupStaleRunStates,
      startBackgroundPoll,
      recordPollResult
    };
  }
});

// scripts/queue.js
var require_queue = __commonJS({
  "scripts/queue.js"(exports2, module2) {
    "use strict";
    var os = require("node:os");
    var path = require("node:path");
    var { createPassport } = require_passport();
    var {
      createAuthQr,
      cleanupAuthQr,
      validateAuthQrPath,
      defaultQrRootDir,
      toWorkspaceRelativePath
    } = require_auth_qr();
    var { createQueueApi } = require_queue_api();
    var { success, failure } = require_result();
    var { createAuthRunId, isAuthRunId } = require_auth_run();
    var {
      startBackgroundPoll,
      readState,
      recordPollResult
    } = require_auth_poll_bg();
    var CLIENT_ID = "170f5f2dbbde4048bd4a5e4ed28209cc";
    var BUSINESS_COMMANDS = /* @__PURE__ */ new Set(["index", "take-number", "order-detail", "order-cancel"]);
    var HELP_COMMANDS = [
      "index <shopId>",
      "take-number <shopId> --people-count N --table-type-id ID --confirm",
      "order-detail <shopId>",
      "order-cancel <shopId> --confirm",
      "auth-start",
      "auth-poll [--background|--wait] [--qr-image-path <path>]",
      "auth-status",
      "logout"
    ];
    function invalidArguments() {
      return failure("INVALID_ARGUMENTS", "\u53C2\u6570\u9519\u8BEF\uFF0C\u8BF7\u4F7F\u7528 --help \u67E5\u770B\u547D\u4EE4\u3002");
    }
    function helpResult() {
      return success("HELP", "\u91D1\u8C37\u56ED\u6392\u961F CLI\uFF08\u9700\u8981 Node.js 18 \u6216\u66F4\u9AD8\u7248\u672C\uFF09\u3002", {
        nodeRequirement: ">=18",
        commands: HELP_COMMANDS
      });
    }
    function positiveInteger(value) {
      if (!/^\d+$/.test(String(value ?? ""))) return null;
      const number = Number(value);
      return Number.isSafeInteger(number) && number > 0 ? number : null;
    }
    function validShopId(value) {
      return /^\d+$/.test(String(value ?? "")) && Number(value) > 0;
    }
    function parseArguments(argv) {
      if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) {
        return { command: "help" };
      }
      const command = argv[0];
      if (!command) return null;
      if (command === "logout") {
        return argv.length === 1 ? { command } : null;
      }
      if (command === "auth-status") {
        return argv.length === 1 ? { command } : null;
      }
      if (command === "auth-start") {
        return argv.length === 1 ? { command } : null;
      }
      if (command === "auth-poll-worker") {
        const rest2 = argv.slice(1);
        let authRunId;
        let qrImagePath;
        for (let index = 0; index < rest2.length; index += 2) {
          const name = rest2[index];
          const value = rest2[index + 1];
          if (!value || value.startsWith("--")) return null;
          if (name === "--auth-run-id" && authRunId === void 0) authRunId = value;
          else if (name === "--qr-image-path" && qrImagePath === void 0) qrImagePath = value;
          else return null;
        }
        if (!isAuthRunId(authRunId)) return null;
        return { command, mode: "worker", authRunId, qrImagePath };
      }
      if (command === "auth-poll") {
        const rest2 = argv.slice(1);
        let mode = "wait";
        let qrImagePath;
        for (let i = 0; i < rest2.length; i += 1) {
          const arg = rest2[i];
          if (arg === "--background") {
            mode = "background";
            continue;
          }
          if (arg === "--wait") {
            mode = "wait";
            continue;
          }
          if (arg === "--qr-image-path") {
            const value = rest2[i + 1];
            if (!value || value.startsWith("--")) return null;
            qrImagePath = value;
            i += 1;
            continue;
          }
          return null;
        }
        return { command, mode, qrImagePath };
      }
      if (!BUSINESS_COMMANDS.has(command) || !validShopId(argv[1])) return null;
      if (command === "index" || command === "order-detail") {
        return argv.length === 2 ? { command, shopId: argv[1] } : null;
      }
      if (command === "order-cancel") {
        if (argv.length === 2) {
          return { command, shopId: argv[1], confirmed: false };
        }
        if (argv.length === 3 && argv[2] === "--confirm") {
          return { command, shopId: argv[1], confirmed: true };
        }
        return null;
      }
      if (command !== "take-number") return null;
      const rest = argv.slice(2);
      let confirmed = false;
      if (rest.length > 0 && rest[rest.length - 1] === "--confirm") {
        confirmed = true;
        rest.pop();
      }
      if (rest.length !== 4) return null;
      const options = /* @__PURE__ */ new Map();
      for (let index = 0; index < rest.length; index += 2) {
        const name = rest[index];
        const value = rest[index + 1];
        if (!["--people-count", "--table-type-id"].includes(name) || options.has(name)) return null;
        options.set(name, value);
      }
      const peopleCount = positiveInteger(options.get("--people-count"));
      const tableTypeId = positiveInteger(options.get("--table-type-id"));
      if (peopleCount === null || tableTypeId === null) return null;
      return { command, shopId: argv[1], peopleCount, tableTypeId, confirmed };
    }
    function tokenFrom(result) {
      return typeof result?.token === "string" && result.token ? result.token : null;
    }
    function sanitized(value, token) {
      if (typeof value === "string") {
        return token ? value.split(token).join("[redacted]") : value;
      }
      if (Array.isArray(value)) return value.map((item) => sanitized(item, token));
      if (value && typeof value === "object") {
        const copy = {};
        for (const [key, entryValue] of Object.entries(value)) {
          if (/token|authorization|cookie|password|secret|credential|api[-_]?key|session[-_]?id/i.test(key)) {
            copy[key] = "[redacted]";
          } else {
            copy[key] = sanitized(entryValue, token);
          }
        }
        return copy;
      }
      return value;
    }
    function passportFailure(error) {
      switch (error?.code) {
        case "PASSPORT_PENDING":
          return failure("AUTH_PENDING", "\u6388\u6743\u5C1A\u672A\u5B8C\u6210\u3002");
        case "PASSPORT_CANCELLED":
          return failure("AUTH_CANCELLED", "\u6388\u6743\u5DF2\u53D6\u6D88\u3002");
        case "PASSPORT_RISK_DENIED":
          return failure("AUTH_RISK_DENIED", "\u6388\u6743\u88AB\u98CE\u63A7\u62D2\u7EDD\u3002");
        case "PASSPORT_TIMEOUT":
          return failure("AUTH_TIMEOUT", "\u6388\u6743\u5DF2\u8D85\u65F6\u3002");
        default:
          return failure("PASSPORT_FAILED", "\u6388\u6743\u670D\u52A1\u8C03\u7528\u5931\u8D25\u3002");
      }
    }
    function authStatusResult(status) {
      const code = String(status?.code || status?.status || "").toUpperCase();
      const aliases = {
        PENDING: "PASSPORT_PENDING",
        AUTH_PENDING: "PASSPORT_PENDING",
        CANCELLED: "PASSPORT_CANCELLED",
        AUTH_CANCELLED: "PASSPORT_CANCELLED",
        RISK_DENIED: "PASSPORT_RISK_DENIED",
        AUTH_RISK_DENIED: "PASSPORT_RISK_DENIED",
        TIMEOUT: "PASSPORT_TIMEOUT",
        AUTH_TIMEOUT: "PASSPORT_TIMEOUT"
      };
      return aliases[code] ? passportFailure({ code: aliases[code] }) : null;
    }
    function confirmationRequired(parsed) {
      if (parsed.command === "take-number") {
        return failure(
          "CONFIRM_REQUIRED",
          "\u53D6\u53F7\u524D\u987B\u53D6\u5F97\u7528\u6237\u5BF9\u672C\u6B21\u52A8\u4F5C\u7684\u660E\u786E\u786E\u8BA4\u3002\u786E\u8BA4\u540E\u8BF7\u5E26\u4E0A --confirm \u518D\u6267\u884C take-number\u3002",
          {
            shopId: parsed.shopId,
            peopleCount: parsed.peopleCount,
            tableTypeId: parsed.tableTypeId,
            requiredFlag: "--confirm"
          }
        );
      }
      if (parsed.command === "order-cancel") {
        return failure(
          "CONFIRM_REQUIRED",
          "\u53D6\u6D88\u6392\u961F\u524D\u987B\u53D6\u5F97\u7528\u6237\u5BF9\u672C\u6B21\u52A8\u4F5C\u7684\u660E\u786E\u786E\u8BA4\u3002\u786E\u8BA4\u540E\u8BF7\u6267\u884C order-cancel <shopId> --confirm\u3002",
          {
            shopId: parsed.shopId,
            requiredFlag: "--confirm"
          }
        );
      }
      return null;
    }
    async function dispatchBusiness(parsed, token, makeQueueApi) {
      if ((parsed.command === "take-number" || parsed.command === "order-cancel") && !parsed.confirmed) {
        return confirmationRequired(parsed);
      }
      const api = makeQueueApi({ token });
      let result;
      switch (parsed.command) {
        case "index":
          result = await api.index(parsed.shopId);
          break;
        case "take-number":
          result = await api.takeNumber(parsed.shopId, parsed.peopleCount, parsed.tableTypeId);
          break;
        case "order-detail":
          result = await api.orderDetail(parsed.shopId);
          break;
        case "order-cancel":
          result = await api.orderCancel(parsed.shopId);
          break;
        default:
          return invalidArguments();
      }
      return sanitized(result, token);
    }
    function buildAuthUserReplyMarkdown({ authLink, qrImagePath }) {
      const lines = [];
      if (typeof qrImagePath === "string" && qrImagePath) {
        lines.push(`![\u7F8E\u56E2\u6388\u6743\u4E8C\u7EF4\u7801](<${qrImagePath}>)`);
        lines.push("");
      }
      lines.push("---");
      lines.push("\u{1F4F1} **\u626B\u7801\u6388\u6743 / \u70B9\u51FB\u94FE\u63A5**");
      lines.push("");
      lines.push(
        typeof qrImagePath === "string" && qrImagePath ? "\u8BF7\u7528\u7F8E\u56E2 App \u626B\u63CF\u4E0A\u65B9\u4E8C\u7EF4\u7801\uFF0C\u6216\u70B9\u51FB\u4E0B\u65B9\u94FE\u63A5\uFF0C\u5728\u6388\u6743\u9875\u70B9\u51FB\u300C**\u786E\u8BA4\u6388\u6743**\u300D\uFF1A" : "\u8BF7\u70B9\u51FB\u4E0B\u65B9\u94FE\u63A5\uFF0C\u5728\u6388\u6743\u9875\u70B9\u51FB\u300C**\u786E\u8BA4\u6388\u6743**\u300D\uFF08\u82E5\u672A\u89C1\u4E8C\u7EF4\u7801\u56FE\uFF0C\u7528\u94FE\u63A5\u5373\u53EF\uFF09\uFF1A"
      );
      lines.push("");
      lines.push(`\u{1F449} [\u6253\u5F00\u7F8E\u56E2\u6388\u6743\u9875\u9762](${authLink})`);
      lines.push("");
      lines.push(authLink);
      lines.push("");
      lines.push("> \u23F1 \u7EA6 10 \u5206\u949F\u6709\u6548\u3002\u5B8C\u6210\u6388\u6743\u540E\u8BF7\u7A0D\u5019\uFF1B\u82E5\u6CA1\u6709\u81EA\u52A8\u7EE7\u7EED\uFF0C\u8BF7\u56DE\u590D\u300C\u5DF2\u6388\u6743\u300D\u3002");
      lines.push(
        "> \u4E91\u7AEF\uFF1A\u7528\u6237\u624B\u673A\u901A\u5E38\u6253\u4E0D\u5F00 Agent \u672C\u673A\u8DEF\u5F84\uFF1B**\u94FE\u63A5\u5FC5\u987B\u51FA\u73B0\u5728\u4E3B\u6C14\u6CE1**\u3002\u684C\u9762\u4FA7\u5E94\u7528 `![](\u7EDD\u5BF9\u8DEF\u5F84)` \u628A\u56FE\u5D4C\u8FDB\u6C14\u6CE1\uFF0C\u52FF\u53EA\u53D1\u9644\u4EF6\u3002"
      );
      return lines.join("\n");
    }
    var AUTH_INLINE_QR_HINT = "CRITICAL\uFF08\u5BF9\u9F50 V1 \u5185\u8054\u56FE\uFF09\uFF1A\u2460 \u82E5\u6709 data.qrImagePath\uFF1A\u5148 Read \u8BE5 PNG\uFF08\u7EDD\u5BF9\u8DEF\u5F84\uFF09\uFF0C\u518D\u628A Markdown `![\u7F8E\u56E2\u6388\u6743\u4E8C\u7EF4\u7801](<\u7EDD\u5BF9\u8DEF\u5F84>)` **\u5199\u5165\u4E3B\u6C14\u6CE1\u6B63\u6587**\u2014\u2014\u8FD9\u662F\u804A\u5929\u6846\u53EF\u89C1\u56FE\u7684\u5173\u952E\uFF1B\u2461 \u26A0\uFE0F \u4EC5 Read / \u4EC5\u9644\u4EF6\u4FA7\u680F / \u6B65\u9AA4\u5361\u300C\u5DF2\u5C55\u793A\u300D\u90FD\u4E0D\u7B97\uFF1A\u7528\u6237\u626B\u4E0D\u5230\u7801\uFF1B\u2462 \u63A8\u8350\u6574\u6BB5\u7C98\u8D34 data.userReplyMarkdown\uFF08\u5DF2\u542B\u7EDD\u5BF9\u8DEF\u5F84\u56FE + \u94FE\u63A5\uFF09\uFF1B\u2463 \u94FE\u63A5\u5FC5\u73B0\uFF08\u4E91\u7AEF\u4E3B\u901A\u9053\uFF09\uFF1B\u2464 \u544A\u77E5\u7528\u6237\u6388\u6743\u540E\u7A0D\u5019\uFF0C\u82E5\u6CA1\u6709\u81EA\u52A8\u7EE7\u7EED\u5219\u56DE\u590D\u300C\u5DF2\u6388\u6743\u300D\uFF1B\u6536\u5230\u56DE\u590D\u540E\u6267\u884C auth-status \u77ED\u67E5\uFF1B\u7981\u6B62\u4FDD\u8BC1\u4E00\u5B9A\u81EA\u52A8\u901A\u77E5\uFF0C\u7981\u6B62 auth-poll --wait\u3002";
    async function beginAuthorization(deps, { force = false } = {}) {
      let started;
      try {
        started = await deps.passport.startAuth({ force });
      } catch (error) {
        return { result: passportFailure(error) };
      }
      const token = tokenFrom(started);
      if (token) return { token };
      if (typeof started?.authLink !== "string" || !started.authLink) {
        return { result: failure("PASSPORT_FAILED", "\u6388\u6743\u670D\u52A1\u672A\u8FD4\u56DE\u6709\u6548\u7ED3\u679C\u3002") };
      }
      const authLink = started.authLink;
      const authRunId = deps.createAuthRunId();
      const data = {
        authLink,
        authRunId,
        pollMode: "background",
        // Hard deliverable: copy this string into the user-visible main bubble this turn.
        userReplyMarkdown: null,
        agentHint: AUTH_INLINE_QR_HINT
      };
      let qrImagePathAbs = null;
      try {
        const qr = await deps.createAuthQr(authLink, {
          tmpDir: deps.tmpDir,
          authRunId,
          clientId: CLIENT_ID
        });
        if (typeof qr?.imagePath === "string") {
          qrImagePathAbs = path.resolve(qr.imagePath);
          data.qrImagePath = qrImagePathAbs;
          data.qrImagePathRelative = toWorkspaceRelativePath(
            qrImagePathAbs,
            deps.workspaceDir
          );
        }
      } catch {
      }
      data.userReplyMarkdown = buildAuthUserReplyMarkdown({
        authLink,
        // Inline tag must be absolute — relative paths often render as attachments.
        qrImagePath: qrImagePathAbs || null
      });
      try {
        const startedBg = deps.startBackgroundPoll({
          homeDir: deps.homeDir,
          authRunId,
          qrImagePath: qrImagePathAbs || null,
          scriptPath: deps.scriptPath,
          execPath: deps.execPath
        });
        if (startedBg?.pid != null) data.pollPid = startedBg.pid;
      } catch {
        data.pollMode = "manual";
        data.agentHint = AUTH_INLINE_QR_HINT + "\u540E\u53F0\u672A\u542F\u52A8\uFF1A\u5C55\u793A\u540E auth-poll --background\uFF0C\u518D\u7528 auth-status\u3002";
      }
      const message = [
        "\u9700\u8981\u5B8C\u6210\u7F8E\u56E2\u6388\u6743\u3002",
        "\u3010Agent \u5FC5\u505A\xB7\u5BF9\u9F50 V1\u3011\u6709\u56FE\u65F6\uFF1ARead \u7EDD\u5BF9\u8DEF\u5F84 PNG \u540E\uFF0C\u628A `![\u7F8E\u56E2\u6388\u6743\u4E8C\u7EF4\u7801](<\u7EDD\u5BF9\u8DEF\u5F84>)` \u5199\u8FDB\u4E3B\u6C14\u6CE1\u6B63\u6587\uFF08\u4EC5 Read/\u4EC5\u9644\u4EF6\u4E0D\u7B97\uFF09\uFF1B\u5E76\u539F\u6837\u8D34 data.userReplyMarkdown\uFF08\u94FE\u63A5\u5FC5\u73B0\uFF09\u3002",
        `\u6388\u6743\u94FE\u63A5: ${authLink}`,
        data.qrImagePath ? `\u4E8C\u7EF4\u7801\u56FE\u7EDD\u5BF9\u8DEF\u5F84: ${data.qrImagePath}` + (data.qrImagePathRelative ? `\uFF08\u5DE5\u4F5C\u533A\u76F8\u5BF9: ${data.qrImagePathRelative}\uFF09` : "") + "\uFF1B\u4E3B\u6C14\u6CE1\u5FC5\u987B\u51FA\u73B0 Markdown \u56FE\u7247\u6807\u7B7E\uFF0C\u4E0D\u8981\u53EA\u5F53\u9644\u4EF6\u3002" : "\u672C\u673A\u672A\u751F\u6210\u4E8C\u7EF4\u7801\u56FE\uFF0C\u8BF7\u81F3\u5C11\u53D1\u51FA\u4E0A\u65B9\u94FE\u63A5\u3002",
        "\u540E\u53F0\u5DF2\u5728\u7B49\u5F85\uFF1B\u8BF7\u7528\u6237\u6388\u6743\u540E\u7A0D\u5019\uFF0C\u82E5\u6CA1\u6709\u81EA\u52A8\u7EE7\u7EED\u5219\u56DE\u590D\u300C\u5DF2\u6388\u6743\u300D\uFF1B\u6536\u5230\u56DE\u590D\u518D\u6267\u884C auth-status\u3002\u4E0D\u8981\u4FDD\u8BC1\u4E00\u5B9A\u81EA\u52A8\u901A\u77E5\uFF1B\u7981\u6B62 auth-poll --wait\u3002"
      ].join(" ");
      return {
        result: failure("AUTH_REQUIRED", message, data)
      };
    }
    function qrOptionsFrom(parsed, deps) {
      if (!parsed.qrImagePath) return null;
      return { imagePath: parsed.qrImagePath, tmpDir: deps.tmpDir };
    }
    async function pollAuthorizationWait(parsed, deps) {
      const qrOptions = qrOptionsFrom(parsed, deps);
      if (qrOptions) {
        try {
          deps.validateAuthQrPath(qrOptions);
        } catch {
          return invalidArguments();
        }
      }
      async function cleanupCancelledQr() {
        if (!qrOptions) return failure("AUTH_CANCELLED", "\u6388\u6743\u5DF2\u53D6\u6D88\u3002");
        try {
          await deps.cleanupAuthQr(qrOptions);
          return failure("AUTH_CANCELLED", "\u6388\u6743\u5DF2\u53D6\u6D88\u3002");
        } catch {
          return failure("QR_CLEANUP_FAILED", "\u6388\u6743\u5DF2\u53D6\u6D88\uFF0C\u4F46\u4E8C\u7EF4\u7801\u6E05\u7406\u5931\u8D25\u3002");
        }
      }
      let polled;
      try {
        polled = await deps.passport.pollAuth();
      } catch (error) {
        const result = passportFailure(error);
        return result.code === "AUTH_CANCELLED" ? cleanupCancelledQr() : result;
      }
      const token = tokenFrom(polled);
      if (!token) {
        const result = authStatusResult(polled) || failure("PASSPORT_FAILED", "\u6388\u6743\u670D\u52A1\u672A\u8FD4\u56DE\u6709\u6548\u7ED3\u679C\u3002");
        return result.code === "AUTH_CANCELLED" ? cleanupCancelledQr() : result;
      }
      if (qrOptions) {
        try {
          await deps.cleanupAuthQr(qrOptions);
        } catch {
          return failure("QR_CLEANUP_FAILED", "\u6388\u6743\u6210\u529F\uFF0C\u4F46\u4E8C\u7EF4\u7801\u6E05\u7406\u5931\u8D25\u3002");
        }
      }
      return success("AUTH_SUCCESS", "\u6388\u6743\u6210\u529F\u3002");
    }
    function startAuthPollBackground(parsed, deps) {
      if (parsed.qrImagePath) {
        try {
          deps.validateAuthQrPath({ imagePath: parsed.qrImagePath, tmpDir: deps.tmpDir });
        } catch {
          return invalidArguments();
        }
      }
      const authRunId = deps.createAuthRunId();
      try {
        const started = deps.startBackgroundPoll({
          homeDir: deps.homeDir,
          authRunId,
          qrImagePath: parsed.qrImagePath || null,
          scriptPath: deps.scriptPath,
          execPath: deps.execPath
        });
        return success("AUTH_POLL_STARTED", "\u5DF2\u5728\u540E\u53F0\u7B49\u5F85\u6388\u6743\uFF0C\u4E0D\u963B\u585E\u5F53\u524D\u5BF9\u8BDD\u3002", {
          pollMode: "background",
          authRunId,
          pollPid: started?.pid ?? null,
          qrImagePath: parsed.qrImagePath || null,
          agentHint: "\u8BF7\u5148\u786E\u4FDD\u7528\u6237\u4E3B\u6C14\u6CE1\u5DF2\u5C55\u793A\u94FE\u63A5\u4E0E\u4E8C\u7EF4\u7801\u56FE\uFF0C\u7136\u540E\u5468\u671F\u6027\u6267\u884C auth-status\uFF08\u77ED\u547D\u4EE4\uFF09\u3002"
        });
      } catch {
        return failure("PASSPORT_FAILED", "\u65E0\u6CD5\u542F\u52A8\u540E\u53F0\u6388\u6743\u8F6E\u8BE2\u3002");
      }
    }
    async function runAuthPollWorker(parsed, deps) {
      const result = await pollAuthorizationWait(parsed, deps);
      try {
        deps.recordPollResult(deps.homeDir, result, {
          authRunId: parsed.authRunId,
          qrImagePath: parsed.qrImagePath || null
        });
      } catch {
      }
      return result;
    }
    async function authStatus(deps) {
      const state = deps.readPollState(deps.homeDir);
      if (!state) {
        return failure("AUTH_STATUS_NONE", "\u5F53\u524D\u6CA1\u6709\u8FDB\u884C\u4E2D\u7684\u6388\u6743\u8F6E\u8BE2\u8BB0\u5F55\u3002\u53EF\u91CD\u65B0\u89E6\u53D1\u9700\u6388\u6743\u7684\u547D\u4EE4\u3002");
      }
      const code = state.code || "AUTH_PENDING";
      const message = state.message || (code === "AUTH_PENDING" ? "\u6388\u6743\u5C1A\u672A\u5B8C\u6210\u3002" : code === "AUTH_SUCCESS" ? "\u6388\u6743\u6210\u529F\u3002" : "\u6388\u6743\u72B6\u6001\u5DF2\u66F4\u65B0\u3002");
      const data = {
        pollMode: "background",
        authRunId: state.authRunId || null,
        status: state.status || null,
        qrImagePath: state.qrImagePath || null,
        startedAt: state.startedAt || null,
        updatedAt: state.updatedAt || null,
        finishedAt: state.finishedAt || null
      };
      if (code === "AUTH_SUCCESS" || state.status === "success") {
        return success("AUTH_SUCCESS", message, data);
      }
      if (code === "AUTH_PENDING" || state.status === "pending") {
        try {
          const cached = await deps.passport.getToken();
          if (tokenFrom(cached)) {
            const result = success("AUTH_SUCCESS", "\u6388\u6743\u6210\u529F\u3002");
            try {
              deps.recordPollResult(deps.homeDir, result, {
                authRunId: state.authRunId,
                qrImagePath: state.qrImagePath || null
              });
            } catch {
            }
            data.status = "success";
            return success("AUTH_SUCCESS", "\u6388\u6743\u6210\u529F\u3002", data);
          }
        } catch {
        }
        return failure("AUTH_PENDING", message, data);
      }
      if (code === "AUTH_CANCELLED" || state.status === "cancelled") {
        return failure("AUTH_CANCELLED", message, data);
      }
      if (code === "AUTH_TIMEOUT" || state.status === "timeout") {
        return failure("AUTH_TIMEOUT", message, data);
      }
      if (code === "AUTH_RISK_DENIED" || state.status === "risk") {
        return failure("AUTH_RISK_DENIED", message, data);
      }
      if (code === "QR_CLEANUP_FAILED") {
        return state.ok ? success("QR_CLEANUP_FAILED", message, data) : failure("QR_CLEANUP_FAILED", message, data);
      }
      return failure(code, message, data);
    }
    function defaultDependencies(overrides) {
      const homeDir = overrides.homeDir || os.homedir();
      const workspaceDir = overrides.workspaceDir || process.cwd();
      const qrRootDir = overrides.qrRootDir || overrides.tmpDir || defaultQrRootDir(workspaceDir);
      const passportTmpDir = overrides.passportTmpDir || os.tmpdir();
      const scriptPath = overrides.scriptPath || path.resolve(__dirname, "queue.js");
      return {
        passport: overrides.passport || createPassport({ homeDir, tmpDir: passportTmpDir }),
        createAuthQr: overrides.createAuthQr || createAuthQr,
        cleanupAuthQr: overrides.cleanupAuthQr || cleanupAuthQr,
        validateAuthQrPath: overrides.validateAuthQrPath || validateAuthQrPath,
        createQueueApi: overrides.createQueueApi || createQueueApi,
        startBackgroundPoll: overrides.startBackgroundPoll || startBackgroundPoll,
        readPollState: overrides.readPollState || readState,
        recordPollResult: overrides.recordPollResult || recordPollResult,
        createAuthRunId: overrides.createAuthRunId || createAuthRunId,
        // createAuthQr / cleanup still take { tmpDir } as the owned QR root.
        tmpDir: qrRootDir,
        qrRootDir,
        workspaceDir,
        homeDir,
        scriptPath,
        execPath: overrides.execPath || process.execPath,
        nodeVersion: overrides.nodeVersion || process.versions.node
      };
    }
    async function run(argv, overrides = {}) {
      const deps = defaultDependencies(overrides);
      const nodeMajor = Number.parseInt(String(deps.nodeVersion).split(".")[0], 10);
      if (!Number.isInteger(nodeMajor) || nodeMajor < 18) {
        return failure("UNSUPPORTED_NODE_VERSION", "\u9700\u8981 Node.js 18 \u6216\u66F4\u9AD8\u7248\u672C\u3002");
      }
      const parsed = parseArguments(Array.isArray(argv) ? argv : []);
      if (!parsed) return invalidArguments();
      if (parsed.command === "help") return helpResult();
      if (parsed.command === "logout") {
        try {
          await deps.passport.logout();
          return success("LOGOUT_SUCCESS", "\u5DF2\u9000\u51FA\u767B\u5F55\u3002");
        } catch (error) {
          return passportFailure(error);
        }
      }
      if (parsed.command === "auth-status") return authStatus(deps);
      if (parsed.command === "auth-start") {
        const authorization = await beginAuthorization(deps);
        if (authorization.result) return authorization.result;
        return success("AUTH_SUCCESS", "\u5DF2\u6388\u6743\uFF0C\u53EF\u76F4\u63A5\u6267\u884C\u6392\u961F\u547D\u4EE4\u3002");
      }
      if (parsed.command === "auth-poll-worker") {
        return runAuthPollWorker(parsed, deps);
      }
      if (parsed.command === "auth-poll") {
        if (parsed.mode === "background") return startAuthPollBackground(parsed, deps);
        return pollAuthorizationWait(parsed, deps);
      }
      if ((parsed.command === "take-number" || parsed.command === "order-cancel") && !parsed.confirmed) {
        return confirmationRequired(parsed);
      }
      let cached;
      try {
        cached = await deps.passport.getToken();
      } catch (error) {
        return passportFailure(error);
      }
      let token = tokenFrom(cached);
      if (!token) {
        const authorization = await beginAuthorization(deps);
        if (authorization.result) return authorization.result;
        token = authorization.token;
      }
      try {
        const result = await dispatchBusiness(parsed, token, deps.createQueueApi);
        if (result?.code !== "AUTH_REQUIRED") return result;
        const authorization = await beginAuthorization(deps, { force: true });
        if (authorization.result) return authorization.result;
        const retryResult = await dispatchBusiness(parsed, authorization.token, deps.createQueueApi);
        return sanitized(retryResult, token);
      } catch {
        return failure("CLI_FAILED", "\u6392\u961F\u547D\u4EE4\u6267\u884C\u5931\u8D25\u3002");
      }
    }
    function exitCodeFor(result) {
      if (result?.code === "AUTH_REQUIRED" || result?.code === "AUTH_PENDING" || result?.code === "AUTH_POLL_STARTED" || result?.code === "AUTH_STATUS_NONE") {
        return 2;
      }
      return result?.ok ? 0 : 1;
    }
    async function main() {
      let result;
      try {
        result = await run(process.argv.slice(2));
      } catch {
        result = failure("CLI_FAILED", "\u6392\u961F\u547D\u4EE4\u6267\u884C\u5931\u8D25\u3002");
      }
      process.stdout.write(`${JSON.stringify(result)}
`);
      process.exitCode = exitCodeFor(result);
    }
    if (require.main === module2) void main();
    module2.exports = { run, exitCodeFor };
  }
});

// scripts/lib/jgy-api.js
var require_jgy_api = __commonJS({
  "scripts/lib/jgy-api.js"(exports2, module2) {
    "use strict";
    var DEFAULT_BASE = (process.env.JGY_BASE_URL || "https://mcp.jinguyuan.cloud").replace(/\/$/, "");
    var REQUEST_TIMEOUT_MS = Number.parseInt(process.env.JGY_TIMEOUT_MS || "", 10) || 15e3;
    function allowedHosts() {
      const hosts = /* @__PURE__ */ new Set(["mcp.jinguyuan.cloud"]);
      for (const h of String(process.env.JGY_ALLOWED_HOSTS || "").split(/[\s,]+/).filter(Boolean)) {
        hosts.add(h.toLowerCase());
      }
      try {
        hosts.add(new URL(DEFAULT_BASE).host.toLowerCase());
      } catch {
      }
      return hosts;
    }
    function assertAllowed(url) {
      const parsed = new URL(url);
      const isLoopback = ["127.0.0.1", "localhost", "[::1]"].some((h) => parsed.host.toLowerCase().startsWith(h));
      if (parsed.protocol !== "https:" && !isLoopback) {
        throw new ApiError("UNSAFE_ENDPOINT", "Only HTTPS endpoints are allowed.");
      }
      if (!allowedHosts().has(parsed.host.toLowerCase())) {
        throw new ApiError("UNSAFE_ENDPOINT", "Endpoint host is not in the allowlist.");
      }
      return parsed.toString();
    }
    var ApiError = class extends Error {
      constructor(code, message, { status = 0, body = null } = {}) {
        super(message || code);
        this.code = code;
        this.status = status;
        this.body = body;
      }
    };
    function createApiClient({ baseUrl = DEFAULT_BASE, fetchImpl = globalThis.fetch, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
      const base = String(baseUrl).replace(/\/$/, "");
      const issuer = `${base}/auth`;
      const businessApi = `${base}/api/v1`;
      async function request(url, { method = "GET", headers = {}, json = null, form = null, bearer = null } = {}) {
        const safeUrl = assertAllowed(url);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const reqHeaders = { accept: "application/json", ...headers };
        let body;
        if (json) {
          reqHeaders["content-type"] = "application/json";
          body = JSON.stringify(json);
        } else if (form) {
          reqHeaders["content-type"] = "application/x-www-form-urlencoded";
          body = new URLSearchParams(form).toString();
        }
        if (bearer) reqHeaders.authorization = `Bearer ${bearer}`;
        let res;
        try {
          res = await fetchImpl(safeUrl, { method, headers: reqHeaders, body, signal: controller.signal });
        } catch (e) {
          throw new ApiError(e && e.name === "AbortError" ? "REQUEST_TIMEOUT" : "NETWORK_ERROR", "Request failed.");
        } finally {
          clearTimeout(timer);
        }
        const text = await res.text();
        let parsed = null;
        try {
          parsed = text ? JSON.parse(text) : {};
        } catch {
          parsed = { raw: text };
        }
        if (!res.ok) throw new ApiError("HTTP_ERROR", `HTTP ${res.status}`, { status: res.status, body: parsed });
        return parsed;
      }
      return {
        baseUrl: base,
        issuer,
        businessApi,
        // --- identity endpoints ---
        phoneStart: (json) => request(`${issuer}/api/phone/start`, { method: "POST", json }),
        phoneVerify: (json) => request(`${issuer}/api/phone/verify`, { method: "POST", json }),
        refresh: (form) => request(`${issuer}/oauth/token`, { method: "POST", form }),
        revoke: (form) => request(`${issuer}/oauth/revoke`, { method: "POST", form }),
        // --- business endpoints ---
        authenticatedTest: (bearer) => request(`${businessApi}/authenticated-test`, { method: "GET", bearer }),
        // Public capability access (Phase 5 migration surface): GET without args, POST with JSON args.
        getCapability: (capabilityPath, bearer = null) => request(`${businessApi}/${String(capabilityPath).replace(/^\//, "")}`, { method: "GET", bearer }),
        postCapability: (capabilityPath, json, bearer = null) => request(`${businessApi}/${String(capabilityPath).replace(/^\//, "")}`, { method: "POST", json, bearer }),
        request
      };
    }
    module2.exports = { createApiClient, ApiError, assertAllowed, DEFAULT_BASE };
  }
});

// scripts/lib/output.js
var require_output = __commonJS({
  "scripts/lib/output.js"(exports2, module2) {
    "use strict";
    var SENSITIVE_KEY = /token|authorization|cookie|password|secret|credential|api[-_]?key|access_token|refresh_token|verification|otp/i;
    var CODE_KEY = /(^|_)code$/i;
    var OTP_LIKE = /^\d{4,8}$/;
    function redactString(value) {
      return String(value == null ? "" : value).replace(/(?<!\d)(1[3-9]\d)\d{4}(\d{4})(?!\d)/g, "$1****$2").replace(/(bearer\s+)[A-Za-z0-9._-]{12,}/gi, "$1[redacted]");
    }
    function deepRedact(value, key = "", path = []) {
      if (key && SENSITIVE_KEY.test(key)) return "[redacted]";
      if (key && CODE_KEY.test(key) && typeof value === "string" && OTP_LIKE.test(value)) return "[redacted]";
      if (typeof value === "string") return redactString(value);
      if (Array.isArray(value)) return value.map((v) => deepRedact(v, "", path));
      if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, deepRedact(v, k, [...path, key].filter(Boolean))]));
      }
      return value;
    }
    function ok(data = {}) {
      return { ok: true, ...data };
    }
    function err(code, message, extra = {}) {
      return { ok: false, error: { code, message, ...extra } };
    }
    function emit(result, { stream = process.stdout } = {}) {
      stream.write(`${JSON.stringify(deepRedact(result))}
`);
    }
    module2.exports = { ok, err, emit, deepRedact, redactString };
  }
});

// scripts/jgy.js
var require_jgy = __commonJS({
  "scripts/jgy.js"(exports2, module2) {
    "use strict";
    var { createApiClient } = require_jgy_api();
    var { ok, err, emit } = require_output();
    var PUBLIC_CAPABILITIES = /* @__PURE__ */ new Set([
      "shop-basics",
      "raw-dumpling-info",
      "news",
      "recommended-dishes",
      "recipes",
      "pickup-link",
      "queue/query",
      "queue/at-time",
      "queue/period-facts",
      "queue/period-advice"
    ]);
    function normalizePublicCapability(value) {
      const raw = String(value || "").trim();
      const [path, query = ""] = raw.split("?", 2);
      if (!PUBLIC_CAPABILITIES.has(path)) return null;
      if (!query) return path;
      if (path !== "recipes") return null;
      const params = new URLSearchParams(query);
      if ([...params.keys()].some((key) => key !== "recipe_id")) return null;
      const recipeId = params.get("recipe_id");
      if (!recipeId || !/^[A-Za-z0-9_-]{1,80}$/.test(recipeId)) return null;
      return `${path}?recipe_id=${encodeURIComponent(recipeId)}`;
    }
    function parseArgs(argv) {
      const args = { _: [] };
      for (let i = 0; i < argv.length; i += 1) {
        const a = argv[i];
        if (a.startsWith("--")) {
          const key = a.slice(2);
          const next = argv[i + 1];
          if (next === void 0 || next.startsWith("--")) {
            args[key] = true;
          } else {
            args[key] = next;
            i += 1;
          }
        } else {
          args._.push(a);
        }
      }
      return args;
    }
    async function main() {
      const argv = process.argv.slice(2);
      const command = argv[0];
      const args = parseArgs(argv.slice(1));
      switch (command) {
        case "call": {
          const capability = args._[0];
          if (!capability) return emit(err("invalid_command", "\u7F3A\u5C11\u80FD\u529B\u540D\u79F0\u3002"));
          const safeCapability = normalizePublicCapability(capability);
          if (!safeCapability) return emit(err("unsupported_capability", "\u8BE5\u516C\u5F00\u80FD\u529B\u4E0D\u5728 Skill \u5141\u8BB8\u6E05\u5355\u4E2D\u3002"));
          const api = createApiClient();
          let data;
          if (args.args) {
            let parsed;
            try {
              parsed = JSON.parse(String(args.args));
            } catch {
              return emit(err("invalid_command", "--args \u5FC5\u987B\u662F\u5408\u6CD5 JSON\u3002"));
            }
            data = await api.postCapability(safeCapability, parsed);
          } else {
            data = await api.getCapability(safeCapability);
          }
          return emit(ok({ data }));
        }
        default:
          return emit(err("invalid_command", "\u672A\u77E5\u547D\u4EE4\u3002\u53EF\u7528\uFF1Acall"));
      }
    }
    function runCli() {
      return main().catch((e) => {
        emit(err("unexpected_error", "\u6267\u884C\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002"));
        process.exitCode = 1;
      });
    }
    if (require.main === module2) void runCli();
    module2.exports = { runCli, normalizePublicCapability };
  }
});

// scripts/cli.js
async function dispatch() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  if (cmd === "queue" || cmd === "auth-poll-worker") {
    const { run, exitCodeFor } = require_queue();
    const queueArgv = cmd === "queue" ? argv.slice(1) : argv;
    const result = await run(queueArgv, { scriptPath: __filename });
    process.stdout.write(`${JSON.stringify(result)}
`);
    process.exitCode = exitCodeFor(result);
    return;
  }
  const { runCli } = require_jgy();
  await runCli();
}
void dispatch();

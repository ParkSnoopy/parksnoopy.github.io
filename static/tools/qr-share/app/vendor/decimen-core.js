var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf,
	__hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) =>
	() => {
		try {
			return (
				mod ||
					(0, cb[__getOwnPropNames(cb)[0]])(
						(mod = { exports: {} }).exports,
						mod,
					),
				mod.exports
			);
		} catch (e) {
			throw ((mod = 0), e);
		}
	};
var __copyProps = (to, from, except, desc) => {
	if ((from && typeof from == "object") || typeof from == "function")
		for (const key of __getOwnPropNames(from))
			!__hasOwnProp.call(to, key) &&
				key !== except &&
				__defProp(to, key, {
					get: () => from[key],
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable,
				});
	return to;
};
var __toESM = (mod, isNodeMode, target) => (
	(target = mod != null ? __create(__getProtoOf(mod)) : {}),
	__copyProps(
		// If the importer is in node compatibility mode or this is not an ESM
		// file that has been converted to a CommonJS file using a Babel-
		// compatible transform (i.e. "__esModule" has not been set), then set
		// "default" to the CommonJS "module.exports" for node compatibility.
		isNodeMode || !mod || !mod.__esModule
			? __defProp(target, "default", { value: mod, enumerable: !0 })
			: target,
		mod,
	)
);

// node_modules/qrcode/lib/can-promise.js
var require_can_promise = __commonJS({
	"node_modules/qrcode/lib/can-promise.js"(exports, module) {
		module.exports = () => (
				typeof Promise == "function" &&
				Promise.prototype &&
				Promise.prototype.then
			);
	},
});

// node_modules/qrcode/lib/core/utils.js
var require_utils = __commonJS({
	"node_modules/qrcode/lib/core/utils.js"(exports) {
		var toSJISFunction,
			CODEWORDS_COUNT = [
				0,
				// Not used
				26, 44, 70, 100, 134, 172, 196, 242, 292, 346, 404, 466, 532, 581, 655,
				733, 815, 901, 991, 1085, 1156, 1258, 1364, 1474, 1588, 1706, 1828,
				1921, 2051, 2185, 2323, 2465, 2611, 2761, 2876, 3034, 3196, 3362, 3532,
				3706,
			];
		exports.getSymbolSize = (version) => {
			if (!version) throw new Error('"version" cannot be null or undefined');
			if (version < 1 || version > 40)
				throw new Error('"version" should be in range from 1 to 40');
			return version * 4 + 17;
		};
		exports.getSymbolTotalCodewords = (version) => CODEWORDS_COUNT[version];
		exports.getBCHDigit = (data) => {
			let digit = 0;
			for (; data !== 0; ) digit++, (data >>>= 1);
			return digit;
		};
		exports.setToSJISFunction = (f) => {
			if (typeof f != "function")
				throw new Error('"toSJISFunc" is not a valid function.');
			toSJISFunction = f;
		};
		exports.isKanjiModeEnabled = () => typeof toSJISFunction < "u";
		exports.toSJIS = (kanji) => toSJISFunction(kanji);
	},
});

// node_modules/qrcode/lib/core/error-correction-level.js
var require_error_correction_level = __commonJS({
	"node_modules/qrcode/lib/core/error-correction-level.js"(exports) {
		exports.L = { bit: 1 };
		exports.M = { bit: 0 };
		exports.Q = { bit: 3 };
		exports.H = { bit: 2 };
		function fromString(string) {
			if (typeof string != "string") throw new Error("Param is not a string");
			switch (string.toLowerCase()) {
				case "l":
				case "low":
					return exports.L;
				case "m":
				case "medium":
					return exports.M;
				case "q":
				case "quartile":
					return exports.Q;
				case "h":
				case "high":
					return exports.H;
				default:
					throw new Error("Unknown EC Level: " + string);
			}
		}
		exports.isValid = (level) => level && typeof level.bit < "u" && level.bit >= 0 && level.bit < 4;
		exports.from = (value, defaultValue) => {
			if (exports.isValid(value)) return value;
			try {
				return fromString(value);
			} catch {
				return defaultValue;
			}
		};
	},
});

// node_modules/qrcode/lib/core/bit-buffer.js
var require_bit_buffer = __commonJS({
	"node_modules/qrcode/lib/core/bit-buffer.js"(exports, module) {
		function BitBuffer() {
			(this.buffer = []), (this.length = 0);
		}
		BitBuffer.prototype = {
			get: function (index) {
				const bufIndex = Math.floor(index / 8);
				return ((this.buffer[bufIndex] >>> (7 - (index % 8))) & 1) === 1;
			},
			put: function (num, length) {
				for (let i = 0; i < length; i++)
					this.putBit(((num >>> (length - i - 1)) & 1) === 1);
			},
			getLengthInBits: function () {
				return this.length;
			},
			putBit: function (bit) {
				const bufIndex = Math.floor(this.length / 8);
				this.buffer.length <= bufIndex && this.buffer.push(0),
					bit && (this.buffer[bufIndex] |= 128 >>> (this.length % 8)),
					this.length++;
			},
		};
		module.exports = BitBuffer;
	},
});

// node_modules/qrcode/lib/core/bit-matrix.js
var require_bit_matrix = __commonJS({
	"node_modules/qrcode/lib/core/bit-matrix.js"(exports, module) {
		function BitMatrix(size) {
			if (!size || size < 1)
				throw new Error("BitMatrix size must be defined and greater than 0");
			(this.size = size),
				(this.data = new Uint8Array(size * size)),
				(this.reservedBit = new Uint8Array(size * size));
		}
		BitMatrix.prototype.set = function (row, col, value, reserved) {
			const index = row * this.size + col;
			(this.data[index] = value), reserved && (this.reservedBit[index] = !0);
		};
		BitMatrix.prototype.get = function (row, col) {
			return this.data[row * this.size + col];
		};
		BitMatrix.prototype.xor = function (row, col, value) {
			this.data[row * this.size + col] ^= value;
		};
		BitMatrix.prototype.isReserved = function (row, col) {
			return this.reservedBit[row * this.size + col];
		};
		module.exports = BitMatrix;
	},
});

// node_modules/qrcode/lib/core/alignment-pattern.js
var require_alignment_pattern = __commonJS({
	"node_modules/qrcode/lib/core/alignment-pattern.js"(exports) {
		var getSymbolSize = require_utils().getSymbolSize;
		exports.getRowColCoords = (version) => {
			if (version === 1) return [];
			const posCount = Math.floor(version / 7) + 2,
				size = getSymbolSize(version),
				intervals =
					size === 145 ? 26 : Math.ceil((size - 13) / (2 * posCount - 2)) * 2,
				positions = [size - 7];
			for (let i = 1; i < posCount - 1; i++)
				positions[i] = positions[i - 1] - intervals;
			return (positions.push(6), positions.reverse());
		};
		exports.getPositions = (version) => {
			const coords = [],
				pos = exports.getRowColCoords(version),
				posLength = pos.length;
			for (let i = 0; i < posLength; i++)
				for (let j = 0; j < posLength; j++)
					(i === 0 && j === 0) || // top-left
						(i === 0 && j === posLength - 1) || // bottom-left
						(i === posLength - 1 && j === 0) ||
						coords.push([pos[i], pos[j]]);
			return coords;
		};
	},
});

// node_modules/qrcode/lib/core/finder-pattern.js
var require_finder_pattern = __commonJS({
	"node_modules/qrcode/lib/core/finder-pattern.js"(exports) {
		var getSymbolSize = require_utils().getSymbolSize,
			FINDER_PATTERN_SIZE = 7;
		exports.getPositions = (version) => {
			const size = getSymbolSize(version);
			return [
				// top-left
				[0, 0],
				// top-right
				[size - FINDER_PATTERN_SIZE, 0],
				// bottom-left
				[0, size - FINDER_PATTERN_SIZE],
			];
		};
	},
});

// node_modules/qrcode/lib/core/mask-pattern.js
var require_mask_pattern = __commonJS({
	"node_modules/qrcode/lib/core/mask-pattern.js"(exports) {
		exports.Patterns = {
			PATTERN000: 0,
			PATTERN001: 1,
			PATTERN010: 2,
			PATTERN011: 3,
			PATTERN100: 4,
			PATTERN101: 5,
			PATTERN110: 6,
			PATTERN111: 7,
		};
		var PenaltyScores = {
			N1: 3,
			N2: 3,
			N3: 40,
			N4: 10,
		};
		exports.isValid = (mask) => (
				mask != null && mask !== "" && !isNaN(mask) && mask >= 0 && mask <= 7
			);
		exports.from = (value) => exports.isValid(value) ? parseInt(value, 10) : void 0;
		exports.getPenaltyN1 = (data) => {
			let size = data.size,
				points = 0,
				sameCountCol = 0,
				sameCountRow = 0,
				lastCol = null,
				lastRow = null;
			for (let row = 0; row < size; row++) {
				(sameCountCol = sameCountRow = 0), (lastCol = lastRow = null);
				for (let col = 0; col < size; col++) {
					let module2 = data.get(row, col);
					module2 === lastCol
						? sameCountCol++
						: (sameCountCol >= 5 &&
								(points += PenaltyScores.N1 + (sameCountCol - 5)),
							(lastCol = module2),
							(sameCountCol = 1)),
						(module2 = data.get(col, row)),
						module2 === lastRow
							? sameCountRow++
							: (sameCountRow >= 5 &&
									(points += PenaltyScores.N1 + (sameCountRow - 5)),
								(lastRow = module2),
								(sameCountRow = 1));
				}
				sameCountCol >= 5 && (points += PenaltyScores.N1 + (sameCountCol - 5)),
					sameCountRow >= 5 &&
						(points += PenaltyScores.N1 + (sameCountRow - 5));
			}
			return points;
		};
		exports.getPenaltyN2 = (data) => {
			let size = data.size,
				points = 0;
			for (let row = 0; row < size - 1; row++)
				for (let col = 0; col < size - 1; col++) {
					const last =
						data.get(row, col) +
						data.get(row, col + 1) +
						data.get(row + 1, col) +
						data.get(row + 1, col + 1);
					(last === 4 || last === 0) && points++;
				}
			return points * PenaltyScores.N2;
		};
		exports.getPenaltyN3 = (data) => {
			let size = data.size,
				points = 0,
				bitsCol = 0,
				bitsRow = 0;
			for (let row = 0; row < size; row++) {
				bitsCol = bitsRow = 0;
				for (let col = 0; col < size; col++)
					(bitsCol = ((bitsCol << 1) & 2047) | data.get(row, col)),
						col >= 10 && (bitsCol === 1488 || bitsCol === 93) && points++,
						(bitsRow = ((bitsRow << 1) & 2047) | data.get(col, row)),
						col >= 10 && (bitsRow === 1488 || bitsRow === 93) && points++;
			}
			return points * PenaltyScores.N3;
		};
		exports.getPenaltyN4 = (data) => {
			let darkCount = 0,
				modulesCount = data.data.length;
			for (let i = 0; i < modulesCount; i++) darkCount += data.data[i];
			return (
				Math.abs(Math.ceil((darkCount * 100) / modulesCount / 5) - 10) *
				PenaltyScores.N4
			);
		};
		function getMaskAt(maskPattern, i, j) {
			switch (maskPattern) {
				case exports.Patterns.PATTERN000:
					return (i + j) % 2 === 0;
				case exports.Patterns.PATTERN001:
					return i % 2 === 0;
				case exports.Patterns.PATTERN010:
					return j % 3 === 0;
				case exports.Patterns.PATTERN011:
					return (i + j) % 3 === 0;
				case exports.Patterns.PATTERN100:
					return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
				case exports.Patterns.PATTERN101:
					return ((i * j) % 2) + ((i * j) % 3) === 0;
				case exports.Patterns.PATTERN110:
					return (((i * j) % 2) + ((i * j) % 3)) % 2 === 0;
				case exports.Patterns.PATTERN111:
					return (((i * j) % 3) + ((i + j) % 2)) % 2 === 0;
				default:
					throw new Error("bad maskPattern:" + maskPattern);
			}
		}
		exports.applyMask = (pattern, data) => {
			const size = data.size;
			for (let col = 0; col < size; col++)
				for (let row = 0; row < size; row++)
					data.isReserved(row, col) ||
						data.xor(row, col, getMaskAt(pattern, row, col));
		};
		exports.getBestMask = (data, setupFormatFunc) => {
			let numPatterns = Object.keys(exports.Patterns).length,
				bestPattern = 0,
				lowerPenalty = 1 / 0;
			for (let p = 0; p < numPatterns; p++) {
				setupFormatFunc(p), exports.applyMask(p, data);
				const penalty =
					exports.getPenaltyN1(data) +
					exports.getPenaltyN2(data) +
					exports.getPenaltyN3(data) +
					exports.getPenaltyN4(data);
				exports.applyMask(p, data),
					penalty < lowerPenalty &&
						((lowerPenalty = penalty), (bestPattern = p));
			}
			return bestPattern;
		};
	},
});

// node_modules/qrcode/lib/core/error-correction-code.js
var require_error_correction_code = __commonJS({
	"node_modules/qrcode/lib/core/error-correction-code.js"(exports) {
		var ECLevel = require_error_correction_level(),
			EC_BLOCKS_TABLE = [
				// L  M  Q  H
				1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 1, 2, 2, 4, 1, 2, 4, 4, 2, 4, 4, 4,
				2, 4, 6, 5, 2, 4, 6, 6, 2, 5, 8, 8, 4, 5, 8, 8, 4, 5, 8, 11, 4, 8, 10,
				11, 4, 9, 12, 16, 4, 9, 16, 16, 6, 10, 12, 18, 6, 10, 17, 16, 6, 11, 16,
				19, 6, 13, 18, 21, 7, 14, 21, 25, 8, 16, 20, 25, 8, 17, 23, 25, 9, 17,
				23, 34, 9, 18, 25, 30, 10, 20, 27, 32, 12, 21, 29, 35, 12, 23, 34, 37,
				12, 25, 34, 40, 13, 26, 35, 42, 14, 28, 38, 45, 15, 29, 40, 48, 16, 31,
				43, 51, 17, 33, 45, 54, 18, 35, 48, 57, 19, 37, 51, 60, 19, 38, 53, 63,
				20, 40, 56, 66, 21, 43, 59, 70, 22, 45, 62, 74, 24, 47, 65, 77, 25, 49,
				68, 81,
			],
			EC_CODEWORDS_TABLE = [
				// L  M  Q  H
				7, 10, 13, 17, 10, 16, 22, 28, 15, 26, 36, 44, 20, 36, 52, 64, 26, 48,
				72, 88, 36, 64, 96, 112, 40, 72, 108, 130, 48, 88, 132, 156, 60, 110,
				160, 192, 72, 130, 192, 224, 80, 150, 224, 264, 96, 176, 260, 308, 104,
				198, 288, 352, 120, 216, 320, 384, 132, 240, 360, 432, 144, 280, 408,
				480, 168, 308, 448, 532, 180, 338, 504, 588, 196, 364, 546, 650, 224,
				416, 600, 700, 224, 442, 644, 750, 252, 476, 690, 816, 270, 504, 750,
				900, 300, 560, 810, 960, 312, 588, 870, 1050, 336, 644, 952, 1110, 360,
				700, 1020, 1200, 390, 728, 1050, 1260, 420, 784, 1140, 1350, 450, 812,
				1200, 1440, 480, 868, 1290, 1530, 510, 924, 1350, 1620, 540, 980, 1440,
				1710, 570, 1036, 1530, 1800, 570, 1064, 1590, 1890, 600, 1120, 1680,
				1980, 630, 1204, 1770, 2100, 660, 1260, 1860, 2220, 720, 1316, 1950,
				2310, 750, 1372, 2040, 2430,
			];
		exports.getBlocksCount = (version, errorCorrectionLevel) => {
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
					return;
			}
		};
		exports.getTotalCodewordsCount = (version, errorCorrectionLevel) => {
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
					return;
			}
		};
	},
});

// node_modules/qrcode/lib/core/galois-field.js
var require_galois_field = __commonJS({
	"node_modules/qrcode/lib/core/galois-field.js"(exports) {
		var EXP_TABLE = new Uint8Array(512),
			LOG_TABLE = new Uint8Array(256);
		(() => {
			let x = 1;
			for (let i = 0; i < 255; i++)
				(EXP_TABLE[i] = x),
					(LOG_TABLE[x] = i),
					(x <<= 1),
					x & 256 && (x ^= 285);
			for (let i = 255; i < 512; i++) EXP_TABLE[i] = EXP_TABLE[i - 255];
		})();
		exports.log = (n) => {
			if (n < 1) throw new Error("log(" + n + ")");
			return LOG_TABLE[n];
		};
		exports.exp = (n) => EXP_TABLE[n];
		exports.mul = (x, y) => x === 0 || y === 0 ? 0 : EXP_TABLE[LOG_TABLE[x] + LOG_TABLE[y]];
	},
});

// node_modules/qrcode/lib/core/polynomial.js
var require_polynomial = __commonJS({
	"node_modules/qrcode/lib/core/polynomial.js"(exports) {
		var GF = require_galois_field();
		exports.mul = (p1, p2) => {
			const coeff = new Uint8Array(p1.length + p2.length - 1);
			for (let i = 0; i < p1.length; i++)
				for (let j = 0; j < p2.length; j++)
					coeff[i + j] ^= GF.mul(p1[i], p2[j]);
			return coeff;
		};
		exports.mod = (divident, divisor) => {
			let result = new Uint8Array(divident);
			for (; result.length - divisor.length >= 0; ) {
				const coeff = result[0];
				for (let i = 0; i < divisor.length; i++)
					result[i] ^= GF.mul(divisor[i], coeff);
				let offset = 0;
				for (; offset < result.length && result[offset] === 0; ) offset++;
				result = result.slice(offset);
			}
			return result;
		};
		exports.generateECPolynomial = (degree) => {
			let poly = new Uint8Array([1]);
			for (let i = 0; i < degree; i++)
				poly = exports.mul(poly, new Uint8Array([1, GF.exp(i)]));
			return poly;
		};
	},
});

// node_modules/qrcode/lib/core/reed-solomon-encoder.js
var require_reed_solomon_encoder = __commonJS({
	"node_modules/qrcode/lib/core/reed-solomon-encoder.js"(exports, module) {
		var Polynomial = require_polynomial();
		function ReedSolomonEncoder(degree) {
			(this.genPoly = void 0),
				(this.degree = degree),
				this.degree && this.initialize(this.degree);
		}
		ReedSolomonEncoder.prototype.initialize = function (degree) {
			(this.degree = degree),
				(this.genPoly = Polynomial.generateECPolynomial(this.degree));
		};
		ReedSolomonEncoder.prototype.encode = function (data) {
			if (!this.genPoly) throw new Error("Encoder not initialized");
			const paddedData = new Uint8Array(data.length + this.degree);
			paddedData.set(data);
			const remainder = Polynomial.mod(paddedData, this.genPoly),
				start = this.degree - remainder.length;
			if (start > 0) {
				const buff = new Uint8Array(this.degree);
				return (buff.set(remainder, start), buff);
			}
			return remainder;
		};
		module.exports = ReedSolomonEncoder;
	},
});

// node_modules/qrcode/lib/core/version-check.js
var require_version_check = __commonJS({
	"node_modules/qrcode/lib/core/version-check.js"(exports) {
		exports.isValid = (version) => !isNaN(version) && version >= 1 && version <= 40;
	},
});

// node_modules/qrcode/lib/core/regex.js
var require_regex = __commonJS({
	"node_modules/qrcode/lib/core/regex.js"(exports) {
		var numeric = "[0-9]+",
			alphanumeric = "[A-Z $%*+\\-./:]+",
			kanji =
				"(?:[u3000-u303F]|[u3040-u309F]|[u30A0-u30FF]|[uFF00-uFFEF]|[u4E00-u9FAF]|[u2605-u2606]|[u2190-u2195]|u203B|[u2010u2015u2018u2019u2025u2026u201Cu201Du2225u2260]|[u0391-u0451]|[u00A7u00A8u00B1u00B4u00D7u00F7])+";
		kanji = kanji.replace(/u/g, "\\u");
		var byte =
			"(?:(?![A-Z0-9 $%*+\\-./:]|" +
			kanji +
			`)(?:.|[\r
]))+`;
		exports.KANJI = new RegExp(kanji, "g");
		exports.BYTE_KANJI = /[^A-Z0-9 $%*+\-./:]+/g;
		exports.BYTE = new RegExp(byte, "g");
		exports.NUMERIC = new RegExp(numeric, "g");
		exports.ALPHANUMERIC = new RegExp(alphanumeric, "g");
		var TEST_KANJI = new RegExp("^" + kanji + "$"),
			TEST_NUMERIC = new RegExp("^" + numeric + "$"),
			TEST_ALPHANUMERIC = /^[A-Z0-9 $%*+\-./:]+$/;
		exports.testKanji = (str) => TEST_KANJI.test(str);
		exports.testNumeric = (str) => TEST_NUMERIC.test(str);
		exports.testAlphanumeric = (str) => TEST_ALPHANUMERIC.test(str);
	},
});

// node_modules/qrcode/lib/core/mode.js
var require_mode = __commonJS({
	"node_modules/qrcode/lib/core/mode.js"(exports) {
		var VersionCheck = require_version_check(),
			Regex = require_regex();
		exports.NUMERIC = {
			id: "Numeric",
			bit: 1,
			ccBits: [10, 12, 14],
		};
		exports.ALPHANUMERIC = {
			id: "Alphanumeric",
			bit: 2,
			ccBits: [9, 11, 13],
		};
		exports.BYTE = {
			id: "Byte",
			bit: 4,
			ccBits: [8, 16, 16],
		};
		exports.KANJI = {
			id: "Kanji",
			bit: 8,
			ccBits: [8, 10, 12],
		};
		exports.MIXED = {
			bit: -1,
		};
		exports.getCharCountIndicator = (mode, version) => {
			if (!mode.ccBits) throw new Error("Invalid mode: " + mode);
			if (!VersionCheck.isValid(version))
				throw new Error("Invalid version: " + version);
			return version >= 1 && version < 10
				? mode.ccBits[0]
				: version < 27
					? mode.ccBits[1]
					: mode.ccBits[2];
		};
		exports.getBestModeForData = (dataStr) => Regex.testNumeric(dataStr)
				? exports.NUMERIC
				: Regex.testAlphanumeric(dataStr)
					? exports.ALPHANUMERIC
					: Regex.testKanji(dataStr)
						? exports.KANJI
						: exports.BYTE;
		exports.toString = (mode) => {
			if (mode && mode.id) return mode.id;
			throw new Error("Invalid mode");
		};
		exports.isValid = (mode) => mode && mode.bit && mode.ccBits;
		function fromString(string) {
			if (typeof string != "string") throw new Error("Param is not a string");
			switch (string.toLowerCase()) {
				case "numeric":
					return exports.NUMERIC;
				case "alphanumeric":
					return exports.ALPHANUMERIC;
				case "kanji":
					return exports.KANJI;
				case "byte":
					return exports.BYTE;
				default:
					throw new Error("Unknown mode: " + string);
			}
		}
		exports.from = (value, defaultValue) => {
			if (exports.isValid(value)) return value;
			try {
				return fromString(value);
			} catch {
				return defaultValue;
			}
		};
	},
});

// node_modules/qrcode/lib/core/version.js
var require_version = __commonJS({
	"node_modules/qrcode/lib/core/version.js"(exports) {
		var Utils = require_utils(),
			ECCode = require_error_correction_code(),
			ECLevel = require_error_correction_level(),
			Mode = require_mode(),
			VersionCheck = require_version_check(),
			G18 = 7973,
			G18_BCH = Utils.getBCHDigit(G18);
		function getBestVersionForDataLength(mode, length, errorCorrectionLevel) {
			for (let currentVersion = 1; currentVersion <= 40; currentVersion++)
				if (
					length <=
					exports.getCapacity(currentVersion, errorCorrectionLevel, mode)
				)
					return currentVersion;
		}
		function getReservedBitsCount(mode, version) {
			return Mode.getCharCountIndicator(mode, version) + 4;
		}
		function getTotalBitsFromDataArray(segments, version) {
			let totalBits = 0;
			return (
				segments.forEach((data) => {
					const reservedBits = getReservedBitsCount(data.mode, version);
					totalBits += reservedBits + data.getBitsLength();
				}),
				totalBits
			);
		}
		function getBestVersionForMixedData(segments, errorCorrectionLevel) {
			for (let currentVersion = 1; currentVersion <= 40; currentVersion++)
				if (
					getTotalBitsFromDataArray(segments, currentVersion) <=
					exports.getCapacity(currentVersion, errorCorrectionLevel, Mode.MIXED)
				)
					return currentVersion;
		}
		exports.from = (value, defaultValue) => VersionCheck.isValid(value) ? parseInt(value, 10) : defaultValue;
		exports.getCapacity = (version, errorCorrectionLevel, mode) => {
			if (!VersionCheck.isValid(version))
				throw new Error("Invalid QR Code version");
			typeof mode > "u" && (mode = Mode.BYTE);
			const totalCodewords = Utils.getSymbolTotalCodewords(version),
				ecTotalCodewords = ECCode.getTotalCodewordsCount(
					version,
					errorCorrectionLevel,
				),
				dataTotalCodewordsBits = (totalCodewords - ecTotalCodewords) * 8;
			if (mode === Mode.MIXED) return dataTotalCodewordsBits;
			const usableBits =
				dataTotalCodewordsBits - getReservedBitsCount(mode, version);
			switch (mode) {
				case Mode.NUMERIC:
					return Math.floor((usableBits / 10) * 3);
				case Mode.ALPHANUMERIC:
					return Math.floor((usableBits / 11) * 2);
				case Mode.KANJI:
					return Math.floor(usableBits / 13);
				case Mode.BYTE:
				default:
					return Math.floor(usableBits / 8);
			}
		};
		exports.getBestVersionForData = (data, errorCorrectionLevel) => {
			let seg,
				ecl = ECLevel.from(errorCorrectionLevel, ECLevel.M);
			if (Array.isArray(data)) {
				if (data.length > 1) return getBestVersionForMixedData(data, ecl);
				if (data.length === 0) return 1;
				seg = data[0];
			} else seg = data;
			return getBestVersionForDataLength(seg.mode, seg.getLength(), ecl);
		};
		exports.getEncodedBits = (version) => {
			if (!VersionCheck.isValid(version) || version < 7)
				throw new Error("Invalid QR Code version");
			let d = version << 12;
			for (; Utils.getBCHDigit(d) - G18_BCH >= 0; )
				d ^= G18 << (Utils.getBCHDigit(d) - G18_BCH);
			return (version << 12) | d;
		};
	},
});

// node_modules/qrcode/lib/core/format-info.js
var require_format_info = __commonJS({
	"node_modules/qrcode/lib/core/format-info.js"(exports) {
		var Utils = require_utils(),
			G15 = 1335,
			G15_MASK = 21522,
			G15_BCH = Utils.getBCHDigit(G15);
		exports.getEncodedBits = (errorCorrectionLevel, mask) => {
			let data = (errorCorrectionLevel.bit << 3) | mask,
				d = data << 10;
			for (; Utils.getBCHDigit(d) - G15_BCH >= 0; )
				d ^= G15 << (Utils.getBCHDigit(d) - G15_BCH);
			return ((data << 10) | d) ^ G15_MASK;
		};
	},
});

// node_modules/qrcode/lib/core/numeric-data.js
var require_numeric_data = __commonJS({
	"node_modules/qrcode/lib/core/numeric-data.js"(exports, module) {
		var Mode = require_mode();
		function NumericData(data) {
			(this.mode = Mode.NUMERIC), (this.data = data.toString());
		}
		NumericData.getBitsLength = (length) => (
				10 * Math.floor(length / 3) + (length % 3 ? (length % 3) * 3 + 1 : 0)
			);
		NumericData.prototype.getLength = function () {
			return this.data.length;
		};
		NumericData.prototype.getBitsLength = function () {
			return NumericData.getBitsLength(this.data.length);
		};
		NumericData.prototype.write = function (bitBuffer) {
			let i, group, value;
			for (i = 0; i + 3 <= this.data.length; i += 3)
				(group = this.data.substr(i, 3)),
					(value = parseInt(group, 10)),
					bitBuffer.put(value, 10);
			const remainingNum = this.data.length - i;
			remainingNum > 0 &&
				((group = this.data.substr(i)),
				(value = parseInt(group, 10)),
				bitBuffer.put(value, remainingNum * 3 + 1));
		};
		module.exports = NumericData;
	},
});

// node_modules/qrcode/lib/core/alphanumeric-data.js
var require_alphanumeric_data = __commonJS({
	"node_modules/qrcode/lib/core/alphanumeric-data.js"(exports, module) {
		var Mode = require_mode(),
			ALPHA_NUM_CHARS = [
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
				":",
			];
		function AlphanumericData(data) {
			(this.mode = Mode.ALPHANUMERIC), (this.data = data);
		}
		AlphanumericData.getBitsLength = (length) => 11 * Math.floor(length / 2) + 6 * (length % 2);
		AlphanumericData.prototype.getLength = function () {
			return this.data.length;
		};
		AlphanumericData.prototype.getBitsLength = function () {
			return AlphanumericData.getBitsLength(this.data.length);
		};
		AlphanumericData.prototype.write = function (bitBuffer) {
			let i;
			for (i = 0; i + 2 <= this.data.length; i += 2) {
				let value = ALPHA_NUM_CHARS.indexOf(this.data[i]) * 45;
				(value += ALPHA_NUM_CHARS.indexOf(this.data[i + 1])),
					bitBuffer.put(value, 11);
			}
			this.data.length % 2 &&
				bitBuffer.put(ALPHA_NUM_CHARS.indexOf(this.data[i]), 6);
		};
		module.exports = AlphanumericData;
	},
});

// node_modules/qrcode/lib/core/byte-data.js
var require_byte_data = __commonJS({
	"node_modules/qrcode/lib/core/byte-data.js"(exports, module) {
		var Mode = require_mode();
		function ByteData(data) {
			(this.mode = Mode.BYTE),
				typeof data == "string"
					? (this.data = new TextEncoder().encode(data))
					: (this.data = new Uint8Array(data));
		}
		ByteData.getBitsLength = (length) => length * 8;
		ByteData.prototype.getLength = function () {
			return this.data.length;
		};
		ByteData.prototype.getBitsLength = function () {
			return ByteData.getBitsLength(this.data.length);
		};
		ByteData.prototype.write = function (bitBuffer) {
			for (let i = 0, l = this.data.length; i < l; i++)
				bitBuffer.put(this.data[i], 8);
		};
		module.exports = ByteData;
	},
});

// node_modules/qrcode/lib/core/kanji-data.js
var require_kanji_data = __commonJS({
	"node_modules/qrcode/lib/core/kanji-data.js"(exports, module) {
		var Mode = require_mode(),
			Utils = require_utils();
		function KanjiData(data) {
			(this.mode = Mode.KANJI), (this.data = data);
		}
		KanjiData.getBitsLength = (length) => length * 13;
		KanjiData.prototype.getLength = function () {
			return this.data.length;
		};
		KanjiData.prototype.getBitsLength = function () {
			return KanjiData.getBitsLength(this.data.length);
		};
		KanjiData.prototype.write = function (bitBuffer) {
			let i;
			for (i = 0; i < this.data.length; i++) {
				let value = Utils.toSJIS(this.data[i]);
				if (value >= 33088 && value <= 40956) value -= 33088;
				else if (value >= 57408 && value <= 60351) value -= 49472;
				else
					throw new Error(
						"Invalid SJIS character: " +
							this.data[i] +
							`
Make sure your charset is UTF-8`,
					);
				(value = ((value >>> 8) & 255) * 192 + (value & 255)),
					bitBuffer.put(value, 13);
			}
		};
		module.exports = KanjiData;
	},
});

// node_modules/dijkstrajs/dijkstra.js
var require_dijkstra = __commonJS({
	"node_modules/dijkstrajs/dijkstra.js"(exports, module) {
		var dijkstra = {
			single_source_shortest_paths: (graph, s, d) => {
				var predecessors = {},
					costs = {};
				costs[s] = 0;
				var open = dijkstra.PriorityQueue.make();
				open.push(s, 0);
				for (
					var closest,
						u,
						v,
						cost_of_s_to_u,
						adjacent_nodes,
						cost_of_e,
						cost_of_s_to_u_plus_cost_of_e,
						cost_of_s_to_v,
						first_visit;
					!open.empty();
				) {
					(closest = open.pop()),
						(u = closest.value),
						(cost_of_s_to_u = closest.cost),
						(adjacent_nodes = graph[u] || {});
					for (v in adjacent_nodes)
						Object.hasOwn(adjacent_nodes, v) &&
							((cost_of_e = adjacent_nodes[v]),
							(cost_of_s_to_u_plus_cost_of_e = cost_of_s_to_u + cost_of_e),
							(cost_of_s_to_v = costs[v]),
							(first_visit = typeof costs[v] > "u"),
							(first_visit || cost_of_s_to_v > cost_of_s_to_u_plus_cost_of_e) &&
								((costs[v] = cost_of_s_to_u_plus_cost_of_e),
								open.push(v, cost_of_s_to_u_plus_cost_of_e),
								(predecessors[v] = u)));
				}
				if (typeof d < "u" && typeof costs[d] > "u") {
					var msg = ["Could not find a path from ", s, " to ", d, "."].join("");
					throw new Error(msg);
				}
				return predecessors;
			},
			extract_shortest_path_from_predecessor_list: (predecessors, d) => {
				for (var nodes = [], u = d, predecessor; u; )
					nodes.push(u), (predecessor = predecessors[u]), (u = predecessors[u]);
				return (nodes.reverse(), nodes);
			},
			find_path: (graph, s, d) => {
				var predecessors = dijkstra.single_source_shortest_paths(graph, s, d);
				return dijkstra.extract_shortest_path_from_predecessor_list(
					predecessors,
					d,
				);
			},
			/**
			 * A very naive priority queue implementation.
			 */
			PriorityQueue: {
				make: (opts) => {
					var T = dijkstra.PriorityQueue,
						t = {},
						key;
					opts = opts || {};
					for (key in T) Object.hasOwn(T, key) && (t[key] = T[key]);
					return (
						(t.queue = []), (t.sorter = opts.sorter || T.default_sorter), t
					);
				},
				default_sorter: (a, b) => a.cost - b.cost,
				/**
				 * Add a new item to the queue and ensure the highest priority element
				 * is at the front of the queue.
				 */
				push: function (value, cost) {
					var item = { value, cost };
					this.queue.push(item), this.queue.sort(this.sorter);
				},
				/**
				 * Return the highest priority element in the queue.
				 */
				pop: function () {
					return this.queue.shift();
				},
				empty: function () {
					return this.queue.length === 0;
				},
			},
		};
		typeof module < "u" && (module.exports = dijkstra);
	},
});

// node_modules/qrcode/lib/core/segments.js
var require_segments = __commonJS({
	"node_modules/qrcode/lib/core/segments.js"(exports) {
		var Mode = require_mode(),
			NumericData = require_numeric_data(),
			AlphanumericData = require_alphanumeric_data(),
			ByteData = require_byte_data(),
			KanjiData = require_kanji_data(),
			Regex = require_regex(),
			Utils = require_utils(),
			dijkstra = require_dijkstra();
		function getStringByteLength(str) {
			return unescape(encodeURIComponent(str)).length;
		}
		function getSegments(regex, mode, str) {
			let segments = [],
				result;
			for (; (result = regex.exec(str)) !== null; )
				segments.push({
					data: result[0],
					index: result.index,
					mode,
					length: result[0].length,
				});
			return segments;
		}
		function getSegmentsFromString(dataStr) {
			let numSegs = getSegments(Regex.NUMERIC, Mode.NUMERIC, dataStr),
				alphaNumSegs = getSegments(
					Regex.ALPHANUMERIC,
					Mode.ALPHANUMERIC,
					dataStr,
				),
				byteSegs,
				kanjiSegs;
			return (
				Utils.isKanjiModeEnabled()
					? ((byteSegs = getSegments(Regex.BYTE, Mode.BYTE, dataStr)),
						(kanjiSegs = getSegments(Regex.KANJI, Mode.KANJI, dataStr)))
					: ((byteSegs = getSegments(Regex.BYTE_KANJI, Mode.BYTE, dataStr)),
						(kanjiSegs = [])),
				numSegs
					.concat(alphaNumSegs, byteSegs, kanjiSegs)
					.sort((s1, s2) => s1.index - s2.index)
					.map((obj) => ({
							data: obj.data,
							mode: obj.mode,
							length: obj.length,
						}))
			);
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
			return segs.reduce((acc, curr) => {
				const prevSeg = acc.length - 1 >= 0 ? acc[acc.length - 1] : null;
				return prevSeg && prevSeg.mode === curr.mode
					? ((acc[acc.length - 1].data += curr.data), acc)
					: (acc.push(curr), acc);
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
							{ data: seg.data, mode: Mode.BYTE, length: seg.length },
						]);
						break;
					case Mode.ALPHANUMERIC:
						nodes.push([
							seg,
							{ data: seg.data, mode: Mode.BYTE, length: seg.length },
						]);
						break;
					case Mode.KANJI:
						nodes.push([
							seg,
							{
								data: seg.data,
								mode: Mode.BYTE,
								length: getStringByteLength(seg.data),
							},
						]);
						break;
					case Mode.BYTE:
						nodes.push([
							{
								data: seg.data,
								mode: Mode.BYTE,
								length: getStringByteLength(seg.data),
							},
						]);
				}
			}
			return nodes;
		}
		function buildGraph(nodes, version) {
			let table = {},
				graph = { start: {} },
				prevNodeIds = ["start"];
			for (let i = 0; i < nodes.length; i++) {
				const nodeGroup = nodes[i],
					currentNodeIds = [];
				for (let j = 0; j < nodeGroup.length; j++) {
					const node = nodeGroup[j],
						key = "" + i + j;
					currentNodeIds.push(key),
						(table[key] = { node, lastCount: 0 }),
						(graph[key] = {});
					for (let n = 0; n < prevNodeIds.length; n++) {
						const prevNodeId = prevNodeIds[n];
						table[prevNodeId] && table[prevNodeId].node.mode === node.mode
							? ((graph[prevNodeId][key] =
									getSegmentBitsLength(
										table[prevNodeId].lastCount + node.length,
										node.mode,
									) -
									getSegmentBitsLength(table[prevNodeId].lastCount, node.mode)),
								(table[prevNodeId].lastCount += node.length))
							: (table[prevNodeId] &&
									(table[prevNodeId].lastCount = node.length),
								(graph[prevNodeId][key] =
									getSegmentBitsLength(node.length, node.mode) +
									4 +
									Mode.getCharCountIndicator(node.mode, version)));
					}
				}
				prevNodeIds = currentNodeIds;
			}
			for (let n = 0; n < prevNodeIds.length; n++)
				graph[prevNodeIds[n]].end = 0;
			return { map: graph, table };
		}
		function buildSingleSegment(data, modesHint) {
			let mode,
				bestMode = Mode.getBestModeForData(data);
			if (
				((mode = Mode.from(modesHint, bestMode)),
				mode !== Mode.BYTE && mode.bit < bestMode.bit)
			)
				throw new Error(
					'"' +
						data +
						'" cannot be encoded with mode ' +
						Mode.toString(mode) +
						`.
 Suggested mode is: ` +
						Mode.toString(bestMode),
				);
			switch (
				(mode === Mode.KANJI &&
					!Utils.isKanjiModeEnabled() &&
					(mode = Mode.BYTE),
				mode)
			) {
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
		exports.fromArray = (array) => array.reduce((acc, seg) => (
					typeof seg == "string"
						? acc.push(buildSingleSegment(seg, null))
						: seg.data && acc.push(buildSingleSegment(seg.data, seg.mode)),
					acc
				), []);
		exports.fromString = (data, version) => {
			const segs = getSegmentsFromString(data, Utils.isKanjiModeEnabled()),
				nodes = buildNodes(segs),
				graph = buildGraph(nodes, version),
				path = dijkstra.find_path(graph.map, "start", "end"),
				optimizedSegs = [];
			for (let i = 1; i < path.length - 1; i++)
				optimizedSegs.push(graph.table[path[i]].node);
			return exports.fromArray(mergeSegments(optimizedSegs));
		};
		exports.rawSplit = (data) => exports.fromArray(
				getSegmentsFromString(data, Utils.isKanjiModeEnabled()),
			);
	},
});

// node_modules/qrcode/lib/core/qrcode.js
var require_qrcode = __commonJS({
	"node_modules/qrcode/lib/core/qrcode.js"(exports) {
		var Utils = require_utils(),
			ECLevel = require_error_correction_level(),
			BitBuffer = require_bit_buffer(),
			BitMatrix = require_bit_matrix(),
			AlignmentPattern = require_alignment_pattern(),
			FinderPattern = require_finder_pattern(),
			MaskPattern = require_mask_pattern(),
			ECCode = require_error_correction_code(),
			ReedSolomonEncoder = require_reed_solomon_encoder(),
			Version = require_version(),
			FormatInfo = require_format_info(),
			Mode = require_mode(),
			Segments = require_segments();
		function setupFinderPattern(matrix, version) {
			const size = matrix.size,
				pos = FinderPattern.getPositions(version);
			for (let i = 0; i < pos.length; i++) {
				const row = pos[i][0],
					col = pos[i][1];
				for (let r = -1; r <= 7; r++)
					if (!(row + r <= -1 || size <= row + r))
						for (let c = -1; c <= 7; c++)
							col + c <= -1 ||
								size <= col + c ||
								((r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
								(c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
								(r >= 2 && r <= 4 && c >= 2 && c <= 4)
									? matrix.set(row + r, col + c, !0, !0)
									: matrix.set(row + r, col + c, !1, !0));
			}
		}
		function setupTimingPattern(matrix) {
			const size = matrix.size;
			for (let r = 8; r < size - 8; r++) {
				const value = r % 2 === 0;
				matrix.set(r, 6, value, !0), matrix.set(6, r, value, !0);
			}
		}
		function setupAlignmentPattern(matrix, version) {
			const pos = AlignmentPattern.getPositions(version);
			for (let i = 0; i < pos.length; i++) {
				const row = pos[i][0],
					col = pos[i][1];
				for (let r = -2; r <= 2; r++)
					for (let c = -2; c <= 2; c++)
						r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0)
							? matrix.set(row + r, col + c, !0, !0)
							: matrix.set(row + r, col + c, !1, !0);
			}
		}
		function setupVersionInfo(matrix, version) {
			let size = matrix.size,
				bits = Version.getEncodedBits(version),
				row,
				col,
				mod;
			for (let i = 0; i < 18; i++)
				(row = Math.floor(i / 3)),
					(col = (i % 3) + size - 8 - 3),
					(mod = ((bits >> i) & 1) === 1),
					matrix.set(row, col, mod, !0),
					matrix.set(col, row, mod, !0);
		}
		function setupFormatInfo(matrix, errorCorrectionLevel, maskPattern) {
			let size = matrix.size,
				bits = FormatInfo.getEncodedBits(errorCorrectionLevel, maskPattern),
				i,
				mod;
			for (i = 0; i < 15; i++)
				(mod = ((bits >> i) & 1) === 1),
					i < 6
						? matrix.set(i, 8, mod, !0)
						: i < 8
							? matrix.set(i + 1, 8, mod, !0)
							: matrix.set(size - 15 + i, 8, mod, !0),
					i < 8
						? matrix.set(8, size - i - 1, mod, !0)
						: i < 9
							? matrix.set(8, 15 - i - 1 + 1, mod, !0)
							: matrix.set(8, 15 - i - 1, mod, !0);
			matrix.set(size - 8, 8, 1, !0);
		}
		function setupData(matrix, data) {
			let size = matrix.size,
				inc = -1,
				row = size - 1,
				bitIndex = 7,
				byteIndex = 0;
			for (let col = size - 1; col > 0; col -= 2)
				for (col === 6 && col--; ; ) {
					for (let c = 0; c < 2; c++)
						if (!matrix.isReserved(row, col - c)) {
							let dark = !1;
							byteIndex < data.length &&
								(dark = ((data[byteIndex] >>> bitIndex) & 1) === 1),
								matrix.set(row, col - c, dark),
								bitIndex--,
								bitIndex === -1 && (byteIndex++, (bitIndex = 7));
						}
					if (((row += inc), row < 0 || size <= row)) {
						(row -= inc), (inc = -inc);
						break;
					}
				}
		}
		function createData(version, errorCorrectionLevel, segments) {
			const buffer = new BitBuffer();
			segments.forEach((data) => {
				buffer.put(data.mode.bit, 4),
					buffer.put(
						data.getLength(),
						Mode.getCharCountIndicator(data.mode, version),
					),
					data.write(buffer);
			});
			const totalCodewords = Utils.getSymbolTotalCodewords(version),
				ecTotalCodewords = ECCode.getTotalCodewordsCount(
					version,
					errorCorrectionLevel,
				),
				dataTotalCodewordsBits = (totalCodewords - ecTotalCodewords) * 8;
			for (
				buffer.getLengthInBits() + 4 <= dataTotalCodewordsBits &&
				buffer.put(0, 4);
				buffer.getLengthInBits() % 8 !== 0;
			)
				buffer.putBit(0);
			const remainingByte =
				(dataTotalCodewordsBits - buffer.getLengthInBits()) / 8;
			for (let i = 0; i < remainingByte; i++) buffer.put(i % 2 ? 17 : 236, 8);
			return createCodewords(buffer, version, errorCorrectionLevel);
		}
		function createCodewords(bitBuffer, version, errorCorrectionLevel) {
			let totalCodewords = Utils.getSymbolTotalCodewords(version),
				ecTotalCodewords = ECCode.getTotalCodewordsCount(
					version,
					errorCorrectionLevel,
				),
				dataTotalCodewords = totalCodewords - ecTotalCodewords,
				ecTotalBlocks = ECCode.getBlocksCount(version, errorCorrectionLevel),
				blocksInGroup2 = totalCodewords % ecTotalBlocks,
				blocksInGroup1 = ecTotalBlocks - blocksInGroup2,
				totalCodewordsInGroup1 = Math.floor(totalCodewords / ecTotalBlocks),
				dataCodewordsInGroup1 = Math.floor(dataTotalCodewords / ecTotalBlocks),
				dataCodewordsInGroup2 = dataCodewordsInGroup1 + 1,
				ecCount = totalCodewordsInGroup1 - dataCodewordsInGroup1,
				rs = new ReedSolomonEncoder(ecCount),
				offset = 0,
				dcData = new Array(ecTotalBlocks),
				ecData = new Array(ecTotalBlocks),
				maxDataSize = 0,
				buffer = new Uint8Array(bitBuffer.buffer);
			for (let b = 0; b < ecTotalBlocks; b++) {
				const dataSize =
					b < blocksInGroup1 ? dataCodewordsInGroup1 : dataCodewordsInGroup2;
				(dcData[b] = buffer.slice(offset, offset + dataSize)),
					(ecData[b] = rs.encode(dcData[b])),
					(offset += dataSize),
					(maxDataSize = Math.max(maxDataSize, dataSize));
			}
			let data = new Uint8Array(totalCodewords),
				index = 0,
				i,
				r;
			for (i = 0; i < maxDataSize; i++)
				for (r = 0; r < ecTotalBlocks; r++)
					i < dcData[r].length && (data[index++] = dcData[r][i]);
			for (i = 0; i < ecCount; i++)
				for (r = 0; r < ecTotalBlocks; r++) data[index++] = ecData[r][i];
			return data;
		}
		function createSymbol(data, version, errorCorrectionLevel, maskPattern) {
			let segments;
			if (Array.isArray(data)) segments = Segments.fromArray(data);
			else if (typeof data == "string") {
				let estimatedVersion = version;
				if (!estimatedVersion) {
					const rawSegments = Segments.rawSplit(data);
					estimatedVersion = Version.getBestVersionForData(
						rawSegments,
						errorCorrectionLevel,
					);
				}
				segments = Segments.fromString(data, estimatedVersion || 40);
			} else throw new Error("Invalid data");
			const bestVersion = Version.getBestVersionForData(
				segments,
				errorCorrectionLevel,
			);
			if (!bestVersion)
				throw new Error(
					"The amount of data is too big to be stored in a QR Code",
				);
			if (!version) version = bestVersion;
			else if (version < bestVersion)
				throw new Error(
					`
The chosen QR Code version cannot contain this amount of data.
Minimum version required to store current data is: ` +
						bestVersion +
						`.
`,
				);
			const dataBits = createData(version, errorCorrectionLevel, segments),
				moduleCount = Utils.getSymbolSize(version),
				modules = new BitMatrix(moduleCount);
			return (
				setupFinderPattern(modules, version),
				setupTimingPattern(modules),
				setupAlignmentPattern(modules, version),
				setupFormatInfo(modules, errorCorrectionLevel, 0),
				version >= 7 && setupVersionInfo(modules, version),
				setupData(modules, dataBits),
				isNaN(maskPattern) &&
					(maskPattern = MaskPattern.getBestMask(
						modules,
						setupFormatInfo.bind(null, modules, errorCorrectionLevel),
					)),
				MaskPattern.applyMask(maskPattern, modules),
				setupFormatInfo(modules, errorCorrectionLevel, maskPattern),
				{
					modules,
					version,
					errorCorrectionLevel,
					maskPattern,
					segments,
				}
			);
		}
		exports.create = (data, options) => {
			if (typeof data > "u" || data === "") throw new Error("No input text");
			let errorCorrectionLevel = ECLevel.M,
				version,
				mask;
			return (
				typeof options < "u" &&
					((errorCorrectionLevel = ECLevel.from(
						options.errorCorrectionLevel,
						ECLevel.M,
					)),
					(version = Version.from(options.version)),
					(mask = MaskPattern.from(options.maskPattern)),
					options.toSJISFunc && Utils.setToSJISFunction(options.toSJISFunc)),
				createSymbol(data, version, errorCorrectionLevel, mask)
			);
		};
	},
});

// node_modules/qrcode/lib/renderer/utils.js
var require_utils2 = __commonJS({
	"node_modules/qrcode/lib/renderer/utils.js"(exports) {
		function hex2rgba(hex) {
			if (
				(typeof hex == "number" && (hex = hex.toString()),
				typeof hex != "string")
			)
				throw new Error("Color should be defined as hex string");
			let hexCode = hex.slice().replace("#", "").split("");
			if (hexCode.length < 3 || hexCode.length === 5 || hexCode.length > 8)
				throw new Error("Invalid hex color: " + hex);
			(hexCode.length === 3 || hexCode.length === 4) &&
				(hexCode = Array.prototype.concat.apply(
					[],
					hexCode.map((c) => [c, c]),
				)),
				hexCode.length === 6 && hexCode.push("F", "F");
			const hexValue = parseInt(hexCode.join(""), 16);
			return {
				r: (hexValue >> 24) & 255,
				g: (hexValue >> 16) & 255,
				b: (hexValue >> 8) & 255,
				a: hexValue & 255,
				hex: "#" + hexCode.slice(0, 6).join(""),
			};
		}
		exports.getOptions = (options) => {
			options || (options = {}), options.color || (options.color = {});
			const margin =
					typeof options.margin > "u" ||
					options.margin === null ||
					options.margin < 0
						? 4
						: options.margin,
				width = options.width && options.width >= 21 ? options.width : void 0,
				scale = options.scale || 4;
			return {
				width,
				scale: width ? 4 : scale,
				margin,
				color: {
					dark: hex2rgba(options.color.dark || "#000000ff"),
					light: hex2rgba(options.color.light || "#ffffffff"),
				},
				type: options.type,
				rendererOpts: options.rendererOpts || {},
			};
		};
		exports.getScale = (qrSize, opts) => opts.width && opts.width >= qrSize + opts.margin * 2
				? opts.width / (qrSize + opts.margin * 2)
				: opts.scale;
		exports.getImageWidth = (qrSize, opts) => {
			const scale = exports.getScale(qrSize, opts);
			return Math.floor((qrSize + opts.margin * 2) * scale);
		};
		exports.qrToImageData = (imgData, qr, opts) => {
			const size = qr.modules.size,
				data = qr.modules.data,
				scale = exports.getScale(size, opts),
				symbolSize = Math.floor((size + opts.margin * 2) * scale),
				scaledMargin = opts.margin * scale,
				palette = [opts.color.light, opts.color.dark];
			for (let i = 0; i < symbolSize; i++)
				for (let j = 0; j < symbolSize; j++) {
					let posDst = (i * symbolSize + j) * 4,
						pxColor = opts.color.light;
					if (
						i >= scaledMargin &&
						j >= scaledMargin &&
						i < symbolSize - scaledMargin &&
						j < symbolSize - scaledMargin
					) {
						const iSrc = Math.floor((i - scaledMargin) / scale),
							jSrc = Math.floor((j - scaledMargin) / scale);
						pxColor = palette[data[iSrc * size + jSrc] ? 1 : 0];
					}
					(imgData[posDst++] = pxColor.r),
						(imgData[posDst++] = pxColor.g),
						(imgData[posDst++] = pxColor.b),
						(imgData[posDst] = pxColor.a);
				}
		};
	},
});

// node_modules/qrcode/lib/renderer/canvas.js
var require_canvas = __commonJS({
	"node_modules/qrcode/lib/renderer/canvas.js"(exports) {
		var Utils = require_utils2();
		function clearCanvas(ctx, canvas, size) {
			ctx.clearRect(0, 0, canvas.width, canvas.height),
				canvas.style || (canvas.style = {}),
				(canvas.height = size),
				(canvas.width = size),
				(canvas.style.height = size + "px"),
				(canvas.style.width = size + "px");
		}
		function getCanvasElement() {
			try {
				return document.createElement("canvas");
			} catch {
				throw new Error("You need to specify a canvas element");
			}
		}
		exports.render = (qrData, canvas, options) => {
			let opts = options,
				canvasEl = canvas;
			typeof opts > "u" &&
				(!canvas || !canvas.getContext) &&
				((opts = canvas), (canvas = void 0)),
				canvas || (canvasEl = getCanvasElement()),
				(opts = Utils.getOptions(opts));
			const size = Utils.getImageWidth(qrData.modules.size, opts),
				ctx = canvasEl.getContext("2d"),
				image = ctx.createImageData(size, size);
			return (
				Utils.qrToImageData(image.data, qrData, opts),
				clearCanvas(ctx, canvasEl, size),
				ctx.putImageData(image, 0, 0),
				canvasEl
			);
		};
		exports.renderToDataURL = (qrData, canvas, options) => {
			let opts = options;
			typeof opts > "u" &&
				(!canvas || !canvas.getContext) &&
				((opts = canvas), (canvas = void 0)),
				opts || (opts = {});
			const canvasEl = exports.render(qrData, canvas, opts),
				type = opts.type || "image/png",
				rendererOpts = opts.rendererOpts || {};
			return canvasEl.toDataURL(type, rendererOpts.quality);
		};
	},
});

// node_modules/qrcode/lib/renderer/svg-tag.js
var require_svg_tag = __commonJS({
	"node_modules/qrcode/lib/renderer/svg-tag.js"(exports) {
		var Utils = require_utils2();
		function getColorAttrib(color, attrib) {
			const alpha = color.a / 255,
				str = attrib + '="' + color.hex + '"';
			return alpha < 1
				? str + " " + attrib + '-opacity="' + alpha.toFixed(2).slice(1) + '"'
				: str;
		}
		function svgCmd(cmd, x, y) {
			let str = cmd + x;
			return (typeof y < "u" && (str += " " + y), str);
		}
		function qrToPath(data, size, margin) {
			let path = "",
				moveBy = 0,
				newRow = !1,
				lineLength = 0;
			for (let i = 0; i < data.length; i++) {
				const col = Math.floor(i % size),
					row = Math.floor(i / size);
				!col && !newRow && (newRow = !0),
					data[i]
						? (lineLength++,
							(i > 0 && col > 0 && data[i - 1]) ||
								((path += newRow
									? svgCmd("M", col + margin, 0.5 + row + margin)
									: svgCmd("m", moveBy, 0)),
								(moveBy = 0),
								(newRow = !1)),
							(col + 1 < size && data[i + 1]) ||
								((path += svgCmd("h", lineLength)), (lineLength = 0)))
						: moveBy++;
			}
			return path;
		}
		exports.render = (qrData, options, cb) => {
			const opts = Utils.getOptions(options),
				size = qrData.modules.size,
				data = qrData.modules.data,
				qrcodesize = size + opts.margin * 2,
				bg = opts.color.light.a
					? "<path " +
						getColorAttrib(opts.color.light, "fill") +
						' d="M0 0h' +
						qrcodesize +
						"v" +
						qrcodesize +
						'H0z"/>'
					: "",
				path =
					"<path " +
					getColorAttrib(opts.color.dark, "stroke") +
					' d="' +
					qrToPath(data, size, opts.margin) +
					'"/>',
				viewBox = 'viewBox="0 0 ' + qrcodesize + " " + qrcodesize + '"',
				svgTag =
					'<svg xmlns="http://www.w3.org/2000/svg" ' +
					(opts.width
						? 'width="' + opts.width + '" height="' + opts.width + '" '
						: "") +
					viewBox +
					' shape-rendering="crispEdges">' +
					bg +
					path +
					`</svg>
`;
			return (typeof cb == "function" && cb(null, svgTag), svgTag);
		};
	},
});

// node_modules/qrcode/lib/browser.js
var require_browser = __commonJS({
	"node_modules/qrcode/lib/browser.js"(exports) {
		var canPromise = require_can_promise(),
			QRCode2 = require_qrcode(),
			CanvasRenderer = require_canvas(),
			SvgRenderer = require_svg_tag();
		function renderCanvas(renderFunc, canvas, text, opts, cb) {
			const args = [].slice.call(arguments, 1),
				argsNum = args.length,
				isLastArgCb = typeof args[argsNum - 1] == "function";
			if (!isLastArgCb && !canPromise())
				throw new Error("Callback required as last argument");
			if (isLastArgCb) {
				if (argsNum < 2) throw new Error("Too few arguments provided");
				argsNum === 2
					? ((cb = text), (text = canvas), (canvas = opts = void 0))
					: argsNum === 3 &&
						(canvas.getContext && typeof cb > "u"
							? ((cb = opts), (opts = void 0))
							: ((cb = opts),
								(opts = text),
								(text = canvas),
								(canvas = void 0)));
			} else {
				if (argsNum < 1) throw new Error("Too few arguments provided");
				return (
					argsNum === 1
						? ((text = canvas), (canvas = opts = void 0))
						: argsNum === 2 &&
							!canvas.getContext &&
							((opts = text), (text = canvas), (canvas = void 0)),
					new Promise((resolve, reject) => {
						try {
							const data = QRCode2.create(text, opts);
							resolve(renderFunc(data, canvas, opts));
						} catch (e) {
							reject(e);
						}
					})
				);
			}
			try {
				const data = QRCode2.create(text, opts);
				cb(null, renderFunc(data, canvas, opts));
			} catch (e) {
				cb(e);
			}
		}
		exports.create = QRCode2.create;
		exports.toCanvas = renderCanvas.bind(null, CanvasRenderer.render);
		exports.toDataURL = renderCanvas.bind(null, CanvasRenderer.renderToDataURL);
		exports.toString = renderCanvas.bind(null, (data, _, opts) => SvgRenderer.render(data, opts));
	},
});

// src/shared/optical-error.ts
var ENGLISH_ERRORS = {
	fileEmpty: "Choose a non-empty file.",
	fileOverLimit: (limit) =>
		`Files are limited to ${limit} in this browser build.`,
	fileNameTooLong: "The file name or media type is too long.",
	inflateOverflow: "The recovered file expands past its declared length.",
	containerTruncated: "The recovered file header is incomplete.",
	containerBadMagic: "The recovered file header is invalid.",
	containerBadCompression: "The recovered file uses unsupported compression.",
	containerLengthMismatch:
		"The recovered file length does not match its header.",
	gzipIncomplete: "The recovered gzip payload is incomplete.",
	gzipLengthMismatch: "The gzip payload length does not match its file header.",
	decompressedLengthMismatch:
		"The decompressed file length does not match its header.",
	streamChecksumMismatch: "The optical stream checksum did not match.",
	sha256Failed: "The recovered file failed SHA-256 verification.",
	snippetEmpty: "Paste or type some text before sending.",
	snippetOverLimit: (limit) => `Text snippets are limited to ${limit}.`,
	snippetNotText: "This stream is not a text snippet.",
	snippetBadUtf8: "The recovered snippet is not valid UTF-8.",
};
function errorText(table, code, params) {
	const entry = table[code];
	return typeof entry == "function" ? entry(params.limit ?? "") : entry;
}
var OpticalError = class extends Error {
	constructor(code, params = {}) {
		super(errorText(ENGLISH_ERRORS, code, params));
		this.code = code;
		this.params = params;
		this.name = "OpticalError";
	}
	code;
	params;
};

// src/shared/protocol.ts
var HEADER_LEN = 22,
	MAGIC0 = 209,
	MAGIC1 = 195,
	LEGACY_MAGIC1 = /* @__PURE__ */ new Map([
		[12, 1],
		[13, 2],
	]),
	WIRE_VERSION = 3,
	CRITICAL_FLAGS = 15,
	FLAG_ENCRYPTED = 1,
	SUPPORTED_FLAGS = 0,
	MAX_FILE_BYTES = 64 * 1024 * 1024,
	MAX_FILE_LABEL = `${MAX_FILE_BYTES / 1024 / 1024} MB`,
	FILE_HEADER_LEN = 49,
	FILE_MAGIC = new Uint8Array([68, 67, 70, 50]),
	textEncoder = new TextEncoder(),
	textDecoder = new TextDecoder();
async function digest(bytes) {
	const stableBytes = Uint8Array.from(bytes);
	return new Uint8Array(await crypto.subtle.digest("SHA-256", stableBytes));
}
async function gzipAsync(bytes) {
	const compressed = new Blob([bytes])
		.stream()
		.pipeThrough(new CompressionStream("gzip"));
	return new Uint8Array(await new Response(compressed).arrayBuffer());
}
async function gunzipAsync(bytes, maxBytes) {
	let reader = new Blob([bytes])
			.stream()
			.pipeThrough(new DecompressionStream("gzip"))
			.getReader(),
		chunks = [],
		total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		if (((total += value.length), total > maxBytes))
			throw (await reader.cancel(), new OpticalError("inflateOverflow"));
		chunks.push(value);
	}
	let out = new Uint8Array(total),
		offset = 0;
	for (const chunk of chunks) out.set(chunk, offset), (offset += chunk.length);
	return out;
}
function safeFileName(name) {
	const cleaned = (name.split(/[\\/]/).pop() ?? "")
		.replace(/[\u0000-\u001f\u007f]/g, "")
		.trim();
	return cleaned === "" || cleaned === "." || cleaned === ".."
		? "transfer.bin"
		: cleaned;
}
var PRECOMPRESSED_TYPES = /* @__PURE__ */ new Set([
		"application/gzip",
		"application/java-archive",
		"application/vnd.rar",
		"application/x-7z-compressed",
		"application/x-brotli",
		"application/x-bzip",
		"application/x-bzip2",
		"application/x-gzip",
		"application/x-lzma",
		"application/x-rar-compressed",
		"application/x-xz",
		"application/x-zip-compressed",
		"application/zip",
		"application/zstd",
	]),
	COMPRESSIBLE_IMAGES =
		/^image\/(bmp|x-ms-bmp|svg\+xml|tiff|x-icon|vnd\.microsoft\.icon)$/,
	COMPRESSIBLE_AUDIO =
		/^audio\/(wav|x-wav|wave|vnd\.wave|aiff|x-aiff|basic|l16)$/;
function isPrecompressedType(type) {
	const media = type.split(";")[0].trim().toLowerCase();
	return media.startsWith("video/")
		? !0
		: media.startsWith("image/")
			? !COMPRESSIBLE_IMAGES.test(media)
			: media.startsWith("audio/")
				? !COMPRESSIBLE_AUDIO.test(media)
				: media.startsWith("application/vnd.openxmlformats-officedocument.") ||
						media.startsWith("application/vnd.oasis.opendocument.") ||
						media.endsWith("+zip")
					? !0
					: PRECOMPRESSED_TYPES.has(media);
}
async function packFile(name, type, bytes) {
	if (bytes.length === 0) throw new OpticalError("fileEmpty");
	if (bytes.length > MAX_FILE_BYTES)
		throw new OpticalError("fileOverLimit", { limit: MAX_FILE_LABEL });
	const nameBytes = textEncoder.encode(safeFileName(name)),
		typeBytes = textEncoder.encode(type || "application/octet-stream");
	if (nameBytes.length > 65535 || typeBytes.length > 65535)
		throw new OpticalError("fileNameTooLong");
	const tryGzip = bytes.length >= 768 && !isPrecompressedType(type),
		[sha256, compressed] = await Promise.all([
			digest(bytes),
			tryGzip ? gzipAsync(bytes) : Promise.resolve(void 0),
		]),
		useGzip = compressed !== void 0 && compressed.length + 64 < bytes.length,
		transmitted = useGzip ? compressed : bytes,
		compression = useGzip ? "gzip" : "none",
		out = new Uint8Array(
			FILE_HEADER_LEN +
				nameBytes.length +
				typeBytes.length +
				transmitted.length,
		),
		view = new DataView(out.buffer);
	return (
		out.set(FILE_MAGIC, 0),
		view.setUint8(4, useGzip ? 1 : 0),
		view.setUint16(5, nameBytes.length, !0),
		view.setUint16(7, typeBytes.length, !0),
		view.setUint32(9, bytes.length, !0),
		view.setUint32(13, transmitted.length, !0),
		out.set(sha256, 17),
		out.set(nameBytes, FILE_HEADER_LEN),
		out.set(typeBytes, FILE_HEADER_LEN + nameBytes.length),
		out.set(transmitted, FILE_HEADER_LEN + nameBytes.length + typeBytes.length),
		{
			container: out,
			compression,
			originalSize: bytes.length,
			transmittedSize: transmitted.length,
		}
	);
}
async function unpackFile(container) {
	if (container.length < FILE_HEADER_LEN)
		throw new OpticalError("containerTruncated");
	for (let i = 0; i < FILE_MAGIC.length; i++)
		if (container[i] !== FILE_MAGIC[i])
			throw new OpticalError("containerBadMagic");
	const view = new DataView(
			container.buffer,
			container.byteOffset,
			container.byteLength,
		),
		compressionByte = view.getUint8(4);
	if (compressionByte > 1) throw new OpticalError("containerBadCompression");
	const compression = compressionByte === 1 ? "gzip" : "none",
		nameLength = view.getUint16(5, !0),
		typeLength = view.getUint16(7, !0),
		fileLength = view.getUint32(9, !0),
		transmittedLength = view.getUint32(13, !0),
		dataOffset = FILE_HEADER_LEN + nameLength + typeLength;
	if (
		fileLength === 0 ||
		fileLength > MAX_FILE_BYTES ||
		transmittedLength === 0 ||
		transmittedLength > MAX_FILE_BYTES ||
		dataOffset + transmittedLength !== container.length
	)
		throw new OpticalError("containerLengthMismatch");
	const transmitted = container.slice(dataOffset);
	if (compression === "gzip") {
		if (transmitted.length < 18) throw new OpticalError("gzipIncomplete");
		if (
			new DataView(
				transmitted.buffer,
				transmitted.byteOffset + transmitted.byteLength - 4,
				4,
			).getUint32(0, !0) !== fileLength
		)
			throw new OpticalError("gzipLengthMismatch");
	}
	const bytes =
		compression === "gzip"
			? await gunzipAsync(transmitted, fileLength)
			: transmitted;
	if (bytes.length !== fileLength)
		throw new OpticalError("decompressedLengthMismatch");
	return {
		name: safeFileName(
			textDecoder.decode(
				container.subarray(FILE_HEADER_LEN, FILE_HEADER_LEN + nameLength),
			),
		),
		type:
			textDecoder.decode(
				container.subarray(FILE_HEADER_LEN + nameLength, dataOffset),
			) || "application/octet-stream",
		sha256: container.slice(17, 49),
		bytes,
		compression,
		transmittedSize: transmittedLength,
	};
}
async function verifyFile(file) {
	return (await digest(file.bytes)).every(
		(value, index) => value === file.sha256[index],
	);
}
function packFrame(h, block) {
	const out = new Uint8Array(HEADER_LEN + block.length),
		dv = new DataView(out.buffer);
	return (
		dv.setUint8(0, MAGIC0),
		dv.setUint8(1, MAGIC1),
		dv.setUint8(2, WIRE_VERSION),
		dv.setUint8(3, h.flags),
		dv.setUint16(4, h.sessionId, !0),
		dv.setUint32(6, h.seq, !0),
		dv.setUint16(10, h.k, !0),
		dv.setUint16(12, h.blockLen, !0),
		dv.setUint32(14, h.totalLen, !0),
		dv.setUint32(18, h.payloadFnv, !0),
		out.set(block, HEADER_LEN),
		out
	);
}
function classifyFrame(bytes) {
	if (bytes.length < 4 || bytes[0] !== MAGIC0) return { kind: "foreign" };
	if (bytes[1] !== MAGIC1) {
		const legacy = LEGACY_MAGIC1.get(bytes[1]);
		return legacy === void 0
			? { kind: "foreign" }
			: { kind: "older-sender", version: legacy };
	}
	const version = bytes[2];
	if (version === 0) return { kind: "malformed" };
	if (version !== WIRE_VERSION)
		return version > WIRE_VERSION
			? { kind: "newer-sender", version }
			: { kind: "older-sender", version };
	const unknownCritical = bytes[3] & CRITICAL_FLAGS & ~SUPPORTED_FLAGS;
	if (unknownCritical !== 0)
		return { kind: "unsupported-flags", flags: unknownCritical };
	if (bytes.length <= HEADER_LEN) return { kind: "malformed" };
	const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
		k = dv.getUint16(10, !0),
		blockLen = dv.getUint16(12, !0),
		totalLen = dv.getUint32(14, !0);
	return k === 0 || blockLen === 0 || totalLen === 0
		? { kind: "malformed" }
		: bytes.length !== HEADER_LEN + blockLen
			? { kind: "malformed" }
			: { kind: "ok" };
}
function frameVerdictMessage(verdict) {
	switch (verdict.kind) {
		case "older-sender":
			return `That screen is sending an older Decimen format (v${verdict.version}). Update the sending device.`;
		case "newer-sender":
			return `That screen is sending a newer Decimen format (v${verdict.version}). Update this app to receive it.`;
		case "unsupported-flags":
			return "That stream uses a Decimen feature this version cannot read. Update this app to receive it.";
		default:
			return null;
	}
}
function parseFrame(bytes) {
	if (classifyFrame(bytes).kind !== "ok") return null;
	const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	return {
		header: {
			sessionId: dv.getUint16(4, !0),
			seq: dv.getUint32(6, !0),
			k: dv.getUint16(10, !0),
			blockLen: dv.getUint16(12, !0),
			totalLen: dv.getUint32(14, !0),
			payloadFnv: dv.getUint32(18, !0),
			flags: dv.getUint8(3),
		},
		block: bytes.subarray(HEADER_LEN),
	};
}
function streamIdentity(h) {
	const critical = h.flags & CRITICAL_FLAGS;
	return `${h.sessionId}:${h.k}:${h.blockLen}:${h.totalLen}:${h.payloadFnv}:${critical}`;
}
function fnv1a(bytes) {
	let h = 2166136261;
	for (let i = 0; i < bytes.length; i++)
		(h ^= bytes[i]), (h = Math.imul(h, 16777619));
	return h >>> 0;
}
function splitmix32(seed) {
	let s = seed | 0;
	return () => {
		s = (s + 2654435769) | 0;
		let t = s ^ (s >>> 16);
		return (
			(t = Math.imul(t, 569420461)),
			(t ^= t >>> 15),
			(t = Math.imul(t, 1935289751)),
			(t ^= t >>> 15),
			t >>> 0
		);
	};
}

// src/shared/fountain.ts
var LN2 = 0.6931471805599453;
function dlog(x) {
	let e = 0,
		m = x;
	for (; m >= 1.5; ) (m /= 2), e++;
	for (; m < 0.75; ) (m *= 2), e--;
	let z = (m - 1) / (m + 1),
		z2 = z * z,
		term = z,
		sum = 0;
	for (let n = 1; n <= 21; n += 2) (sum += term / n), (term *= z2);
	return e * LN2 + 2 * sum;
}
var SOLITON_C = 0.1,
	SOLITON_DELTA = 0.5;
function solitonCdf(k) {
	const cdf = new Float64Array(k);
	if (k === 1) return ((cdf[0] = 1), cdf);
	let R = Math.max(1, SOLITON_C * dlog(k / SOLITON_DELTA) * Math.sqrt(k)),
		spike = Math.min(k, Math.ceil(k / R)),
		total = 0;
	for (let d = 1; d <= k; d++) {
		let rho = d === 1 ? 1 / k : 1 / (d * (d - 1)),
			tau = 0;
		d < spike
			? (tau = R / (d * k))
			: d === spike && (tau = (R * Math.max(0, dlog(R / SOLITON_DELTA))) / k),
			(total += rho + tau),
			(cdf[d - 1] = total);
	}
	for (let i = 0; i < k; i++) cdf[i] = cdf[i] / total;
	return ((cdf[k - 1] = 1), cdf);
}
function frameSeed(sessionId, seq) {
	let h = (Math.imul(sessionId + 1, 2654435761) ^ (seq + 2246822507)) | 0;
	return ((h = Math.imul(h ^ (h >>> 13), 3266489909)), (h ^ (h >>> 16)) | 0);
}
function frameIndices(k, cdf, sessionId, seq) {
	let rnd = splitmix32(frameSeed(sessionId, seq)),
		u = rnd() * 2 ** -32,
		lo = 0,
		hi = k - 1;
	for (; lo < hi; ) {
		const mid = (lo + hi) >> 1;
		cdf[mid] >= u ? (hi = mid) : (lo = mid + 1);
	}
	const d = Math.min(k, lo + 1);
	if (d > k >> 3) {
		const scratch = new Uint32Array(k);
		for (let i = 0; i < k; i++) scratch[i] = i;
		const out = new Array(d);
		for (let i = 0; i < d; i++) {
			const j = i + (rnd() % (k - i)),
				t = scratch[i];
			(scratch[i] = scratch[j]), (scratch[j] = t), (out[i] = scratch[i]);
		}
		return out;
	}
	const set = /* @__PURE__ */ new Set();
	for (; set.size < d; ) set.add(rnd() % k);
	return [...set];
}
function cycleLength(k) {
	return 2 * k;
}
var REPAIR_DEGREE_MIN = 4,
	REPAIR_DEGREE_MAX = 24;
function repairIndices(k, sessionId, seq) {
	const rnd = splitmix32(frameSeed(sessionId, seq)),
		d = Math.min(
			k,
			REPAIR_DEGREE_MIN + (rnd() % (REPAIR_DEGREE_MAX - REPAIR_DEGREE_MIN + 1)),
		),
		set = /* @__PURE__ */ new Set();
	for (; set.size < d; ) set.add(rnd() % k);
	return [...set];
}
function frameComposition(k, sessionId, seq) {
	const pos = seq % cycleLength(k);
	return pos < k ? [pos] : repairIndices(k, sessionId, seq);
}
function xorInto(dst, src) {
	for (let i = 0; i < dst.length; i++) dst[i] = (dst[i] ^ src[i]) >>> 0;
}
var LTEncoder = class {
		constructor(payload, blockLen, sessionId) {
			this.blockLen = blockLen;
			this.sessionId = sessionId;
			(this.k = Math.max(1, Math.ceil(payload.length / blockLen))),
				(this.words = Math.ceil(blockLen / 4)),
				(this.blocks = new Uint32Array(this.k * this.words));
			const bytes = new Uint8Array(this.blocks.buffer);
			for (let b = 0; b < this.k; b++) {
				const src = payload.subarray(
					b * blockLen,
					Math.min((b + 1) * blockLen, payload.length),
				);
				bytes.set(src, b * this.words * 4);
			}
		}
		blockLen;
		sessionId;
		k;
		words;
		blocks;
		encode(seq) {
			const idx = frameComposition(this.k, this.sessionId, seq),
				out = new Uint32Array(this.words);
			for (const b of idx) {
				const off = b * this.words;
				for (let w = 0; w < this.words; w++)
					out[w] = (out[w] ^ this.blocks[off + w]) >>> 0;
			}
			return new Uint8Array(out.buffer, 0, this.blockLen);
		}
	},
	LTDecoder = class {
		constructor(k, blockLen, sessionId, totalLen) {
			this.k = k;
			this.blockLen = blockLen;
			this.sessionId = sessionId;
			this.totalLen = totalLen;
			(this.words = Math.ceil(blockLen / 4)),
				(this.solved = new Array(k).fill(null));
		}
		k;
		blockLen;
		sessionId;
		totalLen;
		words;
		solved;
		byBlock = /* @__PURE__ */ new Map();
		seen = /* @__PURE__ */ new Set();
		solvedCount = 0;
		framesNew = 0;
		framesDup = 0;
		/** Frames with a NEW seq that carried no new information — every block
		 *  they cover was already solved. Rare at high catch rates, but a lossy
		 *  multi-code receiver sees the carousel re-sweep blocks it has, and a
		 *  progress bar fed raw framesNew inflates by exactly that fraction
		 *  (measured 96% shown vs ~50% real on a 30%-catch 4-code run). */
		framesRedundant = 0;
		get isComplete() {
			return this.solvedCount >= this.k;
		}
		addFrame(seq, block) {
			if (this.seen.has(seq)) {
				this.framesDup++;
				return;
			}
			if ((this.seen.add(seq), this.framesNew++, this.isComplete)) return;
			const idx = new Set(frameComposition(this.k, this.sessionId, seq)),
				words = new Uint32Array(this.words);
			new Uint8Array(words.buffer).set(block.subarray(0, this.blockLen));
			for (const b of [...idx]) {
				const s = this.solved[b];
				s && (xorInto(words, s), idx.delete(b));
			}
			if (idx.size === 0) {
				this.framesRedundant++;
				return;
			}
			if (idx.size === 1) {
				this.resolve(idx.values().next().value, words);
				return;
			}
			const pf = { idx, words };
			for (const b of idx) {
				let set = this.byBlock.get(b);
				set || ((set = /* @__PURE__ */ new Set()), this.byBlock.set(b, set)),
					set.add(pf);
			}
		}
		/** Peeling cascade: solve a block, reduce every frame waiting on it, repeat.
		 * Note for progress UX: this cascade back-loads — blocks solved hockey-
		 * sticks near the end while frame ARRIVAL is linear. Show frames collected,
		 * not blocks solved, or your progress bar will look stalled then teleport. */
		resolve(b0, w0) {
			const queue = [[b0, w0]];
			for (; queue.length > 0; ) {
				const [b, w] = queue.pop();
				if (this.solved[b]) continue;
				(this.solved[b] = w), this.solvedCount++;
				const waiting = this.byBlock.get(b);
				if (waiting) {
					this.byBlock.delete(b);
					for (const pf of waiting)
						if ((xorInto(pf.words, w), pf.idx.delete(b), pf.idx.size === 1)) {
							const r = pf.idx.values().next().value;
							this.byBlock.get(r)?.delete(pf),
								this.solved[r] || queue.push([r, pf.words]);
						}
				}
			}
		}
		assemble() {
			if (!this.isComplete) return null;
			const out = new Uint8Array(this.totalLen);
			for (let b = 0; b < this.k; b++) {
				const start = b * this.blockLen,
					len = Math.min(this.blockLen, this.totalLen - start);
				len > 0 &&
					out.set(new Uint8Array(this.solved[b].buffer, 0, len), start);
			}
			return out;
		}
	};

// src/shared/frame-capacity.ts
var MAX_SOURCE_BLOCKS = 65535;
function blockLength(frameBytes) {
	return frameBytes - HEADER_LEN;
}
function sourceBlockCount(payloadBytes, frameBytes) {
	return Math.ceil(payloadBytes / blockLength(frameBytes));
}
function fitsInOneStream(payloadBytes, frameBytes) {
	return sourceBlockCount(payloadBytes, frameBytes) <= MAX_SOURCE_BLOCKS;
}
function minimumFrameBytes(payloadBytes) {
	return Math.ceil(payloadBytes / MAX_SOURCE_BLOCKS) + HEADER_LEN;
}
function smallestSufficientFrameSize(payloadBytes, options) {
	const minimum = minimumFrameBytes(payloadBytes);
	return options.filter((value) => value >= minimum).sort((a, b) => a - b)[0];
}

// src/shared/qr-raster.ts
function rasterizeQr(moduleCount, modules, margin) {
	const size = moduleCount + 2 * margin,
		pixels = new Uint32Array(size * size);
	pixels.fill(4294967295);
	for (let y = 0; y < moduleCount; y++) {
		const row = (y + margin) * size + margin,
			src = y * moduleCount;
		for (let x = 0; x < moduleCount; x++)
			modules[src + x] && (pixels[row + x] = 4278190080);
	}
	return { size, pixels };
}
function gridDims(count) {
	const cols = Math.floor(Math.sqrt(count)),
		rows = Math.ceil(count / Math.max(1, cols));
	if (count < 1 || cols * rows !== count)
		throw new Error(
			`grid needs a count that fills its rows (1, 2, 4, 6, 9\u2026), got ${count}`,
		);
	return { cols, rows };
}
function rasterizeQrGrid(moduleCount, matrices, margin) {
	const { cols, rows } = gridDims(matrices.length),
		cell = moduleCount + 2 * margin,
		width = cols * cell,
		height = rows * cell,
		pixels = new Uint32Array(width * height);
	return (
		pixels.fill(4294967295),
		matrices.forEach((modules, i) => {
			const ox = (i % cols) * cell + margin,
				oy = Math.floor(i / cols) * cell + margin;
			for (let y = 0; y < moduleCount; y++) {
				const row = (y + oy) * width + ox,
					src = y * moduleCount;
				for (let x = 0; x < moduleCount; x++)
					modules[src + x] && (pixels[row + x] = 4278190080);
			}
		}),
		{ width, height, pixels }
	);
}

// src/shared/worker-pool.ts
var DecodeWorkerPool = class {
	constructor(create, onDecoded, onSighted, onTrackedAttempt) {
		this.create = create;
		this.onDecoded = onDecoded;
		this.onSighted = onSighted;
		this.onTrackedAttempt = onTrackedAttempt;
	}
	create;
	onDecoded;
	onSighted;
	onTrackedAttempt;
	workers = [];
	busy = [];
	get size() {
		return this.workers.length;
	}
	get busyCount() {
		return this.busy.filter(Boolean).length;
	}
	/** Grow or shrink in place. Terminating a busy worker just drops the frame it
	 *  held, which the fountain absorbs like any other miss. */
	resize(count) {
		for (; this.workers.length > Math.max(0, count); )
			this.workers.pop().terminate(), this.busy.pop();
		for (; this.workers.length < count; ) {
			const slot = this.workers.length,
				worker = this.create();
			(worker.onmessage = (event) => {
				const { id, symbols, sightings, trackedAttempted } = event.data;
				if (id !== -1) {
					(this.busy[slot] = !1), trackedAttempted && this.onTrackedAttempt?.();
					for (const s of symbols)
						this.onDecoded(s.bytes, s.box, {
							quad: s.quad,
							modules: s.modules,
							tracked: s.tracked,
						});
					if (this.onSighted)
						for (const box of sightings ?? []) this.onSighted(box);
				}
			}),
				this.workers.push(worker),
				this.busy.push(!1);
		}
	}
	/** Hand a frame to a free worker. False when every worker is busy — the
	 *  caller drops the frame rather than queueing it, because a stale frame is
	 *  worth less than the next one. */
	submit(message, transfer) {
		const slot = this.busy.indexOf(!1);
		return slot === -1
			? !1
			: ((this.busy[slot] = !0),
				this.workers[slot].postMessage(message, transfer),
				!0);
	}
};

// src/shared/progress.ts
function expectedFountainOverhead(sourceBlocks) {
	return sourceBlocks <= 1 ? 1 : 1.02;
}
function estimateTransferProgress(
	sourceBlocks,
	uniqueFrames,
	elapsedSeconds,
	solvedBlocks = 0,
) {
	let minimumFrames = Math.max(1, sourceBlocks),
		expectedFrames = Math.max(
			minimumFrames + 1,
			Math.ceil(minimumFrames * expectedFountainOverhead(minimumFrames)),
		),
		expectedRedundancy = expectedFrames - minimumFrames,
		frameFraction;
	if (uniqueFrames < minimumFrames)
		frameFraction = 0.86 * (uniqueFrames / minimumFrames);
	else if (uniqueFrames <= expectedFrames)
		frameFraction =
			0.86 + 0.1 * ((uniqueFrames - minimumFrames) / expectedRedundancy);
	else {
		const extra = (uniqueFrames - expectedFrames) / expectedRedundancy;
		frameFraction = 0.96 + 0.03 * (1 - Math.exp(-extra));
	}
	if (solvedBlocks > 0) {
		const lead = 0.12 * minimumFrames;
		frameFraction = Math.min(
			frameFraction,
			0.86 * Math.min(1, (solvedBlocks + lead) / minimumFrames),
		);
	}
	const decodedFraction = 0.99 * Math.min(1, solvedBlocks / minimumFrames),
		fraction = Math.min(0.99, Math.max(frameFraction, decodedFraction)),
		phase = uniqueFrames < minimumFrames ? "collecting" : "decoding",
		rate = elapsedSeconds > 0 ? uniqueFrames / elapsedSeconds : 0,
		overshoot = uniqueFrames - expectedFrames,
		step = Math.max(expectedRedundancy, Math.ceil(minimumFrames / 10)),
		target =
			overshoot < 0
				? expectedFrames
				: expectedFrames + step * (Math.floor(overshoot / step) + 1),
		etaSeconds =
			uniqueFrames >= 3 && elapsedSeconds >= 1 && rate > 0
				? (target - uniqueFrames) / rate
				: void 0;
	return { fraction, expectedFrames, etaSeconds, phase };
}
function formatDuration(seconds) {
	const rounded = Math.max(1, Math.ceil(seconds));
	if (rounded < 60) return `${rounded}s`;
	const minutes = Math.floor(rounded / 60),
		remainder = rounded % 60;
	if (minutes < 60)
		return remainder === 0 ? `${minutes}m` : `${minutes}m ${remainder}s`;
	const hours = Math.floor(minutes / 60),
		remainingMinutes = minutes % 60;
	return remainingMinutes === 0
		? `${hours}h`
		: `${hours}h ${remainingMinutes}m`;
}

// src/send/qr-frame.ts
var import_qrcode = __toESM(require_browser(), 1),
	QUIET_ZONE_MODULES = 4,
	PINNED_MASK_PATTERN = 4;
function createFrameQr(bytes, ecc, version) {
	return import_qrcode.default.create([{ data: bytes, mode: "byte" }], {
		errorCorrectionLevel: ecc,
		version,
		maskPattern: PINNED_MASK_PATTERN,
	});
}
export {
	CRITICAL_FLAGS,
	DecodeWorkerPool,
	FLAG_ENCRYPTED,
	HEADER_LEN,
	LTDecoder,
	LTEncoder,
	MAX_FILE_BYTES,
	MAX_FILE_LABEL,
	MAX_SOURCE_BLOCKS,
	QUIET_ZONE_MODULES,
	WIRE_VERSION,
	blockLength,
	classifyFrame,
	createFrameQr,
	cycleLength,
	dlog,
	estimateTransferProgress,
	expectedFountainOverhead,
	fitsInOneStream,
	fnv1a,
	formatDuration,
	frameComposition,
	frameIndices,
	frameVerdictMessage,
	gridDims,
	isPrecompressedType,
	minimumFrameBytes,
	packFile,
	packFrame,
	parseFrame,
	rasterizeQr,
	rasterizeQrGrid,
	smallestSufficientFrameSize,
	solitonCdf,
	sourceBlockCount,
	splitmix32,
	streamIdentity,
	unpackFile,
	verifyFile,
};

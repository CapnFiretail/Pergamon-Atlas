/**
 * Pergamon Address System
 *
 * The Atlas is shaped by its own name.
 *
 *   P    E    R    G    A    M    O    N
 *  0x50 0x45 0x52 0x47 0x41 0x4D 0x4F 0x4E
 *
 * PERGAMON_CONSTANT = 0x50455247414D4F4E
 *   High 32 bits: 0x50455247  ("PERG")
 *   Low  32 bits: 0x414D4F4E  ("AMON")
 *
 * Works in both Node.js (require) and the browser (<script> tag).
 */

(function (exports) {

  // --- Pergamon Constant ---

  const PC_HI = 0x50455247; // "PERG" — 1,346,850,375
  const PC_LO = 0x414D4F4E; // "AMON" — 1,095,954,254

  // --- Coordinate space ---

  // Each axis spans ±16,777,215 (2^24 − 1).
  // Total positions: ~37.7 sextillion. Effectively infinite.
  const COORD_MAX = 16_777_215;

  // --- Encoding ---

  // Base-32 alphabet. O and I removed to avoid confusion with 0 and 1.
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const BASE  = 32;

  // Scramble keys: 25-bit slices of the Pergamon Constant.
  // XOR-ing with these makes addresses look non-numeric.
  const SX = PC_HI & 0x1FFFFFF;          // derived from "PERG"
  const SY = PC_LO & 0x1FFFFFF;          // derived from "AMON"
  const SZ = (PC_HI ^ PC_LO) & 0x1FFFFFF; // derived from their XOR

  function encodeAxis(coord, key) {
    // coord in [−COORD_MAX, +COORD_MAX]
    // offset shifts to unsigned [0, 2*COORD_MAX] = [0, 33,554,430]
    // XOR with key obfuscates without exceeding 25 bits (max 33,554,431 < 32^5 = 33,554,432)
    const offset    = coord + COORD_MAX;
    const scrambled = offset ^ key;
    let n = scrambled, s = '';
    for (let i = 0; i < 5; i++) {
      s = ALPHA[n % BASE] + s;
      n = Math.floor(n / BASE);
    }
    return s;
  }

  function decodeAxis(str, key) {
    let n = 0;
    for (const ch of str) {
      const idx = ALPHA.indexOf(ch);
      if (idx < 0) throw new Error(`Invalid Atlas address character: "${ch}"`);
      n = n * BASE + idx;
    }
    return (n ^ key) - COORD_MAX;
  }

  // --- Public API ---

  /**
   * Convert (x, y, z) coordinates to a 17-character Atlas address.
   * Each axis must be an integer in [−16,777,215, +16,777,215].
   * Returns a string like "GS3DK-65H7N-89W2A".
   */
  function coordsToAddress(x, y, z) {
    if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z))
      throw new Error('Coordinates must be integers');
    if (Math.abs(x) > COORD_MAX || Math.abs(y) > COORD_MAX || Math.abs(z) > COORD_MAX)
      throw new Error(`Coordinates must be in [−${COORD_MAX}, +${COORD_MAX}]`);
    return `${encodeAxis(x, SX)}-${encodeAxis(y, SY)}-${encodeAxis(z, SZ)}`;
  }

  /**
   * Decode a 17-character Atlas address back to (x, y, z) coordinates.
   * Input format: "XXXXX-YYYYY-ZZZZZ" (case-insensitive).
   */
  function addressToCoords(addr) {
    const parts = addr.toUpperCase().trim().split('-');
    if (parts.length !== 3 || parts.some(p => p.length !== 5))
      throw new Error('Atlas address must be in format XXXXX-YYYYY-ZZZZZ');
    return {
      x: decodeAxis(parts[0], SX),
      y: decodeAxis(parts[1], SY),
      z: decodeAxis(parts[2], SZ)
    };
  }

  exports.PERGAMON_CONSTANT = { hi: PC_HI, lo: PC_LO, hex: '0x50455247414D4F4E' };
  exports.COORD_MAX         = COORD_MAX;
  exports.coordsToAddress   = coordsToAddress;
  exports.addressToCoords   = addressToCoords;

})(typeof module !== 'undefined' ? module.exports : (window.PergamonAddress = window.PergamonAddress || {}));

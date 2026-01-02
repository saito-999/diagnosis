export function hashAnswersToCode(answersNormalized){
  // Deterministic saveCode from answers only (same answers => same code)
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < answersNormalized.length; i++){
    h ^= (answersNormalized[i] & 0xff);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(36).toUpperCase();
}

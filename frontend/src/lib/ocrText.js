// Cleans OCR output from chat screenshots. Pure logic, no browser APIs, so
// it can be unit-tested in Node (see scripts/test-ocr-text.mjs).

// Read ticks (✓✓) usually come out of OCR as "vv" or "VV".
const TICKS = String.raw`[\s✓✔√/]*(?:vv?|VV?)?[\s✓✔√/]*`;
const DAY = String.raw`(?:today|yesterday|aaj|kal)`;
const TIME = String.raw`\d{1,2}[:.]\d{2}\s*(?:am|pm)?`;
const TIME_ONLY = new RegExp(String.raw`^[\s([]*(?:${DAY}\s*)?${TIME}${TICKS}[)\]]*$`, 'i');
const TRAILING_TIME = new RegExp(String.raw`\s+(?:${DAY}\s*)?${TIME}${TICKS}$`, 'i');
const TRAILING_DAY = new RegExp(String.raw`(?:^|\s+)${DAY}$`, 'i');
const LETTER = /[a-z\u0900-\u097f]/gi;
const ALNUM = /[a-z0-9\u0900-\u097f]/gi;

// Chat screenshots carry clock times, read ticks, battery and network icons,
// and contact names around the actual message. Drop the lines that are
// clearly chrome, keep everything that reads like words, and re-join words
// (often links) that the chat bubble wrapped at a hyphen.
export function cleanOcrText(raw) {
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => !TIME_ONLY.test(line))
    .map((line) => line.replace(TRAILING_TIME, '').replace(TRAILING_DAY, '').trim())
    .filter((line) => {
      // Needs some real words, and must be mostly letters or digits (phone
      // numbers and amounts matter in scam messages; icon debris does not).
      const letters = (line.match(LETTER) || []).length;
      const alnum = (line.match(ALNUM) || []).length;
      return letters >= 3 && alnum / line.replace(/\s/g, '').length >= 0.6;
    });
  const joined = [];
  for (const line of lines) {
    const prev = joined[joined.length - 1];
    if (prev && /[a-z0-9]-$/i.test(prev) && /^[a-z0-9]/i.test(line)) {
      joined[joined.length - 1] = prev + line;
    } else {
      joined.push(line);
    }
  }
  return joined.join('\n').slice(0, 2000);
}

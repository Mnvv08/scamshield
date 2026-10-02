// Unit tests for the screenshot text cleanup. Run: npm test
// Uses only node:assert, so no test framework is needed.
import assert from 'node:assert/strict';
import { cleanOcrText } from '../src/lib/ocrText.js';

const cases = [
  ['WhatsApp read ticks OCR as "vv"', 'Is this real? 10:35 am vv', 'Is this real?'],
  ['upper-case ticks', 'Kaun? 9:20 pm VV', 'Kaun?'],
  ['SMS day label after Hindi text', 'जाएगा। तुरंत अपना केवाईसी अपडेट करें। Today', 'जाएगा। तुरंत अपना केवाईसी अपडेट करें।'],
  ['phone numbers are kept', 'you? Call 18002586161 Yesterday', 'you? Call 18002586161'],
  ['link wrapped at a hyphen is re-joined', 'KYC immediately at sbi-kyc-\nupdate.in', 'KYC immediately at sbi-kyc-update.in'],
  ['status bar, timestamps and orphaned "pm" dropped', '10:42\n4G 78%\nYesterday 1:14 pm\n9:12\npm\nHello there', 'Hello there'],
  ['a line that is only a timestamp', 'Today 8:02 am ✓✓', ''],
  ['a spaced dash is not a wrapped word', 'Rs 500 se kam - \nnahi milega', 'Rs 500 se kam -\nnahi milega'],
  ['Devanagari message kept intact', 'प्रिय ग्राहक, आपका बैंक खाता बंद', 'प्रिय ग्राहक, आपका बैंक खाता बंद'],
];

let failed = 0;
for (const [name, input, expected] of cases) {
  try {
    assert.equal(cleanOcrText(input), expected);
    console.log(`  ok   ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`  FAIL ${name}\n       expected ${JSON.stringify(expected)}\n       got      ${JSON.stringify(err.actual)}`);
  }
}
assert.ok(cleanOcrText('x'.repeat(5000)).length <= 2000, 'output is capped at the API limit');
console.log(failed ? `${failed} failed` : `all ${cases.length + 1} passed`);
process.exit(failed ? 1 : 0);

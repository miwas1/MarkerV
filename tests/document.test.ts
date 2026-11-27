import assert from 'node:assert/strict'
import test from 'node:test'
import { pdfTextItemsToLines, type PdfTextItem } from '../src/domain/document.ts'

// A pdf.js-style item at (x, y) in an 11.5 pt font whose glyphs are 6 units wide on average.
function item(str: string, x: number, y = 700, extra: Partial<PdfTextItem> = {}): PdfTextItem {
  return { str, transform: [11.5, 0, 0, 11.5, x, y], width: str.length * 6, ...extra }
}

// Lays out runs left to right on one baseline, with the given gap after each run.
function run(parts: [string, number][], y = 700): PdfTextItem[] {
  let x = 72
  return parts.map(([str, gap]) => {
    const it = item(str, x, y)
    x += str.length * 6 + gap
    return it
  })
}

test('ligature glyphs split by pdf.js are rejoined without spaces', () => {
  const items = run([['The co', 0], ['ff', 0], ['ee drinkers had a bene', 0], ['fi', 0], ['t', 0]])
  assert.deepEqual(pdfTextItemsToLines(items), ['The coffee drinkers had a benefit'])
})

test('tiny kerning gaps and overlaps do not add spaces', () => {
  const items = run([['e', 0.38], ['ff', -0.26], ['ect estimate', 0]])
  assert.deepEqual(pdfTextItemsToLines(items), ['effect estimate'])
})

test('words placed as separate items without spaces are separated by their visible gap', () => {
  const items = run([['relative', 3], ['risk', 3], ['0.71', 0]])
  assert.deepEqual(pdfTextItemsToLines(items), ['relative risk 0.71'])
})

test('existing spaces in item text are kept and not doubled', () => {
  const items = run([['the confidence ', 0], ['interval', 3], [' excludes 1', 0]])
  assert.deepEqual(pdfTextItemsToLines(items), ['the confidence interval excludes 1'])
})

test('a jump back to the left on the same baseline counts as a new column', () => {
  const items = [item('Interpreting the effect estimate', 300), item('4', 72)]
  assert.deepEqual(pdfTextItemsToLines(items), ['Interpreting the effect estimate 4'])
})

test('line breaks follow hasEOL and changes of baseline', () => {
  const items = [
    item('First line', 72, 700, { hasEOL: true }),
    item('Second', 72, 686),
    item('line', 72 + 6 * 6 + 3, 686),
    item('Third line', 72, 660),
  ]
  assert.deepEqual(pdfTextItemsToLines(items), ['First line', 'Second line', 'Third line'])
})

test('items without geometry keep a separating space', () => {
  const items: PdfTextItem[] = [{ str: 'no' }, { str: 'geometry' }]
  assert.deepEqual(pdfTextItemsToLines(items), ['no geometry'])
})

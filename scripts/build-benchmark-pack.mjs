// Builds src/benchmark/pack.json from marking-test-pack/.
// Every rubric, answer and reference mark in the pack is fictional, which is why the
// benchmark may send these answers to the cloud model for comparison.
//
// Run with: npm run benchmark:pack
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import JSZip from 'jszip'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { normalizeExtractedText, parseRubricText } from '../src/domain/document.ts'

const PACK = 'marking-test-pack'
const OUT = 'src/benchmark/pack.json'
// Scripts whose text can be read without a model. Photo scripts need transcription first.
const TEXT_SCRIPTS = ['05-typed.pdf', '07-answer.docx', '08-answer.txt', '09-paste-me.txt', '10-google-sheets.csv']
const RUBRIC_FILES = ['rubric.txt', 'rubric-backup.txt', 'rubric-table.txt', 'rubric.docx', 'rubric.pdf']

const decode = (text) => text
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
const strip = (xml) => decode(xml.replace(/<w:tab\/>/g, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()

async function docxText(file) {
  const zip = await JSZip.loadAsync(await readFile(file))
  const xml = await zip.file('word/document.xml').async('string')
  // Tables become pipe rows so the rubric parser reads them the same way as a pasted table.
  const withTables = xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, (table) => {
    const rows = table.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) ?? []
    return rows.map((row) => {
      const cells = (row.match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? []).map((cell) => strip(cell.replace(/<\/w:p>/g, ' ')))
      return '<w:p>| ' + cells.join(' | ') + ' |</w:p>'
    }).join('')
  })
  return withTables.split(/<\/w:p>/).map(strip).filter(Boolean).join('\n')
}

async function pdfText(file) {
  const document = await getDocument({ data: new Uint8Array(await readFile(file)), useSystemFonts: true }).promise
  const lines = []
  for (let number = 1; number <= document.numPages; number++) {
    const content = await (await document.getPage(number)).getTextContent()
    const rows = new Map()
    for (const item of content.items) {
      if (!item.str?.trim()) continue
      const y = Math.round(item.transform[5])
      rows.set(y, [...(rows.get(y) ?? []), item])
    }
    for (const y of [...rows.keys()].sort((a, b) => b - a)) {
      lines.push(rows.get(y).sort((a, b) => a.transform[4] - b.transform[4]).map((item) => item.str).join(' '))
    }
  }
  return lines.join('\n')
}

function csvRows(text) {
  const rows = []
  let row = [], cell = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++ } else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"') quoted = true
    else if (char === ',') { row.push(cell); cell = '' }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some((value) => value !== '')) rows.push(row)
      row = []
    } else cell += char
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows
}

async function readText(file) {
  if (file.endsWith('.docx')) return docxText(file)
  if (file.endsWith('.pdf')) return pdfText(file)
  const text = await readFile(file, 'utf8')
  if (file.endsWith('.csv')) {
    const [header, ...rows] = csvRows(text)
    const column = Math.max(0, header.findIndex((name) => /answer/i.test(name)))
    return rows.map((row) => row[column] ?? '').join('\n')
  }
  return text
}

const key = csvRows(await readFile(path.join(PACK, 'answer-key.csv'), 'utf8'))
const [head, ...keyRows] = key
const column = (name) => head.indexOf(name)
const reference = new Map(keyRows.map((row) => [row[column('File')], row]))

const projects = []
const cases = []
for (const folder of (await readdir(PACK, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()) {
  const projectId = folder.split('-')[1].toLowerCase()
  const rubricDir = path.join(PACK, folder, 'rubric')
  const available = await readdir(rubricDir)
  const rubricFile = RUBRIC_FILES.find((name) => available.includes(name))
  if (!rubricFile) throw new Error('No readable rubric in ' + rubricDir)
  const draft = parseRubricText(await readText(path.join(rubricDir, rubricFile)), rubricFile)
  if (!draft.parsedCriteriaCount || !draft.question) throw new Error('Could not parse ' + path.join(rubricDir, rubricFile))
  const criteria = draft.criteria.map((criterion, index) => {
    if (criterion.levels.length !== criterion.max + 1 || criterion.levels.some((level) => !level.trim())) {
      throw new Error(`Incomplete scoring levels for "${criterion.title}" in ${folder}`)
    }
    return { id: 'c' + (index + 1), title: criterion.title, max: criterion.max, levels: criterion.levels, practice: '' }
  })
  const name = keyRows.find((row) => row[column('File')].startsWith(folder + '/'))?.[column('Project')] ?? folder
  projects.push({ id: projectId, name, rubricSource: rubricFile, rubric: { title: draft.title, question: draft.question, criteria } })

  for (const script of TEXT_SCRIPTS) {
    const relative = `${folder}/scripts/${script}`
    const row = reference.get(relative)
    if (!row) throw new Error('No reference marks for ' + relative)
    const marks = criteria.map((criterion, index) => {
      const [score, max] = row[column('C' + (index + 1))].split('/').map(Number)
      if (max !== criterion.max || !Number.isInteger(score) || score < 0 || score > max) {
        throw new Error(`Reference mark for ${relative} C${index + 1} does not fit the rubric`)
      }
      return score
    })
    const transcript = normalizeExtractedText(await readText(path.join(PACK, relative))).trim()
    if (!transcript) throw new Error('Empty answer text in ' + relative)
    cases.push({
      id: `${projectId}-${script.slice(0, 2)}`,
      projectId,
      file: script,
      tests: row[column('What it tests')],
      transcript,
      reference: marks,
    })
  }
}

await mkdir(path.dirname(OUT), { recursive: true })
await writeFile(OUT, JSON.stringify({ source: PACK, projects, cases }, null, 2) + '\n')
console.log(`Wrote ${OUT}: ${projects.length} rubrics, ${cases.length} text scripts`)
for (const project of projects) {
  console.log(`  ${project.id}: "${project.rubric.title}" from ${project.rubricSource}, ${project.rubric.criteria.length} criteria, ${project.rubric.criteria.reduce((sum, c) => sum + c.max, 0)} marks`)
}

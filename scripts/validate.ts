// 사용: node scripts/validate.ts [batch 파일...]  (생략 시 scripts/batches 전체)
// 실패 목록은 scripts/report.txt. 실패가 있으면 exit 1
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface Entry {
  word: string
  reading: string
  meaning_ko: string
  example_ja: string
  example_target: string
  example_ko: string
  pos: string
}
export const POS = ['명사', '동사', 'い형용사', 'な형용사', '부사', '기타']
const FIELDS = ['word', 'reading', 'meaning_ko', 'example_ja', 'example_target', 'example_ko', 'pos'] as const
const KANA = /^[ぁ-ゖァ-ヺー]+$/

export const BATCH_DIR = join(import.meta.dirname, 'batches')
export const batchFiles = () =>
  readdirSync(BATCH_DIR).filter((f) => /^batch_\d{3}\.json$/.test(f)).sort().map((f) => join(BATCH_DIR, f))
export const key = (e: Entry) => `${e.word}|${e.reading}`

export function entryErrors(e: Entry): string[] {
  const errs = FIELDS.filter((f) => typeof e[f] !== 'string' || !e[f].trim()).map((f) => `${f} 누락`)
  if (errs.length) return errs
  if (!e.example_ja.includes(e.example_target)) errs.push(`example_target "${e.example_target}"가 예문에 없음`)
  if (!KANA.test(e.reading)) errs.push(`reading "${e.reading}"에 가나 외 문자`)
  if (!POS.includes(e.pos)) errs.push(`pos "${e.pos}" 허용값 아님`)
  const len = [...e.example_ja].length
  if (len < 20 || len > 40) errs.push(`예문 길이 ${len}자 (20~40)`)
  const meanings = e.meaning_ko.split(',').filter((m) => m.trim())
  if (meanings.length < 1 || meanings.length > 3) errs.push(`뜻 ${meanings.length}개 (1~3)`)
  return errs
}

// 전체 배치를 읽어 검증. 중복은 전 배치 기준
export function validate(files: string[]) {
  const all = batchFiles().flatMap((f) => (JSON.parse(readFileSync(f, 'utf8')) as Entry[]).map((e) => ({ e, f })))
  const seen = new Map<string, string>()
  const failures: string[] = []
  let total = 0
  let passed = 0
  for (const { e, f } of all) {
    const errs = entryErrors(e)
    const k = key(e)
    if (seen.has(k)) errs.push(`중복 (${seen.get(k)})`)
    else seen.set(k, f.split('/').pop()!)
    if (!files.includes(f)) continue
    total++
    if (errs.length) failures.push(`${f.split('/').pop()}\t${k}\t${errs.join('; ')}`)
    else passed++
  }
  return { total, passed, failures }
}

if (import.meta.main) {
  const files = process.argv.length > 2 ? process.argv.slice(2).map((f) => join(process.cwd(), f)) : batchFiles()
  const { total, passed, failures } = validate(files)
  writeFileSync(join(import.meta.dirname, 'report.txt'), failures.join('\n') + '\n')
  console.log(`통과 ${passed} / 전체 ${total}`)
  if (failures.length) {
    console.log(failures.join('\n'))
    process.exit(1)
  }
}

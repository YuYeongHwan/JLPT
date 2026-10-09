// 배치 생성 보조 (100개 단위, 이어하기 가능)
//   node scripts/make_batch.ts                 다음에 만들 배치 번호 + 원본 행 출력 (있는 배치는 건너뜀)
//   node scripts/make_batch.ts 3 < lines.txt   batch_003.json 생성 후 검증
//   node scripts/make_batch.ts 3 --patch < l   word|reading 이 같은 항목만 교체 후 검증
// 입력 한 줄: word|reading|meaning_ko|example_ja|example_target|example_ko|pos
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BATCH_DIR, key, validate, type Entry } from './validate.ts'

const SIZE = 100
const rows = readFileSync(join(import.meta.dirname, 'source/n1.csv'), 'utf8')
  .trim()
  .split('\n')
  .slice(1)
  .map((l) => l.match(/("([^"]*)"|[^,]*)/g)!.filter((_, i) => i % 2 === 0).map((c) => c.replace(/^"|"$/g, '')))
const file = (n: number) => join(BATCH_DIR, `batch_${String(n).padStart(3, '0')}.json`)
const batches = Math.ceil(rows.length / SIZE)

const [arg, flag] = process.argv.slice(2)
if (!arg) {
  const n = Array.from({ length: batches }, (_, i) => i + 1).find((i) => !existsSync(file(i)))
  if (!n) console.log(`전체 ${batches}개 배치 완료`)
  else {
    console.log(`다음: ${n} / ${batches}`)
    rows.slice((n - 1) * SIZE, n * SIZE).forEach(([w, r, m]) => console.log(`${w}|${r}|${m}`))
  }
} else {
  const n = Number(arg)
  const input: Entry[] = readFileSync(0, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => {
      const [word, reading, meaning_ko, example_ja, example_target, example_ko, pos] = l.split('|').map((s) => s.trim())
      return { word, reading, meaning_ko, example_ja, example_target, example_ko, pos }
    })
  let out = input
  if (flag === '--patch') {
    const patch = new Map(input.map((e) => [key(e), e]))
    out = (JSON.parse(readFileSync(file(n), 'utf8')) as Entry[]).map((e) => patch.get(key(e)) ?? e)
  } else {
    const expected = Math.min(SIZE, rows.length - (n - 1) * SIZE)
    if (input.length !== expected) throw new Error(`${input.length}줄 입력, ${expected}줄 필요`)
  }
  writeFileSync(file(n), JSON.stringify(out, null, 1) + '\n')
  const { total, passed, failures } = validate([file(n)])
  console.log(`batch_${String(n).padStart(3, '0')}: 통과 ${passed} / ${total}`)
  if (failures.length) console.log(failures.join('\n'))
}

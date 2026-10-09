// 사용: node scripts/merge.ts
// 전체 배치를 검증 후 public/data/n1_vocab.json 으로 병합. 검증 실패 항목은 제외하고 report.txt에 남김
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { batchFiles, entryErrors, key, validate, type Entry } from './validate.ts'

const files = batchFiles()
const { total, passed, failures } = validate(files)
writeFileSync(join(import.meta.dirname, 'report.txt'), failures.join('\n') + '\n')

const seen = new Set<string>()
const out = files
  .flatMap((f) => JSON.parse(readFileSync(f, 'utf8')) as Entry[])
  .filter((e) => !entryErrors(e).length && !seen.has(key(e)) && seen.add(key(e)))

writeFileSync(join(import.meta.dirname, '../public/data/n1_vocab.json'), JSON.stringify(out, null, 1) + '\n')
console.log(`검증 통과 ${passed} / 전체 ${total} → n1_vocab.json ${out.length}개`)

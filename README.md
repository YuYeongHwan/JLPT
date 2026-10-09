# JLPT N1 단어 학습 PWA

JLPT N1 대비용 개인 학습 앱입니다. 휴대폰 홈 화면에 설치해서 틈틈이 한자·어휘를 복습할 수 있도록 만든 오프라인 PWA입니다.

## 주요 기능

- **간격 반복 복습 (FSRS)**
  - `ts-fsrs` 기반 스케줄링, Again / Hard / Good / Easy 4단계 평가
  - 평가 버튼 아래에 다음 복습 간격 미리보기
  - 5분 세션: 복습 카드 우선, 남는 자리에 신규 카드 (최대 15장)
  - 학습일 경계는 새벽 4시

- **N1 시험 유형에 맞춘 카드**
  - 읽기 카드: 漢字 → 読み
  - 문맥 카드: 예문 빈칸 → 단어 (활용형 예문도 지원)
  - 같은 단어의 카드는 같은 날 하나만 출제
  - 문맥 카드는 읽기 카드를 한 번 이상 맞힌 뒤 열림

- **단어 분류 모드**
  - 안다 / 모른다로 빠르게 분류해서 이미 아는 단어는 학습 대상에서 제외
  - 모르는 단어부터 우선 출제, 설정에서 개별 복구 가능

- **시험일 역산**
  - 시험일 기준 D-day와 하루 권장 신규 카드 수 표시
  - 시험 14일 전부터 신규 카드 자동 중단 (해제 가능)

- **데이터 관리**
  - 학습 기록 JSON 백업 / 복원 (스키마 버전 관리, 이전 버전 자동 마이그레이션)
  - 이상한 카드 플래그 표시 후 목록 내보내기
  - 마지막 백업 7일 경과 시 홈 화면 알림

- **완전 오프라인**
  - 첫 실행 후 서버 없이 동작
  - 일본어 폰트(Noto Sans JP) 포함

## 기술 스택

| 영역 | 사용 기술 |
|---|---|
| 프레임워크 | Vite, React, TypeScript |
| 스타일 | Tailwind CSS |
| 로컬 저장소 | Dexie.js (IndexedDB) |
| 스케줄링 | ts-fsrs |
| PWA | vite-plugin-pwa |
| 테스트 | Vitest |
| 배포 | Vercel |

## 시작하기

```bash
npm install
npm run dev      # 개발 서버
npm test         # 테스트
npm run build    # 프로덕션 빌드 (dist/)
```

요구 사항: Node.js 20.19 이상 또는 22.12 이상

### 휴대폰에 설치

1. HTTPS 정적 호스팅에 배포 (이 저장소는 Vercel 사용)
2. 휴대폰 브라우저로 접속
3. 홈 화면에 추가
   - iOS: Safari → 공유 → 홈 화면에 추가
   - Android: Chrome → 메뉴 → 앱 설치

iOS는 홈 화면에 추가한 상태로 사용해야 저장 데이터가 유지됩니다. 주기적으로 백업하는 것을 권장합니다.

## 프로젝트 구조

```
src/
├── db.ts            # DB 스키마, 단어 데이터 동기화, 백업/복원
├── srs.ts           # 복습 스케줄링, 세션 구성, 신규 카드 한도
├── pages/
│   ├── Home.tsx
│   ├── Review.tsx
│   ├── Triage.tsx   # 단어 분류 모드
│   └── Settings.tsx
public/data/
└── n1_vocab.json    # 단어 데이터 (원본)
scripts/
├── source/          # 원본 단어 목록 CSV
├── batches/         # 생성된 배치 데이터
├── make_batch.ts    # 배치 생성 및 수정(--patch)
├── validate.ts      # 데이터 검증
└── merge.ts         # 배치 병합 → n1_vocab.json
```

## 단어 데이터

### 스키마

```json
{
  "word": "潔い",
  "reading": "いさぎよい",
  "meaning_ko": "깨끗하다, 미련 없다",
  "example_ja": "彼は潔く負けを認めた。",
  "example_target": "潔く",
  "example_ko": "그는 깨끗하게 패배를 인정했다.",
  "pos": "い형용사"
}
```

- 단어 id는 `word|reading`으로 앱에서 생성합니다.
- `example_target`은 예문 속 실제 표기(활용형)이며 문맥 카드 빈칸에 쓰입니다.

### 데이터 수정

1. 앱에서 이상한 카드를 플래그 → 설정에서 목록 내보내기
2. 해당 배치를 `make_batch.ts --patch`로 수정
3. `validate.ts`로 검증 후 `merge.ts`로 병합

`n1_vocab.json`을 교체해도 학습 기록은 유지됩니다. 데이터에서 빠진 단어의 카드는 삭제되지 않고 정지 처리됩니다.

## 데이터 출처 및 주의

- 단어 목록: [open-anki-jlpt-decks](https://github.com/jamsinclair/open-anki-jlpt-decks) (MIT), 원본은 [Tanos](http://www.tanos.co.uk/jlpt/) N1 목록
- 한국어 뜻과 예문은 AI로 생성했으며 오류가 있을 수 있습니다.
- JLPT 공식 단어 목록은 공개되어 있지 않으므로, 이 목록은 비공식 추정 범위입니다.
- 개인 학습용으로 만든 프로젝트입니다.

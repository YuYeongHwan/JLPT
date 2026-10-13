"""폰트 서브셋 생성. 단어 데이터나 UI 문구가 바뀌면 다시 실행.

    .venv/bin/python scripts/subset_fonts.py

- Shippori Mincho 500/700: n1_vocab.json의 word, example_ja, example_target 문자
  + 히라가나/가타카나 + 기본 문장부호 + src/ 안의 일본어 UI 문자 + ASCII
- Pretendard Variable: 데이터의 한국어(meaning_ko, example_ko) + src/ 안의 한국어 UI 문자 + ASCII
원본 TTF는 scripts/fonts-src/ 에 내려받아 캐시 (git 제외).
의존성: pip install fonttools brotli
"""
import json
import re
import urllib.request
from pathlib import Path

from fontTools import subset

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "scripts" / "fonts-src"
OUT_DIR = ROOT / "public" / "fonts"
FONTS = {
    "ShipporiMincho-Medium.ttf": "https://raw.githubusercontent.com/google/fonts/main/ofl/shipporimincho/ShipporiMincho-Medium.ttf",
    "ShipporiMincho-Bold.ttf": "https://raw.githubusercontent.com/google/fonts/main/ofl/shipporimincho/ShipporiMincho-Bold.ttf",
    "PretendardVariable.ttf": "https://raw.githubusercontent.com/orioncactus/pretendard/main/packages/pretendard/dist/public/variable/PretendardVariable.ttf",
}

ASCII = "".join(chr(c) for c in range(0x20, 0x7F))
KANA = "".join(chr(c) for c in [*range(0x3041, 0x3097), *range(0x30A1, 0x30FB)]) + "ーゝゞヽヾ々〆"
JA_PUNCT = "、。・「」『』（）［］【】〈〉《》！？：；…〜～＿　，．"
KO_PUNCT = "·…‘’“”→←"
IS_JA = re.compile(r"[　-ヿ㐀-鿿＀-￯]")
IS_KO = re.compile(r"[가-힣㄰-㆏]")


def source(name: str) -> Path:
    path = SRC_DIR / name
    if not path.exists():
        SRC_DIR.mkdir(parents=True, exist_ok=True)
        print(f"download {name}")
        urllib.request.urlretrieve(FONTS[name], path)
    return path


def make(src: str, out: str, text: str) -> None:
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["*"]  # 세로쓰기·약물 대체 등 유지
    opts.name_IDs = ["*"]
    font = subset.load_font(source(src), opts)
    sub = subset.Subsetter(opts)
    sub.populate(text=text)
    sub.subset(font)
    dest = OUT_DIR / out
    subset.save_font(font, dest, opts)
    before = (SRC_DIR / src).stat().st_size
    print(f"{out}: {before / 1024:,.0f}KB -> {dest.stat().st_size / 1024:,.0f}KB ({len(set(text))} chars)")


vocab = json.loads((ROOT / "public/data/n1_vocab.json").read_text())
ui = "".join(p.read_text() for p in (ROOT / "src").rglob("*.tsx"))

ja = "".join(w["word"] + w["example_ja"] + w.get("example_target", "") for w in vocab)
ja_text = "".join(sorted(set(ja + KANA + JA_PUNCT + ASCII + "".join(IS_JA.findall(ui)))))
ko = "".join(w["meaning_ko"] + w["example_ko"] for w in vocab)
ko_text = "".join(sorted(set(ko + ASCII + KO_PUNCT + "".join(IS_KO.findall(ui)))))

OUT_DIR.mkdir(parents=True, exist_ok=True)
make("ShipporiMincho-Medium.ttf", "shippori-mincho-500.woff2", ja_text)
make("ShipporiMincho-Bold.ttf", "shippori-mincho-700.woff2", ja_text)
make("PretendardVariable.ttf", "pretendard-variable.woff2", ko_text)

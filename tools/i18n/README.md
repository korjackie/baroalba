# i18n 작업 도구 (2026-07-22)

8개 언어(`ko en zh ja vi ru mn np`) 번역 작업용 스크립트.
`shared-lang.js`의 `TRANSLATIONS`가 단일 사전이고, 화면은 `data-i18n` 속성 또는
JS의 `t('key')` 호출로 이 사전을 참조한다.

> 네팔어 코드는 ISO 표준 `ne`가 아니라 **`np`** 를 쓴다(기존 코드 전체가 그렇게 돼 있음).

## addkeys.py — 사전에 키 일괄 추가

```bash
python3 tools/i18n/addkeys.py keys.json
```

`keys.json` 형식 (값은 반드시 8개, 순서는 `ko en zh ja vi ru mn np`):

```json
{ "my_key": ["한국어","English","中文","日本語","Tiếng Việt","Русский","Монгол","नेपाली"] }
```

- 값에 **작은따옴표(')가 있으면 JS 문자열이 깨지므로 실행을 중단**한다. 영어 `Today's` 같은 표현은 피할 것.
- 이미 있는 키는 건너뛴다.

## wire.py — HTML에 data-i18n 부여

```bash
python3 tools/i18n/wire.py 바로알바.html map.json \
  '<div class="full-panel" id="panel-chats"' '<div class="full-panel" id="(?!panel-chats)'
```

`map.json`은 `{"화면에 보이는 한국어": "사전키"}` 형식. 3·4번째 인자는 처리 범위(선택).

- 이모지/기호 접두·접미(`📢 공지사항`, `편집 ›`)를 인식해 **텍스트 부분만** `<span data-i18n>`으로 감싼다.
- **안전장치**: 처리 전후로 "태그를 모두 제거한 순수 텍스트"가 동일한지 검증하고,
  다르면 파일을 저장하지 않고 종료한다.
  (이전 버전에 이미 `data-i18n`이 붙은 태그를 건너뛸 때 그 구간 텍스트를 버퍼에
  넣지 않아 **파일 344줄이 유실된 사고**가 있었다. 그래서 이 검증이 들어갔다.)

## ⚠️ JS 안의 문자열을 t()로 바꿀 때 (자동화 금지)

`${t('key')}`는 **백틱 템플릿 리터럴 안에서만** 동작한다.
작은따옴표 문자열에 넣으면 `t(` 의 따옴표가 문자열을 조기 종료시켜 SyntaxError.

| 감싸는 문자열 | 써야 할 형식 |
|---|---|
| `` `...` `` | `${t('key')}` |
| `'...'` | `' + t('key') + '` |
| `"..."` | `" + t('key') + "` |

문자열 문맥을 자동 판별하는 스크립트를 두 번 시도했으나 모두 실패했다.
1. 역방향 탐색 → HTML 속성 `style="..."` 의 `"`를 문자열 경계로 오인
2. 문자열 상태 추적 → app.js의 정규식 리터럴(`/'/g`)에서 상태가 어긋남

**결론: JS는 대상마다 앞뒤 문맥을 직접 확인해 치환하고, 매번 `node --check`로 검증할 것.**

## 검수 방법

```bash
# 사전 완전성 (8개 언어 키 누락 확인)
# HTML/JS가 쓰는 키가 사전에 있는지 (없으면 화면에 키 이름이 그대로 노출됨)
node --check shared-lang.js && node --check assets/js/app.js
```

번역하지 않는 것:
- 브랜드명(바로알바/바로모임/바로만남/바로브랜딩)
- 언어 이름 — `NATIVE_LANG_LABELS`로 각 언어의 자기 이름 표시(`English`, `中文`, `नेपाली`)
- 국가명 — 이미 영문 병기(`베트남 (Vietnam)`)

## 사전에 이미 있는 것 재사용 (새 키 만들기 전에 확인)

마크업에 사전 키가 이미 들어있는 경우가 있다. `applyLang()`이 자동 처리한다.

| 속성 | 사전 |
|---|---|
| `data-v="bicycle"` | `VEHICLE_LABELS` (8종) |
| `data-s="strong"` | `STRENGTH_LABELS` (20종) |
| `data-day="월"` | `DAY_LABELS` (7종) |
| `data-l="en"` | `NATIVE_LANG_LABELS` (8종) |

업종은 `tCategory()`를 쓴다 — DB의 `category`가 자유 입력이라 표기가 난립하는 것을
`CAT_GROUPS` 키워드로 흡수한다.

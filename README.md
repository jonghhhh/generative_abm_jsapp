
# Generative Agent Simulation

> 10명의 한국인 에이전트가 뉴스를 읽고 토론하며 태도가 변화하는 과정을 시뮬레이션.
> **React (정적, GitHub Pages) + Apps Script (백엔드) + Gemini 2.5 Flash Lite**.

---

## 구성 파일

| 파일 | 역할 | 위치 |
|---|---|---|
| `index.html` | React 단일 파일 프론트엔드 | GitHub Pages |
| `Code.gs`    | Apps Script 백엔드 (Gemini 프록시) | Google Apps Script |

---

## 1단계 · Apps Script 백엔드 배포

1. <https://script.google.com> → **새 프로젝트**
2. `Code.gs` 내용 전체 붙여넣기
3. **(권장) 키 서버 보관**
   - 좌측 톱니 → **프로젝트 설정** → **스크립트 속성**
   - 속성 이름 `GEMINI_API_KEY`, 값에 Gemini 키 입력
4. **배포 → 새 배포** → 유형 **웹 앱**
   - *다음 사용자 인증 정보로 실행*: **나**
   - *액세스 권한*: **모든 사용자**
5. 배포 후 표시되는 **웹 앱 URL** 복사 (`.../exec`로 끝남)

> ⚠️ 정적 호스팅(GitHub Pages)은 코드가 모두 노출되므로, 키는 가급적 **서버(Script Properties)에 보관**하고 프론트의 "서버 키 사용" 옵션을 켭니다.

---

## 2단계 · 로컬에서 동작 확인

1. `index.html` 더블클릭 또는 간단한 정적 서버로 열기
   ```bash
   cd /your/folder
   python -m http.server 8080
   # http://localhost:8080/index.html
   ```
2. 상단 **SETUP**에 Apps Script URL 입력 → **연결 테스트**
   - 시스템 로그에 `model=gemini-2.5-flash-lite, serverHasKey=true/false` 떠야 정상
3. (서버 키 미사용 시) Gemini API Key 입력
4. **STIMULUS** 패널에서 자극(뉴스) 편집
5. **CONTROL → 시뮬레이션 시작**
   - 라운드당 5쌍 × 10라운드 = **50회 API 호출** (약 2~5분)

---

## 3단계 · GitHub Pages 배포

```bash
git init
git add index.html README.md
git commit -m "agent simulation"
git branch -M main
git remote add origin https://github.com/<USER>/<REPO>.git
git push -u origin main
```

GitHub 저장소 → **Settings → Pages**
- Source: **Deploy from a branch**
- Branch: **main / (root)**
- 잠시 후 `https://<USER>.github.io/<REPO>/` 에서 접속

> Apps Script 배포 권한이 "모든 사용자"이고 응답이 JSON이라면 GitHub Pages 도메인에서 그대로 호출 가능합니다 (CORS 자동 허용).

---

## 시뮬레이션 모델

```
Round r
  ├─ pair(10 agents) → 5 pairs (random)
  ├─ for each pair (A, B):
  │     ├─ buildPrompt(topic, A, B)  ← 페르소나 + 현 입장 + 최근 기억 2개
  │     ├─ Gemini 호출 (responseMimeType: application/json)
  │     ├─ 응답 = { dialogue, a/b_new_attitude, a/b_memory, a/b_reason }
  │     └─ A.attitude ← clamp(round(a_new), -5, 5),  A.memories.push(a_memory)
  └─ σ(attitudes) 기록
```

**기본 에이전트 10명**: 김민수(진보·회사원) … 서지원(보수·의사) — 연령·직업·이념·초기 입장(-5~+5)이 다양하게 분포.
**기본 자극**: AI 생성 뉴스 표시 의무화 법안 (편집 가능).
**점수**: -5(강력 반대) ↔ +5(강력 찬성). 라운드당 일반적으로 ±1, 강한 설득 시 ±2.

---

## 시각화

- **AGENTS**: 10개 카드. 현재 입장 슬라이더 + 직전 변화량(Δ) + 최근 기억 한 줄.
- **DIALOGUES**: 라운드별 대화 로그. 화자 색상 = 이념(진보 cyan / 중도 violet / 보수 rose).
- **TRAJECTORIES**: Recharts 라인차트. 10명 입장 궤적 + 양극화 σ.
- **시스템 로그**: 페어링·API 호출·실패 내역.

---

## 확장 아이디어

- `Code.gs` `LOG_SHEET_ID`에 시트 ID 넣고 `action: 'log'`로 모든 conversation 저장 → 사후 분석용 데이터셋 확보
- 에이전트 페르소나를 외부 JSON으로 분리해 다른 모집단(예: 미국 시민, 학생) 교체
- 자극을 라운드마다 바꿔 **편향 노출(filter bubble) 실험** — A 그룹에는 진보 매체, B 그룹에는 보수 매체
- 페어링 정책을 random → homophily(같은 이념끼리)로 바꿔 **양극화 가속 비교** (현재 연구의 동질성 조건과 동형)
- 추론 동기 조건을 프롬프트에 추가해 **2×2 설계** 그대로 재현

---

## 트러블슈팅

| 증상 | 원인 / 해결 |
|---|---|
| `HTTP 401` 또는 빈 응답 | Apps Script 배포 권한이 "모든 사용자"인지, URL이 `.../exec`인지 확인 |
| `Gemini 400` | API 키 오타, 키에 Gemini API 활성화 안 됨 — Google AI Studio에서 발급 |
| `JSON 파싱 실패` | 모델이 가끔 JSON 외 텍스트 포함. 자동 재파싱 시도 후 실패 시 해당 페어만 스킵 |
| 진행이 너무 느림 | 라운드당 5회 호출이 순차 실행. 라운드 수를 5로 줄이거나, `runRound` 내부를 `Promise.all`로 변경 가능 (단, rate limit 주의) |

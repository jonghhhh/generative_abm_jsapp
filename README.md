# Generative Agent Simulation

> **생성형 AI 에이전트 기반 사회과학 시뮬레이션**  
> 다양한 배경의 가상 시민들이 뉴스를 읽고 토론하면서 태도가 변화하는 과정을 관찰합니다.

[![React](https://img.shields.io/badge/React-18-61dafb?logo=react)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-5-646cff?logo=vite)](https://vitejs.dev)
[![Gemini](https://img.shields.io/badge/Gemini-2.5_Flash_Lite-4285f4?logo=google)](https://aistudio.google.com)

---

## 개요

이 프로젝트는 [Generative Agents](https://arxiv.org/abs/2304.03442) 개념을 활용한 **소규모 ABM(Agent-Based Model)** 웹 애플리케이션입니다. 연구자나 교육자가 이슈와 에이전트를 자유롭게 구성해 여론 형성·극화·설득 효과 등 사회적 동학을 실험할 수 있습니다.

**주요 활용 분야**

- 정치 커뮤니케이션 연구
- 여론 극화(Polarization) 실험
- 프레이밍 효과(Framing Effect) 분석
- 계산사회과학 교육

---

## 주요 기능

- **자유로운 이슈 설정** — 뉴스 헤드라인·본문·토론 질문을 직접 입력
- **에이전트 커스터마이징** — 나이·성별·직업·소득·성격·가치관·정치성향·초기 입장을 개별 설정
- **실시간 시뮬레이션** — 라운드별 무작위 페어링 → LLM 대화 생성 → 태도 변화 추적
- **시각화** — 태도 궤적 라인 차트, 극화 지수(σ) 실시간 표시
- **결과 내보내기** — 전체 시뮬레이션 데이터를 JSON으로 다운로드
- **15 RPM 자동 준수** — 무료 Gemini API 쿼터에 맞춰 호출 간격 자동 조절

---

## 빠른 시작

### 설치 및 실행

```bash
git clone <repo-url>
cd generative_abm_jsapp
npm install
npm run dev
```

빌드 후 정적 배포 (GitHub Pages, Netlify 등):

```bash
npm run build   # dist/ 폴더 생성
```

### Gemini API Key 발급 (무료)

1. [Google AI Studio](https://aistudio.google.com) 접속 → Google 계정 로그인
2. **"Get API key"** → **"Create API key"** 클릭
3. 생성된 키(`AIzaSy…`)를 앱 첫 화면에 입력

> **무료 쿼터** (Gemini 2.5 Flash-Lite): RPM 15 / TPM 250,000 / RPD 1,000  
> 신용카드 없이 사용 가능. API Key는 브라우저 localStorage에만 저장됩니다.

---

## 사용 흐름

| 단계 | 설명 |
|---|---|
| **1. API Key 입력** | 발급받은 Gemini Key 입력 |
| **2. 이슈 설정** | 뉴스 헤드라인·본문·토론 질문 작성 |
| **3. 에이전트 구성** | 5명의 가상 시민 프로필 설정 (기본값 예제 제공) |
| **4. 시뮬레이션 실행** | 라운드 수 설정 후 실행 — 실시간 대화·태도 변화 관찰 |
| **5. 결과 저장** | JSON 다운로드로 분석 데이터 저장 |

---

## 기술 스택

| 구분 | 기술 |
|---|---|
| UI | React 18, Tailwind CSS |
| 빌드 | Vite 5 |
| AI | Google Gemini 2.5 Flash-Lite |
| 차트 | Recharts |
| 배포 | 정적 파일 (GitHub Pages, Netlify 등) |

서버 없이 **브라우저에서 Gemini API를 직접 호출**합니다. 백엔드 불필요.

---

## 시뮬레이션 구조

```
Round (Step)
  ├── 뉴스 읽기         — 모든 에이전트가 동일 뉴스 접촉
  ├── 무작위 페어링      — 에이전트를 2인 1조로 무작위 매칭
  └── 대화 생성 (×쌍 수) — Gemini가 4~6턴 대화 생성 + 태도 점수(-5~+5) 갱신
```

- 에이전트당 최대 6개의 **기억(Memory)** 보유, 다음 대화에 맥락으로 반영
- **태도 변화**: 통상 0 또는 ±1, 강한 설득 시 ±2 (핵심 가치관에 반하는 급변 차단)
- **극화 지수**: 에이전트 태도의 표준편차(σ) 실시간 계산

---

## JSON 출력 예시

```json
{
  "simulationId": "sim_1748700000000_a3f2",
  "topic": { "headline": "...", "content": "...", "question": "..." },
  "rounds": 5,
  "agents": [{
    "name": "강철민",
    "ideology": "hard_conservative",
    "initialAttitude": -5,
    "finalAttitude": -4,
    "delta": 1,
    "attitudeHistory": [{"round": 0, "value": -5}, {"round": 1, "value": -5}],
    "memories": ["상대가 제시한 고용 데이터가 일부 설득력 있었음"]
  }],
  "conversations": [{
    "round": 1,
    "dialogue": [{"speaker": "A", "text": "..."}, {"speaker": "B", "text": "..."}],
    "aDelta": 0,
    "bDelta": 1,
    "aMemory": "...",
    "bReason": "..."
  }]
}
```

자세한 스키마는 [DOCUMENTATION.md](./DOCUMENTATION.md#14-json-출력-스키마)를 참조하세요.

---

## 기본값 예제

처음 실행 시 **최저임금 1만 5000원 인상안** 이슈와 아래 5명의 에이전트가 기본값으로 제공됩니다. 이슈와 에이전트 구성을 원하는 내용으로 자유롭게 교체해 사용하세요.

| 이름 | 나이 | 직업 | 성향 | 초기 입장 |
|---|---|---|---|---|
| 강철민 | 64 | 전직 대기업 회장 | 강경보수 | -5 |
| 박도현 | 50 | 중소 제조업체 대표 | 보수 | -3 |
| 김유진 | 37 | 경제부처 사무관 | 중도 | 0 |
| 이수빈 | 29 | 비정규직 지원센터 상담사 | 진보 | +3 |
| 최한별 | 22 | 대학생·사회운동 활동가 | 강경진보 | +5 |

---

## 상세 문서

전체 기술 문서: **[DOCUMENTATION.md](./DOCUMENTATION.md)**

- 에이전트 생성 원리 및 프롬프트 구조
- 페어링 알고리즘
- 태도 변화 메커니즘 및 기억 시스템
- API 호출 구조 (15 RPM 제한 대응, 503 재시도)
- JSON 스키마 전체 설명
- 결과 해석 가이드
- 연구 활용 시 주의사항

---

## 참고 문헌

- Park, J. S., et al. (2023). [Generative Agents: Interactive Simulacra of Human Behavior](https://arxiv.org/abs/2304.03442). *UIST 2023*.
- Axelrod, R. (1997). *The Complexity of Cooperation*. Princeton University Press.

---

## 라이선스

MIT License

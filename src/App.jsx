import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'

/* ============================================================
 * 0. 상수 & 기본값
 * ============================================================ */
const GEMINI_MODEL    = 'gemini-2.5-flash-lite'
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`
const RATE_LIMIT_MS   = 4500   // 15 RPM → 최소 4초 간격 + 여유
const DAILY_CALL_LIMIT = 50    // 브라우저(기기)당 일일 API 호출 상한

const IDEOLOGY_COLOR = {
  hard_conservative: '#dc2626',
  conservative:      '#fb7185',
  moderate:          '#a78bfa',
  progressive:       '#22d3ee',
  hard_progressive:  '#0891b2',
}
const IDEOLOGY_LABEL = {
  hard_conservative: '강경보수',
  conservative:      '보수',
  moderate:          '중도',
  progressive:       '진보',
  hard_progressive:  '강경진보',
}
const IDEOLOGY_OPTIONS = Object.entries(IDEOLOGY_LABEL).map(([v, l]) => ({ value: v, label: l }))
const GENDER_OPTIONS   = ['남성', '여성', '기타']
const INCOME_OPTIONS   = ['저소득', '중산층', '고소득']

const DEFAULT_AGENTS = [
  {
    id: 1, name: '강철민', age: 64, gender: '남성', location: '서울 강남구',
    occupation: '전직 대기업 회장·경제단체 고문', income: '고소득',
    personality: '권위적이고 단호함. 오랜 재계 경험에서 나온 확신으로 쉽게 흔들리지 않음.',
    ideology: 'hard_conservative', initialAttitude: -5,
    values: '시장만이 임금을 결정할 수 있다. 최저임금 자체가 시장 왜곡이며 기업 이윤이 곧 국가 이익. 노동 규제가 늘수록 일자리가 줄고 청년이 피해를 본다. 좌파 포퓰리즘이 경제를 망친다.',
  },
  {
    id: 2, name: '박도현', age: 50, gender: '남성', location: '경기도 성남시',
    occupation: '중소 제조업체 대표', income: '중산층',
    personality: '실용적이고 현실적. 경험에서 나온 논리로 주장하며 급진적 변화를 경계함.',
    ideology: 'conservative', initialAttitude: -3,
    values: '복지 취지는 이해하지만 현실에서 인상 비용은 고스란히 영세 사업자가 진다. 급격한 인상은 반드시 고용 감소로 이어진다. 시장 자율 조정을 선호함.',
  },
  {
    id: 3, name: '김유진', age: 37, gender: '여성', location: '세종시',
    occupation: '경제부처 사무관', income: '중산층',
    personality: '분석적이고 객관적. 데이터 기반으로 판단하며 양극단을 경계함.',
    ideology: 'moderate', initialAttitude: 0,
    values: '이념이 아닌 근거로 판단한다. 인상 효과와 부작용이 업종·지역마다 다르므로 차등 적용이 합리적. 사회적 합의와 단계적 접근 지지.',
  },
  {
    id: 4, name: '이수빈', age: 29, gender: '여성', location: '인천시 미추홀구',
    occupation: '비정규직 지원센터 상담사', income: '저소득',
    personality: '열정적이고 공감 능력이 높음. 현장 경험에서 우러나온 강한 신념을 가짐.',
    ideology: 'progressive', initialAttitude: 3,
    values: '최저임금은 노동자의 생존권이지 기업의 시혜가 아니다. 물가 인상분을 반영한 실질적 인상이 필요. 불평등 해소 없이 내수 경제도 살아나지 않는다.',
  },
  {
    id: 5, name: '최한별', age: 22, gender: '여성', location: '서울 관악구',
    occupation: '대학생·사회운동 활동가', income: '저소득',
    personality: '열정적이고 이상주의적. 타협을 거부하고 구조적 변화를 요구함.',
    ideology: 'hard_progressive', initialAttitude: 5,
    values: '자본주의 구조 자체가 저임금을 재생산한다. 최저임금은 즉각 2만원 이상으로 올려야 하며 타협은 없다. 생활임금 법제화, 노동시간 단축이 동시에 이루어져야 한다.',
  },
]

const DEFAULT_TOPIC = {
  headline: '내년도 최저임금 1만 5000원 인상안 국회 제출',
  content:  '정부·여당이 현행 시간당 9,860원인 최저임금을 내년 1월부터 1만 5,000원(약 52% 인상)으로 올리는 최저임금법 개정안을 국회에 제출했다. 지지 측은 "물가 폭등·주거비 급등을 반영한 최소한의 생존권 보장"이라고 환영한다. 반대 측은 "급격한 인상은 자영업·중소기업의 고용 감소와 폐업을 초래한다"며 강하게 반발한다.',
  question: '내년도 최저임금을 1만 5000원으로 대폭 인상하는 것에 찬성하십니까? (-5: 강력 반대 ↔ +5: 강력 찬성)',
}

/* ============================================================
 * 1. 유틸리티
 * ============================================================ */
function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
function pairAgents(agents) {
  const s = shuffle(agents)
  const pairs = []
  for (let i = 0; i < s.length - 1; i += 2) pairs.push([s[i], s[i + 1]])
  return pairs
}
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)) }
function polarization(agents) {
  const xs   = agents.map(a => a.attitude)
  const mean = xs.reduce((s, v) => s + v, 0) / xs.length
  return Math.sqrt(xs.reduce((s, v) => s + (v - mean) ** 2, 0) / xs.length)
}
function genSimId() { return 'sim_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6) }

function buildPrompt(topic, A, B) {
  const memSnip = (a) => a.memories.length
    ? a.memories.slice(-2).map((m, i) => `   ${i + 1}) ${m}`).join('\n')
    : '   (없음)'
  const desc = (a) =>
    `${a.name} (${a.age}세 ${a.gender || ''}, ${a.location || ''} 거주)
직업: ${a.occupation} / 소득: ${a.income || '미상'} / 성향: ${IDEOLOGY_LABEL[a.ideology] || a.ideology}
성격: ${a.personality || '(미입력)'}
핵심 가치관: ${a.values}
현재 입장 점수: ${a.attitude}
최근 기억:
${memSnip(a)}`
  return `당신은 한국 사회 두 시민의 실시간 대화를 시뮬레이션합니다. 두 사람의 페르소나·현재 입장·기억을 반영해 자연스러운 한국어 대화를 만들고, 대화 후 변화된 입장을 평가하세요.

[주제]
헤드라인: ${topic.headline}
내용 요약: ${topic.content}
질문: ${topic.question} (점수 범위 -5 ~ +5, 정수)

[에이전트 A]
${desc(A)}

[에이전트 B]
${desc(B)}

[작성 규칙]
1. 두 사람이 일상적인 한국어 말투로 4~6턴 정도 대화 (A→B→A→B…). 각 turn 1~2 문장.
2. 각자의 핵심 가치관과 직업적 경험에서 나온 구체적 근거로 주장. 추상적 슬로건 금지.
3. 성향 차이가 클수록 날카롭게 대립하되 인신공격 없이 논거로 맞받아침.
4. 대화 직후 각자의 새 입장 점수 산출:
   - 통상 변화 없음 또는 ±1
   - 강하게 설득당했을 때만 ±2 (드물게)
   - 핵심 가치관에 반하는 급격한 변화는 절대 금지
5. 각자 이번 대화에서 새로 알게 된/느낀 점을 한 문장(40자 이내) 메모.

[출력]
반드시 아래 JSON만 출력. 코드펜스나 설명 금지.
{
  "dialogue": [{"speaker":"A","text":"..."},{"speaker":"B","text":"..."}],
  "a_new_attitude": <-5..5 정수>,
  "a_memory": "<한 문장>",
  "a_reason": "<한 줄 이유>",
  "b_new_attitude": <-5..5 정수>,
  "b_memory": "<한 문장>",
  "b_reason": "<한 줄 이유>"
}`
}

function safeParseJSON(text) {
  if (!text) return null
  let t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/g, '').trim()
  try { return JSON.parse(t) } catch {}
  const m = t.match(/\{[\s\S]*\}/)
  if (m) { try { return JSON.parse(m[0]) } catch {} }
  return null
}

/* ============================================================
 * 2. 일일 사용량 추적 (localStorage, 기기당)
 * ============================================================ */
function _todayKey() { return new Date().toISOString().slice(0, 10) }

function getDailyUsage() {
  try {
    const raw = JSON.parse(localStorage.getItem('daily_usage') || '{}')
    if (raw.date !== _todayKey()) return { date: _todayKey(), count: 0 }
    return raw
  } catch { return { date: _todayKey(), count: 0 } }
}

function incrementDailyUsage() {
  const u = getDailyUsage()
  u.count += 1
  localStorage.setItem('daily_usage', JSON.stringify(u))
  return u.count
}

function checkDailyLimit() {
  const { count } = getDailyUsage()
  if (count >= DAILY_CALL_LIMIT)
    throw new Error(`일일 사용 한도(${DAILY_CALL_LIMIT}회)에 도달했습니다. 내일 자정에 초기화됩니다.`)
}

/* ============================================================
 * 3. Gemini API 직접 호출 (브라우저 → Google)
 * ============================================================ */
let _lastCallMs = 0  // 모듈 수준 rate-limit 추적

async function callGemini(apiKey, prompt) {
  // 일일 한도 확인
  checkDailyLimit()

  // 15 RPM 제한 준수: 마지막 호출로부터 RATE_LIMIT_MS 미만이면 대기
  const wait = _lastCallMs + RATE_LIMIT_MS - Date.now()
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  _lastCallMs = Date.now()

  const RETRY_DELAYS = [5000, 10000, 20000]
  let lastErr
  for (let attempt = 0; attempt < 1 + RETRY_DELAYS.length; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt - 1]))
      _lastCallMs = Date.now()
    }
    try {
      const res = await fetch(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.8, topP: 0.95, maxOutputTokens: 2048,
            responseMimeType: 'application/json',
          },
        }),
      })
      if (!res.ok) {
        const txt = await res.text()
        throw new Error(`Gemini ${res.status}: ${txt.slice(0, 300)}`)
      }
      const data  = await res.json()
      const parts = (((data.candidates || [])[0] || {}).content || {}).parts || []
      const text  = parts.map(p => p.text || '').join('').trim()
      incrementDailyUsage()  // 성공 시에만 카운트
      return text
    } catch (e) {
      lastErr = e
      if ((e.message || '').includes('503') && attempt < RETRY_DELAYS.length) continue
      throw e
    }
  }
  throw lastErr
}

/* ============================================================
 * 3. 설정 화면 컴포넌트
 * ============================================================ */
function KeyInstructions() {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-[var(--border)] rounded-lg overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full px-4 py-2.5 text-left text-xs font-mono text-[var(--text-faint)] hover:text-[var(--amber)] flex items-center justify-between transition">
        <span>💡 무료 API Key 발급 방법 · 쿼터 정보 보기</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1 space-y-4 text-xs text-[var(--text-dim)] fade-in border-t border-[var(--border)]">
          <div>
            <div className="font-mono font-bold text-[var(--amber)] text-[11px] mb-2 mt-3">KEY 발급 절차 (무료 · 신용카드 불필요)</div>
            <ol className="space-y-1.5 list-none">
              {[
                <>Google AI Studio <span className="font-mono text-[var(--amber)]">aistudio.google.com</span> 접속</>,
                'Google 계정으로 로그인',
                '좌측 메뉴 또는 상단 "Get API key" 클릭',
                '"Create API key" 버튼 클릭 → 키 복사',
                '위 입력란에 붙여넣기 (AIzaSy…로 시작)',
              ].map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-[var(--amber)] font-bold font-mono w-4 flex-shrink-0">{i + 1}.</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="border-t border-[var(--border)] pt-4">
            <div className="font-mono font-bold text-[var(--amber)] text-[11px] mb-2">Gemini 2.5 Flash-Lite 무료 쿼터</div>
            <table className="w-full text-[11px] font-mono">
              <thead>
                <tr className="text-[var(--text-faint)] border-b border-[var(--border)]">
                  <th className="text-left py-1 pr-4">구분</th>
                  <th className="text-right py-1">한도</th>
                  <th className="text-right py-1 pl-4 text-[var(--text-faint)] font-normal">이 앱 자동 준수</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-[var(--border)]/40">
                  <td className="py-1 pr-4 text-[var(--text-dim)]">RPM (분당 요청)</td>
                  <td className="text-right text-emerald-400 font-bold">15</td>
                  <td className="text-right pl-4 text-emerald-400">✓ 4.5초 간격</td>
                </tr>
                <tr className="border-b border-[var(--border)]/40">
                  <td className="py-1 pr-4 text-[var(--text-dim)]">TPM (분당 토큰)</td>
                  <td className="text-right text-emerald-400 font-bold">250,000</td>
                  <td className="text-right pl-4 text-[var(--text-faint)]">—</td>
                </tr>
                <tr>
                  <td className="py-1 pr-4 text-[var(--text-dim)]">RPD (일일 요청)</td>
                  <td className="text-right text-emerald-400 font-bold">1,000</td>
                  <td className="text-right pl-4 text-[var(--text-faint)]">—</td>
                </tr>
              </tbody>
            </table>
            <div className="mt-3 text-[var(--text-faint)] leading-relaxed">
              ※ API 키는 브라우저 localStorage에만 저장되며 서버로 전송되지 않습니다.<br/>
              ※ 분당 15회 제한으로 대화당 최소 4.5초 대기가 자동 적용됩니다.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AgentForm({ agent, index, onChange }) {
  const color    = IDEOLOGY_COLOR[agent.ideology]
  const isCustomIncome = !INCOME_OPTIONS.includes(agent.income)
  return (
    <div className="panel-2 rounded-lg p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full grid place-items-center font-bold text-sm flex-shrink-0"
             style={{ background: `${color}22`, color, border: `1px solid ${color}55` }}>
          {index + 1}
        </div>
        <span className="font-medium text-sm">에이전트 {index + 1}</span>
        <span className="ml-auto text-[10px] font-mono px-2 py-0.5 rounded"
              style={{ background: `${color}22`, color }}>
          {IDEOLOGY_LABEL[agent.ideology]}
        </span>
      </div>

      {/* 이름 / 나이 / 성별 */}
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2 sm:col-span-1">
          <div className="text-[10px] font-mono uppercase text-[var(--text-faint)] mb-1">이름</div>
          <input value={agent.name} onChange={e => onChange('name', e.target.value)}
            className="w-full bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1.5 text-sm focus:border-[var(--amber)] outline-none" />
        </div>
        <div>
          <div className="text-[10px] font-mono uppercase text-[var(--text-faint)] mb-1">나이</div>
          <input type="number" min="18" max="90" value={agent.age}
            onChange={e => onChange('age', parseInt(e.target.value) || 30)}
            className="w-full bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1.5 text-sm focus:border-[var(--amber)] outline-none" />
        </div>
        <div>
          <div className="text-[10px] font-mono uppercase text-[var(--text-faint)] mb-1">성별</div>
          <select value={agent.gender} onChange={e => onChange('gender', e.target.value)}
            className="w-full bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1.5 text-sm focus:border-[var(--amber)] outline-none">
            {GENDER_OPTIONS.map(g => <option key={g}>{g}</option>)}
          </select>
        </div>
        <div>
          <div className="text-[10px] font-mono uppercase text-[var(--text-faint)] mb-1">거주지</div>
          <input value={agent.location} onChange={e => onChange('location', e.target.value)}
            placeholder="예: 서울 강남구"
            className="w-full bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1.5 text-sm focus:border-[var(--amber)] outline-none" />
        </div>
      </div>

      {/* 직업 / 소득 */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-[10px] font-mono uppercase text-[var(--text-faint)] mb-1">직업</div>
          <input value={agent.occupation} onChange={e => onChange('occupation', e.target.value)}
            className="w-full bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1.5 text-sm focus:border-[var(--amber)] outline-none" />
        </div>
        <div>
          <div className="text-[10px] font-mono uppercase text-[var(--text-faint)] mb-1">소득 수준</div>
          <select
            value={isCustomIncome ? '__custom__' : agent.income}
            onChange={e => {
              if (e.target.value === '__custom__') onChange('income', '')
              else onChange('income', e.target.value)
            }}
            className="w-full bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1.5 text-sm focus:border-[var(--amber)] outline-none">
            {INCOME_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            <option value="__custom__">직접 입력</option>
          </select>
          {isCustomIncome && (
            <input value={agent.income} onChange={e => onChange('income', e.target.value)}
              placeholder="소득 수준 직접 입력"
              className="w-full mt-1 bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1.5 text-sm focus:border-[var(--amber)] outline-none" />
          )}
        </div>
      </div>

      {/* 성격 */}
      <div>
        <div className="text-[10px] font-mono uppercase text-[var(--text-faint)] mb-1">성격 · 기질</div>
        <input value={agent.personality} onChange={e => onChange('personality', e.target.value)}
          placeholder="예: 논리적이고 분석적. 실용적인 해결책을 선호함."
          className="w-full bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1.5 text-sm focus:border-[var(--amber)] outline-none" />
      </div>

      {/* 가치관 */}
      <div>
        <div className="text-[10px] font-mono uppercase text-[var(--text-faint)] mb-1">핵심 가치관 · 신념</div>
        <textarea value={agent.values} onChange={e => onChange('values', e.target.value)}
          rows={3} placeholder="이 이슈에 대한 핵심 신념, 경험, 논거를 서술하세요."
          className="w-full bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1.5 text-sm focus:border-[var(--amber)] outline-none leading-relaxed resize-none" />
      </div>

      {/* 정치성향 / 초기입장 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] font-mono uppercase text-[var(--text-faint)] mb-1">정치 성향</div>
          <select value={agent.ideology} onChange={e => onChange('ideology', e.target.value)}
            className="w-full bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1.5 text-sm focus:border-[var(--amber)] outline-none"
            style={{ color }}>
            {IDEOLOGY_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <div className="text-[10px] font-mono uppercase text-[var(--text-faint)] mb-1">
            초기 입장{' '}
            <span className="font-bold" style={{ color }}>
              {agent.initialAttitude > 0 ? '+' : ''}{agent.initialAttitude}
            </span>
          </div>
          <input type="range" min="-5" max="5" step="1" value={agent.initialAttitude}
            onChange={e => onChange('initialAttitude', parseInt(e.target.value))}
            className="w-full accent-amber-400 mt-1.5" />
          <div className="flex justify-between text-[9px] font-mono text-[var(--text-faint)] mt-0.5">
            <span>-5 반대</span><span>0</span><span>+5 찬성</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function SetupView({ onStart }) {
  const [apiKey,    setApiKey]    = useState(() => localStorage.getItem('gemini_key')  || '')
  const [scriptUrl, setScriptUrl] = useState(() => localStorage.getItem('gas_url')     || '')
  const [agents,    setAgents]    = useState(() => DEFAULT_AGENTS.map(a => ({ ...a })))
  const [topic,     setTopic]     = useState(DEFAULT_TOPIC)
  const [error,     setError]     = useState('')

  useEffect(() => { localStorage.setItem('gemini_key', apiKey)    }, [apiKey])
  useEffect(() => { localStorage.setItem('gas_url',    scriptUrl) }, [scriptUrl])

  const updateAgent = (idx, field, value) =>
    setAgents(prev => prev.map((a, i) => i === idx ? { ...a, [field]: value } : a))

  const handleStart = () => {
    if (!apiKey.trim()) { setError('Gemini API Key를 입력하세요.'); return }
    if (agents.some(a => !a.name.trim())) { setError('모든 에이전트의 이름을 입력하세요.'); return }
    setError('')
    onStart({ apiKey: apiKey.trim(), scriptUrl: scriptUrl.trim(), agents, topic })
  }

  return (
    <div className="min-h-screen grain">
      <header className="border-b border-[var(--border)] bg-[var(--bg)]/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-[1200px] mx-auto px-6 py-4">
          <div className="text-[10px] font-mono tracking-[0.3em] text-[var(--text-faint)] uppercase">Computational Social Science · Lab</div>
          <h1 className="font-display text-3xl font-extrabold mt-1">
            Generative Agent Simulation
            <span className="text-[var(--amber)] italic font-normal text-2xl ml-2">— 시뮬레이션 설정</span>
          </h1>
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-6 py-8 space-y-8">

        {/* Intro */}
        <section className="panel rounded-lg p-6 space-y-5">
          <div>
            <div className="font-mono text-[11px] tracking-widest text-[var(--amber)] mb-2">ABOUT</div>
            <p className="text-[var(--text-dim)] text-sm leading-relaxed">
              <span className="text-[var(--text)] font-medium">생성형 AI 에이전트(Generative Agent)</span> 기반
              사회과학 시뮬레이션 플랫폼입니다. 서로 다른 정치 성향·배경을 가진 가상의 시민들이 특정 뉴스를 읽고 상호 토론하면서
              태도(Attitude)가 어떻게 변화하는지를 라운드별로 추적합니다.
              편향 강화·의견 수렴·극화(Polarization) 등 사회적 동학을 실험적으로 관찰할 수 있습니다.
            </p>
          </div>

          {/* Steps */}
          <div className="grid sm:grid-cols-4 gap-3">
            {[
              { n: '1', icon: '🔑', title: 'API Key 입력', desc: 'Google AI Studio에서 무료 발급한 Gemini Key를 입력합니다.' },
              { n: '2', icon: '🗞️', title: '이슈 설정', desc: '에이전트가 읽을 뉴스 헤드라인·내용·토론 질문을 작성합니다.' },
              { n: '3', icon: '🧑‍🤝‍🧑', title: '에이전트 구성', desc: '참여자의 나이·직업·성격·가치관·초기 입장을 설정합니다.' },
              { n: '4', icon: '▶', title: '시뮬레이션 실행', desc: '대화 생성·태도 변화를 실시간으로 관찰하고 JSON으로 저장합니다.' },
            ].map(s => (
              <div key={s.n} className="panel-2 rounded-lg p-3 flex gap-3">
                <div className="text-xl flex-shrink-0 mt-0.5">{s.icon}</div>
                <div>
                  <div className="text-xs font-mono font-bold text-[var(--amber)] mb-0.5">{s.n}. {s.title}</div>
                  <div className="text-[11px] text-[var(--text-faint)] leading-snug">{s.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Default notice */}
          <div className="flex items-start gap-2 bg-amber-500/8 border border-amber-500/20 rounded-lg px-4 py-3">
            <span className="text-amber-400 flex-shrink-0 mt-0.5">💡</span>
            <p className="text-[12px] text-[var(--text-dim)] leading-relaxed">
              <span className="text-amber-300 font-medium">아래 설정은 예제 기본값</span>입니다.
              최저임금 1만 5000원 인상안 뉴스와 강경보수·보수·중도·진보·강경진보 5명의 에이전트가 미리 구성되어 있습니다.
              이슈와 에이전트 구성을 자유롭게 바꿔 다양한 주제와 집단을 실험해볼 수 있습니다.
            </p>
          </div>
        </section>

        {/* API Key */}
        <section className="panel rounded-lg p-5 space-y-3">
          <div className="flex items-baseline gap-3 mb-2">
            <span className="font-mono text-[11px] tracking-widest text-[var(--amber)]">01 / API KEY</span>
            <span className="text-sm text-[var(--text-dim)]">본인의 Gemini API Key 입력 (Google AI Studio 무료 발급)</span>
          </div>
          <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
            placeholder="AIzaSy..."
            className="w-full bg-[var(--bg)] border border-[var(--border)] rounded px-3 py-2.5 text-sm font-mono focus:border-[var(--amber)] outline-none" />
          <KeyInstructions />
          <div>
            <div className="text-[10px] font-mono uppercase text-[var(--text-faint)] mb-1">
              Apps Script URL{' '}
              <span className="normal-case font-normal">— 선택사항 · 입력 시 결과가 Google Sheets에 자동 저장</span>
            </div>
            <input type="text" value={scriptUrl} onChange={e => setScriptUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/…/exec"
              className="w-full bg-[var(--bg)] border border-[var(--border)] rounded px-3 py-2.5 text-sm font-mono focus:border-[var(--amber)] outline-none" />
          </div>
        </section>

        {/* Topic */}
        <section className="panel rounded-lg p-5">
          <div className="flex items-baseline justify-between mb-4">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-[11px] tracking-widest text-[var(--amber)]">02 / 뉴스 · 이슈</span>
              <span className="text-sm text-[var(--text-dim)]">에이전트가 읽고 토론할 주제</span>
            </div>
            <button onClick={() => setTopic(DEFAULT_TOPIC)}
              className="text-[10px] font-mono text-[var(--text-faint)] hover:text-[var(--amber)] transition">
              ↺ 기본값
            </button>
          </div>
          <div className="space-y-3">
            <div>
              <div className="text-[10px] font-mono uppercase text-[var(--text-faint)] mb-1">헤드라인</div>
              <input value={topic.headline} onChange={e => setTopic({ ...topic, headline: e.target.value })}
                className="w-full font-display text-xl font-semibold bg-[var(--bg)] border border-[var(--border)] rounded px-3 py-2 focus:border-[var(--amber)] outline-none" />
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase text-[var(--text-faint)] mb-1">기사 내용 요약</div>
              <textarea value={topic.content} onChange={e => setTopic({ ...topic, content: e.target.value })}
                rows={4}
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--amber)] outline-none leading-relaxed resize-none" />
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase text-[var(--text-faint)] mb-1">
                토론 질문
                <span className="ml-1 normal-case text-[var(--text-faint)] font-normal">— 찬반 척도 설명 포함 권장 (예: −5 강력 반대 ↔ +5 강력 찬성)</span>
              </div>
              <input value={topic.question} onChange={e => setTopic({ ...topic, question: e.target.value })}
                placeholder="예: 이 정책에 찬성하십니까? (-5: 강력 반대 ↔ +5: 강력 찬성)"
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--amber)] outline-none" />
            </div>
          </div>
        </section>

        {/* Agents */}
        <section>
          <div className="flex items-baseline justify-between mb-4">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-[11px] tracking-widest text-[var(--amber)]">03 / 에이전트 구성</span>
              <span className="text-sm text-[var(--text-dim)]">시뮬레이션에 참여할 {agents.length}명 설정</span>
            </div>
            <button onClick={() => setAgents(DEFAULT_AGENTS.map(a => ({ ...a })))}
              className="text-[10px] font-mono text-[var(--text-faint)] hover:text-[var(--amber)] transition">
              ↺ 기본값으로 초기화
            </button>
          </div>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {agents.map((agent, idx) => (
              <AgentForm key={agent.id} agent={agent} index={idx}
                onChange={(field, value) => updateAgent(idx, field, value)} />
            ))}
          </div>
        </section>

        {/* Start */}
        {error && (
          <div className="text-rose-400 text-sm font-mono bg-rose-900/20 border border-rose-800/50 rounded px-4 py-3">
            {error}
          </div>
        )}
        <div className="flex justify-end pb-8">
          <button onClick={handleStart}
            className="px-10 py-3.5 bg-[var(--amber)] text-black font-bold text-base rounded-lg hover:bg-amber-400 transition shadow-lg">
            시뮬레이션 시작 →
          </button>
        </div>
      </main>
    </div>
  )
}

/* ============================================================
 * 4. 시뮬레이션 화면 컴포넌트
 * ============================================================ */
const PHASES = [
  { id: 'reading',    label: '뉴스 읽기', icon: '📰', desc: '에이전트들이 뉴스를 읽는 중' },
  { id: 'pairing',    label: '페어링',    icon: '🔀', desc: '무작위 대화 상대 매칭 중' },
  { id: 'discussing', label: '대화 생성', icon: '💬', desc: 'Gemini로 대화 생성 중' },
]

function AttitudeBar({ value, small }) {
  const pct = ((value + 5) / 10) * 100
  return (
    <div className={`relative ${small ? 'h-1' : 'h-2'} rounded-full att-track overflow-visible`}>
      <div className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full bg-white border border-black shadow
                       ${small ? 'w-2 h-2' : 'w-3 h-3'}`}
           style={{ left: `${pct}%` }} />
    </div>
  )
}

function AgentMini({ agent, pulse }) {
  const color = IDEOLOGY_COLOR[agent.ideology]
  return (
    <div className="text-center select-none" style={{ minWidth: 80 }}>
      <div className={`w-16 h-16 rounded-full grid place-items-center font-display font-bold text-2xl mx-auto transition-all duration-300 ${pulse ? 'glow-anim' : ''}`}
           style={{ background: `${color}22`, color, border: `2px solid ${color}`,
                    boxShadow: pulse ? `0 0 20px ${color}66` : 'none' }}>
        {agent.name.charAt(0)}
      </div>
      <div className="text-sm mt-2 font-medium">{agent.name}</div>
      <div className="text-[11px] text-[var(--text-faint)]">{IDEOLOGY_LABEL[agent.ideology]}</div>
      <div className="font-mono text-base font-bold mt-1" style={{ color }}>
        {agent.attitude > 0 ? '+' : ''}{agent.attitude}
      </div>
      <div className="mt-1 px-2"><AttitudeBar value={agent.attitude} small /></div>
    </div>
  )
}

function AgentCard({ agent, isActive, lastDelta }) {
  const color     = IDEOLOGY_COLOR[agent.ideology]
  const deltaSign = lastDelta > 0 ? '+' : ''
  return (
    <div className={`panel-2 rounded-md p-3 transition-all ${isActive ? 'ring-glow' : ''}`}>
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full grid place-items-center font-display font-bold text-sm flex-shrink-0"
             style={{ background: `${color}22`, color, border: `1px solid ${color}55` }}>
          {agent.name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-medium truncate">{agent.name}</span>
            <span className="text-[10px] font-mono text-[var(--text-faint)]">{IDEOLOGY_LABEL[agent.ideology]}</span>
          </div>
          <div className="text-[11px] text-[var(--text-faint)] truncate">
            {agent.age}세 {agent.gender} · {agent.occupation}
          </div>
        </div>
      </div>
      <div className="mt-3">
        <div className="flex items-baseline justify-between text-[10px] font-mono mb-1">
          <span className="text-[var(--text-faint)]">반대 −5</span>
          <span className="font-bold" style={{ color }}>
            {agent.attitude > 0 ? '+' : ''}{agent.attitude}
            {lastDelta !== undefined && lastDelta !== 0 && (
              <span className={`ml-1 text-[9px] ${lastDelta > 0 ? 'text-amber-400' : 'text-cyan-400'}`}>
                ({deltaSign}{lastDelta})
              </span>
            )}
          </span>
          <span className="text-[var(--text-faint)]">+5 찬성</span>
        </div>
        <AttitudeBar value={agent.attitude} />
      </div>
      {agent.memories.length > 0 && (
        <div className="mt-2 pt-2 border-t border-[var(--border)]">
          <div className="text-[9px] font-mono uppercase text-[var(--text-faint)] mb-1">최근 기억</div>
          <div className="text-[11px] text-[var(--text-dim)] leading-snug line-clamp-2">
            "{agent.memories[agent.memories.length - 1]}"
          </div>
        </div>
      )}
    </div>
  )
}

function SimulationStep({ phase, activePair, agents, currentRound, currentPairIndex, totalPairs }) {
  const A = activePair ? agents.find(a => a.id === activePair[0]) : null
  const B = activePair ? agents.find(a => a.id === activePair[1]) : null
  return (
    <section className="panel rounded-lg p-5">
      <div className="flex items-baseline justify-between mb-4">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[11px] tracking-widest text-[var(--amber)]">LIVE / STEP</span>
          <span className="text-sm text-[var(--text-dim)]">실시간 시뮬레이션 단계</span>
        </div>
        {currentRound > 0 && (
          <div className="font-mono text-xs text-[var(--text-faint)]">
            R<span className="text-amber-400 font-bold">{currentRound}</span>
            {totalPairs > 0 && <span> · pair <span className="text-amber-400">{currentPairIndex}</span>/{totalPairs}</span>}
          </div>
        )}
      </div>
      <div className="flex gap-1.5 mb-5">
        {PHASES.map(step => {
          const isActive = phase === step.id
          return (
            <div key={step.id}
              className={`flex-1 rounded py-2 px-1 text-center transition-all duration-300 ${
                isActive ? 'bg-amber-500 text-black' : 'bg-[var(--surface-2)] text-[var(--text-faint)]'
              }`}>
              <div className="text-base leading-none">{step.icon}</div>
              <div className="text-[10px] font-mono font-bold mt-1">{step.label}</div>
              {isActive && <div className="text-[9px] mt-0.5 opacity-80">{step.desc}</div>}
            </div>
          )
        })}
      </div>
      {A && B ? (
        <div className="flex items-center justify-center gap-4 mt-2 fade-in">
          <AgentMini agent={A} pulse={phase === 'discussing'} />
          <div className="flex flex-col items-center gap-2 flex-shrink-0">
            {phase === 'discussing' ? (
              <>
                <div className="text-2xl connecting">💬</div>
                <div className="text-[10px] font-mono text-amber-400 pulse-dot whitespace-nowrap">대화 생성 중</div>
              </>
            ) : (
              <div className="text-xl text-[var(--text-faint)]">↔</div>
            )}
          </div>
          <AgentMini agent={B} pulse={phase === 'discussing'} />
        </div>
      ) : (
        <div className="text-center py-8 text-[var(--text-faint)] text-sm italic font-display">
          {phase === 'idle' && '시뮬레이션 대기 중 — ▶ 시작 버튼을 누르세요'}
          {phase === 'reading' && '📰 에이전트들이 뉴스를 읽고 있습니다…'}
          {phase === 'pairing' && '🔀 대화 상대를 무작위로 매칭하는 중…'}
        </div>
      )}
    </section>
  )
}

function AttitudeChart({ agents, currentRound }) {
  const data = useMemo(() => {
    const maxR = Math.max(currentRound, ...agents.flatMap(a => a.attitudeHistory.map(h => h.round)))
    const rows = []
    for (let r = 0; r <= maxR; r++) {
      const pt = { round: r }
      agents.forEach(a => {
        const h = a.attitudeHistory.find(h => h.round === r)
        if (h) pt[a.name] = h.value
      })
      rows.push(pt)
    }
    return rows
  }, [agents, currentRound])

  return (
    <div className="panel rounded-lg p-5">
      <div className="flex items-baseline justify-between mb-3">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[11px] tracking-widest text-[var(--amber)]">TRAJECTORIES</span>
          <span className="text-sm text-[var(--text-dim)]">태도 변화</span>
        </div>
        <div className="font-mono text-xs text-[var(--text-faint)]">
          σ = <span className="text-[var(--amber)]">{polarization(agents).toFixed(2)}</span>
        </div>
      </div>
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: -12 }}>
            <CartesianGrid stroke="#283149" strokeDasharray="2 4" />
            <XAxis dataKey="round" stroke="#6b7587" tick={{ fontSize: 11 }} />
            <YAxis domain={[-5, 5]} stroke="#6b7587" tick={{ fontSize: 11 }} ticks={[-5, -3, 0, 3, 5]} />
            <ReferenceLine y={0} stroke="#6b7587" strokeDasharray="3 3" />
            <Tooltip contentStyle={{ background: '#131a2b', border: '1px solid #283149', fontSize: 12 }} />
            {agents.map(a => (
              <Line key={a.id} type="monotone" dataKey={a.name}
                stroke={IDEOLOGY_COLOR[a.ideology]} strokeWidth={1.5}
                dot={{ r: 2 }} activeDot={{ r: 4 }} connectNulls isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-[10px] font-mono text-[var(--text-faint)]">
        {agents.map(a => (
          <span key={a.id}>
            <span className="inline-block w-3 h-[2px] mr-1 align-middle" style={{ background: IDEOLOGY_COLOR[a.ideology] }}></span>
            {a.name}
          </span>
        ))}
      </div>
    </div>
  )
}

function ConversationLog({ conversations, agents }) {
  const ref = useRef(null)
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight }, [conversations.length])
  const findAgent = (id) => agents.find(a => a.id === id)
  return (
    <div className="panel rounded-lg p-5 flex flex-col" style={{ height: '500px' }}>
      <div className="flex items-baseline gap-3 mb-3">
        <span className="font-mono text-[11px] tracking-widest text-[var(--amber)]">DIALOGUES</span>
        <span className="text-sm text-[var(--text-dim)]">실시간 대화 로그</span>
        <span className="ml-auto font-mono text-[10px] text-[var(--text-faint)]">{conversations.length} pairs</span>
      </div>
      <div ref={ref} className="flex-1 overflow-y-auto scroll-thin pr-2 space-y-4">
        {conversations.length === 0 && (
          <div className="text-center text-[var(--text-faint)] text-sm pt-12 italic font-display">
            시뮬레이션을 시작하면 대화가 여기에 표시됩니다.
          </div>
        )}
        {conversations.map((c) => {
          const A = findAgent(c.agentAId)
          const B = findAgent(c.agentBId)
          if (!A || !B) return null
          return (
            <div key={c.key} className="fade-in panel-2 rounded p-3">
              <div className="flex items-center gap-2 text-[10px] font-mono text-[var(--text-faint)] mb-2">
                <span className="text-[var(--amber)]">R{c.round}</span>
                <span>·</span>
                <span style={{ color: IDEOLOGY_COLOR[A.ideology] }}>{A.name}</span>
                <span>↔</span>
                <span style={{ color: IDEOLOGY_COLOR[B.ideology] }}>{B.name}</span>
                <span className="ml-auto">
                  Δ {A.name.slice(0, 1)}:{c.aDelta > 0 ? '+' : ''}{c.aDelta} · {B.name.slice(0, 1)}:{c.bDelta > 0 ? '+' : ''}{c.bDelta}
                </span>
              </div>
              <div className="space-y-1.5 text-sm leading-relaxed">
                {c.dialogue.map((d, i) => {
                  const speaker = d.speaker === 'A' ? A : B
                  return (
                    <div key={i} className="flex gap-2">
                      <span className="font-medium flex-shrink-0" style={{ color: IDEOLOGY_COLOR[speaker.ideology] }}>
                        {speaker.name}
                      </span>
                      <span className="text-[var(--text)]">{d.text}</span>
                    </div>
                  )
                })}
              </div>
              {(c.aReason || c.bReason) && (
                <div className="mt-2 pt-2 border-t border-[var(--border)] text-[11px] text-[var(--text-faint)] italic space-y-0.5">
                  {c.aReason && <div>· {A.name}: {c.aReason}</div>}
                  {c.bReason && <div>· {B.name}: {c.bReason}</div>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StatusLog({ logs }) {
  const ref = useRef(null)
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight }, [logs.length])
  return (
    <div ref={ref} className="panel rounded-lg p-3 font-mono text-[11px] text-[var(--text-dim)] h-36 overflow-y-auto scroll-thin">
      {logs.length === 0 && <div className="text-[var(--text-faint)] italic">시스템 로그…</div>}
      {logs.map((l, i) => (
        <div key={i}>
          <span className="text-[var(--text-faint)]">[{l.t}]</span>{' '}
          <span className={l.kind === 'err' ? 'text-rose-400' : l.kind === 'ok' ? 'text-emerald-400' : ''}>{l.msg}</span>
        </div>
      ))}
    </div>
  )
}

function ResultsPanel({ agents, conversations, topic, simulationId, currentRound }) {
  const downloadJSON = () => {
    const data = {
      simulationId, exportedAt: new Date().toISOString(), topic, rounds: currentRound,
      agents: agents.map(a => ({
        id: a.id, name: a.name, age: a.age, gender: a.gender, location: a.location,
        occupation: a.occupation, income: a.income, personality: a.personality,
        ideology: a.ideology, ideologyLabel: IDEOLOGY_LABEL[a.ideology],
        values: a.values,
        initialAttitude: a.initialAttitude, finalAttitude: a.attitude,
        delta: a.attitude - a.initialAttitude,
        attitudeHistory: a.attitudeHistory, memories: a.memories,
      })),
      conversations: conversations.map(c => ({
        round: c.round, agentAId: c.agentAId, agentBId: c.agentBId,
        dialogue: c.dialogue, aDelta: c.aDelta, bDelta: c.bDelta,
        aMemory: c.aMemory, bMemory: c.bMemory, aReason: c.aReason, bReason: c.bReason,
      })),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const el   = document.createElement('a')
    el.href    = url
    el.download = `simulation_${simulationId || Date.now()}.json`
    el.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="panel rounded-lg p-5 fade-in">
      <div className="flex items-baseline justify-between mb-4">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[11px] tracking-widest text-[var(--amber)]">RESULTS</span>
          <span className="text-sm text-[var(--text-dim)]">최종 결과 요약</span>
        </div>
        <button onClick={downloadJSON}
          className="px-4 py-2 border border-[var(--amber)] text-[var(--amber)] text-xs font-mono rounded hover:bg-amber-500/10 transition">
          ↓ JSON 다운로드
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] font-mono uppercase text-[var(--text-faint)] border-b border-[var(--border)]">
              <th className="text-left py-2 pr-4">에이전트</th>
              <th className="text-left py-2 pr-3">이념</th>
              <th className="text-center py-2 pr-3">초기</th>
              <th className="text-center py-2 pr-3">최종</th>
              <th className="text-center py-2 pr-3">변화</th>
              <th className="text-left py-2">마지막 기억</th>
            </tr>
          </thead>
          <tbody>
            {agents.map(a => {
              const color = IDEOLOGY_COLOR[a.ideology]
              const delta = a.attitude - a.initialAttitude
              return (
                <tr key={a.id} className="border-b border-[var(--border)]/50 hover:bg-white/[0.02] transition">
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full grid place-items-center text-xs font-bold flex-shrink-0"
                           style={{ background: `${color}22`, color, border: `1px solid ${color}55` }}>
                        {a.name.charAt(0)}
                      </div>
                      <div>
                        <div className="font-medium">{a.name}</div>
                        <div className="text-[10px] text-[var(--text-faint)]">{a.age}세 {a.gender}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-2 pr-3">
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: `${color}22`, color }}>
                      {IDEOLOGY_LABEL[a.ideology]}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-center font-mono text-[var(--text-dim)]">
                    {a.initialAttitude > 0 ? '+' : ''}{a.initialAttitude}
                  </td>
                  <td className="py-2 pr-3 text-center font-mono font-bold" style={{ color }}>
                    {a.attitude > 0 ? '+' : ''}{a.attitude}
                  </td>
                  <td className="py-2 pr-3 text-center font-mono text-xs">
                    <span className={delta > 0 ? 'text-amber-400' : delta < 0 ? 'text-cyan-400' : 'text-[var(--text-faint)]'}>
                      {delta > 0 ? '+' : ''}{delta}
                    </span>
                  </td>
                  <td className="py-2 text-[11px] text-[var(--text-faint)] italic max-w-[260px] truncate">
                    {a.memories.length > 0 ? `"${a.memories[a.memories.length - 1]}"` : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 pt-3 border-t border-[var(--border)] flex flex-wrap gap-5 text-xs font-mono text-[var(--text-faint)]">
        <span>완료 라운드 <span className="text-[var(--amber)]">{currentRound}</span></span>
        <span>총 대화 <span className="text-[var(--amber)]">{conversations.length}</span>쌍</span>
        <span>σ (편차) <span className="text-[var(--amber)]">{polarization(agents).toFixed(3)}</span></span>
        {simulationId && <span>ID <span className="text-[var(--text-dim)]">{simulationId.slice(0, 24)}</span></span>}
      </div>
    </section>
  )
}

/* ============================================================
 * 5. 시뮬레이션 뷰 (메인 실행)
 * ============================================================ */
function SimulationView({ config, onBack }) {
  const { apiKey, scriptUrl, agents: configAgents, topic } = config

  const makeInitialAgents = useCallback(() =>
    configAgents.map(a => ({
      ...a,
      attitude:        a.initialAttitude,
      attitudeHistory: [{ round: 0, value: a.initialAttitude }],
      memories:        [],
    })), [configAgents])

  const [agents,        setAgents]        = useState(makeInitialAgents)
  const [conversations, setConversations] = useState([])
  const [currentRound,  setCurrentRound]  = useState(0)
  const [maxRounds,     setMaxRounds]     = useState(5)
  const [isRunning,     setIsRunning]     = useState(false)
  const [activePair,    setActivePair]    = useState(null)
  const [lastDeltas,    setLastDeltas]    = useState({})
  const [logs,          setLogs]          = useState([])
  const [phase,         setPhase]         = useState('idle')
  const [simulationId,  setSimulationId]  = useState('')
  const [pairProgress,  setPairProgress]  = useState({ current: 0, total: 0 })
  const [dailyUsed,     setDailyUsed]     = useState(() => getDailyUsage().count)

  const refreshDailyUsed = () => setDailyUsed(getDailyUsage().count)

  const stopRef   = useRef(false)
  const agentsRef = useRef(agents)
  const simIdRef  = useRef('')
  useEffect(() => { agentsRef.current = agents }, [agents])

  const log = useCallback((msg, kind = '') => {
    const t = new Date().toLocaleTimeString('ko-KR', { hour12: false })
    setLogs(ls => [...ls.slice(-300), { t, msg, kind }])
  }, [])

  const logToSheets = useCallback((kind, payload) => {
    if (!scriptUrl) return
    fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'log', kind, payload }),
    }).catch(() => {})
  }, [scriptUrl])

  const status = isRunning
    ? `R${currentRound} 실행 중`
    : (currentRound > 0 ? `R${currentRound} 완료` : '대기 중')

  const runConversation = async (round, A, B, sid) => {
    setActivePair([A.id, B.id])
    setPhase('discussing')
    log(`R${round} · ${A.name} ↔ ${B.name} 대화 생성 중… (15RPM 제한 자동 준수)`)
    let parsed = null
    try {
      const text = await callGemini(apiKey, buildPrompt(topic, A, B))
      parsed     = safeParseJSON(text)
      if (!parsed) throw new Error('JSON 파싱 실패')
    } catch (e) {
      log(`✗ ${A.name} ↔ ${B.name}: ${e.message}`, 'err')
      setActivePair(null)
      setPhase('idle')
      return null
    }
    const aNew   = clamp(Math.round(parsed.a_new_attitude ?? A.attitude), -5, 5)
    const bNew   = clamp(Math.round(parsed.b_new_attitude ?? B.attitude), -5, 5)
    const aDelta = aNew - A.attitude
    const bDelta = bNew - B.attitude
    return {
      round, agentAId: A.id, agentBId: B.id,
      dialogue: Array.isArray(parsed.dialogue) ? parsed.dialogue : [],
      aNew, bNew, aDelta, bDelta,
      aMemory: parsed.a_memory || '', bMemory: parsed.b_memory || '',
      aReason: parsed.a_reason || '', bReason: parsed.b_reason || '',
    }
  }

  const runRound = async (round, sid) => {
    log(`━━━ ROUND ${round} 시작 ━━━`)
    setPhase('reading')
    setActivePair(null)
    await new Promise(r => setTimeout(r, 600))

    setPhase('pairing')
    const currentAgents = agentsRef.current
    const pairs = pairAgents(currentAgents)
    setPairProgress({ current: 0, total: pairs.length })
    log(`페어링: ${pairs.map(([a, b]) => `${a.name}-${b.name}`).join(', ')}`)
    await new Promise(r => setTimeout(r, 400))

    for (let pi = 0; pi < pairs.length; pi++) {
      if (stopRef.current) break
      const [A, B] = pairs[pi]
      setPairProgress({ current: pi + 1, total: pairs.length })
      const r = await runConversation(round, A, B, sid)
      refreshDailyUsed()
      if (!r) continue
      setAgents(curr => curr.map(a => {
        if (a.id === A.id) return { ...a, attitude: r.aNew, attitudeHistory: [...a.attitudeHistory, { round, value: r.aNew }], memories: [...a.memories, r.aMemory].filter(Boolean).slice(-6) }
        if (a.id === B.id) return { ...a, attitude: r.bNew, attitudeHistory: [...a.attitudeHistory, { round, value: r.bNew }], memories: [...a.memories, r.bMemory].filter(Boolean).slice(-6) }
        return a
      }))
      setLastDeltas(d => ({ ...d, [A.id]: r.aDelta, [B.id]: r.bDelta }))
      setConversations(cs => [...cs, { ...r, key: `${round}-${A.id}-${B.id}` }])
      logToSheets('conversation', {
        simulationId: sid,
        round,
        agentAId: A.id, agentAName: A.name,
        agentBId: B.id, agentBName: B.name,
        dialogue: r.dialogue,
        aOldAttitude: A.attitude, aNewAttitude: r.aNew, aDelta: r.aDelta,
        aMemory: r.aMemory, aReason: r.aReason,
        bOldAttitude: B.attitude, bNewAttitude: r.bNew, bDelta: r.bDelta,
        bMemory: r.bMemory, bReason: r.bReason,
      })
      log(`✓ ${A.name}(${r.aDelta > 0 ? '+' : ''}${r.aDelta}) ↔ ${B.name}(${r.bDelta > 0 ? '+' : ''}${r.bDelta})`, 'ok')
    }

    setAgents(curr => curr.map(a => {
      const has = a.attitudeHistory.some(h => h.round === round)
      return has ? a : { ...a, attitudeHistory: [...a.attitudeHistory, { round, value: a.attitude }] }
    }))
    setActivePair(null)
    setPairProgress({ current: 0, total: 0 })
    setPhase('idle')
    const snap = agentsRef.current
    const atts = snap.map(a => a.attitude)
    const mean = atts.reduce((s, v) => s + v, 0) / atts.length
    log(`R${round} 완료 · σ=${polarization(snap).toFixed(2)} · 평균=${mean.toFixed(2)}`, 'ok')
    logToSheets('round_stats', {
      simulationId: sid,
      round,
      polarization: parseFloat(polarization(snap).toFixed(3)),
      mean: parseFloat(mean.toFixed(3)),
      min: Math.min(...atts),
      max: Math.max(...atts),
    })
  }

  const onStart = async () => {
    let from = currentRound
    let sid  = simIdRef.current
    if (currentRound >= maxRounds || !sid) {
      sid = genSimId()
      simIdRef.current = sid
      setSimulationId(sid)
      const fresh = makeInitialAgents()
      agentsRef.current = fresh
      setAgents(fresh)
      setConversations([])
      setLastDeltas({})
      setCurrentRound(0)
      from = 0
      log('새 시뮬레이션: ' + sid, 'ok')
      logToSheets('simulation_start', {
        simulationId: sid,
        startedAt: new Date().toISOString(),
        topicHeadline: topic.headline,
        numAgents: configAgents.length,
        maxRounds,
        agents: configAgents.map(a => ({
          id: a.id, name: a.name, age: a.age, occupation: a.occupation,
          ideology: a.ideology, initialAttitude: a.initialAttitude,
        })),
      })
    }
    stopRef.current = false
    setIsRunning(true)
    log(`시뮬레이션 시작 · ${maxRounds} rounds × ${Math.floor(configAgents.length / 2)} pairs · 15RPM 자동 준수`)
    for (let r = from + 1; r <= maxRounds; r++) {
      if (stopRef.current) { log('사용자 중단', 'err'); break }
      setCurrentRound(r)
      await runRound(r, sid)
    }
    setIsRunning(false)
    setActivePair(null)
    setPhase('idle')
    log('━━━ 시뮬레이션 종료 ━━━', 'ok')
  }

  const onStop  = () => { stopRef.current = true }
  const onReset = () => {
    const fresh = makeInitialAgents()
    agentsRef.current = fresh
    simIdRef.current  = ''
    setAgents(fresh)
    setConversations([])
    setCurrentRound(0)
    setLastDeltas({})
    setActivePair(null)
    setPhase('idle')
    setSimulationId('')
    setPairProgress({ current: 0, total: 0 })
    log('초기화', 'ok')
  }

  return (
    <div className="min-h-screen grain">
      {/* Header */}
      <header className="border-b border-[var(--border)] bg-[var(--bg)]/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] text-[var(--text-faint)] uppercase">Computational Social Science · Lab</div>
            <h1 className="font-display text-3xl font-extrabold mt-1">
              Generative Agent Simulation
              <span className="text-[var(--amber)] italic font-normal text-2xl ml-2">— {configAgents.length}인 토론</span>
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right text-xs font-mono text-[var(--text-dim)]">
              <div><span className="pulse-dot"></span>{status}</div>
              <div className="text-[var(--text-faint)] mt-1">{GEMINI_MODEL} · 15 RPM</div>
              <div className="mt-1 flex items-center justify-end gap-1">
                <span className="text-[var(--text-faint)]">오늘 사용</span>
                <span className={
                  dailyUsed >= DAILY_CALL_LIMIT ? 'text-rose-400 font-bold' :
                  dailyUsed >= DAILY_CALL_LIMIT * 0.8 ? 'text-amber-400 font-bold' :
                  'text-emerald-400'
                }>{dailyUsed}/{DAILY_CALL_LIMIT}</span>
                {dailyUsed >= DAILY_CALL_LIMIT && <span className="text-rose-400">· 한도 초과</span>}
              </div>
            </div>
            {!isRunning && (
              <button onClick={onBack}
                className="px-4 py-2 border border-[var(--border)] text-[var(--text-dim)] rounded text-sm hover:border-[var(--amber)] hover:text-[var(--amber)] transition">
                ← 설정
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-6 space-y-6">

        {/* Topic summary */}
        <section className="panel rounded-lg px-5 py-4">
          <div className="flex items-baseline gap-3 mb-2">
            <span className="font-mono text-[11px] tracking-widest text-[var(--amber)]">STIMULUS</span>
            <span className="font-display font-semibold text-lg truncate">{topic.headline}</span>
          </div>
          <div className="text-xs text-[var(--text-faint)] italic">{topic.question}</div>
        </section>

        {/* Controls */}
        <section className="panel rounded-lg p-5">
          <div className="flex items-baseline gap-3 mb-3">
            <span className="font-mono text-[11px] tracking-widest text-[var(--amber)]">CONTROL</span>
            <span className="text-sm text-[var(--text-dim)]">시뮬레이션 실행</span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="font-mono text-sm">
              <span className="text-[var(--text-faint)]">진행</span>{' '}
              <span className="text-2xl font-display font-bold text-[var(--amber)]">
                {String(currentRound).padStart(2, '0')}
              </span>
              <span className="text-[var(--text-faint)]">/{String(maxRounds).padStart(2, '0')}</span>
            </div>
            <div className="flex-1 h-1.5 bg-[var(--bg)] rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-cyan-400 to-amber-400 transition-all"
                   style={{ width: `${(currentRound / maxRounds) * 100}%` }} />
            </div>
            <label className="flex items-center gap-2 text-xs">
              <span className="text-[var(--text-faint)] font-mono">ROUNDS</span>
              <input type="number" min="1" max="5" value={maxRounds} disabled={isRunning}
                onChange={e => setMaxRounds(clamp(parseInt(e.target.value) || 5, 1, 5))}
                className="w-14 bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1 text-sm font-mono text-center disabled:opacity-50" />
            </label>
            {!isRunning ? (
              <button onClick={onStart}
                className="px-5 py-2 bg-[var(--amber)] text-black font-medium rounded text-sm hover:bg-amber-400 transition">
                ▶ {currentRound > 0 ? '재시작' : '시뮬레이션 시작'}
              </button>
            ) : (
              <button onClick={onStop}
                className="px-5 py-2 bg-rose-500 text-white font-medium rounded text-sm hover:bg-rose-400 transition">
                ■ 중단
              </button>
            )}
            <button onClick={onReset} disabled={isRunning}
              className="px-3 py-2 border border-[var(--border)] text-[var(--text-dim)] rounded text-sm hover:border-[var(--amber)] disabled:opacity-40 transition">
              ↺ 초기화
            </button>
          </div>
        </section>

        <SimulationStep phase={phase} activePair={activePair} agents={agents}
          currentRound={currentRound} currentPairIndex={pairProgress.current} totalPairs={pairProgress.total} />

        <div className="grid xl:grid-cols-[2fr_3fr_3fr] gap-6">
          {/* Agents */}
          <section className="panel rounded-lg p-5">
            <div className="flex items-baseline gap-3 mb-4">
              <span className="font-mono text-[11px] tracking-widest text-[var(--amber)]">AGENTS</span>
              <span className="text-sm text-[var(--text-dim)]">{configAgents.length}명의 시민</span>
            </div>
            <div className="grid sm:grid-cols-2 xl:grid-cols-1 gap-3">
              {agents.map(a => (
                <AgentCard key={a.id} agent={a}
                  isActive={activePair && activePair.includes(a.id)}
                  lastDelta={lastDeltas[a.id]} />
              ))}
            </div>
          </section>
          <ConversationLog conversations={conversations} agents={agents} />
          <div className="space-y-4">
            <AttitudeChart agents={agents} currentRound={currentRound} />
            <StatusLog logs={logs} />
          </div>
        </div>

        {/* Results */}
        {currentRound > 0 && (
          <ResultsPanel agents={agents} conversations={conversations} topic={topic}
            simulationId={simulationId} currentRound={currentRound} />
        )}

        <footer className="text-center text-[10px] font-mono text-[var(--text-faint)] py-8 border-t border-[var(--border)]">
          Generative Agent Simulation · React + Vite · {GEMINI_MODEL} · 15 RPM 자동 준수 ·
          <span className="text-[var(--amber)]"> Computational Social Science</span>
        </footer>
      </main>
    </div>
  )
}

/* ============================================================
 * 6. 메인 앱 (뷰 전환)
 * ============================================================ */
export default function App() {
  const [view,      setView]      = useState('setup')
  const [simConfig, setSimConfig] = useState(null)

  const handleStart = (config) => {
    setSimConfig(config)
    setView('simulation')
  }

  if (view === 'setup' || !simConfig) {
    return <SetupView onStart={handleStart} />
  }
  return <SimulationView config={simConfig} onBack={() => setView('setup')} />
}

/**
 * Generative Agent Simulation – Apps Script Backend
 * ===================================================
 *
 * ▶ 설정 절차 (최초 1회)
 *
 * 1) script.google.com → 새 프로젝트 → 이 파일 전체 붙여넣기
 *
 * 2) 스크립트 속성 등록 (좌측 톱니바퀴 → "스크립트 속성")
 *      키 이름              값
 *      GEMINI_API_KEY      AIzaSy... (Google AI Studio 발급)
 *      LOG_SHEET_ID        스프레드시트 URL의 /d/...... / 부분
 *
 * 3) 편집기 상단 함수 드롭다운에서 setup 선택 → ▶ 실행
 *    → 권한 허용 → 시트 5개 자동 생성 확인
 *
 * 4) 배포 → 새 배포 → 유형: 웹 앱
 *      실행 사용자 : 나
 *      액세스 권한 : 모든 사용자
 *
 * 5) 발급된 /exec URL을 React 앱 SETUP 패널에 입력
 *
 * ▶ 시트 구조
 *   simulations  – 시뮬레이션 세션
 *   agents       – 에이전트 프로필
 *   conversations – 대화·태도 변화 전체
 *   attitudes    – 라운드별 에이전트 태도 (분석용)
 *   rounds       – 라운드 집계 통계
 */

const GEMINI_MODEL    = 'gemini-2.5-flash-lite';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Script Properties가 없을 때 사용할 기본 시트 ID
const DEFAULT_LOG_SHEET_ID = '10tkvUGfipdJvu5YqcdoC9vvcEQTDY-OScPpkFQ0dz50';

// 하루 Gemini 호출 상한 (Script Properties의 DAILY_LIMIT으로 덮어쓸 수 있음)
// 시뮬레이션 1회 = 라운드 × 5쌍 호출. 예: 10라운드 = 50회
const DEFAULT_DAILY_LIMIT = 100;

function getProp_(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || '';
}

function getSheetId_() {
  return getProp_('LOG_SHEET_ID') || DEFAULT_LOG_SHEET_ID;
}

function getDailyLimit_() {
  const v = parseInt(getProp_('DAILY_LIMIT'));
  return isNaN(v) ? DEFAULT_DAILY_LIMIT : v;
}

/**
 * 오늘 사용량을 1 증가시키고 한도 초과 여부를 반환.
 * LockService로 동시 요청 중복 카운트 방지.
 */
function checkQuota_() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(3000);
  } catch (e) {
    // 락 획득 실패 시 일단 통과 (보수적 허용)
    return { allowed: true, used: -1, limit: getDailyLimit_() };
  }
  try {
    const props = PropertiesService.getScriptProperties();
    const today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
    const storedDate  = props.getProperty('QUOTA_DATE')  || '';
    let   used        = parseInt(props.getProperty('QUOTA_COUNT') || '0');
    const limit       = getDailyLimit_();

    if (storedDate !== today) {
      used = 0;
      props.setProperty('QUOTA_DATE', today);
    }

    if (used >= limit) {
      return { allowed: false, used, limit };
    }

    props.setProperty('QUOTA_COUNT', String(used + 1));
    return { allowed: true, used: used + 1, limit };
  } finally {
    lock.releaseLock();
  }
}

// ─────────────────────────── 라우터 ───────────────────────────

function doGet(e) {
  const props     = PropertiesService.getScriptProperties();
  const today     = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
  const storedDate = props.getProperty('QUOTA_DATE') || '';
  const used      = storedDate === today ? parseInt(props.getProperty('QUOTA_COUNT') || '0') : 0;
  const limit     = getDailyLimit_();

  return jsonOut_({
    ok:             true,
    model:          GEMINI_MODEL,
    serverHasKey:   !!getProp_('GEMINI_API_KEY'),
    serverHasSheet: !!(getProp_('LOG_SHEET_ID') || DEFAULT_LOG_SHEET_ID),
    quota:          { used, limit, remaining: Math.max(0, limit - used), date: today },
    time:           new Date().toISOString()
  });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    if (body.action === 'generate') return jsonOut_(handleGenerate_(body));
    if (body.action === 'log')      return jsonOut_(handleLog_(body));
    return jsonOut_({ ok: false, error: 'unknown action: ' + body.action });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err && err.message || err) });
  }
}

// ─────────────────────────── Gemini 호출 ───────────────────────────

function handleGenerate_(body) {
  const quota = checkQuota_();
  if (!quota.allowed) {
    return { ok: false, error: `일일 사용 한도 초과 (${quota.used}/${quota.limit}). 내일 다시 이용하세요.`, quotaExceeded: true };
  }

  const apiKey = body.apiKey || getProp_('GEMINI_API_KEY');
  if (!apiKey) throw new Error('API 키 없음. 프론트 입력 또는 Script Properties → GEMINI_API_KEY 저장');

  const prompt = body.prompt;
  if (!prompt) throw new Error('prompt 없음');

  const temperature = typeof body.temperature === 'number' ? body.temperature : 0.8;

  const payload = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature,
      topP: 0.95,
      maxOutputTokens: 2048,
      ...(body.json ? { responseMimeType: 'application/json' } : {})
    }
  };

  const res = UrlFetchApp.fetch(
    `${GEMINI_ENDPOINT}?key=${encodeURIComponent(apiKey)}`,
    { method: 'post', contentType: 'application/json',
      payload: JSON.stringify(payload), muteHttpExceptions: true }
  );

  const code = res.getResponseCode();
  const text = res.getContentText();
  if (code !== 200) return { ok: false, error: `Gemini ${code}: ${text.slice(0, 500)}` };

  const data  = JSON.parse(text);
  const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
  const reply = parts.map(p => p.text || '').join('').trim();
  return { ok: true, text: reply };
}

// ─────────────────────────── 시트 로깅 ───────────────────────────

const LOG_SHEETS_ = {
  simulations: {
    name: 'simulations',
    headers: ['simulation_id', 'started_at', 'topic_headline', 'num_agents', 'max_rounds']
  },
  agents: {
    name: 'agents',
    headers: ['simulation_id', 'agent_id', 'name', 'age', 'occupation', 'ideology', 'initial_attitude']
  },
  conversations: {
    name: 'conversations',
    headers: [
      'timestamp', 'simulation_id', 'round',
      'agent_a', 'agent_b', 'dialogue_json',
      'a_old', 'a_new', 'a_delta', 'a_memory', 'a_reason',
      'b_old', 'b_new', 'b_delta', 'b_memory', 'b_reason'
    ]
  },
  attitudes: {
    name: 'attitudes',
    headers: ['timestamp', 'simulation_id', 'round', 'agent_id', 'agent_name', 'attitude', 'delta']
  },
  rounds: {
    name: 'rounds',
    headers: ['timestamp', 'simulation_id', 'round', 'polarization', 'mean_attitude', 'min_attitude', 'max_attitude']
  }
};

function handleLog_(body) {
  const sheetId = getSheetId_();
  if (!sheetId) return { ok: true, skipped: true, reason: 'LOG_SHEET_ID not configured' };

  const ss   = SpreadsheetApp.openById(sheetId);
  const kind = body.kind;
  const p    = body.payload || {};
  const ts   = new Date().toISOString();

  try {
    if (kind === 'simulation_start') {
      ensureSheet_(ss, LOG_SHEETS_.simulations).appendRow([
        p.simulationId, p.startedAt, p.topicHeadline, p.numAgents, p.maxRounds
      ]);
      const agSh = ensureSheet_(ss, LOG_SHEETS_.agents);
      (p.agents || []).forEach(a =>
        agSh.appendRow([p.simulationId, a.id, a.name, a.age, a.occupation, a.ideology, a.initialAttitude])
      );
      return { ok: true };
    }

    if (kind === 'conversation') {
      ensureSheet_(ss, LOG_SHEETS_.conversations).appendRow([
        ts, p.simulationId, p.round,
        p.agentAName, p.agentBName, JSON.stringify(p.dialogue),
        p.aOldAttitude, p.aNewAttitude, p.aDelta, p.aMemory, p.aReason,
        p.bOldAttitude, p.bNewAttitude, p.bDelta, p.bMemory, p.bReason
      ]);
      const attSh = ensureSheet_(ss, LOG_SHEETS_.attitudes);
      attSh.appendRow([ts, p.simulationId, p.round, p.agentAId, p.agentAName, p.aNewAttitude, p.aDelta]);
      attSh.appendRow([ts, p.simulationId, p.round, p.agentBId, p.agentBName, p.bNewAttitude, p.bDelta]);
      return { ok: true };
    }

    if (kind === 'round_stats') {
      ensureSheet_(ss, LOG_SHEETS_.rounds).appendRow([
        ts, p.simulationId, p.round, p.polarization, p.mean, p.min, p.max
      ]);
      return { ok: true };
    }

    return { ok: false, error: 'unknown kind: ' + kind };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
}

// ─────────────────────────── 유틸 ───────────────────────────

function ensureSheet_(ss, def) {
  let sh = ss.getSheetByName(def.name);
  if (!sh) {
    sh = ss.insertSheet(def.name);
    sh.getRange(1, 1, 1, def.headers.length).setValues([def.headers]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─────────────────────────── 진단 및 초기화 ───────────────────────────

/** 1단계: 이걸 먼저 실행해서 시트 접근이 되는지 확인 */
function ping() {
  Logger.log('sheetId = ' + getSheetId_());
  try {
    const ss = SpreadsheetApp.openById(getSheetId_());
    Logger.log('✅ 시트 열림: ' + ss.getName() + ' / ' + ss.getUrl());
  } catch (e) {
    Logger.log('❌ 시트 열기 실패: ' + e.message);
  }
}

/** 2단계: ping 성공 후 이걸 실행해서 탭 5개 생성 */
function setup() {
  const sheetId = getSheetId_();
  Logger.log('sheetId = ' + sheetId);

  let ss;
  try {
    ss = SpreadsheetApp.openById(sheetId);
    Logger.log('시트 열림: ' + ss.getName());
  } catch (e) {
    Logger.log('❌ openById 실패: ' + e.message);
    return;
  }

  Object.values(LOG_SHEETS_).forEach(def => {
    try {
      ensureSheet_(ss, def);
      Logger.log('✅ 탭 확인: ' + def.name);
    } catch (e) {
      Logger.log('❌ 탭 생성 실패 (' + def.name + '): ' + e.message);
    }
  });

  Logger.log('완료. URL: ' + ss.getUrl());
}

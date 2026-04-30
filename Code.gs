/**
 * Generative Agent Simulation – Apps Script Backend
 * ---------------------------------------------------
 * Role: Gemini 2.5 Flash Lite API 프록시 + (선택) 시뮬레이션 로그 저장
 *
 * 배포 방법
 * 1) script.google.com → 새 프로젝트 → 이 코드 붙여넣기
 * 2) (선택) PropertiesService에 GEMINI_API_KEY 저장하면 키를 서버에 보관 가능
 *      Project Settings → Script Properties → GEMINI_API_KEY 추가
 * 3) 배포 → 새 배포 → 유형: 웹 앱
 *      • 다음 사용자 인증 정보로 실행: 나
 *      • 액세스 권한: 모든 사용자
 * 4) 배포 후 "웹 앱 URL"을 React 프론트엔드에 입력
 *
 * 보안 메모
 * - 프론트에서 키를 입력받는 모드(BYOK)와 서버 보관 모드 둘 다 지원
 * - 서버 보관을 권장 (GitHub Pages는 정적이라 키가 노출됨)
 */

const GEMINI_MODEL = 'gemini-2.5-flash-lite';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// (선택) 로그를 저장할 스프레드시트 ID. 비워두면 로깅 안 함.
const LOG_SHEET_ID = '';

/** 헬스 체크 */
function doGet(e) {
  return jsonOut({
    ok: true,
    model: GEMINI_MODEL,
    serverHasKey: Boolean(PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY')),
    time: new Date().toISOString()
  });
}

/** 메인 라우터 */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    const action = body.action || 'generate';

    if (action === 'generate') {
      return jsonOut(handleGenerate(body));
    }
    if (action === 'log') {
      return jsonOut(handleLog(body));
    }
    return jsonOut({ ok: false, error: `Unknown action: ${action}` });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err && err.message || err) });
  }
}

/** Gemini 호출 */
function handleGenerate(body) {
  const apiKey = body.apiKey
    || PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) throw new Error('API 키가 없습니다. 프론트에서 입력하거나 Script Properties에 GEMINI_API_KEY를 저장하세요.');

  const prompt = body.prompt;
  if (!prompt) throw new Error('prompt가 비어 있습니다.');

  const wantJson = Boolean(body.json);
  const temperature = typeof body.temperature === 'number' ? body.temperature : 0.8;

  const payload = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature,
      topP: 0.95,
      maxOutputTokens: 2048,
      ...(wantJson ? { responseMimeType: 'application/json' } : {})
    }
  };

  const res = UrlFetchApp.fetch(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = res.getResponseCode();
  const text = res.getContentText();
  if (code !== 200) {
    return { ok: false, error: `Gemini ${code}: ${text.slice(0, 500)}` };
  }

  const data = JSON.parse(text);
  const out = (((data.candidates || [])[0] || {}).content || {}).parts || [];
  const reply = out.map(p => p.text || '').join('').trim();
  return { ok: true, text: reply, raw: data };
}

/** (선택) 시뮬레이션 결과를 시트에 로깅 */
function handleLog(body) {
  if (!LOG_SHEET_ID) return { ok: true, skipped: true };
  const sheet = SpreadsheetApp.openById(LOG_SHEET_ID).getSheets()[0];
  const row = [
    new Date(),
    body.simulationId || '',
    body.round || '',
    body.kind || '',
    JSON.stringify(body.payload || {})
  ];
  sheet.appendRow(row);
  return { ok: true };
}

/** JSON 응답 헬퍼 (Apps Script Web App은 자동으로 CORS Allow-Origin: * 부여) */
function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

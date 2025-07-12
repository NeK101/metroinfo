// ─── API 키 설정 ─────────────────────────────────
const SEARCH_KEY    = '474e6565736e656f3130305350694344'; // 역명→코드
const ARRIVE_ALL    = '4a785a444d6e656f3132306e5371775a'; // 도착(ALL)
const POSITION_KEY  = '586e44667a6e656f313030515263554e'; // 위치
const TIMETABLE_KEY = '514e4a7a636e656f39314d6c484969'; // 시간표
const FIRSTLAST_KEY = '4757714c766e656f313238414f76724f'; // 첫/막차

// ─── DOM 참조 ───────────────────────────────────
const input       = document.getElementById('stationInput');
const suggestions = document.getElementById('suggestions');
const lineSelect  = document.getElementById('lineSelect');
const daySelect   = document.getElementById('daySelect');
const dirSelect   = document.getElementById('dirSelect');
const resultDiv   = document.getElementById('result');

// ─── 자동완성: 키워드 API ────────────────────────
input.addEventListener('input', async () => {
  const raw = input.value.trim();
  suggestions.innerHTML = '';
  if (!raw) return;
  const keyword = raw.endsWith('역') ? raw : raw + '역';
  try {
    const list = await getKeywordStationList(keyword);
    list.slice(0, 10).forEach(s => {
      const li = document.createElement('li');
      li.textContent = `${s.stationName} (${s.lineNumber}호선)`;
      li.onclick = () => {
        input.value = s.stationName;
        lineSelect.value = s.lineNumber;
        suggestions.innerHTML = '';
        runFetch();
      };
      suggestions.appendChild(li);
    });
  } catch {
    suggestions.innerHTML = `<li style="color:red;">검색 오류</li>`;
  }
});

// ─── 옵션 변경 시 조회 ───────────────────────────
[lineSelect, daySelect, dirSelect].forEach(el =>
  el.addEventListener('change', runFetch)
);

// ─── 메인 조회 함수 ─────────────────────────────
async function runFetch() {
  const stationName = input.value.trim();
  const lineNo      = lineSelect.value;
  const weekTag     = daySelect.value;
  const updnLine    = dirSelect.value;
  if (!stationName || !lineNo) return;
  resultDiv.innerHTML = '로딩 중...';

  try {
    // 1) 역코드·호선ID
    const { statnId, subwayId } = await getStationInfo(stationName);

    // 2) 동시 호출
    const [ firstlast, timetable, arrivals, positions ] = await Promise.all([
      getFirstLastByLine(statnId, lineNo, weekTag, updnLine),
      getTimetableById(statnId, updnLine, weekTag),
      getRealtimeArrivalAll(stationName),
      getRealtimePosition(lineNo)
    ]);

    // 3) 결과 렌더링
    resultDiv.innerHTML = `
      <h2>${stationName}역 (${subwayId}호선, 코드 ${statnId})</h2>
      <h3>첫차/막차 (${getDayText(weekTag)}, ${getDirText(updnLine)})</h3>
      <p>첫차: ${firstlast.firstTrain} / 막차: ${firstlast.lastTrain}</p>
      <h3>시간표 (${getDayText(weekTag)}, ${getDirText(updnLine)})</h3>
      <ul>${timetable.slice(0,5).map(r=>
        `<li>${r.TRAIN_NO} → ${r.SUBWAY_STA_NM} 출발 ${r.PUBLICTIME}분</li>`
      ).join('')}</ul>
      <h3>실시간 도착예정</h3>
      <ul>${arrivals.slice(0,5).map(a=>
        `<li>${a.trainLine} / ${Math.floor(a.leftTime/60)}분 ${a.leftTime%60}초 후</li>`
      ).join('')}</ul>
      <h3>실시간 위치 (${lineNo}호선)</h3>
      <ul>${positions.slice(0,5).map(p=>
        `<li>차량 ${p.trainNo} → ${p.statnNm} (${p.direct==='0'?'상행':'하행'})</li>`
      ).join('')}</ul>
    `;
  } catch (e) {
    resultDiv.innerHTML = `<span style="color:red;">오류: ${e.message}</span>`;
  }
}

// ─── 아래에 API 함수들 (getStationInfo, getKeywordStationList, getRealtimeArrivalAll, getRealtimePosition, getTimetableById, getFirstLastByLine) ─────────────────────────────────────
// (이전에 작성해둔 함수들을 그대로 복사·붙여넣으시면 됩니다.)

// 헬퍼 텍스트 변환
function getDayText(v) { return {1:'평일',2:'토요일',3:'휴일/일요일'}[v]; }
function getDirText(v){ return {1:'상행(내선)',2:'하행(외선)'}[v]; }

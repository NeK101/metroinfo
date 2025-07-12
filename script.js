// ─── API 키 설정 ─────────────────────────────────
const SEARCH_KEY    = '474e6565736e656f3130305350694344'; // 역명→역코드
const ALL_ARRIVAL   = '4a785a444d6e656f3132306e5371775a'; // 실시간 도착(ALL)
const POSITION_KEY  = '586e44667a6e656f313030515263554e'; // 실시간 위치
const TIMETABLE_KEY = '514e4a7a636e656f39314d6c484969'; // 시간표
const FIRSTLAST_KEY = '4757714c766e656f313238414f76724f'; // 첫/막차
const KEYWORD_KEY   = 'T8tUkqY6WnY41RQVgce8n9o0oXPEKkKQRyWK/tXlAVgEMFqxEYO2iJhRd8bpN6YRNsL5X+7yUtvEw0UUms/ogg=='; // 키워드 조회 (인코딩 전 원본)

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
    list.slice(0,10).forEach(s => {
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
  } catch(err) {
    suggestions.innerHTML = `<li style="color:red;">검색 오류</li>`;
    console.error(err);
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
    console.error(e);
    resultDiv.innerHTML = `<span style="color:red;">오류: ${e.message}</span>`;
  }
}

// ─── API 함수들 ─────────────────────────────────

// 1) 역명 → statnId, subwayId
async function getStationInfo(name) {
  const url = 
    `http://openAPI.seoul.go.kr:8088/${SEARCH_KEY}/xml/` +
    `SearchInfoBySubwayNameService/1/5/${encodeURIComponent(name)}`;
  const res = await fetch(url);
  const xml = await res.text();
  const doc = new DOMParser().parseFromString(xml,'application/xml');
  const row = doc.querySelector('row');
  if (!row) throw new Error('해당 역을 찾을 수 없습니다.');
  return {
    statnId:  row.querySelector('statnId').textContent,
    subwayId: row.querySelector('subwayId').textContent
  };
}

// 2) 키워드 검색
async function getKeywordStationList(keyword) {
  const url = 
    `https://apis.data.go.kr/1613000/SubwayInfoService/` +
    `getKwrdFndSubwaySttnList?serviceKey=${encodeURIComponent(KEYWORD_KEY)}` +
    `&pageNo=1&numOfRows=10&_type=xml` +
    `&subwayStationName=${encodeURIComponent(keyword)}`;
  const res = await fetch(url);
  const xml = await res.text();
  const doc = new DOMParser().parseFromString(xml,'application/xml');
  return Array.from(doc.querySelectorAll('row')).map(r => ({
    stationName: r.querySelector('subwayStationName')?.textContent || '',
    stationId:   r.querySelector('subwayStationId')?.textContent || '',
    lineNumber:  (r.querySelector('lineNumber')?.textContent || '').replace('호선','')
  }));
}

// 3) 실시간 도착정보(ALL → 필터링)
async function getRealtimeArrivalAll(stationName) {
  const url = 
    `http://swopenapi.seoul.go.kr/api/subway/${ALL_ARRIVAL}/xml/` +
    `realtimeStationArrival/ALL`;
  const res = await fetch(url);
  const xml = await res.text();
  const doc = new DOMParser().parseFromString(xml,'application/xml');
  return Array.from(doc.querySelectorAll('row'))
    .filter(r => r.querySelector('statnNm')?.textContent === stationName)
    .map(r => ({
      trainLine:   r.querySelector('trainLineNm')?.textContent || '-',
      leftTime:    Number(r.querySelector('barvlDt')?.textContent || 0),
      prevStation: r.querySelector('bstatnNm')?.textContent || '-'
    }));
}

// 4) 실시간 위치
async function getRealtimePosition(lineNo) {
  const url = 
    `http://swopenapi.seoul.go.kr/api/subway/${POSITION_KEY}/xml/` +
    `realtimePosition/0/100/${lineNo}`;
  const res = await fetch(url);
  const xml = await res.text();
  const doc = new DOMParser().parseFromString(xml,'application/xml');
  return Array.from(doc.querySelectorAll('row')).map(r => ({
    trainNo: r.querySelector('trainNo')?.textContent || '-',
    statnNm: r.querySelector('statnNm')?.textContent || '-',
    direct:  r.querySelector('direct')?.textContent || '-'
  }));
}

// 5) 시간표 조회
async function getTimetableById(stationId, updnLine, weekTag) {
  const url = 
    `http://openAPI.seoul.go.kr:8088/${TIMETABLE_KEY}/xml/` +
    `SearchSTNTimeTableByIDService/1/100/` +
    `${stationId}/${updnLine}/${weekTag}`;
  const res = await fetch(url);
  const xml = await res.text();
  const doc = new DOMParser().parseFromString(xml,'application/xml');
  return Array.from(doc.querySelectorAll('row')).map(row => ({
    TRAIN_NO:      row.querySelector('trainNo')?.textContent,
    SUBWAY_STA_NM: row.querySelector('subwayStaNm')?.textContent,
    PUBLICTIME:    row.querySelector('pubTime')?.textContent
  }));
}

// 6) 첫/막차 조회
async function getFirstLastByLine(stationId, lineNo, weekTag, updnLine) {
  const lineName = `${lineNo}호선`;
  const url = 
    `http://openapi.seoul.go.kr:8088/${FIRSTLAST_KEY}/xml/` +
    `SearchFirstAndLastTrainbyLineServiceNew/1/5/` +
    `${encodeURIComponent(lineName)}/${weekTag}/${updnLine}/${stationId}`;
  const res = await fetch(url);
  const xml = await res.text();
  const doc = new DOMParser().parseFromString(xml,'application/xml');
  const row = doc.querySelector('row');
  if (!row) throw new Error('첫/막차 정보를 찾을 수 없습니다.');
  return {
    firstTrain: row.querySelector('frstTrainTm')?.textContent || '-',
    lastTrain:  row.querySelector('lstTrainTm')?.textContent  || '-'
  };
}

// ─── 헬퍼: select 값 → 텍스트 ────────────────────
function getDayText(v){ return {'1':'평일','2':'토요일','3':'휴일/일요일'}[v]; }
function getDirText(v){ return {'1':'상행(내선)','2':'하행(외선)'}[v]; }

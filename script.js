// API 키 설정
const SEARCH_KEY    = '474e6565736e656f3130305350694344'; // 역명→코드
const ALL_ARRIVAL   = '4a785a444d6e656f3132306e5371775a'; // 실시간 도착(ALL)
const POSITION_KEY  = '586e44667a6e656f313030515263554e'; // 실시간 위치
const TIMETABLE_KEY = '514e4a7a636e656f39314d6c484969'; // 시간표
const FIRSTLAST_KEY = '4757714c766e656f313238414f76724f'; // 첫/막차
const KEYWORD_KEY   = 'T8tUkqY6WnY41RQVgce8n9o0oXPEKkKQRyWK/tXlAVgEMFqxEYO2iJhRd8bpN6YRNsL5X+7yUtvEw0UUms/ogg=='; // 키워드

// DOM 참조
const input       = document.getElementById('stationInput');
const suggestions = document.getElementById('suggestions');
const daySelect   = document.getElementById('daySelect');
const dirSelect   = document.getElementById('dirSelect');
const resultDiv   = document.getElementById('result');

// 현재 선택된 역 정보
let selectedStation = { name: null, id: null, lineNo: null };

// 1) 자동완성: 키워드 API
input.addEventListener('input', async () => {
  const raw = input.value.trim();
  suggestions.innerHTML = '';
  selectedStation = { name: null, id: null, lineNo: null };
  if (!raw) return;

  const keyword = raw.endsWith('역') ? raw : raw + '역';
  try {
    const list = await getKeywordStationList(keyword);
    list.slice(0, 10).forEach(s => {
      const li = document.createElement('li');
      const badge = document.createElement('span');
      badge.classList.add('line-badge', 'line-' + s.lineNumber);
      badge.textContent = s.lineNumber;
      li.append(badge, document.createTextNode(s.stationName));
      li.addEventListener('click', () => {
        selectedStation = {
          name:   s.stationName,
          id:     s.stationId,
          lineNo: s.lineNumber
        };
        input.value = s.stationName;
        suggestions.innerHTML = '';
        runFetch();
      });
      suggestions.appendChild(li);
    });
  } catch (err) {
    console.error(err);
    suggestions.innerHTML = `<li style="color:red;">검색 오류</li>`;
  }
});

// 2) 요일/방향 변경 시 자동조회
[daySelect, dirSelect].forEach(el =>
  el.addEventListener('change', runFetch)
);

// 3) 메인 조회 함수
async function runFetch() {
  const { name, id, lineNo } = selectedStation;
  const weekTag  = daySelect.value;
  const updnLine = dirSelect.value;
  if (!name || !id || !lineNo) return;

  resultDiv.innerHTML = '로딩 중...';
  try {
    const [ firstlast, timetable, arrivals, positions ] = await Promise.all([
      getFirstLastByLine(id, lineNo, weekTag, updnLine),
      getTimetableById(id, updnLine, weekTag),
      getRealtimeArrivalAll(name),
      getRealtimePosition(lineNo)
    ]);

    resultDiv.innerHTML = `
      <h2>${name}역 (${lineNo}호선, 코드 ${id})</h2>
      <h3>첫차/막차 (${getDayText(weekTag)}, ${getDirText(updnLine)})</h3>
      <p>첫차: ${firstlast.firstTrain} / 막차: ${firstlast.lastTrain}</p>
      <h3>시간표</h3>
      <ul>${timetable.slice(0,5).map(r=>
        `<li>${r.TRAIN_NO} → ${r.SUBWAY_STA_NM} ${r.PUBLICTIME}분</li>`
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

// ── API 함수들 ────────────────────────────────────

// 역명 → statnId, subwayId
async function getStationInfo(name) {
  const url =
    `http://openAPI.seoul.go.kr:8088/${SEARCH_KEY}/xml/` +
    `SearchInfoBySubwayNameService/1/5/${encodeURIComponent(name)}`;
  const res = await fetch(url), xml = await res.text();
  const doc = new DOMParser().parseFromString(xml,'application/xml');
  const row = doc.querySelector('row');
  if (!row) throw new Error('해당 역을 찾을 수 없습니다.');
  return {
    statnId:  row.querySelector('statnId').textContent,
    subwayId: row.querySelector('subwayId').textContent
  };
}

// 키워드 검색
async function getKeywordStationList(keyword) {
  const url =
    `https://apis.data.go.kr/1613000/SubwayInfoService/` +
    `getKwrdFndSubwaySttnList?serviceKey=${encodeURIComponent(KEYWORD_KEY)}` +
    `&pageNo=1&numOfRows=10&_type=xml` +
    `&subwayStationName=${encodeURIComponent(keyword)}`;
  const res = await fetch(url), xml = await res.text();
  const doc = new DOMParser().parseFromString(xml,'application/xml');
  return Array.from(doc.querySelectorAll('row')).map(r => ({
    stationName: r.querySelector('subwayStationName')?.textContent || '',
    stationId:   r.querySelector('subwayStationId')?.textContent   || '',
    lineNumber:  (r.querySelector('lineNumber')?.textContent || '').replace('호선','')
  }));
}

// 실시간 도착(All)
async function getRealtimeArrivalAll(stationName) {
  const url =
    `http://swopenapi.seoul.go.kr/api/subway/${ALL_ARRIVAL}/xml/` +
    `realtimeStationArrival/ALL`;
  const res = await fetch(url), xml = await res.text();
  const doc = new DOMParser().parseFromString(xml,'application/xml');
  return Array.from(doc.querySelectorAll('row'))
    .filter(r => r.querySelector('statnNm')?.textContent === stationName)
    .map(r => ({
      trainLine:   r.querySelector('trainLineNm')?.textContent || '-',
      leftTime:    Number(r.querySelector('barvlDt')?.textContent || 0),
      prevStation: r.querySelector('bstatnNm')?.textContent     || '-'
    }));
}

// 실시간 위치
async function getRealtimePosition(lineNo) {
  const url =
    `http://swopenapi.seoul.go.kr/api/subway/${POSITION_KEY}/xml/` +
    `realtimePosition/0/100/${lineNo}`;
  const res = await fetch(url), xml = await res.text();
  const doc = new DOMParser().parseFromString(xml,'application/xml');
  return Array.from(doc.querySelectorAll('row')).map(r => ({
    trainNo: r.querySelector('trainNo')?.textContent || '-',
    statnNm: r.querySelector('statnNm')?.textContent || '-',
    direct:  r.querySelector('direct')?.textContent  || '-'
  }));
}

// 시간표 조회
async function getTimetableById(stationId, updnLine, weekTag) {
  const url =
    `http://openAPI.seoul.go.kr:8088/${TIMETABLE_KEY}/xml/` +
    `SearchSTNTimeTableByIDService/1/100/` +
    `${stationId}/${updnLine}/${weekTag}`;
  const res = await fetch(url), xml = await res.text();
  const doc = new DOMParser().parseFromString(xml,'application/xml');
  return Array.from(doc.querySelectorAll('row')).map(r => ({
    TRAIN_NO:      r.querySelector('trainNo')?.textContent,
    SUBWAY_STA_NM: r.querySelector('subwayStaNm')?.textContent,
    PUBLICTIME:    r.querySelector('pubTime')?.textContent
  }));
}

// 첫/막차 조회
async function getFirstLastByLine(stationId, lineNo, weekTag, updnLine) {
  const lineName = `${lineNo}호선`;
  const url =
    `http://openapi.seoul.go.kr:8088/${FIRSTLAST_KEY}/xml/` +
    `SearchFirstAndLastTrainbyLineServiceNew/1/5/` +
    `${encodeURIComponent(lineName)}/${weekTag}/${updnLine}/${stationId}`;
  const res = await fetch(url), xml = await res.text();
  const doc = new DOMParser().parseFromString(xml,'application/xml');
  const row = doc.querySelector('row');
  if (!row) throw new Error('첫/막차 정보를 찾을 수 없습니다.');
  return {
    firstTrain: row.querySelector('frstTrainTm')?.textContent || '-',
    lastTrain:  row.querySelector('lstTrainTm')?.textContent  || '-'
  };
}

// 헬퍼: select → 텍스트
function getDayText(v) { return {'1':'평일','2':'토요일','3':'휴일/일요일'}[v]; }
function getDirText(v){ return {'1':'상행(내선)','2':'하행(외선)'}[v]; }

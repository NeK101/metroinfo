// ─── API 키 설정 ─────────────────────────────────
const ARRIVAL_KEY   = '4a785a444d6e656f3132306e5371775a'; // 실시간 도착(JSON)
const POSITION_KEY  = '586e44667a6e656f313030515263554e'; // 실시간 위치(JSON)
const TIMETABLE_KEY = '514e4a7a636e656f39314d6c484969';   // 시간표(XML)
const FIRSTLAST_KEY = '4757714c766e656f313238414f76724f'; // 첫/막차(XML)

document.addEventListener('DOMContentLoaded', () => {
  const input       = document.getElementById('stationInput');
  const suggestions = document.getElementById('suggestions');
  const daySelect   = document.getElementById('daySelect');
  const dirSelect   = document.getElementById('dirSelect');
  const resultDiv   = document.getElementById('result');

  // 로컬 stations.json 로드
  let stations = [];
  fetch('data/stations.json')
    .then(r => r.json())
    .then(data => {
      stations = data.map(item => ({
        id:     item.STATN_ID,
        name:   item.STATN_NM,
        lineNo: item.호선이름.replace('호선','')
      }));
    })
    .catch(e => console.error('역정보 로드 실패', e));

  let selectedStation = { name:null, id:null, lineNo:null };

  // 1) 역명 입력 → 자동완성
  input.addEventListener('input', () => {
    const q = input.value.trim();
    suggestions.innerHTML = '';
    selectedStation = { name:null, id:null, lineNo:null };
    if (!q) return;

    stations
      .filter(s => s.name.includes(q))
      .slice(0, 10)
      .forEach(s => {
        const li = document.createElement('li');
        const badge = document.createElement('span');
        badge.classList.add('line-badge', 'line-' + s.lineNo);
        badge.textContent = s.lineNo;
        li.append(badge, document.createTextNode(s.name));
        li.onclick = () => {
          selectedStation = { name:s.name, id:s.id, lineNo:s.lineNo };
          input.value = s.name;
          suggestions.innerHTML = '';
          runFetch();
        };
        suggestions.append(li);
      });
  });

  // 2) 옵션 변경 시 자동조회
  [daySelect, dirSelect].forEach(el =>
    el.addEventListener('change', runFetch)
  );

  // 3) 데이터 조회 & 렌더링
  async function runFetch() {
    const { name, id, lineNo } = selectedStation;
    const week = daySelect.value;
    const dir  = dirSelect.value;
    if (!name||!id||!lineNo) return;

    resultDiv.innerHTML = '로딩 중...';
    try {
      const [ fl, tt, arr, pos ] = await Promise.all([
        getFirstLast(id, lineNo, week, dir),
        getTimetable(id, dir, week),
        getArrival   (name),
        getPosition  (lineNo)
      ]);

      let html = `<h2>${name}역 (${lineNo}호선, 코드 ${id})</h2>`;

      html += `<h3>첫차/막차 (${getDayText(week)}, ${getDirText(dir)})</h3>`
           +  `<p>첫차: ${fl.firstTrain} / 막차: ${fl.lastTrain}</p>`;

      html += `<h3>시간표</h3><ul>` 
           +  tt.slice(0,5).map(r=>
                `<li>${r.TRAIN_NO} → ${r.SUBWAY_STA_NM} ${r.PUBLICTIME}분</li>`
              ).join('')
           + `</ul>`;

      html += `<h3>실시간 도착예정</h3><ul>`
           +  arr.slice(0,5).map(a=>
                `<li>${a.trainLine} / ${Math.floor(a.leftTime/60)}분 ${a.leftTime%60}초 후</li>`
              ).join('')
           + `</ul>`;

      html += `<h3>실시간 위치 (${lineNo}호선)</h3><ul>`
           +  pos.slice(0,5).map(p=>
                `<li>차량 ${p.trainNo} → ${p.statnNm} (${p.direct==='0'?'상행':'하행'})</li>`
              ).join('')
           + `</ul>`;

      resultDiv.innerHTML = html;
    } catch(e) {
      console.error(e);
      resultDiv.innerHTML = `<span style="color:red;">오류: ${e.message}</span>`;
    }
  }

  // --- API 호출 함수들 ---

  // A) 실시간 도착 (JSON)
  async function getArrival(stationName) {
    const url = 
      `https://swopenapi.seoul.go.kr/api/subway/`+
      `${ARRIVAL_KEY}/json/realtimeStationArrival/0/20/`+
      `${encodeURIComponent(stationName)}`;
    const res  = await fetch(url);
    const { realtimeArrivalList } = await res.json();
    return realtimeArrivalList.map(o=>({
      trainLine:   o.trainLineNm,
      leftTime:    +o.barvlDt,
      prevStation: o.bfStnNm
    }));
  }

  // B) 실시간 위치 (JSON)
  async function getPosition(lineNo) {
    const url =
      `https://swopenapi.seoul.go.kr/api/subway/`+
      `${POSITION_KEY}/json/realtimePosition/0/100/${lineNo}`;
    const res = await fetch(url);
    const { realtimePositionList } = await res.json();
    return realtimePositionList.map(o=>({
      trainNo: o.trainNo,
      statnNm: o.statnNm,
      direct:  o.direct
    }));
  }

  // C) 시간표 조회 (XML)
  async function getTimetable(stationId,updnLine,weekTag) {
    const url =
      `https://openapi.seoul.go.kr:443/`+
      `${TIMETABLE_KEY}/xml/SearchSTNTimeTableByIDService/1/100/`+
      `${stationId}/${updnLine}/${weekTag}`;
    const res = await fetch(url);
    const xml = await res.text();
    const doc = new DOMParser().parseFromString(xml,'application/xml');
    return Array.from(doc.querySelectorAll('row')).map(r=>({
      TRAIN_NO:      r.querySelector('trainNo').textContent,
      SUBWAY_STA_NM: r.querySelector('subwayStaNm').textContent,
      PUBLICTIME:    r.querySelector('pubTime').textContent
    }));
  }

  // D) 첫/막차 조회 (XML)
  async function getFirstLast(stationId,lineNo,weekTag,updnLine) {
    const lineName = encodeURIComponent(`${lineNo}호선`);
    const url =
      `https://openapi.seoul.go.kr:443/`+
      `${FIRSTLAST_KEY}/xml/SearchFirstAndLastTrainbyLineServiceNew/1/5/`+
      `${lineName}/${weekTag}/${updnLine}/${stationId}`;
    const res = await fetch(url);
    const xml = await res.text();
    const doc = new DOMParser().parseFromString(xml,'application/xml');
    const row = doc.querySelector('row');
    if(!row) throw new Error('첫/막차 데이터 없음');
    return {
      firstTrain: row.querySelector('frstTrainTm').textContent,
      lastTrain:  row.querySelector('lstTrainTm').textContent
    };
  }

  // 헬퍼
  function getDayText(v){ return {'1':'평일','2':'토요일','3':'휴일/일요일'}[v]; }
  function getDirText(v){ return {'1':'상행(내선)','2':'하행(외선)'}[v]; }
});

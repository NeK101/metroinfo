// ─── API 키 설정 ─────────────────────────────────
const ARRIVAL_KEY   = '4a785a444d6e656f3132306e5371775a'; // 실시간 도착(JSON)
const POSITION_KEY  = '586e44667a6e656f313030515263554e'; // 실시간 위치(JSON)
const TIMETABLE_KEY = '514e4a7a636e656f39314d6c484969';   // 시간표(JSON)
const FIRSTLAST_KEY = '4757714c766e656f313238414f76724f'; // 첫/막차(JSON)

document.addEventListener('DOMContentLoaded', () => {
  const input       = document.getElementById('stationInput');
  const suggestions = document.getElementById('suggestions');
  const daySelect   = document.getElementById('daySelect');
  const dirSelect   = document.getElementById('dirSelect');
  const resultDiv   = document.getElementById('result');
  
  let stations = [];
  fetch('data/stations.json')
    .then(r => r.json())
    .then(data => {
      stations = data.map(item => ({
        id:     item.STATN_ID,
        name:   item.STATN_NM,
        lineNo: item.호선이름.replace('호선','')
      }));
    });

  let selectedStation = { name:null, id:null, lineNo:null };
  let timerId = null;

  // 1) 자동완성
  input.addEventListener('input', () => {
    const q = input.value.trim();
    suggestions.innerHTML = '';
    selectedStation = { name:null, id:null, lineNo:null };
    if (!q) return;

    stations
      .filter(s => s.name.includes(q))
      .slice(0,10)
      .forEach(s => {
        const li = document.createElement('li');
        const badge = document.createElement('span');
        badge.classList.add('line-badge','line-'+s.lineNo);
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

  // 2) 옵션 변경시
  [daySelect, dirSelect].forEach(el =>
    el.addEventListener('change', runFetch)
  );

  // 3) 조회·렌더링
  async function runFetch() {
    const { name, id, lineNo } = selectedStation;
    const week = daySelect.value;
    const dir  = dirSelect.value;
    if (!name||!id||!lineNo) return;

    // 이전 타이머 클리어
    if (timerId) clearInterval(timerId);

    resultDiv.innerHTML = '로딩 중...';
    try {
      const [ fl, tt, arr, pos ] = await Promise.all([
        getFirstLast(id,lineNo,week,dir),
        getTimetable(id,dir,week),
        getArrival  (name),
        getPosition (lineNo)
      ]);

      // 헤더
      let html = `<h2>${name}역 (${lineNo}호선, 코드 ${id})</h2>`;

      // 첫/막차
      html += `<h3>첫차/막차 (${getDayText(week)}, ${getDirText(dir)})</h3>`;
      html += `<p>첫차: ${fl.firstTrain} / 막차: ${fl.lastTrain}</p>`;

      // 시간표
      html += `<h3>시간표</h3><ul>`+
        tt.slice(0,5).map(r=>
          `<li>${r.TRAIN_NO} → ${r.SUBWAY_STA_NM} ${r.PUBLICTIME}분</li>`
        ).join('')+`</ul>`;

      // 실시간 도착
      html += `<h3>실시간 도착예정</h3><ul>`+
        arr.slice(0,5).map(a=>{
          const secs = a.barvlDt; 
          return `<li>${a.trainLineNm} / <span class="arrival-time" data-seconds="${secs}">
                    ${Math.floor(secs/60)}분 ${secs%60}초 후
                  </span></li>`;
        }).join('')+`</ul>`;

      // 실시간 위치
      html += `<h3>실시간 위치 (${lineNo}호선)</h3><ul>`+
        pos.slice(0,5).map(p=>
          `<li>차량 ${p.trainNo} → ${p.statnNm} (${p.direct==='0'?'상행':'하행'})</li>`
        ).join('')+`</ul>`;

      resultDiv.innerHTML = html;

      // 카운트다운
      timerId = setInterval(()=>{
        document.querySelectorAll('.arrival-time').forEach(el=>{
          let s = parseInt(el.dataset.seconds,10);
          if (s>0) {
            s -= 1;
            el.dataset.seconds = s;
            const m = Math.floor(s/60);
            const ss= s%60;
            el.textContent = `${m}분 ${ss}초 후`;
          }
        });
      },1000);

    } catch(e) {
      console.error(e);
      resultDiv.innerHTML = `<span style="color:red;">오류: ${e.message}</span>`;
    }
  }

  // ─── OpenAPI JSON 호출 ───────────────────────────

  // A) 실시간 도착 (JSON)
  async function getArrival(stnNm) {
    const url = `https://swopenapi.seoul.go.kr/api/subway/${ARRIVAL_KEY}/json/realtimeStationArrival/0/20/${encodeURIComponent(stnNm)}`;
    const res = await fetch(url, { mode:'cors' });
    const { realtimeArrivalList } = await res.json();
    return realtimeArrivalList;
  }

  // B) 실시간 위치 (JSON)
  async function getPosition(lineNo) {
    const url = `https://swopenapi.seoul.go.kr/api/subway/${POSITION_KEY}/json/realtimePosition/0/100/${lineNo}`;
    const res = await fetch(url, { mode:'cors' });
    const { realtimePositionList } = await res.json();
    return realtimePositionList;
  }

  // C) 시간표 (JSON)
  async function getTimetable(stationId, updnLine, weekTag) {
    const url = `https://openapi.seoul.go.kr:8088/${TIMETABLE_KEY}/json/SearchSTNTimeTableByIDService/1/100/${stationId}/${updnLine}/${weekTag}`;
    const res = await fetch(url, { mode:'cors' });
    const data = await res.json();
    // 서비스명은 JSON 구조에 따라 달라질 수 있습니다.
    // 아래는 예시: { SearchSTNTimeTableByIDService: { row: [...] } }
    return data.SearchSTNTimeTableByIDService.row || [];
  }

  // D) 첫/막차 (JSON)
  async function getFirstLast(stationId, lineNo, weekTag, updnLine) {
    const url = `https://openapi.seoul.go.kr:8088/${FIRSTLAST_KEY}/json/SearchFirstAndLastTrainbyLineServiceNew/1/5/${encodeURIComponent(lineNo+'호선')}/${weekTag}/${updnLine}/${stationId}`;
    const res = await fetch(url, { mode:'cors' });
    const data = await res.json();
    const row  = data.SearchFirstAndLastTrainbyLineServiceNew?.row?.[0];
    if (!row) return { firstTrain:'정보 없음', lastTrain:'정보 없음' };
    return { firstTrain: row.frstTrainTm, lastTrain: row.lstTrainTm };
  }

  // 헬퍼
  function getDayText(v){ return {'1':'평일','2':'토요일','3':'휴일/일요일'}[v]; }
  function getDirText(v){ return {'1':'상행(내선)','2':'하행(외선)'}[v]; }
});

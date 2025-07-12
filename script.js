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
  let selectedStation = { name:null, id:null, lineNo:null };
  let timerId = null;

  // 1) 로컬 역정보 로드
  fetch('data/stations.json')
    .then(r => r.json())
    .then(data => {
      stations = data.map(i => ({
        id:     i.STATN_ID,
        name:   i.STATN_NM,
        lineNo: i.호선이름.replace('호선','')
      }));
    })
    .catch(console.error);

  // 2) 자동완성
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

  // 3) 옵션 변경
  [daySelect, dirSelect].forEach(el =>
    el.addEventListener('change', runFetch)
  );

  // 4) 조회 & 렌더링
  async function runFetch() {
    const { name, id, lineNo } = selectedStation;
    const week = daySelect.value, dir = dirSelect.value;
    if (!name||!id||!lineNo) return;

    if (timerId) clearInterval(timerId);
    resultDiv.innerHTML = '로딩 중...';

    try {
      const [fl, tt, arr, pos] = await Promise.all([
        getFirstLast(id, lineNo, week, dir),
        getTimetable( id, lineNo, week, dir),
        getArrival(   name),
        getPosition(  lineNo)
      ]);

      let html = `<h2>${name}역 (${lineNo}호선, 코드 ${id})</h2>`;

      // 첫/막차
      html += `<h3>첫차/막차 (${getDayText(week)}, ${getDirText(dir)})</h3>`;
      html += `<p>첫차: ${fl.firstTrain} / 막차: ${fl.lastTrain}</p>`;

      // 시간표
      html += `<h3>시간표</h3><ul>${
        tt.slice(0,5).map(r=>
          `<li>${r.TRAIN_NO} → ${r.SUBWAY_STA_NM} ${r.PUBLICTIME}분</li>`
        ).join('')
      }</ul>`;

      // 실시간 도착 (data-seconds)
      html += `<h3>실시간 도착예정</h3><ul>${
        arr.slice(0,5).map(a=>{
          const secs = +a.barvlDt;
          return `<li>${a.trainLineNm} / <span class="arrival-time" data-seconds="${secs}">
                    ${Math.floor(secs/60)}분 ${secs%60}초 후
                  </span></li>`;
        }).join('')
      }</ul>`;

      // 실시간 위치
      html += `<h3>실시간 위치 (${lineNo}호선)</h3><ul>${
        pos.slice(0,5).map(p=>
          `<li>차량 ${p.trainNo} → ${p.statnNm} (${p.direct==='0'?'상행':'하행'})</li>`
        ).join('')
      }</ul>`;

      resultDiv.innerHTML = html;

      // countdown
      timerId = setInterval(()=>{
        document.querySelectorAll('.arrival-time').forEach(el=>{
          let s = parseInt(el.dataset.seconds,10);
          if (s>0) { el.dataset.seconds = --s; }
          const m = Math.floor(s/60), sec=s%60;
          el.textContent = `${m}분 ${sec}초 후`;
        });
      },1000);
    } catch(e) {
      console.error(e);
      resultDiv.innerHTML = `<span style="color:red;">오류: ${e.message}</span>`;
    }
  }

  // ─── OpenAPI 직접 JSON 호출 ───────────────────────

  // A) 실시간 도착
  async function getArrival(stnNm){
    const url = `https://swopenapi.seoul.go.kr/api/subway/${ARRIVAL_KEY}/json/realtimeStationArrival/0/20/${encodeURIComponent(stnNm)}`;
    const res = await fetch(url,{mode:'cors'}); 
    const { realtimeArrivalList } = await res.json();
    return realtimeArrivalList;
  }

  // B) 실시간 위치
  async function getPosition(lineNo){
    const url = `https://swopenapi.seoul.go.kr/api/subway/${POSITION_KEY}/json/realtimePosition/0/100/${lineNo}`;
    const res = await fetch(url,{mode:'cors'}); 
    const { realtimePositionList } = await res.json();
    return realtimePositionList;
  }

  // C) 시간표 조회
  async function getTimetable(stationId,_,weekTag){
    const url = `https://openapi.seoul.go.kr/${TIMETABLE_KEY}/json/SearchSTNTimeTableByIDService/1/100/${stationId}/1/${weekTag}`;
    const res = await fetch(url,{mode:'cors'});
    const data = await res.json();
    return data.SearchSTNTimeTableByIDService?.row || [];
  }

  // D) 첫/막차 조회
  async function getFirstLast(stationId,_,weekTag,updnLine){
    const url = `https://openapi.seoul.go.kr/${FIRSTLAST_KEY}/json/SearchFirstAndLastTrainbyLineServiceNew/1/5/${encodeURIComponent('1호선')}/${weekTag}/${updnLine}/${stationId}`;
    const res = await fetch(url,{mode:'cors'});
    const data = await res.json();
    const row = data.SearchFirstAndLastTrainbyLineServiceNew?.row?.[0];
    return row 
      ? { firstTrain:row.frstTrainTm, lastTrain:row.lstTrainTm }
      : { firstTrain:'정보 없음',   lastTrain:'정보 없음' };
  }

  // 헬퍼
  function getDayText(v){ return {'1':'평일','2':'토요일','3':'휴일/일요일'}[v]; }
  function getDirText(v){ return {'1':'상행(내선)','2':'하행(외선)'}[v]; }
});

// ─── CORS 프록시 (HTTPS) ───────────────────────────
const PROXY = 'https://api.codetabs.com/v1/proxy?quest=';

// ─── API 키 설정 ───────────────────────────────────
const ARRIVAL_KEY   = '4a785a444d6e656f3132306e5371775a';
const POSITION_KEY  = '586e44667a6e656f313030515263554e';
const TIMETABLE_KEY = '514e4a7a636e656f39314d6c484969';
const FIRSTLAST_KEY = '4757714c766e656f313238414f76724f';

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

  // 2) 옵션 변경 시 재조회
  [daySelect, dirSelect].forEach(el =>
    el.addEventListener('change', runFetch)
  );

  // 3) 조회 & 렌더링
  async function runFetch(){
    const { name, id, lineNo } = selectedStation;
    const week = daySelect.value;
    const dir  = dirSelect.value;
    if (!name||!id||!lineNo) return;

    // 이전 타이머 클리어
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }

    resultDiv.innerHTML = '로딩 중...';
    try {
      const [ fl, tt, arr, pos ] = await Promise.all([
        getFirstLast(id, lineNo, week, dir),
        getTimetable(id,  dir, week),
        getArrival   (name),
        getPosition  (lineNo)
      ]);

      let html = `<h2>${name}역 (${lineNo}호선, 코드 ${id})</h2>`;

      // 첫/막차
      html += `<h3>첫차/막차 (${getDayText(week)}, ${getDirText(dir)})</h3>`;
      html += `<p>첫차: ${fl.firstTrain} / 막차: ${fl.lastTrain}</p>`;

      // 시간표
      html += `<h3>시간표</h3><ul>` +
        tt.slice(0,5).map(r=>
          `<li>${r.TRAIN_NO} → ${r.SUBWAY_STA_NM} ${r.PUBLICTIME}분</li>`
        ).join('')+`</ul>`;

      // 실시간 도착 (data-seconds로 보관)
      html += `<h3>실시간 도착예정</h3><ul>` +
        arr.slice(0,5).map(a=>{
          const secs = a.leftTime;
          return `<li>${a.trainLine} / <span class="arrival-time" data-seconds="${secs}">
                    ${Math.floor(secs/60)}분 ${secs%60}초 후
                  </span></li>`;
        }).join('')+`</ul>`;

      // 실시간 위치
      html += `<h3>실시간 위치 (${lineNo}호선)</h3><ul>` +
        pos.slice(0,5).map(p=>
          `<li>차량 ${p.trainNo} → ${p.statnNm} (${p.direct==='0'?'상행':'하행'})</li>`
        ).join('')+`</ul>`;

      resultDiv.innerHTML = html;

      // ★ 카운트다운 타이머 시작
      timerId = setInterval(() => {
        document.querySelectorAll('.arrival-time').forEach(el => {
          let secs = parseInt(el.dataset.seconds,10);
          if (secs > 0) {
            secs -= 1;
            el.dataset.seconds = secs;
            const m = Math.floor(secs/60);
            const s = secs%60;
            el.textContent = `${m}분 ${s}초 후`;
          }
        });
      }, 1000);

    } catch(e) {
      console.error(e);
      resultDiv.innerHTML = `<span style="color:red;">오류: ${e.message}</span>`;
    }
  }

  // ─── OpenAPI 호출 함수들 ────────────────────────

  // A) 실시간 도착 (XML via proxy)
  async function getArrival(stationName){
    const target = 
      `http://swopenapi.seoul.go.kr/api/subway/`+
      `${ARRIVAL_KEY}/xml/realtimeStationArrival/0/20/`+
      `${encodeURIComponent(stationName)}`;
    const res = await fetch(PROXY + encodeURIComponent(target));
    const xml = await res.text();
    const doc = new DOMParser().parseFromString(xml,'application/xml');
    return Array.from(doc.querySelectorAll('row')).map(r=>({
      trainLine:   r.querySelector('trainLineNm')?.textContent  || '-',
      leftTime:    Number(r.querySelector('barvlDt')?.textContent) || 0,
      prevStation: r.querySelector('bstatnNm')?.textContent      || '-'
    }));
  }

  // B) 실시간 위치 (XML via proxy)
  async function getPosition(lineNo){
    const target =
      `http://swopenapi.seoul.go.kr/api/subway/`+
      `${POSITION_KEY}/xml/realtimePosition/0/100/${lineNo}`;
    const res = await fetch(PROXY + encodeURIComponent(target));
    const xml = await res.text();
    const doc = new DOMParser().parseFromString(xml,'application/xml');
    return Array.from(doc.querySelectorAll('row')).map(r=>({
      trainNo: r.querySelector('trainNo')?.textContent || '-',
      statnNm: r.querySelector('statnNm')?.textContent || '-',
      direct:  r.querySelector('direct')?.textContent  || '-'
    }));
  }

  // C) 시간표 조회 (XML via proxy)
  async function getTimetable(stationId, updnLine, weekTag){
    const target =
      `http://openapi.seoul.go.kr:8088/`+
      `${TIMETABLE_KEY}/xml/SearchSTNTimeTableByIDService/1/100/`+
      `${stationId}/${updnLine}/${weekTag}`;
    const res = await fetch(PROXY + encodeURIComponent(target));
    const xml = await res.text();
    const doc = new DOMParser().parseFromString(xml,'application/xml');
    return Array.from(doc.querySelectorAll('row')).map(r=>({
      TRAIN_NO:      r.querySelector('trainNo')?.textContent,
      SUBWAY_STA_NM: r.querySelector('subwayStaNm')?.textContent,
      PUBLICTIME:    r.querySelector('pubTime')?.textContent
    }));
  }

  // D) 첫/막차 조회 (XML via proxy, 없으면 정보 없음)
  async function getFirstLast(stationId,lineNo,weekTag,updnLine){
    const lineName = encodeURIComponent(`${lineNo}호선`);
    const target =
      `http://openapi.seoul.go.kr:8088/`+
      `${FIRSTLAST_KEY}/xml/SearchFirstAndLastTrainbyLineServiceNew/1/5/`+
      `${lineName}/${weekTag}/${updnLine}/${stationId}`;
    const res = await fetch(PROXY + encodeURIComponent(target));
    const xml = await res.text();
    const doc = new DOMParser().parseFromString(xml,'application/xml');
    const row = doc.querySelector('row');
    if(!row){
      return { firstTrain:'정보 없음', lastTrain:'정보 없음' };
    }
    return {
      firstTrain: row.querySelector('frstTrainTm')?.textContent,
      lastTrain:  row.querySelector('lstTrainTm')?.textContent
    };
  }

  // 헬퍼
  function getDayText(v){ return {'1':'평일','2':'토요일','3':'휴일/일요일'}[v]; }
  function getDirText(v){ return {'1':'상행(내선)','2':'하행(외선)'}[v]; }
});

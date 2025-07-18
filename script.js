// script.js

// Netlify Functions 프록시 (상대경로)
const PROXY = '/.netlify/functions/proxy?target=';

// API 키
const ALL_ARRIVAL   = '4a785a444d6e656f3132306e5371775a';
const POSITION_KEY  = '586e44667a6e656f313030515263554e';
const FIRSTLAST_KEY = '4757714c766e656f313238414f76724f';

document.addEventListener('DOMContentLoaded', () => {
  const input       = document.getElementById('stationInput');
  const suggestions = document.getElementById('suggestions');
  const daySelect   = document.getElementById('daySelect');
  const dirSelect   = document.getElementById('dirSelect');
  const resultDiv   = document.getElementById('result');

  let stations = [];
  let selectedStation = { name: null, id: null, lineNo: null };
  let timerId = null;

  // 1) stations.json 로드
  fetch('data/stations.json')
    .then(r => r.json())
    .then(data => {
      stations = data.map(item => ({
        id:     item.STATN_ID,
        name:   item.STATN_NM,
        lineNo: item.호선이름.replace('호선','')
      }));
    })
    .catch(console.error);

  // 2) 역명 자동완성
  input.addEventListener('input', () => {
    const q = input.value.trim();
    suggestions.innerHTML = '';
    selectedStation = { name: null, id: null, lineNo: null };
    if (!q) return;

    stations
      .filter(s => s.name.includes(q))
      .slice(0, 10)
      .forEach(s => {
        const li    = document.createElement('li');
        const badge = document.createElement('span');
        badge.classList.add('line-badge', 'line-' + s.lineNo);
        badge.textContent = s.lineNo;
        li.append(badge, document.createTextNode(s.name));
        li.onclick = () => {
          selectedStation = { name: s.name, id: s.id, lineNo: s.lineNo };
          input.value     = s.name;
          suggestions.innerHTML = '';
          runFetch();
        };
        suggestions.append(li);
      });
  });

  // 3) 옵션 변경 시 재조회
  [daySelect, dirSelect].forEach(el =>
    el.addEventListener('change', runFetch)
  );

  // 4) 메인 조회 & 렌더링 (시간표 제외)
  async function runFetch() {
    const { name, id, lineNo } = selectedStation;
    const week = daySelect.value, dir = dirSelect.value;
    if (!name || !id || !lineNo) return;

    if (timerId) clearInterval(timerId);
    resultDiv.innerHTML = '로딩 중...';

    try {
      // 첫/막차, 실시간 도착, 실시간 위치만 호출
      const [ fl, arr, pos ] = await Promise.all([
        getFirstLast(id, lineNo, week, dir),
        getArrivalAll(name),
        getPosition(lineNo)
      ]);

      let html = `<h2>${name}역 (${lineNo}호선, 코드 ${id})</h2>`;

      // 첫/막차
      html += `<h3>첫차/막차 (${getDayText(week)}, ${getDirText(dir)})</h3>`;
      html += `<p>첫차: ${fl.firstTrain || '정보 없음'} / 막차: ${fl.lastTrain || '정보 없음'}</p>`;

      // 실시간 도착예정
      html += `<h3>실시간 도착예정</h3><ul>`;
      arr.forEach(a => {
        const s = a.leftTime;
        html += `<li>${a.trainLineNm} / 
                    <span class="arrival-time" data-seconds="${s}">
                      ${Math.floor(s/60)}분 ${s % 60}초 후
                    </span>
                 </li>`;
      });
      html += `</ul>`;

      // 실시간 위치
      html += `<h3>실시간 위치 (${lineNo}호선)</h3><ul>`;
      pos.forEach(p => {
        const dirText = p.direct === '0' ? '상행' : '하행';
        html += `<li>차량 ${p.trainNo} → ${p.statnNm} (${dirText})</li>`;
      });
      html += `</ul>`;

      resultDiv.innerHTML = html;

      // 카운트다운 타이머
      timerId = setInterval(() => {
        document.querySelectorAll('.arrival-time').forEach(el => {
          let s = parseInt(el.dataset.seconds, 10);
          if (s > 0) el.dataset.seconds = --s;
          const m = Math.floor(s/60), sec = s % 60;
          el.textContent = `${m}분 ${sec}초 후`;
        });
      }, 1000);

    } catch (e) {
      console.error(e);
      resultDiv.innerHTML = `<p style="color:red;">오류: ${e.message}</p>`;
    }
  }

  // ─── JSON 엔드포인트로 데이터 가져오기 ───

  // A) 실시간 도착예정
  async function getArrivalAll(stnNm) {
    const target =
      `http://swopenapi.seoul.go.kr/api/subway/${ALL_ARRIVAL}` +
      `/json/realtimeStationArrival/0/5/${encodeURIComponent(stnNm)}`;
    const data = await fetch(PROXY + encodeURIComponent(target))
                       .then(r => r.json());
    return (data.realtimeArrivalList || []).map(a => ({
      trainLineNm: a.trainLineNm,
      leftTime:    Number(a.barvlDt) || 0
    }));
  }

  // B) 실시간 위치 (JSON, 선택 역으로 오는 열차 최대 3개)
  async function getPosition(lineNo) {
    const target =
      `http://swopenapi.seoul.go.kr/api/subway/${POSITION_KEY}` +
      `/json/realtimePosition/0/100/${lineNo}`;
    const data = await fetch(PROXY + encodeURIComponent(target))
                       .then(r => r.json());
    return (data.realtimePositionList || [])
      .filter(p => p.statnNm === selectedStation.name)
      .slice(0, 3)
      .map(p => ({
        trainNo: p.trainNo,
        statnNm: p.statnNm,
        direct:  p.direct
      }));
  }

  // C) 첫/막차 조회 (JSON)
  async function getFirstLast(stationId, _, weekTag, updnLine) {
    const target =
      `http://openapi.seoul.go.kr:8088/${FIRSTLAST_KEY}` +
      `/json/SearchFirstAndLastTrainbyLineServiceNew/1/5/` +
      `${encodeURIComponent(selectedStation.lineNo + '호선')}/` +
      `${weekTag}/${updnLine}/${stationId}`;
    const data = await fetch(PROXY + encodeURIComponent(target))
                       .then(r => r.json());
    const row = data.SearchFirstAndLastTrainbyLineServiceNew?.row?.[0];
    return row
      ? { firstTrain: row.frstTrainTm, lastTrain: row.lstTrainTm }
      : { firstTrain: null, lastTrain: null };
  }

  // 헬퍼
  function getDayText(v) { return { '1':'평일','2':'토요일','3':'휴일/일요일' }[v]; }
  function getDirText(v){ return { '1':'상행(내선)','2':'하행(외선)' }[v]; }

}); // DOMContentLoaded 끝


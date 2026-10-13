/* No libraries or reference-image assets. Apps Script bundle uses the same source. */
(() => {
  'use strict';
  const KEY = 'climate-assessment-v1';
  const YEARS = Array.from({length:26}, (_,i) => 2000+i);
  const SLOTS = ['dataTable','graph','aiImage','newspaper'];
  const LABELS = ['기본 정보','기후 데이터','미래 예측','AI 이미지','기후신문'];
  const QUESTIONS = [
    ['그래프에서 어떤 경향이 나타났나요?','시간이 지날수록 우리 지역의 평균기온은 ~하는 경향을 보였다.'],
    ['앞으로 어떻게 변할 것으로 예상하나요?','따라서 앞으로 우리 지역의 평균기온은 ~할 것으로 예상한다.'],
    ['그렇게 생각한 근거를 그래프에서 찾아 쓰세요.','그 이유는 그래프에서 ~이 나타났기 때문이다.'],
    ['내가 한 예측이 반드시 맞는다고 할 수 있을까요? 그 이유를 쓰세요.','']
  ];
  const DATA_CHECKS = [
    '조사한 지역과 2000~2025년 연평균 기온 자료를 정확하게 확인했나요?',
    '기상청에서 받은 자료의 연평균 기온 값을 빠짐없이 입력했나요?',
    '입력한 데이터를 이용해 연도에 따른 기온 변화 그래프를 완성했나요?',
    '그래프를 보고 기온이 상승 / 하강 / 뚜렷한 변화 없음 중 어디에 해당하는지 판단했나요?',
    '그래프의 경향을 근거로 미래 기후 변화와 그 이유를 작성했나요?'
  ];
  const FINAL_CHECKS = [
    '그래프에서 나타난 기온 변화 경향을 작성했나요?',
    '그래프를 근거로 미래 기후 변화를 예측하고 이유를 설명했나요?',
    '내 예측의 한계 또는 반드시 맞는 것은 아닌 이유를 작성했나요?',
    '미래 연도, 기후 변화, 지역 모습 변화를 반영한 AI 이미지 프롬프트를 작성했나요?',
    '생성한 AI 이미지를 업로드하고, 내 데이터 분석·예측 내용과 맞는지 확인했나요?'
  ];
  const portal = 'https://data.kma.go.kr/stcs/grnd/grndTaList.do?pgmNo=70';
  const online = Boolean(window.google && google.script && google.script.run);
  const main = document.querySelector('#main');
  const modal = document.querySelector('#modal');
  let state, db, busy = false, previewUrls = [], debounce, dbFailure = false;
  const makeId = () => crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');
  const fresh = () => ({version:1,id:makeId(),token:makeId()+makeId(),step:1,view:'form',fields:{},temperatures:{},checks:{data:[],final:[]},files:{},receipt:null,dirty:false,clientUpdatedAt:null});
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  try { const saved=JSON.parse(localStorage.getItem(KEY)); state=saved && saved.version===1 && saved.id && saved.token ? saved : fresh(); }
  catch (_) { state=fresh(); }
  state.fields ||= {};state.files ||= {};state.checks ||= {data:[],final:[]};state.temperatures ||= {};
  const fmt = v => v ? new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium',timeStyle:'medium'}).format(new Date(v)) : '아직 제출하지 않았어요';
  function persist(changed=true) {
    if(changed){state.clientUpdatedAt=new Date().toISOString();state.dirty=true;const notice=[...document.querySelectorAll('.mode-note')].find(x=>x.textContent.includes('최종 제출:'));if(notice&&state.receipt)notice.textContent='제출 후 수정 중 · 다시 제출해야 선생님께 반영됩니다. 최종 제출: '+fmt(state.receipt.updatedAt);}
    try {localStorage.setItem(KEY,JSON.stringify(state));document.querySelector('#saveStatus').textContent=state.clientUpdatedAt ? '이 기기에 저장됨 · '+fmt(state.clientUpdatedAt) : '작성 내용 자동 저장';}
    catch(_){document.querySelector('#saveStatus').textContent='이 기기에 저장할 수 없어요. 브라우저 저장 공간을 확인하세요.';}
  }
  function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open('climate-assessment-images-v1',1);req.onupgradeneeded=()=>req.result.createObjectStore('images');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
  async function imageStore(action,slot,file){
    if(!db)throw new Error('이미지를 저장할 수 없어요. 브라우저에서 사이트 저장 공간을 허용하세요.');
    return new Promise((resolve,reject)=>{const tx=db.transaction('images',action==='get'?'readonly':'readwrite'),s=tx.objectStore('images'),key=state.id+':'+slot;const req=action==='get'?s.get(key):action==='put'?s.put(file,key):s.delete(key);let value;req.onsuccess=()=>{value=req.result;};tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
  }
  const rpc = (name,arg) => new Promise((resolve,reject)=>{google.script.run.withSuccessHandler(resolve).withFailureHandler(e=>reject(new Error(e.message||String(e))))[name](arg);});
  function toast(msg){const t=document.querySelector('#toast');t.textContent=msg;t.style.display='block';clearTimeout(debounce);debounce=setTimeout(()=>t.style.display='none',4200);}
  function character(kind='earth') {
    const eye='<ellipse cx="69" cy="78" rx="8" ry="12" fill="white"/><ellipse cx="111" cy="78" rx="8" ry="12" fill="white"/><circle cx="72" cy="81" r="4" fill="#111"/><circle cx="108" cy="81" r="4" fill="#111"/><path d="M73 110q17-18 34 0" fill="#e64f23" stroke="#171d21" stroke-width="4"/><path d="M59 61l15 4m30 0l15-4" stroke="#171d21" stroke-width="4"/><ellipse cx="54" cy="98" rx="9" ry="4" fill="#ed805b"/><ellipse cx="128" cy="98" rx="9" ry="4" fill="#ed805b"/>';
    if(kind==='thermo')return '<svg viewBox="0 0 180 190" aria-hidden="true"><path d="M30 162q60-32 120 0l14 13q-73 20-144 0z" fill="#9bd5de" stroke="#fff1d6" stroke-width="12"/><path d="M74 111V34a18 18 0 0136 0v77a36 36 0 11-36 0z" fill="#dbf0e8" stroke="#fff3d8" stroke-width="14"/><path d="M74 111V34a18 18 0 0136 0v77a36 36 0 11-36 0z" fill="#cadfd8" stroke="#253d3e" stroke-width="5"/><path d="M92 48v80" stroke="#e44816" stroke-width="13" stroke-linecap="round"/><circle cx="92" cy="144" r="23" fill="#e44816" stroke="#253d3e" stroke-width="4"/><path d="M117 44h13m-13 16h13m-13 16h13m-13 16h13" stroke="#253d3e" stroke-width="4"/></svg>';
    return '<svg viewBox="0 0 180 190" aria-hidden="true"><path d="M40 156q45-18 100 0l19 19q-78 14-139-1z" fill="#80c8d3" stroke="#fff3d9" stroke-width="9"/><circle cx="90" cy="84" r="69" fill="#2a91a1" stroke="#fff5dd" stroke-width="12"/><circle cx="90" cy="84" r="68" fill="#2a91a1" stroke="#203b3f" stroke-width="4"/><path d="M41 38l23-12 21 9-4 21-25 10-19-10zm56-17l31 12 16 26-22 6-13-18-23-4zm-51 82l23-11 20 17-6 30-12 9-9-20zm56 24l13-26 22-3 8 19-18 22z" fill="#77ad68" stroke="#24474a" stroke-width="2"/>'+eye+'<path d="M25 90q-20 27-3 30q17-1 3-30m116-52q-14 23 0 25q14-2 0-25m8 98q-14 23 0 25q14-2 0-25" fill="#b8e6eb" stroke="#fff4db" stroke-width="5"/><path d="M53 140l-7 20m81-20 7 20" stroke="#28484b" stroke-width="8" stroke-linecap="round"/>'+(kind==='news'?'<path d="M51 119l39 10 39-10-6 54-33 10-33-10z" fill="#fff6dc" stroke="#263639" stroke-width="3"/><text x="65" y="148" font-size="16" font-weight="900">NEWS</text><path d="M63 155h52m-50 6h48m-46 6h44" stroke="#263639" stroke-width="2"/>':'')+'</svg>';
  }
  const cloud = '<svg viewBox="0 0 100 90" aria-hidden="true"><path d="M24 66C0 64 3 37 23 36C27 3 69 4 73 32C99 32 103 66 80 68" fill="none" stroke="#5c6876" stroke-width="8" stroke-linecap="round"/><path d="M50 73V38m-14 15 14-15 14 15" fill="none" stroke="#5c6876" stroke-width="8" stroke-linecap="round"/><path d="M79 12l5-10m4 21 8-7" stroke="#ee461c" stroke-width="4" stroke-linecap="round"/></svg>';
  const environment = '<div class="environment" aria-hidden="true"><svg viewBox="0 0 180 165"><path d="M12 150V88l36-18v28l35-18v30h22V52h18v60h23v38z" fill="#ba5829" stroke="#fff0cf" stroke-width="12"/><path d="M12 150V88l36-18v28l35-18v30h22V52h18v60h23v38z" fill="#ba5829" stroke="#253c3b" stroke-width="4"/><path d="M111 42Q79 30 92 18q-27 2-22-10 24-17 43 3 21-3 26 10 19 13-10 20z" fill="#d2c6aa" stroke="#fff0cf" stroke-width="7"/><path d="M25 117h14v12H25zm27 0h14v12H52zm27 0h14v12H79zm35 14h14v12h-14z" fill="#ffe4a9" stroke="#253c3b" stroke-width="2"/></svg><svg viewBox="0 0 180 165"><path d="M26 145Q-2 109 46 76q-4 24 13 25 26-44 14-79 57 24 44 79 24-13 26-33 55 47 13 84z" fill="#d9511e" stroke="#fff0cf" stroke-width="12"/><path d="M26 145Q-2 109 46 76q-4 24 13 25 26-44 14-79 57 24 44 79 24-13 26-33 55 47 13 84z" fill="#d9511e" stroke="#543d22" stroke-width="4"/><path d="M62 149q-16-20 8-45 0 17 12 17 25-19 15-47 46 46 22 77z" fill="#ffc843"/></svg></div>';
  const hourglass = '<div class="hourglass" aria-hidden="true"><svg viewBox="0 0 180 245"><path d="M28 27h124v23q0 43-49 73 49 31 49 79v18H28v-18q0-48 49-79-49-30-49-73z" fill="#d7e4d5" stroke="#fff0cf" stroke-width="12"/><path d="M28 27h124v23q0 43-49 73 49 31 49 79v18H28v-18q0-48 49-79-49-30-49-73z" fill="#d7e4d5" stroke="#253e3e" stroke-width="4"/><circle cx="90" cy="76" r="41" fill="#3096a3" stroke="#253e3e" stroke-width="3"/><path d="M59 47l25-9 11 14-13 20-28-4zm38 25l24-9 8 20-20 25-14-10z" fill="#7bac70" stroke="#253e3e" stroke-width="2"/><ellipse cx="75" cy="78" rx="6" ry="8" fill="white"/><ellipse cx="106" cy="78" rx="6" ry="8" fill="white"/><circle cx="77" cy="80" r="3"/><circle cx="104" cy="80" r="3"/><path d="M77 99q13-12 26 0m-39-39 15 4m22 0 14-4" stroke="#253e3e" stroke-width="3" fill="none"/><path d="M91 144q-20 28 0 29 20-1 0-29m-43 60 37-25 49 33" fill="#55adbc" stroke="#253e3e" stroke-width="2"/><path d="M15 19h150v16H15zm0 193h150v17H15z" fill="#936944" stroke="#fff0cf" stroke-width="10"/><path d="M15 19h150v16H15zm0 193h150v17H15z" fill="#936944" stroke="#253e3e" stroke-width="3"/></svg></div>';
  const chart = '<svg viewBox="0 0 450 170" role="img" aria-label="예시 그래프. 제출할 데이터가 아닙니다"><path d="M35 10v133h390M35 40h390M35 75h390M35 110h390" stroke="#bfc7cb" fill="none"/><polyline points="35,103 65,105 95,91 125,101 155,88 185,105 215,104 245,87 275,76 305,82 335,59 365,65 395,39 425,53" fill="none" stroke="#47af58" stroke-width="3"/><text x="35" y="162" font-size="12">2000</text><text x="211" y="162" font-size="12">연도</text><text x="393" y="162" font-size="12">2025</text><text x="2" y="15" font-size="12">°C</text></svg>';
  function field(name,label,placeholder='',type='text',opts='') {
    const val=state.fields[name]||'';
    return `<label class="field" for="${name}">${label}<input id="${name}" data-field="${name}" type="${type}" value="${esc(val)}" placeholder="${esc(placeholder)}" ${opts} required></label>`;
  }
  function select(name,label,values,placeholder){return `<label class="field" for="${name}">${label}<select id="${name}" data-field="${name}" required><option value="">${placeholder}</option>${values.map(v=>`<option value="${esc(v)}" ${state.fields[name]===String(v)?'selected':''}>${esc(v)}</option>`).join('')}</select></label>`;}
  const text = (name,placeholder='') => `<textarea id="${name}" data-field="${name}" ${name==='imageReason'?'aria-label="이 이미지를 만든 이유"':''} placeholder="${esc(placeholder)}" maxlength="8000" required>${esc(state.fields[name])}</textarea>`;
  const question = (n,name,label,hint='') => `<div class="question"><label for="${name}"><span class="number">${n}</span>${label}</label>${text(name,hint)}</div>`;
  function checks(group,items){return `<div class="checks">${items.map((x,i)=>`<label class="check"><input type="checkbox" data-check="${group}" data-index="${i}" ${state.checks[group]?.[i]?'checked':''}><span>${x}</span></label>`).join('')}</div>`;}
  function upload(slot,label,large=false){const f=state.files[slot];return `<div><label class="upload ${large?'large':''}" data-drop="${slot}"><input type="file" accept="image/png,image/jpeg" data-upload="${slot}" aria-label="${label}"><span class="file-preview" data-preview="${slot}">${cloud}</span><strong>${f?esc(f.name)+' · 클릭하여 바꾸기':label}</strong><small>JPG, PNG · 파일당 최대 5MB</small></label>${f?`<button type="button" class="file-remove" data-remove="${slot}">파일 제거</button>`:''}<p class="file-note">${f?f.remote?'Drive에 저장된 이미지':'이 기기에 이미지 저장됨 · 제출할 때 Drive에 업로드':'클릭하거나 이미지를 끌어 놓으세요.'}</p></div>`;}
  function sampleTable(){return `<table class="sample-table"><caption>자료표 캡처 예시 (값은 예시입니다)</caption><thead><tr><th>년도</th><th>지점</th><th>평균기온(°C)</th><th>평균최저</th><th>평균최고</th></tr></thead><tbody>${[11.4,11.1,11.4,11.2,11.9].map((v,i)=>`<tr><td>${2000+i}</td><td>203</td><td>${v}</td><td>${(v-4.5).toFixed(1)}</td><td>${(v+6).toFixed(1)}</td></tr>`).join('')}</tbody></table>`;}
  function yearsTable(years){return `<div class="year-scroll" tabindex="0" aria-label="연평균 기온 입력표. 작은 화면에서는 가로로 스크롤하세요"><table class="year-table"><thead><tr><th>년도</th>${years.map(y=>`<th scope="col">${y}</th>`).join('')}</tr></thead><tbody><tr><th scope="row">평균기온(°C)</th>${years.map(y=>`<td><input type="number" inputmode="decimal" step="0.1" min="-60" max="60" data-year="${y}" value="${esc(state.temperatures[y])}" aria-label="${y}년 연평균 기온" required></td>`).join('')}</tr></tbody></table></div>`;}
  function pageContent(step){
    if(step===1)return `<section class="paper">${select('courseClass','과학탐구실험1 반 (A~F)',['A','B','C','D','E','F'],'A~F반 중 선택')}${field('school','학교','학교 이름을 입력하세요 (예: ○○고등학교)','text','maxlength="100"')}<div class="grid3">${select('grade','학년',['1','2','3'],'학년 선택')}${select('classNumber','반',Array.from({length:30},(_,i)=>String(i+1)),'반 선택')}${field('studentNumber','번호','번호 입력','number','min="1" max="99" step="1"')}</div>${field('name','이름','이름을 입력하세요','text','maxlength="50"')}<div class="nav"><button class="next" type="button" data-next>다음 단계로 ❯</button></div></section>`;
    if(step===2)return `<section class="paper"><h2>1. 우리 지역의 기후 데이터 찾기</h2>${field('region','조사 지역','예: 이천시','text','maxlength="100"')}<div class="meta"><span>조사할 기후 요소　연평균 기온</span><span>자료 기간　2000~2025년</span></div><h2>2. 자료 제출</h2><button class="small-button" type="button" data-guide>▣ 자료 찾기 &amp; 제출방법 보기 ❯</button><div class="grid2" style="margin-top:12px"><div class="example"><h3>자료 표 캡처 예시</h3>${sampleTable()}<p class="hint">선택한 지역과 기간이 보이게 캡처하세요.</p></div><div class="example"><h3>▧ 자료 표 캡처 사진 제출</h3>${upload('dataTable','캡처한 사진을 업로드하세요.')}</div></div><h2 style="margin-top:18px">3. 연평균 기온</h2><p class="unit">(단위: °C)</p>${yearsTable(YEARS.slice(0,13))}${yearsTable(YEARS.slice(13))}<h2 style="margin-top:20px">4. 기후 변화 그래프</h2><div class="grid2"><div class="chart-example"><p class="hint">기온 변화 그래프 · 2000~2025년</p>${chart}<span class="stamp">캡처본 제출 양식</span></div><div class="example"><h3>▥ 그래프 캡처 사진 제출</h3>${upload('graph','캡처한 사진을 업로드하세요.')}</div></div><fieldset class="trend"><legend>기온 변화 경향은?</legend>${[['상승한다','↗'],['하강한다','↘'],['뚜렷한 변화가 없다','→']].map(([t,s])=>`<label><input type="radio" name="trend" data-field="trend" value="${t}" ${state.fields.trend===t?'checked':''}><b>${s}</b> ${t}</label>`).join('')}</fieldset></section>`;
    if(step===3)return `<section class="paper"><aside class="think"><strong>생각 도움말</strong>미래에는 지금까지와 다른 변화가 나타날 수도 있고, 기후에는 다양한 요인이 영향을 줄 수 있습니다.</aside><h2>1. 미래 기후 예측하기</h2><div style="clear:both">${QUESTIONS.map(([q,h],i)=>question(i+1,'prediction'+(i+1),q,h)).join('')}</div></section><section class="paper"><h2>2. 데이터 확인하기</h2>${checks('data',DATA_CHECKS)}</section>`;
    if(step===4)return `<section class="paper"><h2>1. 어떤 미래 모습을 만들까요?</h2><p>내가 예측한 미래 기후를 그림으로 표현한다면 어떤 모습일까요?</p><div class="future-row">${field('futureYear','미래 연도','2XXX년','number','min="2000" max="2999" step="1"')}${field('climateChange','기후 변화','예) 평균기온이 상승하여, 여름이 더 길어지고 …','text','maxlength="1000"')}</div><label class="field" for="landscape">지역 모습의 변화${text('landscape','예) 폭염으로 인해 그늘막이 늘어나고, 하천의 수량이 줄어 …')}</label><h2>2. AI 이미지 프롬프트 만들기</h2><p>아래 문장을 참고하여, AI 이미지 생성용 프롬프트를 완성해 보세요.</p><div class="prompt-example">2XXX년 ${esc(state.fields.region||'○○')} 지역의 모습.<br>평균기온이 [변화]하여 [지역 변화]한 모습이 나타나고 있다.<br>실제 지역신문에 사용되는 사진처럼 표현해 줘.</div><label class="field" for="prompt"><span class="prompt-label">✎ 학생 작성 프롬프트</span>${text('prompt','AI 이미지 생성을 위한 프롬프트를 직접 작성해 주세요.')}</label><h2>3. 생성한 이미지</h2>${upload('aiImage','생성한 AI 이미지를 업로드하세요.',true)}<h2 style="margin-top:16px">4. 이 이미지를 만든 이유</h2><label class="field" for="imageReason">${text('imageReason','내가 분석한 기후 데이터를 바탕으로 이 이미지를 만든 이유와, 어떤 미래 모습을 표현하고 싶었는지 자세히 작성해 보세요.')}</label></section>`;
    return `<section class="paper"><h2>1. 우리 지역 기후 신문 만들기</h2><div class="example"><strong>신문 기사 제목, 과거 기후 데이터 분석, [2.에서 만든 그래프],<br>미래 우리 지역 기후 예측, [4.에서 만든 사진]을 통합하여 AI로 신문을 만들어봅시다.</strong></div><div class="newspaper" style="margin-top:13px"><h3>완성한 AI 기후신문 파일 제출</h3>${upload('newspaper','학생이 만든 AI 기후신문 업로드',true)}</div></section><section class="paper essay"><h2>2. 논술형 작성하기</h2>${question(1,'essay1','이렇게 예측한 과학적 근거를 작성하시오.','그래프와 기후 데이터에서 나타난 경향을 바탕으로 왜 이렇게 예측했는지 자세히 써 보세요.')}${question(2,'essay2','예측할 때 고려해야 할 점을 작성하시오.','미래 예측의 한계, 다양한 기후 요인, 앞으로 달라질 수 있는 점 등을 생각해 써 보세요.')}</section><section class="paper"><h2>3. 데이터 확인하기</h2>${checks('final',FINAL_CHECKS)}</section>`;
  }
  function hero(step){const titles=['','<span class="banner white">수행평가:</span><span class="banner">우리 지역</span><br><span class="banner">기후 변화</span><span class="banner teal">예측하기</span>','<span class="banner white">2단계:</span><span class="banner">기후</span><span class="banner teal">데이터</span><span class="banner">찾기</span>','<span class="banner white">3단계:</span><span class="banner">미래 기후</span><br><span class="banner teal">예측하기</span>','<span class="banner white">4단계:</span><span class="banner">AI로</span><span class="banner teal">미래 우리 지역 모습 만들기</span>','<span class="banner white">5단계:</span><span class="banner">미래 기후신문</span><span class="banner teal">만들기</span>'];const subtitles=['','기본 정보를 입력하고<br>다음 단계로 진행하세요.','기상청 자료를 찾아 입력하고 그래프를 완성해보세요.','그래프를 바탕으로 우리 지역의 미래 기후를 예측해보세요.','내가 예측한 미래 기후를 AI 이미지로 표현해 봅시다.','지금까지 분석하고 예측한 내용을 바탕으로<br>우리 지역의 미래 기후신문을 완성해보세요.'];return `<header class="hero"><div class="course"><span>제3차 과학탐구실험 I</span></div><div class="mascot">${character(step===5?'news':'earth')}</div><h1>${titles[step]}</h1><p class="subtitle">${subtitles[step]}</p>${step===2?`<div class="toolbar"><button class="small-button" type="button" data-guide>자료 찾는 법 보기 ❯</button><a class="portal" href="${portal}" target="_blank" rel="noopener noreferrer">기상자료개방포털 바로가기 ❯</a></div>`:''}</header>`;}
  function render(){
    previewUrls.forEach(URL.revokeObjectURL);previewUrls=[];
    const step=Math.min(5,Math.max(1,Number(state.step)||1));state.step=step;
    if(state.view==='complete'){renderComplete();return;}
    main.innerHTML=`<div class="shell ${step===1?'cover':''}">${hero(step)}<ol class="progress" aria-label="작성 단계">${LABELS.map((x,i)=>`<li><button type="button" data-step="${i+1}" ${i+1>step?'disabled':''} class="${i+1===step?'active':''}" ${i+1===step?'aria-current="step"':''}>${i+1}. ${x}</button></li>`).join('')}</ol>${!online?'<div class="mode-note">미리보기 모드 · 이 기기에 저장됩니다. 실제 제출은 배포한 Apps Script 주소에서 진행하세요.</div>':''}${state.receipt?`<div class="mode-note">${state.dirty?'제출 후 수정 중 · 다시 제출해야 선생님께 반영됩니다.':'제출한 내용을 확인하고 있어요.'} 최종 제출: ${fmt(state.receipt.updatedAt)}</div>`:''}<form id="assessment" novalidate><div class="teal-frame"><div id="formError" role="alert"></div>${pageContent(step)}${step>1?`<div class="nav"><button type="button" class="back" data-back>❮ 이전 단계로</button><button type="button" class="next" ${step===5?'data-submit':'data-next'}>${step===5?'제출하기':'다음 단계로'} ❯</button><div class="decor-bottom">${character('thermo')}</div></div>`:''}</div></form><p class="status-note" style="color:#fff9df">입력 내용은 이 기기에 자동 저장됩니다. 공용 기기에서는 제출 후 새 학생 시작을 눌러 주세요.</p></div>`;
    if(step===1){main.querySelector('.teal-frame').insertAdjacentHTML('afterend',environment);main.querySelector('.hero').insertAdjacentHTML('beforeend',hourglass);main.querySelector('.mascot').innerHTML=character('thermo');}
    hydratePreviews();
  }
  async function hydratePreviews(){for(const slot of SLOTS){const target=document.querySelector(`[data-preview="${slot}"]`);if(!target || !state.files[slot])continue;try{const f=await imageStore('get',slot);if(f && target.isConnected){const url=URL.createObjectURL(f);previewUrls.push(url);target.innerHTML=`<img src="${url}" alt="${esc(state.files[slot].name)} 미리보기">`;}}catch(_){} }}
  function renderComplete(){
    const r=state.receipt;
    main.innerHTML=`<div class="shell">${hero(5)}<div class="teal-frame"><section class="paper completion">
      <div class="success-icon">✓</div><h2>${r?.mode==='demo'?'미리보기 제출 완료':'제출이 완료되었어요!'}</h2>
      <p>${esc(state.fields.name)} 학생의 미래 기후신문 ${r?.mode==='demo'?'미리보기를':'제출을'} 마쳤습니다.</p>
      ${r?.mode==='demo'?'<div class="mode-note">체험 결과입니다. Google Sheets와 Drive에는 저장되지 않았습니다.</div>':'<p>작성 내용을 수정한 뒤 다시 제출할 수 있습니다.</p>'}
      <dl><dt>조사 지역</dt><dd>${esc(state.fields.region)}</dd><dt>최초 제출 시각</dt><dd>${fmt(r?.createdAt)}</dd><dt>최종 수정 시각</dt><dd>${fmt(r?.updatedAt)}</dd><dt>제출 상태</dt><dd>${r?.mode==='demo'?'미리보기 완료':esc(r?.status||'제출 완료')}</dd><dt>제출 번호</dt><dd>${esc(state.id)}</dd></dl>
      <div class="nav"><button class="next" type="button" data-edit>내용 수정하기 ❯</button></div>
      ${r?.mode!=='demo'?`<details class="recovery"><summary>다른 기기에서 불러오기 위한 복구 코드</summary><p class="hint">이 코드를 보관하면 다른 기기에서 제출 내용을 불러올 수 있어요. 다른 사람에게 공유하지 마세요.</p><code>${esc(state.id+'.'+state.token)}</code></details>`:''}
      <div class="modal-actions"><button type="button" data-export>내 답변 내려받기</button><button type="button" data-new>새 학생 시작</button></div>
    </section></div></div>`;
  }
  function showModal(title,body,actions){document.querySelector('#modalBody').innerHTML=`<div class="modal-paper"><button class="modal-close" type="button" data-close aria-label="팝업 닫기">×</button><h2 id="modalTitle">${title}</h2>${body}<div class="modal-actions">${actions||'<button type="button" data-close>닫기</button>'}</div></div>`;modal.showModal();}
  function showGuide(){showModal('자료 찾기 &amp; 제출 방법',`<ol class="guide"><li>기상청 기상자료개방포털에 접속해요.<br><a class="portal" href="${portal}" target="_blank" rel="noopener noreferrer">기상자료개방포털 바로가기 ❯</a></li><li>기후통계분석 → 통계분석 → 기온분석을 선택해요.<div class="crumbs"><span>기후통계분석</span><span>통계분석</span><span>기온분석</span></div><small>현재 포털 메뉴 명칭은 바뀔 수 있어요. 연별 기온 자료를 찾아주세요.</small></li><li>조회할 자료와 그래프 화면을 확인해요.<div class="grid2"><div>${sampleTable()}</div><div>${chart}</div></div></li><li>조사할 지역을 선택하고 기간을 <strong>2000~2025년</strong>으로 맞춰요.</li><li>연평균 기온이 보이도록 조회하고 CSV로 내려받아요.</li><li>지역, 기간, 평균기온 값이 잘 보이게 자료표와 그래프를 각각 캡처해서 제출해요.</li></ol>`,'<button type="button" data-close>닫기</button><button type="button" class="confirm" data-close>확인했어요!</button>');}
  function missing(step){const f=state.fields, errors=[];let names=[];
    if(step===1)names=['courseClass','school','grade','classNumber','studentNumber','name'];
    if(step===2){names=['region','trend'];if(!YEARS.every(y=>state.temperatures[y]!=='' && state.temperatures[y]!=null && Number.isFinite(Number(state.temperatures[y])) && Math.abs(Number(state.temperatures[y]))<=60))errors.push('2000~2025년의 연평균 기온 26개를 모두 입력하세요. (-60~60°C)');['dataTable','graph'].forEach(x=>{if(!state.files[x])errors.push(x==='graph'?'그래프 캡처를 업로드하세요.':'자료표 캡처를 업로드하세요.');});}
    if(step===3)names=['prediction1','prediction2','prediction3','prediction4'];
    if(step===4){names=['futureYear','climateChange','landscape','prompt','imageReason'];if(!state.files.aiImage)errors.push('생성한 AI 이미지를 업로드하세요.');if(f.futureYear && (!/^2\d{3}$/.test(String(f.futureYear))))errors.push('미래 연도는 2000~2999 사이의 네 자리 숫자로 입력하세요.');}
    if(step===5){names=['essay1','essay2'];if(!state.files.newspaper)errors.push('완성한 AI 기후신문을 업로드하세요.');}
    for(const n of names){if(!String(f[n]||'').trim()){const label=({courseClass:'과학탐구실험1 반',school:'학교',grade:'학년',classNumber:'반',studentNumber:'번호',name:'이름',region:'조사 지역',trend:'기온 변화 경향',futureYear:'미래 연도',climateChange:'기후 변화',landscape:'지역 모습의 변화',prompt:'AI 이미지 프롬프트',imageReason:'이미지를 만든 이유',essay1:'논술형 1번',essay2:'논술형 2번'})[n]||n.replace('prediction','미래 예측 문항 ');errors.push(label+' 항목을 작성하세요.');}}
    if(step===1 && f.studentNumber && (!Number.isInteger(Number(f.studentNumber))||Number(f.studentNumber)<1||Number(f.studentNumber)>99))errors.push('번호는 1~99 사이 정수로 입력하세요.');
    return errors;
  }
  function validate(step){const errors=missing(step),el=document.querySelector('#formError');if(errors.length){el.innerHTML=`<div class="error"><strong>다음 항목을 확인하세요.</strong><ul>${errors.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`;el.scrollIntoView({block:'center',behavior:'smooth'});return false;}el.innerHTML='';return true;}
  function navigate(step){state.step=step;persist(false);render();window.scrollTo({top:0,behavior:'smooth'});main.focus({preventScroll:true});}
  async function pickFile(slot,file){if(busy||!file)return;if(!['image/png','image/jpeg'].includes(file.type)){toast('JPG 또는 PNG 이미지 파일만 업로드할 수 있어요.');return;}if(file.size>5*1024*1024 || !file.size){toast('파일은 0바이트보다 크고 5MB 이하여야 해요.');return;}try{const bitmap=await createImageBitmap(file);bitmap.close();await imageStore('put',slot,file);state.files[slot]={name:file.name,type:file.type,size:file.size,requestId:makeId(),remote:false};state.pendingRequest=null;persist();render();}catch(_){toast('이미지를 읽거나 저장할 수 없어요. 파일과 브라우저 저장 공간을 확인하세요.');}}
  const base64 = file => new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('이미지를 읽을 수 없어요.'));reader.readAsDataURL(file);});
  function busyView(msg){let el=document.querySelector('.busy');if(!el){el=document.createElement('div');el.className='busy';el.setAttribute('role','status');document.body.append(el);}el.innerHTML=`<div><div class="spinner"></div><strong>${esc(msg)}</strong><p>잠시 기다려 주세요. 이 창을 닫지 마세요.</p></div>`;}
  function startSubmit(){
    if(busy)return;
    const unchecked=[['data',DATA_CHECKS],['final',FINAL_CHECKS]].flatMap(([g,items])=>items.filter((_,i)=>!state.checks[g]?.[i]));
    if(unchecked.length){showModal('확인하지 않은 항목이 있습니다',`<p>3페이지와 5페이지의 체크리스트를 모두 확인한 뒤 제출해 주세요.</p><ul>${unchecked.map(x=>`<li>${x}</li>`).join('')}</ul>`,'<button type="button" data-close>돌아가서 확인하기</button>');return;}
    for(let s=1;s<=5;s++){if(missing(s).length){navigate(s);validate(s);return;}}
    showModal(state.receipt?'수정한 내용을 다시 제출할까요?':'최종 제출할까요?',`<p><strong>${esc(state.fields.school)} ${esc(state.fields.name)}</strong> 학생의 답변과 이미지 4개를 제출합니다.</p><p>${online?'최초 제출 시각은 유지되며, 재제출하면 최종 수정 시각이 갱신됩니다.':'현재는 미리보기 모드입니다. Google Sheets와 Drive에는 저장되지 않습니다.'}</p>`,'<button type="button" data-close>계속 작성하기</button><button type="button" class="confirm" data-confirm-submit>확인 · 제출하기</button>');
  }
  async function submit(){
    if(busy)return;modal.close();busy=true;busyView('이미지를 준비하고 있어요');
    try{
      if(online){for(let i=0;i<SLOTS.length;i++){const slot=SLOTS[i],f=state.files[slot];if(f.remote)continue;busyView(`이미지 업로드 중 (${i+1}/4)`);const blob=await imageStore('get',slot);if(!blob)throw new Error('저장된 '+slot+' 이미지가 없어요. 해당 페이지에서 다시 업로드하세요.');const result=await rpc('uploadImage',{id:state.id,token:state.token,slot,requestId:f.requestId,name:f.name,mimeType:f.type,base64:await base64(blob)});state.files[slot]={...f,...result,remote:true};persist(false);}
        busyView('답변을 저장하고 있어요');
        state.pendingRequest ||= makeId();persist(false);
        state.receipt=await rpc('submitAssessment',{id:state.id,token:state.token,requestId:state.pendingRequest,fields:state.fields,temperatures:state.temperatures,checks:state.checks,files:state.files});
      }else{const now=new Date().toISOString();state.receipt={mode:'demo',createdAt:state.receipt?.createdAt||now,updatedAt:now,status:'미리보기 완료'};}
      state.pendingRequest=null;state.dirty=false;state.view='complete';persist(false);render();window.scrollTo(0,0);
    }catch(e){showModal('제출을 완료하지 못했어요',`<p>${esc(e.message)}</p><p>답변과 이미지는 이 기기에 남아 있습니다. 연결과 배포 설정을 확인한 뒤 다시 제출하세요.</p>`);}
    finally{busy=false;document.querySelector('.busy')?.remove();}
  }
  function exportAnswers(){const data={...state};delete data.token;const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='기후탐구_내답변.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  document.addEventListener('input',e=>{if(busy)return;const el=e.target;if(el.dataset.field){if(el.type==='radio'&&!el.checked)return;state.fields[el.dataset.field]=el.value;state.pendingRequest=null;persist();}if(el.dataset.year){state.temperatures[el.dataset.year]=el.value;state.pendingRequest=null;persist();}});
  document.addEventListener('change',e=>{if(busy)return;const el=e.target;if(el.dataset.check){state.checks[el.dataset.check][Number(el.dataset.index)]=el.checked;state.pendingRequest=null;persist();}if(el.dataset.upload)pickFile(el.dataset.upload,el.files[0]);});
  document.addEventListener('dragover',e=>{if(e.target.closest('[data-drop]'))e.preventDefault();});
  document.addEventListener('drop',e=>{const el=e.target.closest('[data-drop]');if(el){e.preventDefault();pickFile(el.dataset.drop,e.dataTransfer.files[0]);}});
  document.addEventListener('submit',e=>e.preventDefault());
  document.addEventListener('click',async e=>{const el=e.target.closest('button');if(!el || busy)return;
    if(el.hasAttribute('data-guide'))showGuide();
    if(el.hasAttribute('data-close'))modal.close();
    if(el.hasAttribute('data-next') && validate(state.step))navigate(state.step+1);
    if(el.hasAttribute('data-back'))navigate(state.step-1);
    if(el.dataset.step)navigate(Number(el.dataset.step));
    if(el.hasAttribute('data-submit'))startSubmit();
    if(el.hasAttribute('data-confirm-submit'))await submit();
    if(el.hasAttribute('data-edit')){state.view='form';navigate(1);}
    if(el.dataset.remove){await imageStore('delete',el.dataset.remove);delete state.files[el.dataset.remove];state.pendingRequest=null;persist();render();}
    if(el.hasAttribute('data-export'))exportAnswers();
    if(el.hasAttribute('data-new'))showModal('새 학생 시작', '<p>이 기기에 저장된 현재 학생의 답변과 복구 코드를 지웁니다. 선생님께 제출한 자료는 유지됩니다. 필요한 답변과 복구 코드를 먼저 보관하세요.</p>', '<button type="button" data-close>취소</button><button type="button" class="confirm" data-reset>새 학생 시작</button>');
    if(el.hasAttribute('data-reset')){for(const slot of SLOTS){try{await imageStore('delete',slot);}catch(_){}}state=fresh();persist(false);modal.close();render();window.scrollTo(0,0);}
    if(el.hasAttribute('data-recover'))showModal('제출 내용 불러오기','<p>제출 완료 화면에서 보관한 복구 코드를 입력하세요.</p><label class="field" for="recoveryCode">복구 코드<input id="recoveryCode" autocomplete="off"></label><p class="hint">불러오면 이 기기의 현재 답변을 대체합니다. 필요한 답변을 먼저 내려받으세요.</p>', '<button type="button" data-close>취소</button><button type="button" class="confirm" data-recover-confirm>불러오기</button>');
    if(el.hasAttribute('data-recover-confirm')){const code=document.querySelector('#recoveryCode').value.trim(),parts=code.split('.');if(parts.length!==2){toast('복구 코드 형식을 확인하세요.');return;}busy=true;try{const result=await rpc('getSubmission',{id:parts[0],token:parts[1]});state={...fresh(),...result,id:parts[0],token:parts[1],step:5,view:'complete',dirty:false};for(const slot of SLOTS){try{await imageStore('delete',slot);}catch(_){}}persist(false);modal.close();render();}catch(err){toast(err.message);}finally{busy=false;}}
  });
  async function init(){try{db=await openDB();}catch(_){dbFailure=true;}persist(false);render();if(dbFailure)toast('브라우저 저장 공간을 사용할 수 없어요. 이미지 업로드를 위해 저장 공간을 허용하세요.');const utility=document.querySelector('.utility');if(online){const recover=document.createElement('button');recover.className='small-button';recover.textContent='제출 내용 불러오기';recover.setAttribute('data-recover','');utility.append(recover);} }
  window.ClimateApp={missing,startSubmit,getState:()=>structuredClone(state),isOnline:online};
  init();
})();

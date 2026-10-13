/** Google Apps Script V8. Run teacherSetup once in the editor as the teacher. */
const SETTINGS = {sheetName:'제출현황', uploadsName:'업로드기록', maxBytes:5*1024*1024};
const TARGET_SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID';
const TARGET_DRIVE_FOLDER_ID = 'YOUR_PRIVATE_DRIVE_FOLDER_ID';
const FILE_SLOTS = ['dataTable','graph','aiImage','newspaper'];
const FIELD_KEYS = ['courseClass','school','grade','classNumber','studentNumber','name','region','trend','prediction1','prediction2','prediction3','prediction4','futureYear','climateChange','landscape','prompt','imageReason','essay1','essay2'];
const HEADERS = ['제출ID','수정권한해시','과학탐구실험1반','학교','학년','반','번호','이름','조사지역','자료시작연도','자료종료연도']
  .concat(Array.from({length:26},(_,i)=>(2000+i)+'년 연평균기온(°C)'))
  .concat(['기온변화경향','미래예측1','미래예측2','미래예측3','미래예측4','미래연도','기후변화','지역모습변화','AI프롬프트','이미지만든이유','논술형1','논술형2','자료표URL','그래프URL','AI이미지URL','기후신문URL','3페이지체크리스트','5페이지체크리스트','최초제출시각','최종수정시각','제출상태','최종요청ID','전체답변JSON','학생폴더ID']);
const UPLOAD_HEADERS = ['제출ID','항목','요청ID','파일ID','파일명','MIME','크기','URL','업로드시각'];

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index').setTitle('우리 지역 기후 변화 예측하기')
    .addMetaTag('viewport','width=device-width, initial-scale=1');
}

/** Editor-only setup. Functions ending in _ cannot be called using google.script.run. */
function teacherSetup() {requireTeacher_();return setup_();}
function requireTeacher_(){const active=Session.getActiveUser().getEmail(),effective=Session.getEffectiveUser().getEmail();if(!active||active!==effective)throw new Error('선생님 계정만 초기 설정을 실행할 수 있습니다.');}
function setup_() {
  const p=PropertiesService.getScriptProperties();
  const sheetId=TARGET_SPREADSHEET_ID,folderId=TARGET_DRIVE_FOLDER_ID;
  p.setProperty('SPREADSHEET_ID',sheetId);p.setProperty('DRIVE_FOLDER_ID',folderId);
  const ss=SpreadsheetApp.openById(sheetId);ss.setSpreadsheetTimeZone('Asia/Seoul');
  initSheet_(ss,SETTINGS.sheetName,HEADERS);initSheet_(ss,SETTINGS.uploadsName,UPLOAD_HEADERS);
  console.log('제출 시트: '+ss.getUrl());console.log('이미지 폴더: '+DriveApp.getFolderById(folderId).getUrl());
  return {spreadsheetUrl:ss.getUrl(),folderUrl:DriveApp.getFolderById(folderId).getUrl()};
}
function initSheet_(ss,name,headers){let s=ss.getSheetByName(name);if(!s)s=ss.insertSheet(name);if(s.getMaxColumns()<headers.length)s.insertColumnsAfter(s.getMaxColumns(),headers.length-s.getMaxColumns());if(s.getLastRow()===0){s.getRange(1,1,1,headers.length).setValues([headers]);s.setFrozenRows(1);s.getRange(1,1,1,headers.length).setBackground('#075157').setFontColor('#ffffff').setFontWeight('bold');}else if(s.getRange(1,1,1,headers.length).getValues()[0].join('|')!==headers.join('|'))throw new Error(name+'의 열 구조가 다릅니다. 새 시트를 사용하거나 원래 머리글을 복원하세요.');return s;}
function config_(){const p=PropertiesService.getScriptProperties();const sheetId=p.getProperty('SPREADSHEET_ID'),folderId=p.getProperty('DRIVE_FOLDER_ID');if(!sheetId||!folderId)throw new Error('선생님이 Apps Script에서 setup 함수를 먼저 실행해야 합니다.');return {ss:SpreadsheetApp.openById(sheetId),folder:DriveApp.getFolderById(folderId)};}
function locked_(fn){const l=LockService.getScriptLock();l.waitLock(30000);try{return fn();}finally{l.releaseLock();}}
function hash_(s){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s,Utilities.Charset.UTF_8).map(x=>('0'+((x+256)%256).toString(16)).slice(-2)).join('');}
function auth_(req){if(!req||!/^[a-zA-Z0-9-]{16,80}$/.test(req.id||'')||!/^[a-zA-Z0-9-]{32,160}$/.test(req.token||''))throw new Error('제출 번호 또는 수정 권한이 올바르지 않습니다.');}
function findRow_(sheet,id){if(sheet.getLastRow()<2)return 0;const match=sheet.getRange(2,1,sheet.getLastRow()-1,1).createTextFinder(id).matchEntireCell(true).findNext();return match?match.getRow():0;}
function record_(c,req,create){auth_(req);const sheet=c.ss.getSheetByName(SETTINGS.sheetName);if(!sheet)throw new Error('setup 함수를 실행하세요.');let row=findRow_(sheet,req.id);if(!row){if(!create)throw new Error('이 복구 코드의 제출 내역이 없습니다.');const values=HEADERS.map(()=> '');values[0]=req.id;values[1]=hash_(req.token);values[HEADERS.indexOf('제출상태')]='업로드 중';row=sheet.getLastRow()+1;sheet.getRange(row,1,1,HEADERS.length).setValues([values]);}if(sheet.getRange(row,2).getValue()!==hash_(req.token))throw new Error('수정 권한이 일치하지 않습니다. 제출 완료 화면의 복구 코드를 확인하세요.');return {sheet,row,values:sheet.getRange(row,1,1,HEADERS.length).getValues()[0]};}
function requestId_(id){if(!/^[a-zA-Z0-9-]{16,80}$/.test(id||''))throw new Error('요청 번호가 올바르지 않습니다.');}
function uploadImage(req) {
  auth_(req);requestId_(req.requestId);
  if(FILE_SLOTS.indexOf(req.slot)===-1)throw new Error('지원하지 않는 이미지 항목입니다.');
  if(['image/png','image/jpeg'].indexOf(req.mimeType)===-1)throw new Error('JPG, PNG 이미지만 허용합니다.');
  if(typeof req.base64!=='string'||req.base64.length>Math.ceil(SETTINGS.maxBytes/3)*4+4||!/^[A-Za-z0-9+/]+={0,2}$/.test(req.base64))throw new Error('이미지는 5MB 이하로 업로드하세요.');
  const bytes=Utilities.base64Decode(req.base64);if(!bytes.length||bytes.length>SETTINGS.maxBytes)throw new Error('파일 크기가 올바르지 않습니다.');
  const b=bytes.map(x=>(x+256)%256);
  const isPng=b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71&&b[4]===13&&b[5]===10&&b[6]===26&&b[7]===10;
  const isJpg=b[0]===255&&b[1]===216&&b[2]===255;
  if((req.mimeType==='image/png'&&!isPng)||(req.mimeType==='image/jpeg'&&!isJpg))throw new Error('이미지 형식과 파일 내용이 일치하지 않습니다.');
  return locked_(()=>{
    const c=config_(),r=record_(c,req,true),logs=c.ss.getSheetByName(SETTINGS.uploadsName);
    const rows=logs.getLastRow()>1?logs.getRange(2,1,logs.getLastRow()-1,UPLOAD_HEADERS.length).getValues():[];
    const existing=rows.find(x=>x[0]===req.id&&x[1]===req.slot&&x[2]===req.requestId);
    if(existing)return {fileId:existing[3],url:existing[7],name:existing[4],type:existing[5],size:existing[6]};
    let folderId=r.values[HEADERS.indexOf('학생폴더ID')];
    if(!folderId){folderId=c.folder.createFolder(req.id).getId();r.sheet.getRange(r.row,HEADERS.indexOf('학생폴더ID')+1).setValue(folderId);}
    const name=String(req.name||'image').replace(/[\\/<>:"|?*\x00-\x1f]/g,'_').slice(0,100);
    const file=DriveApp.getFolderById(folderId).createFile(Utilities.newBlob(bytes,req.mimeType,req.slot+'_'+req.requestId+'_'+name));
    // Files remain private to the teacher. No public link-sharing is enabled.
    logs.appendRow([req.id,req.slot,req.requestId,file.getId(),safeCell_(name),req.mimeType,bytes.length,file.getUrl(),new Date().toISOString()]);
    return {fileId:file.getId(),url:file.getUrl(),name,type:req.mimeType,size:bytes.length};
  });
}
function safeCell_(s){s=String(s==null?'':s);return /^[=+\-@]/.test(s)?"'"+s:s;}
function validateSubmission_(req){
  auth_(req);requestId_(req.requestId);const f=req.fields||{};
  FIELD_KEYS.forEach(k=>{if(typeof f[k]!=='string'||!f[k].trim()||f[k].length>8000)throw new Error('필수 답변을 확인하세요: '+k);});
  if(!/^[A-F]$/.test(f.courseClass)||!['1','2','3'].includes(f.grade)||!/^\d+$/.test(f.classNumber)||Number(f.classNumber)<1||Number(f.classNumber)>30||!/^\d+$/.test(f.studentNumber)||Number(f.studentNumber)<1||Number(f.studentNumber)>99)throw new Error('학생 기본정보를 확인하세요.');
  if(!/^2\d{3}$/.test(f.futureYear)||!['상승한다','하강한다','뚜렷한 변화가 없다'].includes(f.trend))throw new Error('미래 연도 또는 기온 변화 경향을 확인하세요.');
  for(let y=2000;y<=2025;y++){const v=req.temperatures&&req.temperatures[y];if(v==null||String(v).trim()===''||!Number.isFinite(Number(v))||Math.abs(Number(v))>60)throw new Error(y+'년 기온을 확인하세요.');}
  ['data','final'].forEach(k=>{const a=req.checks&&req.checks[k];if(!Array.isArray(a)||a.length!==5||!a.every(x=>x===true))throw new Error('체크리스트를 모두 확인하세요.');});
  if(JSON.stringify(req).length>43000)throw new Error('답변이 너무 깁니다. 각 문항의 분량을 줄여 주세요.');
}
function submitAssessment(req) {
  validateSubmission_(req);
  return locked_(()=>{
    const c=config_(),r=record_(c,req,false),get=h=>r.values[HEADERS.indexOf(h)];
    // Retrying an already committed request returns the original receipt.
    if(get('최종요청ID')===req.requestId)return JSON.parse(get('전체답변JSON')).receipt;
    const log=c.ss.getSheetByName(SETTINGS.uploadsName),rows=log.getLastRow()>1?log.getRange(2,1,log.getLastRow()-1,UPLOAD_HEADERS.length).getValues():[];
    const files={};
    FILE_SLOTS.forEach(slot=>{const input=req.files&&req.files[slot];if(!input)throw new Error('이미지를 업로드하세요: '+slot);const found=rows.find(x=>x[0]===req.id&&x[1]===slot&&x[3]===input.fileId);if(!found)throw new Error('이미지 소유권을 확인할 수 없습니다: '+slot);files[slot]={fileId:found[3],url:found[7],name:found[4],type:found[5],size:found[6],remote:true};});
    const now=new Date().toISOString(),created=get('최초제출시각')||now,receipt={createdAt:created,updatedAt:now,status:created===now?'제출 완료':'수정 제출 완료',mode:'cloud'};
    const fields={};FIELD_KEYS.forEach(k=>fields[k]=req.fields[k].trim());const temperatures={};for(let y=2000;y<=2025;y++)temperatures[y]=String(req.temperatures[y]);
    const saved={fields,temperatures,checks:req.checks,files,receipt};
    const f=fields,values=[req.id,hash_(req.token),f.courseClass,f.school,f.grade,f.classNumber,f.studentNumber,f.name,f.region,2000,2025]
      .concat(Array.from({length:26},(_,i)=>Number(temperatures[2000+i])))
      .concat([f.trend,f.prediction1,f.prediction2,f.prediction3,f.prediction4,f.futureYear,f.climateChange,f.landscape,f.prompt,f.imageReason,f.essay1,f.essay2,files.dataTable.url,files.graph.url,files.aiImage.url,files.newspaper.url,JSON.stringify(req.checks.data),JSON.stringify(req.checks.final),created,now,receipt.status,req.requestId,JSON.stringify(saved),get('학생폴더ID')]);
    r.sheet.getRange(r.row,1,1,HEADERS.length).setValues([values.map(v=>typeof v==='string'?safeCell_(v):v)]);SpreadsheetApp.flush();return receipt;
  });
}
function getSubmission(req){auth_(req);return locked_(()=>{const r=record_(config_(),req,false),json=r.values[HEADERS.indexOf('전체답변JSON')];if(!json)throw new Error('최종 제출된 답변이 아직 없습니다. 원래 기기에서 제출을 완료하세요.');return JSON.parse(json);});}

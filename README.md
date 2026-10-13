# 우리 지역 기후 변화 예측하기

과학탐구실험1 · 2026년 3차 수행평가.

GitHub Pages는 학생용 시작 페이지를 제공합니다. 실제 5단계 작성·이미지 업로드·답안 저장·수정 제출은 Apps Script 웹앱에서 실행됩니다.

## 파일
- index.html: 학생용 시작 페이지
- source/: HTML, CSS, JavaScript와 서버 소스
- apps-script/: Apps Script 편집기에 저장할 배포 파일

## 별도 학교에 설치
1. Google Sheets와 비공개 Drive 폴더를 만듭니다.
2. apps-script/Code.gs의 YOUR_SPREADSHEET_ID와 YOUR_PRIVATE_DRIVE_FOLDER_ID를 실제 ID로 바꿉니다.
3. Apps Script에 Code.gs, Index.html, appsscript.json을 저장합니다.
4. 교사 계정으로 teacherSetup을 실행하고 Sheets·Drive 권한을 승인합니다.
5. 웹앱으로 배포합니다. 실행 계정은 교사(나), 접속 범위는 수강 학생에 맞춰 설정합니다.
6. index.html의 시작 버튼 주소를 웹앱 /exec 주소로 바꿉니다.
7. GitHub Settings → Pages → Deploy from a branch → main / (root) → Save.

## 화면 수정
source에서 수정 후 Node.js로 source/build.mjs를 실행합니다. 생성된 source/apps-script/Index.html을 Apps Script에 저장하고 배포 관리에서 새 버전으로 업데이트합니다. GitHub 코드 변경만으로 Apps Script 배포가 자동 갱신되지는 않습니다.

## 저장 방식
학생 기본정보·26년 기온·서술 답안·파일 URL·최초 제출시각·최종 수정시각·제출 상태를 Sheets에 저장합니다. PNG/JPG는 학생별 비공개 Drive 폴더에 저장합니다. 동일한 제출 ID로 다시 제출하면 기존 행을 갱신합니다. 기기의 localStorage와 IndexedDB에도 임시 답안·이미지를 보관합니다.

GitHub 저장소에는 학생 답안이나 교사용 시트·폴더 연결 ID를 포함하지 않습니다.


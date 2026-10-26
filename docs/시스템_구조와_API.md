# 시스템 구조와 API

## 1. 구성

```text
브라우저
  └─ Vite 개발 서버 :5173
       └─ /api 프록시 → ASP.NET Core :5182
                            ├─ ClosedXML → 샘플 엑셀 파일
                            └─ 초기화 후 로컬 JSON 적재 파일
```

### 프론트엔드

- 현재 진입점: `app/frontend/index.html`. `work/screen_template.html`을 `work/sync_frontend.mjs`로 동기화합니다.
- 화면 집계·조회·운영요약·CSV 업로드 로직도 현재 템플릿에 있습니다. `app/frontend/src/`의 React 코드는 이전 구현으로 보존합니다.
- 초기 로드 시 `GET /api/data`, `GET /api/spec`, `GET /api/data/status`를 호출합니다. 업로드 성공 후 화면을 다시 읽습니다.

### 백엔드

- 프로젝트: `app/backend/AxBackend.csproj`
- API/엑셀 로딩: `app/backend/Program.cs`
- ASP.NET Core Minimal API와 ClosedXML을 사용합니다.
- 백엔드는 샘플 엑셀 또는 로컬 적재 파일을 조회해 테이블을 JSON으로 전달합니다. 운영 도메인 계산 대부분은 프론트엔드가 수행합니다.

## 2. API 엔드포인트

### `GET /api/health`

다음 정보를 JSON으로 반환합니다.

- `status`: 성공 시 `ok`
- `source`: 샘플 엑셀 파일명
- `asOf`: `equipment_snapshot`에서 계산한 최신 스냅샷 시각
- `tables`: 각 시트의 반환 행 수

이 엔드포인트도 전체 통합 문서를 로드하므로 파일/시트 문제가 있으면 실패합니다.

### `GET /api/data`

15개 시트를 `{ 테이블명: [행 객체, ...] }` 구조로 반환합니다. 페이지 필터는 프론트엔드에서 동작합니다. 인증·권한, 페이지네이션, 선택 필드 API는 구현되어 있지 않습니다.

### 로컬 적재 API

- `GET /api/data/status`: 현재 원본 모드, 테이블별 건수와 화면 준비 여부를 반환합니다.
- `POST /api/data/reset`: 화면 데이터를 빈 로컬 저장소로 초기화합니다. 샘플 엑셀 원본은 유지됩니다.
- `POST /api/data/upload`: `{ table, headers, rows }` JSON을 받아 필드·자료형·필수값·중복 키·참조를 검사한 뒤 한 테이블에 원자적으로 추가합니다.
- `POST /api/data/restore-sample`: 로컬 저장소를 해제하고 샘플 엑셀로 복원합니다.

초기화 상태에서도 운영현황·조회·운영요약 화면을 열 수 있습니다. 운영현황 지표는 0/0 또는 0으로, 공정은 미작업으로 표시합니다. 화면에 필요한 기준 테이블과 블록별 공정 작업지시가 준비되면 적재한 데이터를 표시합니다. CSV는 테이블별로 올리며, 참조 대상 테이블을 먼저 적재해야 합니다.

### `GET /api/summary/ai`

현재는 `{ "enabled": false, "text": null }`을 반환하는 비활성 응답입니다. 실제 AI 공급자 호출이나 요약 생성은 없습니다.

## 3. 개발 프록시와 포트

`app/frontend/vite.config.js`에서 개발 서버 호스트/포트는 `127.0.0.1:5173`, `/api` 프록시 목적지는 `http://127.0.0.1:5182`입니다. 백엔드 실행 주소도 같은 값으로 맞춰야 합니다.

프론트엔드가 API 오류를 받으면 화면에 오류 메시지를 표시하고, 연결 확인 안내로 백엔드 주소를 제시합니다.

## 4. 오류와 구성

- 데이터 파일 경로는 `Program.cs`에서 백엔드 콘텐츠 루트를 기준으로 구성됩니다.
- `app/backend/appsettings*.json`에는 기본 로깅 수준과 허용 호스트 설정이 있습니다.
- 환경 변수/비밀키 기반 외부 서비스 연동 설정은 현재 프로젝트에 없습니다.
- 데이터 API에 대한 인증·인가나 CORS 정책은 별도 구성되어 있지 않습니다. 현재 개발 프록시를 통한 로컬 실행을 전제로 합니다.

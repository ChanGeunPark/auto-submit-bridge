# 카공맵 자동 제보 브릿지

카공맵 어드민 페이지(`/admin/auto-submit`)가 본인 PC 의 `claude` CLI 를 호출해 카페 정보를 자동 조사하도록 하는 로컬 HTTP 브릿지입니다.

브라우저는 `http://localhost` / `127.0.0.1` 을 mixed content 예외로 취급하므로, **Vercel 배포된 어드민 페이지에서도 본인 PC 브릿지를 그대로 호출**할 수 있습니다. 단, 본인 PC 가 켜져 있고 브릿지가 떠 있는 상태여야 합니다 (모바일 미지원).

---

## 0. 사전 준비

다음 두 가지가 본인 PC 에 설치되어 있어야 합니다.

|                 | 확인 명령          | 설치 가이드                                       |
| --------------- | ------------------ | ------------------------------------------------- |
| **Node.js 20+** | `node --version`   | https://nodejs.org/                               |
| **Claude CLI**  | `claude --version` | https://docs.claude.com/en/docs/claude-code/setup |

Claude CLI 는 한 번 `claude` 명령으로 실행해 로그인까지 마쳐야 합니다.

또한 **카공맵 어드민 운영자에게 다음 두 가지를 받아두세요**:

- `BRIDGE_TOKEN` — 카공맵 Vercel 환경변수에 등록되어 있는 공유 토큰
- 어드민 권한 (NextAuth oauth ID 가 카공맵 `ADMIN_USER_IDS` 에 등록)

---

## 1. 다운로드

```bash
# 의존성 설치
npm install
```

> `<OWNER>/<REPO>` 자리는 실제 깃허브 레포 경로로 변경 (예: `<username>/kagongmap-auto-submit-bridge`).

---

## 2. 환경변수 (`.env`) 설정

```bash
cp .env.example .env
```

`.env` 파일을 열어 **`BRIDGE_TOKEN`** 만 어드민 운영자에게 받은 값으로 변경합니다. 나머지는 기본값 그대로 두면 됩니다.

```ini
BRIDGE_TOKEN=<운영자에게 받은 토큰>
PORT=7332
ALLOWED_ORIGINS=http://localhost:3000,https://www.xn--ob0bo0wy3p.com
AGENT=claude
CONCURRENCY=1
TIMEOUT_MS=180000
```

> 본인이 카공맵 운영자 본인이라면, 토큰은 `openssl rand -hex 32` 로 직접 생성해 (1) 이 `.env` 의 `BRIDGE_TOKEN`, (2) 카공맵 Vercel 환경변수 `NEXT_PUBLIC_BRIDGE_TOKEN`, (3) 로컬 카공맵의 `.env.development.local` 의 `NEXT_PUBLIC_BRIDGE_TOKEN` 세 곳에 동일하게 등록.

---

## 3. 실행 방식 두 가지

### A. 수동 실행 (개발/임시 사용)

```bash
npm run bridge
```

`http://127.0.0.1:7332` 에서 listen. 터미널을 닫으면 종료됩니다. 코드 수정이 즉시 반영되는 `tsx watch` 모드.

브릿지를 매번 직접 띄우는 게 귀찮다면 → **B 옵션** 으로 자동 시작 셋업.

### B. 자동 시작 (LaunchAgent — macOS 전용, 추천)

macOS 부팅 시 자동으로 시작되고, 죽으면 자동으로 재시작됩니다. 본인이 더 이상 터미널을 띄울 필요가 없습니다.

### B-1. 본인 환경의 절대경로 확인

LaunchAgent 는 PATH 가 매우 제한적이라 **모든 명령을 절대경로**로 적어야 합니다. 다음 명령으로 본인 환경의 경로를 먼저 확인:

```bash
which node      # 보통 /usr/local/bin/node 또는 /opt/homebrew/bin/node
which npm       # 보통 /usr/local/bin/npm 또는 /opt/homebrew/bin/npm
which claude    # 보통 ~/.local/bin/claude

pwd             # 브릿지 폴더의 절대경로 — 위 git clone 한 곳
echo $HOME      # 본인 홈 디렉토리
whoami          # 본인 username
```

### B-2. plist 파일 생성

`~/Library/LaunchAgents/com.kagongmap.auto-submit-bridge.plist` 를 아래 내용으로 만듭니다.

> 아래 템플릿의 **`/Users/<username>`** 부분을 모두 본인 username 의 home 경로로 변경하고, **`WorkingDirectory`** 는 위에서 확인한 `pwd` 결과로, **`PATH`** 의 claude 디렉토리는 `which claude` 결과의 디렉토리 부분으로 변경.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.kagongmap.auto-submit-bridge</string>

    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/npm</string>
        <string>run</string>
        <string>start</string>
    </array>

    <!-- ⬇ 본인이 git clone 한 폴더의 절대경로 -->
    <key>WorkingDirectory</key>
    <string>/Users/<username>/Desktop/auto-submit-bridge</string>

    <!-- LaunchAgent 는 PATH 가 매우 제한적이라 직접 명시.
         claude CLI 가 있는 디렉토리(보통 ~/.local/bin)를 반드시 포함. -->
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/opt/homebrew/bin:/Users/<username>/.local/bin:/usr/bin:/bin</string>
        <key>HOME</key>
        <string>/Users/<username></string>
    </dict>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>ThrottleInterval</key>
    <integer>10</integer>

    <key>StandardOutPath</key>
    <string>/Users/<username>/Library/Logs/auto-submit-bridge.log</string>

    <key>StandardErrorPath</key>
    <string>/Users/<username>/Library/Logs/auto-submit-bridge.error.log</string>

    <key>Nice</key>
    <integer>1</integer>

    <key>ProcessType</key>
    <string>Background</string>
</dict>
</plist>
```

#### 주요 키 설명

| 키                                      | 역할                                                       |
| --------------------------------------- | ---------------------------------------------------------- |
| `Label`                                 | LaunchAgent 식별자. `launchctl` 명령에서 사용. 변경 비추천 |
| `ProgramArguments`                      | 실행할 명령 배열. `npm run start` (= `tsx src/server.ts`)  |
| `WorkingDirectory`                      | 명령 실행 디렉토리. **본인이 clone 한 절대경로**           |
| `EnvironmentVariables.PATH`             | LaunchAgent 의 PATH. **claude 디렉토리 필수**              |
| `RunAtLoad`                             | 등록 즉시 + 부팅 시 자동 시작                              |
| `KeepAlive`                             | 죽으면 자동 재시작 (항상 켜짐 보장)                        |
| `StandardOutPath` / `StandardErrorPath` | 로그 파일 경로                                             |

### B-3. 등록 + 시작

```bash
# 로그 디렉토리 생성
mkdir -p ~/Library/Logs

# (있다면) 수동으로 떠있는 npm run bridge 종료
lsof -i :7332 | tail -n +2 | awk '{print $2}' | xargs -r kill

# LaunchAgent 등록 + 즉시 시작
launchctl load -w ~/Library/LaunchAgents/com.kagongmap.auto-submit-bridge.plist
```

### B-4. 동작 확인

```bash
# 1) 등록 + PID 확인 — 두 번째 컬럼이 0 이고 첫 컬럼에 PID 가 보이면 정상
launchctl list | grep kagongmap

# 2) 헬스체크 (.env 의 토큰 자동 추출)
TOKEN=$(grep BRIDGE_TOKEN .env | cut -d= -f2)
curl -s http://127.0.0.1:7332/health -H "Authorization: Bearer $TOKEN"
# 정상: {"ok":true,"agent":"claude","concurrency":1}
```

마지막으로 카공맵의 `/admin/auto-submit` 페이지를 새로고침했을 때 우측 상단 배지가 **●초록 "브릿지 연결됨"** 으로 뜨면 셋업 완료.

### B-5. 평소 사용 명령

| 작업             | 명령                                                                                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 수동 시작        | `launchctl start com.kagongmap.auto-submit-bridge`                                                                                                   |
| 수동 중단        | `launchctl stop com.kagongmap.auto-submit-bridge` (KeepAlive 로 곧 재시작됨)                                                                         |
| 일시 비활성화    | `launchctl unload ~/Library/LaunchAgents/com.kagongmap.auto-submit-bridge.plist`                                                                     |
| 다시 활성화      | `launchctl load -w ~/Library/LaunchAgents/com.kagongmap.auto-submit-bridge.plist`                                                                    |
| 로그 실시간 보기 | `tail -f ~/Library/Logs/auto-submit-bridge.{log,error.log}`                                                                                          |
| 완전 제거        | `launchctl unload ~/Library/LaunchAgents/com.kagongmap.auto-submit-bridge.plist && rm ~/Library/LaunchAgents/com.kagongmap.auto-submit-bridge.plist` |

### B-6. 코드/설정 변경 후 재시작

`.env` 또는 `src/*.ts` 를 수정했다면:

```bash
launchctl unload ~/Library/LaunchAgents/com.kagongmap.auto-submit-bridge.plist
launchctl load -w ~/Library/LaunchAgents/com.kagongmap.auto-submit-bridge.plist
```

> `npm run start` 는 watch 모드가 아니므로 코드 변경 시 재시작 필요. 개발 중엔 LaunchAgent unload 후 `npm run bridge`(watch) 로 작업하는 게 편함.

### B-7. 코드 업데이트 (`git pull`)

레포에 새 변경사항이 올라왔을 때:

```bash
cd /path/to/auto-submit-bridge
git pull
npm install                                                 # 의존성 변경 시
launchctl unload ~/Library/LaunchAgents/com.kagongmap.auto-submit-bridge.plist
launchctl load -w ~/Library/LaunchAgents/com.kagongmap.auto-submit-bridge.plist
```

---

## 엔드포인트

| 메서드 | 경로                  | 설명                             |
| ------ | --------------------- | -------------------------------- |
| GET    | `/health`             | 헬스체크 (토큰 검증 포함)        |
| GET    | `/jobs`               | 큐 전체 목록                     |
| POST   | `/jobs`               | 새 작업 추가 (body: `{ place }`) |
| DELETE | `/jobs/:id`           | 작업 취소/삭제                   |
| POST   | `/jobs/:id/submitted` | 작업 상태를 'submitted' 로 마킹  |
| GET    | `/events`             | SSE — 큐 변화 스트림             |

모든 요청에 `Authorization: Bearer <BRIDGE_TOKEN>` 필요. CORS 는 `.env` 의 `ALLOWED_ORIGINS` 에 명시된 origin 만 허용.

---

## 환경변수 (`.env`)

| 변수              | 기본값                  | 용도                                                     |
| ----------------- | ----------------------- | -------------------------------------------------------- |
| `BRIDGE_TOKEN`    | 없음 (필수)             | `Authorization: Bearer` 토큰                             |
| `PORT`            | `7332`                  | listen 포트 (`127.0.0.1` 에만 바인딩)                    |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | CORS 허용 origin (콤마 구분)                             |
| `AGENT`           | `claude`                | `claude` 또는 `codex` (codex 는 placeholder, 검증 안 됨) |
| `CONCURRENCY`     | `1`                     | 동시 실행 작업 수                                        |
| `TIMEOUT_MS`      | `180000`                | CLI 타임아웃 (3분)                                       |

---

## 트러블슈팅

### LaunchAgent 가 시작되지 않음

```bash
cat ~/Library/Logs/auto-submit-bridge.error.log | tail -50
```

| 에러 메시지                           | 원인 → 조치                                                                                     |
| ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `command not found: claude`           | plist 의 `EnvironmentVariables.PATH` 에 claude 경로 누락. `which claude` 결과의 디렉토리를 추가 |
| `BRIDGE_TOKEN 이 설정되지 않았습니다` | `.env` 의 BRIDGE_TOKEN 이 비어있거나 default 값 그대로. 변경 후 LaunchAgent unload + load       |
| `EADDRINUSE :::7332`                  | 다른 프로세스가 포트 점유 중. `lsof -i :7332` 로 PID 찾아 kill                                  |
| `permission denied`                   | plist 파일 권한 문제. `chmod 644 ~/Library/LaunchAgents/com.kagongmap.auto-submit-bridge.plist` |
| `cannot find module 'tsx'`            | `npm install` 누락. WorkingDirectory 에서 다시 실행                                             |

### 어드민 페이지가 ●빨강 "연결 끊김"

1. 브릿지 동작 확인:
   ```bash
   curl -s http://127.0.0.1:7332/health -H "Authorization: Bearer <토큰>"
   ```
2. 토큰 일치 확인: 카공맵 `.env.development.local` 의 `NEXT_PUBLIC_BRIDGE_TOKEN` 과 브릿지 `.env` 의 `BRIDGE_TOKEN` 비교
3. 카공맵 dev 서버 재시작 + 브라우저 hard reload (`Cmd+Shift+R`) — `NEXT_PUBLIC_*` 환경변수는 빌드 타임 인라인이라 dev 서버 재시작 필수
4. CORS 차단 시 브릿지 `.env` 의 `ALLOWED_ORIGINS` 에 현재 origin 포함되어 있는지 확인. 변경 후 LaunchAgent 재로드

### claude CLI 가 인증 만료 / 로그인 필요

LaunchAgent 환경에서는 인터랙티브 로그인이 어렵습니다. 일반 터미널에서 한 번 `claude` 실행해 로그인 → LaunchAgent 재로드:

```bash
launchctl unload ~/Library/LaunchAgents/com.kagongmap.auto-submit-bridge.plist
launchctl load -w ~/Library/LaunchAgents/com.kagongmap.auto-submit-bridge.plist
```

### Apple Silicon (M1/M2/M3) 에서 경로 다름

Apple Silicon Mac 은 Homebrew 가 `/opt/homebrew/bin` 에 설치됩니다. plist 의 `PATH` 와 `ProgramArguments` 의 npm 경로를 수정:

```xml
<key>ProgramArguments</key>
<array>
    <string>/opt/homebrew/bin/npm</string>   <!-- ⬅ 변경 -->
    <string>run</string>
    <string>start</string>
</array>
```

`which npm` 결과를 그대로 쓰면 됩니다.

---

## 보안 메모

- 브릿지는 **`127.0.0.1` 에만 바인딩** — 같은 LAN 의 다른 기기에서 접근 불가. 절대 `0.0.0.0` 으로 바꾸지 말 것.
- **토큰 노출 위험은 낮음**: `NEXT_PUBLIC_BRIDGE_TOKEN` 은 클라이언트 번들에 인라인되어 노출되지만, 토큰을 알아도 본인 PC 에 브릿지가 떠 있어야만 의미 있음.
- **CORS 화이트리스트 필수**: 배포 도메인 추가 시 `.env` 의 `ALLOWED_ORIGINS` 갱신 + LaunchAgent 재로드.
- **claude CLI 는 본인 권한으로 spawn** — `--permission-mode bypassPermissions` 사용. 본인이 직접 돌리는 것과 동등하므로 신뢰 경계 내부.

---

## 라이선스 / 기여

내부 도구이므로 별도 라이선스 없음. 카공맵 본체 (`kagongmap` 레포) 와 함께 발전.

브릿지 측 변경 PR 시 카공맵 본체의 `types/autoSubmit.ts` 와 enum 동기화 여부 확인 필요.

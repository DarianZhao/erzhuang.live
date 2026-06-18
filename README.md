# 越南语 AI 电话系统

一个可本地模拟、可接入真实 Twilio 外呼的最小生产骨架：

- Twilio Voice API 外呼；
- Twilio `<Connect><Stream>` 双向音频；
- Deepgram 越南语实时识别；
- DeepSeek 结构化销售状态机；
- MiniMax 越南语克隆音色；
- 客户打断与 Twilio `clear`；
- SQLite 客户、通话和逐轮转录；
- 浏览器管理后台。

## 1. 本地启动

要求 Node.js 22 或更高版本。

```bash
npm install
cp .env.example .env
npm start
```

浏览器访问 `http://localhost:8787`。默认 `APP_MODE=mock`，不需要任何API密钥：

1. 添加客户；
2. 点击“模拟通话”；
3. 输入客户说的越南语；
4. 后台运行状态机并由浏览器越南语语音朗读回复；
5. 转录和状态保存在 `data/calls.sqlite`。

## 2. 接入真实服务

填写 `.env`：

```env
APP_MODE=live
PUBLIC_BASE_URL=https://你的公网HTTPS域名

TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=...

DEEPGRAM_API_KEY=...

DEEPSEEK_API_KEY=...
DEEPSEEK_MODEL=deepseek-v4-flash

MINIMAX_API_KEY=...
MINIMAX_VOICE_ID=...
MINIMAX_MODEL=speech-2.8-turbo
```

公网地址必须同时支持：

- HTTPS webhook：`POST /twilio/voice`
- HTTPS状态回调：`POST /twilio/status`
- WSS双向音频：`/twilio/media`

本地联调可使用 Cloudflare Tunnel 或 ngrok，把生成的 HTTPS 地址填入
`PUBLIC_BASE_URL`。

## 3. MiniMax音色

先在 MiniMax 创建自己的合法授权音色，再把返回的 `voice_id` 写入
`MINIMAX_VOICE_ID`。建议录制2–5分钟干净、自然、无音乐的人声；源录音可以是
普通话或英语，输出时由MiniMax生成越南语。

项目已包含克隆命令：

```bash
npm run clone-voice -- /绝对路径/darian-voice.wav DarianVietnamVoice
```

完整上线顺序见 [`docs/LIVE_SETUP.md`](docs/LIVE_SETUP.md)。

## 公网部署

项目包含 `Dockerfile` 和 `render.yaml`。推荐部署到常驻的Render Starter服务，
将持久磁盘挂载到 `/var/data`，再把 `call.erzhuang.live` 指向平台提供的域名。
公网后台由 `APP_USERNAME` 和 `APP_PASSWORD` 保护；Twilio回调使用独立签名验证，
不经过后台登录。

## 4. 当前MVP边界

- MiniMax使用整句WAV合成，再转换为Twilio要求的8kHz μ-law；可靠但不是最低延迟。
- 生产优化可改成MiniMax流式MP3 + 常驻解码器。
- Twilio HTTP 与 WebSocket 回调已验证签名；上线前仍需增加后台登录鉴权、加密密钥管理和正式隐私政策。
- 只能呼叫有合法商业联系依据的联系人，必须维护拒接名单和当地工作时间限制。

## 5. 检查

```bash
npm test
npm run check
```

# 真实越南外呼上线清单

按顺序执行。前一步不通，不进入下一步。

## A. 准备账号

需要：

1. Twilio 可充值账号；
2. Deepgram API Key；
3. DeepSeek API Key；
4. MiniMax API Key；
5. 一个公网 HTTPS/WSS 地址。

Twilio Console 中：

- 开启 Vietnam Geographic Permissions；
- 准备一个允许语音外呼的 `From` 号码；
- Trial账号只能拨已验证号码，正式测试需升级；
- 设置合理的账户余额告警和每日消费上限。

## B. 创建配置

```bash
cp .env.example .env
```

先填写：

```env
APP_MODE=mock
DEEPGRAM_API_KEY=...
DEEPSEEK_API_KEY=...
MINIMAX_API_KEY=...
```

不要把 `.env` 发给任何人，也不要提交到Git。

## C. 录制并克隆音色

录制要求：

- 2–5分钟自然人声；
- WAV、MP3或M4A；
- 单人、无背景音乐、无混响；
- 普通话或英语即可；
- 内容不要包含密码、地址、证件号码。

执行：

```bash
npm run clone-voice -- /绝对路径/darian-voice.wav DarianVietnamVoice
```

把输出写入：

```env
MINIMAX_VOICE_ID=DarianVietnamVoice
```

随后先在模拟模式检查越南语自然度，并请越南母语者审核。

## D. 建立公网地址

正式环境推荐常驻云服务，开发阶段可使用 Cloudflare Tunnel 或 ngrok。公网地址必须支持：

- `POST /twilio/voice`
- `POST /twilio/status`
- `WSS /twilio/media`

填写：

```env
PUBLIC_BASE_URL=https://example-tunnel.example
```

URL不能带末尾斜杠。

公网后台还必须设置：

```env
APP_USERNAME=darian
APP_PASSWORD=至少20位随机密码
DATA_DIR=/var/data
```

## E. 配置Twilio

```env
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+1...
```

程序会在拨号时动态向Twilio提供TwiML和状态回调，不需要手工创建Studio Flow。

## F. 分层测试

1. `npm run check`
2. `npm start`
3. 打开后台，确认状态组件全部就绪；
4. 添加一个由你本人控制、允许接听的越南测试号码；
5. 先用`APP_MODE=mock`完成一轮；
6. 改成`APP_MODE=live`并重启；
7. 点击真实拨号；
8. 检查来电显示、首句披露、识别准确率、声音质量和客户打断；
9. 检查通话转录、时长、摘要和结果。

第一轮真实测试只拨你本人或明确同意测试的人。

## G. 正式业务规则

上线前必须完成：

- 后台登录；
- API密钥由部署平台的Secret管理；
- 每日拨号数量和费用上限；
- 越南当地工作时间；
- 号码去重和呼叫频率限制；
- 永久拒呼名单；
- AI身份披露；
- 录音/转录许可；
- 人工接管号码；
- 隐私和数据删除流程；
- 越南当地法律顾问确认外呼用途和许可依据。

未经许可，不应对公开抓取的号码进行批量机器人外呼。

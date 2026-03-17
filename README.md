# Telegram AI WebApp

独立的 Telegram WebApp 静态项目，用来承载“幻梦 AI 陪聊”主页。

## 启动

```bash
cd /Users/tchen/workspace/dev_engineer/pro/telegram-ai-webapp
python3 server.py
```

默认监听：

- `0.0.0.0:8080`

可以通过环境变量修改：

```bash
HOST=0.0.0.0 PORT=8080 python3 server.py
```

## Telegram 接入

Telegram `web_app` 入口必须使用公网 `https` 地址。

本地开发时可以直接预览：

- `http://127.0.0.1:8080`

正式接入 Bot 时，把你的公网 `https` 地址配置到机器人按钮或菜单即可。

## 对接 Bot API

默认会请求：

- `http://127.0.0.1:8090`

如果你的 API 地址不同，可以通过查询参数传入：

```text
http://127.0.0.1:8080/?apiBase=https://your-api.example.com
```

本地预览时，如果不在 Telegram 内打开，也可以补一个用户 ID：

```text
http://127.0.0.1:8080/?user_id=6953351913
```

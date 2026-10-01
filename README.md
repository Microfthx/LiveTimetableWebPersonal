# Live Idol Timetable Personal

手机浏览器中的个人演出时间表。此项目从服务器同步版的现有前端整理而来，保留现场延迟、OCR JSON 导入、海报裁剪预览和时间轴；无需 API、管理员密钥或服务器数据库。

## 本地运行

```bash
npm ci
npm run dev
npm test
npm run build
```

构建产物在 `dist/`。任意静态 Web 服务器都可以托管，服务器配置示例见 `deploy/`。

## 数据位置

活动和延迟只保存在当前浏览器的 `localStorage`。浏览器、设备和端口之间互不共享；9998 个人版与 9999 服务器同步版互不影响。清除网站数据会清除个人时间表。

原始海报保存在当前浏览器的 IndexedDB，不写入 `localStorage` 或 OCR JSON。刷新后网页读取海报并重新生成裁剪图；调整延迟不会重新裁剪。恢复 Demo 会清除已存海报。旧版已导入、但此前未保存的海报无法凭空找回，需要重新上传一次。若浏览器禁用或清除了 IndexedDB、存储空间不足，网页会提示海报保存或恢复失败。OCR JSON 唯一规范是 [docs/DATA_FORMAT.md](docs/DATA_FORMAT.md)。

## 阿里云部署

`deploy/nginx-9998.conf` 用独立 Nginx 实例监听 `9998`，静态文件位于 `/opt/live-idol-timetable-personal/current`。`deploy/live-idol-timetable-personal.service` 为 systemd 服务。此版本没有 Node 常驻进程，也不会访问 9999 的 API。

若服务器本机访问正常而公网地址超时，还需在阿里云 ECS 实例关联的安全组入方向放行 TCP 9998；Nginx 配置本身无法改变云侧规则。

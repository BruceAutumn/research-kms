# Windows and Android clients

客户端使用 Tauri v2 最小权限容器打开正式 HTTPS Web 工作区，因此 Web、Windows 和 Android 使用同一套登录与用户数据。构建前在 GitHub 仓库变量 `PRODUCT_WEB_URL` 中配置正式站点根 URL。

- Windows CI 生成未签名 MSI/NSIS；公开下载会出现系统来源提醒，商业分发应增加 Authenticode 签名。
- Android CI 生成可侧载 APK；进入应用商店前需上传密钥、Play App Signing、AAB、Data safety 和账户删除说明。
- 容器不包含 API Key、数据库密码或后端管理凭据，也不授予 shell、任意文件系统或进程权限。

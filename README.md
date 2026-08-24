# Research KMS v0.5.0

Research KMS 把文献管理、AI Chat/Agent 与双链知识库放进同一个研究工作区。

正式产品提供三种入口：

- Web：登录后上传和阅读 PDF、管理集合/标签/元数据/标注，配置个人模型 API，使用 Chat/Plan/Agent，以及编辑带属性、双链、反链和图谱的 Vault。
- Windows：Tauri v2 客户端，连接同一个 Web 工作区。
- Android：Tauri v2 客户端，连接同一个 Web 工作区。

## 公开仓库内容

- `website/`：正式官网与多用户 Web 客户端；包含可拖动工作区、统一登录入口、多模型路由、D1 数据库、R2 文件存储和服务端 AES-GCM 密钥加密。
- `frontend/`、`backend/`：本地优先版 React + Spring Boot 参考实现，适合离线研究与二次开发。
- `frontend/src-tauri/`：Windows / Android 最小权限客户端容器。
- `plugin-sdk/`：声明式插件清单和权限模型草案。
- `.github/workflows/`：质量检查及 Windows/Android 构建。
- `openapi/openapi-v1.yaml`：Hosted 与 Spring 数据适配器共用的公开 `/api/v1` 契约。

公开包不包含个人 API、数据库、PDF、Vault、日志、开发历史、部署凭据、签名证书或本机绝对路径。

## 运行正式 Web 源码

```bash
cd website
npm ci
npm test
```

部署时需要提供 D1 绑定 `DB`、R2 绑定 `FILES`，以及两个服务端机密变量：

- `APP_ENCRYPTION_KEY`：32 字节 Base64 主密钥。
- `ADMIN_EMAIL`：可进入私有运营后台的账户邮箱。

## 运行本地版

```bash
cp .env.example .env
docker compose up -d db
(cd backend && mvn spring-boot:run)
(cd frontend && npm ci && npm run dev)
```

本地版默认只监听本机，不应直接暴露到公网；公网用户产品以 `website/` 为准。

## 安全

发现安全问题请使用 GitHub Security Advisory 私下报告，不要在公开 Issue 中粘贴密钥、日志或个人文献。详见 [SECURITY.md](SECURITY.md)。

## License

[MIT](LICENSE)

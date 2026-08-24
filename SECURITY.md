# Security policy

## Supported release

仅最新公开版本接受安全更新。

## Public product controls

- 身份由 Sign in with ChatGPT 提供，产品不自行保存密码。
- 文献、PDF、笔记、对话和模型设置的查询均绑定稳定用户 ID。
- PDF 存储键使用用户哈希前缀，下载前再次校验所有权。
- 用户 API Key 使用服务端 AES-GCM 主密钥加密，读取接口永不返回密钥。
- 模型 Base URL 只允许公网 HTTPS，并拒绝本机、私网、保留地址和非标准端口。
- 写请求进行同源检查，上传限制为 PDF 且最大 30 MB。
- 管理后台只展示聚合计数和审计事件，不显示密钥或正文。

## Never commit

API Key、`.env`、`~/.kms/secret.key`、数据库转储、Vault、PDF、日志、证书和应用商店签名材料不得进入公开仓库。

## Reporting

请使用 GitHub 的 “Report a vulnerability” 私下提交复现步骤、影响范围和建议修复。公开 Issue 只用于不含敏感数据的普通缺陷。

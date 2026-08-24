# Research KMS hosted product

正式官网与多用户 Web 工作区。技术栈为 vinext/React、D1、R2、Drizzle 和 Sign in with ChatGPT。

```bash
npm ci
npm test
```

部署清单需要声明 D1 `DB` 和 R2 `FILES`；运行环境需要 32 字节 Base64 的 `APP_ENCRYPTION_KEY`，管理员后台可选 `ADMIN_EMAIL`。不要把这些值写进仓库。

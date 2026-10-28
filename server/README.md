# 基础后端

使用 Node.js 24 自带的 `node:http` 和 `node:sqlite`，无需安装 npm 包。在仓库根目录运行：

```powershell
node server/server.mjs
```

服务仅监听本机 `127.0.0.1:3000`。若端口被占用，可先在 PowerShell 中运行 `$env:PORT=3001`，再启动服务。第一次启动会根据 `database/seed.json` 自动创建 `database/meishi.sqlite`。数据库文件只保存在本地，不提交到 Git。

| 方法与路径 | 用途 | 响应 |
| --- | --- | --- |
| `GET /` | 打开现有网页 | HTML，网页暂用演示数据 |
| `GET /api/health` | 检查服务 | `{ "status": "ok" }` |
| `GET /api/places` | 获取全部觅食点及其菜品 | `{ "places": [...] }` |
| `GET /api/places/:id` | 获取一个觅食点及其菜品 | `{ "place": {...} }` |

地点字段为 `id`、`name`、`placeType`、`sourceGroup`、`parentId`、`campusArea`、`locationNote`、`sourceLabel`、`verificationStatus`、`lastConfirmedAt` 和 `recommendations`。菜品字段为 `id`、`placeId`、`name`、`floor`、`note`、`priceLevel`、`mealPeriod`、`sourceLabel` 和 `verificationStatus`。尚未收集到的数据返回 `null`，不会猜测价格、餐次、位置或营业状态。

未知地点返回 HTTP 404 和 `{ "error": "place_not_found", "message": "..." }`。当前接口只支持读取；其它方法返回 HTTP 405。下一步再实现前端 API 接入和需要审核的反馈提交。不要把当前网页的本地“管理员维护”误认为服务器管理功能。

后续增加地点或菜品：编辑 `database/seed.json`，给新记录设置不重复的 `id`，菜品的 `placeId` 填已有地点的 `id`，然后运行 `node database/init.mjs`。脚本按 ID 插入或更新，已有记录不会重复添加；从种子文件删去一条记录不会自动删除数据库中的旧记录。组员拉取新代码后，各自运行初始化命令同步本地数据。

运行接口测试：

```powershell
node --test server/app.test.mjs
```

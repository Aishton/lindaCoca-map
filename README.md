# 华科觅食

面向华中科技大学校园餐饮场景的推荐与地图网页。当前支持区域、地点类型与菜名偏好筛选、快速推荐、换一个选择、地点详情、交互式校园地图，以及无需登录的修改意见提交与进度查询。

- 在线网站：[https://aishton.github.io/lindaCoca-map/](https://aishton.github.io/lindaCoca-map/)
- 网站入口：`index.html`
- 当前数据：31 个地点／店铺、63 条食物推荐

## 当前功能

- 午餐／晚餐场景标记，区域、地点类型和菜名关键词筛选
- “帮我决定今天吃什么”快速模式
- 以地点为主体的三个推荐、推荐理由与“换一家”
- 全部地点搜索和餐饮点详情
- Leaflet + OpenStreetMap 校园地图
- 地图搜索、食堂／店铺筛选、合并标记和详情弹窗
- 名称、位置、楼层入口、菜品、营业时间等多类型修改意见
- 反馈编号生成、处理状态查询和管理员审核
- “详情 → 纠错反馈 → 地图圈点”的位置纠错草稿
- 校准结果复制与 JSON 下载

本地服务会将反馈写入 SQLite，并通过管理员登录保护审核接口；GitHub Pages 演示环境只能在当前浏览器保存普通用户反馈，不能提供真实管理员权限。用户圈出的坐标只作为“大致位置”，不会自动变成“已确认”。

## 文档导航

- [项目文档索引](docs/README.md)
- [地图与位置数据](docs/map/README.md)：地图结构、坐标来源、状态规则、人工圈点和发布检查。
- [角色、权限与纠错审核设计](docs/roles-and-review.md)：后续游客、贡献者、管理员、维护者和审核工作流。
- [数据库说明](database/README.md)
- [后端与 API 说明](server/README.md)

## 部署到 Render

仓库已包含 `render.yaml`。在 Render 中选择 **New → Blueprint**，连接本仓库并确认创建服务；随后为 `ADMIN_PASSWORD` 填写强密码。Blueprint 会创建 Node Web Service，并把 SQLite 放在 `/var/data/meishi.sqlite` 的 1 GB 持久化磁盘中。部署成功后请依次检查 `/api/health`、普通反馈提交、管理员登录和反馈审核。

持久化磁盘需要 Render 付费实例。如果仅为短时课堂展示，可删除 `render.yaml` 中的 `disk` 配置并选择 Free，但每次重启、休眠或重新部署都可能丢失反馈数据，不适合作为长期在线系统。

## 仓库结构

```text
lindaCoca-map/
├─ index.html                 # GitHub Pages 入口、页面结构和样式
├─ app.js                     # 推荐、地图、详情和校准交互
├─ database/
│  ├─ schema.sql              # SQLite 表结构
│  ├─ seed.json               # 地点、坐标与推荐菜品种子数据
│  ├─ init.mjs                # 数据库初始化／同步脚本
│  └─ README.md               # 数据库说明
├─ server/
│  ├─ server.mjs              # 本地服务启动入口
│  ├─ app.mjs                 # HTTP 路由、地点读取和反馈 API
│  ├─ app.test.mjs            # API 测试
│  └─ README.md               # 后端说明
└─ docs/
   ├─ README.md               # 文档索引
   ├─ map/README.md           # 地图专题文档
   └─ roles-and-review.md     # 角色、权限和审核设计
```

`index.html` 和 `app.js` 保留在根目录，是为了让现有 GitHub Pages 部署继续工作；专题说明统一放入 `docs/`。

## 本地运行

需要 Node.js 24。项目不依赖第三方 npm 包。

```powershell
git clone https://github.com/Aishton/lindaCoca-map.git
cd lindaCoca-map
$env:ADMIN_USERNAME="admin"
$env:ADMIN_PASSWORD="请替换为强密码"
node server/server.mjs
```

打开：

- 网页：`http://127.0.0.1:3000/`
- 健康检查：`http://127.0.0.1:3000/api/health`
- 地点 API：`http://127.0.0.1:3000/api/places`
- 反馈 API：`POST http://127.0.0.1:3000/api/feedbacks`
- 管理员登录：`POST http://127.0.0.1:3000/api/admin/login`
- 受保护审核列表：`GET http://127.0.0.1:3000/api/admin/feedbacks`

第一次启动会根据 `database/seed.json` 创建本地 `database/meishi.sqlite`。该数据库文件不提交到 Git。

修改种子数据后运行：

```powershell
node database/init.mjs
```

## 静态部署与数据读取

网页优先读取本地 `/api/places`。GitHub Pages 无法运行 Node.js，因此线上页面会回退读取仓库中的 `database/seed.json`；反馈则保存在当前浏览器并仍可凭编号查询。

不要直接双击 `index.html` 用 `file://` 打开；浏览器可能阻止 JSON 请求。使用本地服务或 GitHub Pages。

## 地图位置维护

位置字段和校准操作统一见[地图与位置数据](docs/map/README.md)。简要规则：

1. 官方可靠数据或现场核验才可标记为“已确认”。
2. 用户或项目成员在网页上人工圈点，一律标记为“大致位置”。
3. 收到校准 JSON 后，维护者审核并更新 `database/seed.json`。
4. 更新种子数据后重新初始化 SQLite 并运行测试。

## 检查与测试

```powershell
node --check app.js
node --test server/app.test.mjs
```

页面修改还应人工检查：区域和类型筛选、推荐理由、换一家、搜索、详情、地图筛选、反馈提交、反馈查询、合并标记和校准 JSON 导出。

## 协作流程

修改前同步 `main`：

```bash
git switch main
git pull origin main
```

建议每次提交只处理一个明确主题：

```bash
git switch -c feat/short-description
git add .
git commit -m "说明本次修改内容"
git push -u origin feat/short-description
```

推送后创建 Pull Request，经检查后合并。不要提交个人隐私、账号密钥、第三方平台密码或本地 SQLite 文件。

## 后续规划

下一阶段重点是实现管理员审核队列，并区分普通访问者、贡献者、管理员和系统维护者。具体职责、权限边界、数据模型、API 草案和实施顺序见：

**[角色、权限与纠错审核设计](docs/roles-and-review.md)**

该设计明确要求：用户只能提交提案，管理员审核后才能更新正式地点；人工圈点即使审核通过，默认仍保持“大致位置”。

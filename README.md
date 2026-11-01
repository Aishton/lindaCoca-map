# 华科觅食

一个温暖配色的校园餐饮推荐网页初版。当前支持按菜名关键词筛选、快速推荐、换一家、餐饮点详情和地点搜索。地点与菜品来自项目组收集清单；未核实的价格、校区和营业时段不会被用于匹配。

网站入口文件是仓库根目录的 `index.html`。

## 和同伴一起开发

### 第一次获取项目

1. 安装 [Git](https://git-scm.com/downloads)。
2. 打开终端（Windows 可以使用 PowerShell 或 Git Bash）。
3. 选择一个用于保存项目的文件夹，运行：

```bash
git clone https://github.com/Aishton/lindaCoca-map.git
cd lindaCoca-map
```

### 本地运行网页与后端

在仓库根目录运行：

```powershell
node server/server.mjs
```

打开 `http://127.0.0.1:3000/` 查看网页，打开 `http://127.0.0.1:3000/api/places` 查看数据库中的全部地点和推荐菜品。第一次启动会自动生成本地 SQLite 数据库；之后修改 `database/seed.json` 时，运行 `node database/init.mjs` 更新本地数据。按 `Ctrl+C` 停止服务。

网页会优先调用本地 API。GitHub Pages 没有运行 Node 服务时，网页会读取仓库中的 `database/seed.json` 展示同一份公开清单；这只是静态只读数据。接口说明见 [server/README.md](server/README.md)。

### 只查看静态网页

可打开仓库的 GitHub Pages 页面；它会读取仓库中的种子清单。直接双击 `index.html` 使用 `file://` 打开时，浏览器可能禁止读取 JSON，因此推荐使用上面的本地服务。

### 校准地图位置

在首页地图右上方点击“校准位置”，选择待校准地点后直接在地图上单击正确位置。页面会将多个地点共用的标记作为一组移动，并把草稿保存在当前浏览器的 `localStorage` 中；草稿不会自动写入仓库或数据库。完成后使用“复制校准结果”或“下载 JSON”，由项目维护者审核后更新 `database/seed.json`。

### 开始修改前

每次修改前先同步最新版本：

```bash
git switch main
git pull origin main
```

网页相关文件是：

```text
index.html
app.js
```

页面结构与样式在 `index.html`，交互逻辑在 `app.js`，真实清单在 `database/seed.json`。修改后请在浏览器中检查筛选、推荐、“换一家”、搜索和详情页。

### 提交并推送修改

确认网页正常后，在项目目录运行：

```bash
git switch -c feat/short-description
git status
git add .
git status
git commit -m "说明本次修改内容"
git push -u origin feat/short-description
```

推送成功后，在 GitHub 创建 Pull Request，检查后合并到 `main`。如果网络连接在推送时出现 `SSL_ERROR_SYSCALL`，可尝试在 `git push` 前加入 `git -c http.version=HTTP/1.1`。

## 协作约定

- 修改前先执行 `git pull origin main`，避免覆盖同伴的工作。
- 一次提交尽量只处理一个明确功能，例如“补充西区餐饮点”或“调整推荐分数”。
- 不确定餐饮点位置、价格或营业情况时，标记为“待确认”，不要写成确定信息。
- 不要上传个人隐私信息、账户密钥或第三方平台密码。
- 大幅修改前先在群里说明，避免两个人同时改同一段代码。

## 当前功能范围

- 午餐／晚餐场景标记和按菜名关键词粗略筛选；尚不按营业时段筛选
- 快速模式：“帮我决定今天吃什么”
- 三家推荐和“换一家”
- 全部地点搜索和餐饮点详情
- 形象化校园地图、餐饮标记、类型筛选和地点搜索
- 无需登录的浏览器本地位置校准草稿与 JSON 导出
- 纠错入口提示；提交反馈功能尚未接入

地图使用 Leaflet 和 OpenStreetMap 在线底图，按真实经纬度显示并支持拖动、缩放。主要食堂坐标来自华中科技大学官方“一张图”餐饮图层；官方未收录的品牌店、窗口和楼内店铺根据公开地址及周边官方点位校准，继续标记为“大致位置”。数据库保留旧版 0～100 相对坐标，仅作兼容，不再用于当前地图渲染。

## 待完成：用户与权限

- 区分游客和维护员；游客只读，维护员可编辑地点并审核反馈。
- 增加维护员登录、安全会话和后端写入权限检查。
- 将浏览器校准草稿接入维护员审核流程，审核通过后写入线上数据并标记为“已确认”。
- 接入纠错反馈提交和审核流程。

真实用户上传、图片和线上 Node 服务部署也保留为后续工作。

## 觅食点数据库

项目组收集的食堂、楼层、推荐食物和校内店铺已整理为 SQLite 种子数据。运行 `node database/init.mjs` 可在本地生成或更新数据库；字段含义与待确认项见 [database/README.md](database/README.md)。本地后端读取 SQLite，GitHub Pages 则读取仓库中的种子清单。

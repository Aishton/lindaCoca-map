# 华科觅食

一个温暖配色的校园餐饮推荐网页初版。当前支持条件筛选、快速推荐、换一家、餐饮点详情，以及浏览器本地模拟的管理员维护。

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

当前页面仍使用演示数据和浏览器本地存储，尚未调用这些 API；页面上的“管理员维护”也不会修改 SQLite。接口说明见 [server/README.md](server/README.md)。

### 只查看静态网页

直接双击 `index.html`，用浏览器打开即可查看页面。

如果浏览器限制本地页面功能，可以在项目目录运行：

```bash
npx serve .
```

然后打开终端提示的网址。

### 开始修改前

每次修改前先同步最新版本：

```bash
git switch main
git pull origin main
```

主要修改文件是：

```text
index.html
```

目前页面样式、交互逻辑和模拟餐饮数据都在同一个文件中。修改后请自行在浏览器中检查筛选、推荐、“换一家”和详情页是否仍正常。

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

- 用餐场景、区域、预算、口味和忌口筛选
- 快速模式：“帮我决定今天吃什么”
- 三家推荐和“换一家”
- 餐饮点详情与纠错入口
- 浏览器本地的管理员状态和权重维护

地图、真实用户上传、图片、登录和数据库 API 接入将在后续版本完成。

## 觅食点数据库

项目组收集的食堂、楼层、推荐食物和校内店铺已整理为 SQLite 种子数据。运行 `node database/init.mjs` 可在本地生成或更新数据库；字段含义与待确认项见 [database/README.md](database/README.md)。后端读取这些数据，但当前网页尚未连接数据库，仍使用页面中的演示数据。

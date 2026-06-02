# 天门顺过

湖北天门地方纸牌游戏 ·  手机联机 H5 版。**仅供熟人娱乐,不含充值、金币、现金输赢、赌博功能。**

- 微信内置浏览器 / 手机浏览器可直接打开
- 创建房间 → 生成分享链接 → 朋友点开即加入
- 支持 3 / 4 / 5 / 6 人
- 实时同步:发牌、出牌(顺过 +1)、摸牌、结算
- 断线自动重连(座位与手牌恢复)
- 天门方言搞笑语音包(放入 mp3 即生效)
- 规则模块化,方便后续补充天门本地细节

---

## 一、本地运行(先在电脑上跑通)

需要先装 [Node.js](https://nodejs.org)(18 以上)。

```bash
# 1. 进入项目目录
cd tianmen

# 2. 安装依赖(只需一次)
npm install

# 3. 启动
npm start
```

看到 `天门顺过服务器运行中: http://localhost:3000` 就成功了。
电脑浏览器打开 `http://localhost:3000` 即可。

**手机和电脑在同一 WiFi 下**,可用电脑内网 IP 测试多人(如 `http://192.168.1.10:3000`)。

> ⚠️ 内网 IP 只能在同一 WiFi 内、且**微信里打不开**(微信要求 HTTPS 公网)。要发给朋友玩,必须按第二步部署上线。

跑测试:
```bash
npm test          # 规则引擎 48 用例
node server/test-e2e.js   # 联机全流程模拟
```

---

## 二、部署上线(免费方案,微信可用)

微信分享链接必须是 **HTTPS 公网地址**。推荐 Railway 或 Render,都有免费额度,且自动给 HTTPS。

### 方案 A:Railway(最简单)

1. 把整个项目传到一个 GitHub 仓库。
2. 打开 [railway.app](https://railway.app),用 GitHub 登录。
3. New Project → Deploy from GitHub repo → 选你的仓库。
4. Railway 自动识别 Node 项目,自动运行 `npm install` 和 `npm start`。
5. 部署完成后,在 Settings → Networking → **Generate Domain**,得到一个 `https://xxx.up.railway.app` 网址。
6. 这个网址就能在微信里打开了。

### 方案 B:Render

1. 项目传到 GitHub。
2. [render.com](https://render.com) → New → Web Service → 连 GitHub 仓库。
3. 配置:
   - Build Command: `npm install`
   - Start Command: `npm start`
4. 创建后得到 `https://xxx.onrender.com`,微信可用。

### 部署后怎么玩

1. 手机微信打开你的网址。
2. 填昵称 → 选人数 → **创建房间**。
3. 点右上角 **分享**,把链接发到微信群或好友。
4. 朋友点开链接 → 填昵称 → 自动进同一房间。
5. 人齐了房主点 **开始游戏**。

---

## 三、免费方案的已知限制(MVP 阶段)

- **冷启动**:免费实例闲置一段时间会休眠,第一个人打开要等 10~30 秒,之后就快了。
- **重启丢房间**:房间状态存在内存里,服务一旦重启,进行中的牌局会丢。适合一次性娱乐,不适合长时间挂机。
- 想解决这两点(房间持久化 + 不休眠),需要升级到付费实例或加数据库,后续可以做。

---

## 四、规则在哪里改(模块化)

所有规则集中在两个文件,改这里不影响联机逻辑:

- `server/rules/config.js` —— **配置项**。待确认的天门规则(2 能否进顺子/连对/连三张等)都在这里,改 `true/false` 即可,不用动代码。
- `server/rules/shunguo.js` —— **牌型识别 + 顺过接牌判断**。要加新牌型或改大小规则在这里。

改完务必跑一遍 `npm test`,确认 48 个用例还过。

### 已经实现的规则

牌组、万能牌(大王/小王/2张赖子,不可单出)、单张/对子/三张/顺子/连对/连三张/炸弹、顺过 +1 接牌、炸弹压制(先比张数再比点数)、要不起摸牌、结算排名(头游/二游…)。详见你提供的规则文档,48 个用例全部覆盖通过。

### 待你确认后开启的规则

`config.js` 里这三项默认 `false`,确认天门玩法后改成 `true` 即可:
- `allowTwoInStraight` —— 2 能否参与顺子(如 QKA2)
- `allowTwoInDoubleStraight` —— 2 能否参与连对(如 AA22)
- `allowTwoInTripleStraight` —— 2 能否参与连三张(如 AAA222)

---

## 五、目录结构

```
tianmen/
├── package.json
├── README.md                  ← 本文件
├── server/
│   ├── index.js               后端:Express + Socket.IO
│   ├── test-rules.js          规则 48 用例测试
│   ├── test-e2e.js            联机全流程测试
│   └── rules/
│       ├── config.js          ★ 规则配置(改这里)
│       ├── shunguo.js         ★ 牌型识别 + 顺过判断(核心)
│       ├── deck.js            牌组、洗牌、发牌
│       └── room.js            房间状态机、断线重连
└── public/
    ├── index.html             前端页面(移动端/微信适配)
    ├── game.js                前端逻辑:联机、渲染、出牌、重连、语音
    └── assets/audio/
        └── README.md          ★ 语音包放置说明
```

★ = 你后续最常改动的文件。

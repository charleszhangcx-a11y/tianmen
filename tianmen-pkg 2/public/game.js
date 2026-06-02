// 天门顺过 - 前端游戏逻辑
(function () {
  "use strict";

  // ---------- 持久身份(断线重连用) ----------
  // playerId 存 localStorage, 刷新/断线后仍是同一个人
  let playerId = localStorage.getItem("tm_playerId");
  if (!playerId) {
    playerId = "p_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem("tm_playerId", playerId);
  }
  let myName = localStorage.getItem("tm_name") || "";

  const socket = io({ transports: ["websocket", "polling"] });

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const lobby = $("lobby"), table = $("table");
  const nameInput = $("nameInput"), roomInput = $("roomInput");
  const opponentsEl = $("opponents"), handEl = $("hand"), lastPlayEl = $("lastPlay");
  const centerTip = $("centerTip"), controlsEl = $("controls"), roomCode = $("roomCode");

  nameInput.value = myName;

  // ---------- 状态 ----------
  let state = null;          // 最近一次服务器状态
  let selected = new Set();  // 选中的手牌 id
  let chosenSeats = 4;       // 创建时选的人数
  let voiceOn = true;

  // ---------- 人数选择 ----------
  $("seatSeg").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-n]");
    if (!b) return;
    chosenSeats = Number(b.dataset.n);
    document.querySelectorAll("#seatSeg button").forEach((x) => x.classList.remove("on"));
    b.classList.add("on");
  });

  function getName() {
    const n = (nameInput.value || "").trim() || ("玩家" + Math.floor(Math.random() * 99));
    myName = n; localStorage.setItem("tm_name", n);
    return n;
  }

  // ---------- 创建 / 加入 ----------
  $("createBtn").addEventListener("click", () => {
    socket.emit("createRoom", { name: getName(), maxPlayers: chosenSeats, playerId }, (res) => {
      if (!res.ok) return toast(res.error || "创建失败");
      enterTable(res.roomId);
    });
  });

  $("joinBtn").addEventListener("click", () => {
    const rid = (roomInput.value || "").trim();
    if (!/^\d{4}$/.test(rid)) return toast("请输入4位房号");
    doJoin(rid);
  });

  function doJoin(rid) {
    socket.emit("joinRoom", { roomId: rid, name: getName(), playerId }, (res) => {
      if (!res.ok) return toast(res.error || "加入失败");
      enterTable(res.roomId);
      if (res.reconnected) toast("已重连");
    });
  }

  function enterTable(rid) {
    localStorage.setItem("tm_lastRoom", rid);
    roomCode.textContent = rid;
    lobby.classList.remove("active");
    table.classList.add("active");
  }

  // ---------- URL 带房号自动加入(微信分享链接核心) ----------
  function checkUrlRoom() {
    const params = new URLSearchParams(location.search);
    const rid = params.get("room");
    if (rid && /^\d{4}$/.test(rid)) {
      // 有昵称直接进,没有则提示先填昵称
      if (!nameInput.value.trim()) {
        toast("点开了房间 " + rid + ",请先填昵称再点加入");
        roomInput.value = rid;
      } else {
        doJoin(rid);
      }
    }
  }

  // ---------- 断线自动重连 ----------
  socket.on("connect", () => {
    const lastRoom = localStorage.getItem("tm_lastRoom");
    // 如果之前在某房间且当前在牌桌界面 -> 自动重连
    if (lastRoom && table.classList.contains("active")) {
      socket.emit("joinRoom", { roomId: lastRoom, name: myName, playerId }, (res) => {
        if (res.ok) toast("已重连");
      });
    }
  });

  // ---------- 接收状态 ----------
  socket.on("state", (s) => {
    state = s;
    render();
  });

  // ---------- 接收动作(触发语音) ----------
  socket.on("action", (a) => {
    playVoice(a);
  });

  // ---------- 渲染 ----------
  function render() {
    if (!state) return;
    roomCode.textContent = state.roomId;

    renderOpponents();
    renderLastPlay();
    renderHand();
    renderControls();

    // 结算
    if (state.phase === "finished") {
      showResult();
    }
  }

  function renderOpponents() {
    opponentsEl.innerHTML = "";
    // 显示除自己外的玩家(自己在底部)
    state.players.forEach((p) => {
      if (p.seat === state.mySeat) return;
      const div = document.createElement("div");
      div.className = "opp";
      if (p.seat === state.turnSeat && state.phase === "playing") div.classList.add("turn");
      if (!p.online) div.classList.add("offline");
      const hostMark = p.id === state.hostId ? '<span class="host">👑</span>' : "";
      const offMark = !p.online ? '<span class="badge">掉线</span>' : "";
      div.innerHTML =
        `<div class="nm">${hostMark}${escapeHtml(p.name)}${offMark}</div>` +
        `<div class="cc">余牌 <span class="num">${p.cardCount}</span></div>`;
      opponentsEl.appendChild(div);
    });
  }

  function renderLastPlay() {
    lastPlayEl.innerHTML = "";
    if (state.lastPlay && state.lastPlay.cards) {
      state.lastPlay.cards.forEach((c) => lastPlayEl.appendChild(makeCard(c, false)));
      const who = state.players.find((p) => p.seat === state.lastPlay.seat);
      centerTip.textContent = (who ? who.name : "") + " 出牌,请顺过 +1";
      centerTip.className = "tip";
    } else if (state.phase === "playing") {
      const cur = state.players.find((p) => p.seat === state.turnSeat);
      centerTip.textContent = (cur ? cur.name : "") + " 自由出牌";
      centerTip.className = "tip big";
    } else if (state.phase === "waiting") {
      centerTip.textContent = `等待玩家加入 (${state.players.length}/${state.maxPlayers})`;
      centerTip.className = "tip";
    }
  }

  function renderHand() {
    handEl.innerHTML = "";
    (state.myHand || []).forEach((c) => {
      const el = makeCard(c, false);
      if (selected.has(c.id)) el.classList.add("sel");
      el.addEventListener("click", () => {
        if (selected.has(c.id)) selected.delete(c.id);
        else selected.add(c.id);
        renderHand();
      });
      handEl.appendChild(el);
    });
  }

  function renderControls() {
    controlsEl.innerHTML = "";
    const myTurn = state.phase === "playing" && state.turnSeat === state.mySeat;

    if (state.phase === "waiting") {
      // 房主可开始
      if (state.isHost) {
        const start = btn("开始游戏", "btn");
        start.disabled = state.players.length < 3;
        start.addEventListener("click", () => {
          socket.emit("startGame", {}, (res) => { if (!res.ok) toast(res.error); });
        });
        controlsEl.appendChild(start);
        if (state.players.length < 3) {
          const note = document.createElement("span");
          note.className = "turn-tip";
          note.textContent = "至少3人才能开始";
          controlsEl.appendChild(note);
        }
      } else {
        const note = document.createElement("span");
        note.className = "turn-tip";
        note.textContent = "等房主开始…";
        controlsEl.appendChild(note);
      }
      return;
    }

    if (state.phase === "playing") {
      if (myTurn) {
        const playBtn = btn("出牌", "btn");
        playBtn.addEventListener("click", doPlay);
        const passBtn = btn(state.lastPlay ? "接不上(摸牌)" : "本轮头家", "btn ghost");
        passBtn.disabled = !state.lastPlay;
        passBtn.addEventListener("click", doPass);
        controlsEl.appendChild(playBtn);
        controlsEl.appendChild(passBtn);
      } else {
        const note = document.createElement("span");
        note.className = "turn-tip";
        const cur = state.players.find((p) => p.seat === state.turnSeat);
        note.textContent = "等待 " + (cur ? cur.name : "") + " 出牌";
        controlsEl.appendChild(note);
      }
    }
  }

  function doPlay() {
    if (selected.size === 0) return toast("请先选牌");
    socket.emit("play", { cardIds: [...selected] }, (res) => {
      if (!res.ok) return toast(res.error);
      selected.clear();
    });
  }
  function doPass() {
    socket.emit("pass", {}, (res) => {
      if (!res.ok) return toast(res.error);
      selected.clear();
    });
  }

  // ---------- 牌渲染 ----------
  const SUIT_SYM = { spade: "♠", heart: "♥", club: "♣", diamond: "♦" };
  const WILD_TEXT = { BIG_JOKER: "大王", SMALL_JOKER: "小王", WILD_1: "赖子", WILD_2: "赖子" };
  function makeCard(c, small) {
    const el = document.createElement("div");
    el.className = "card" + (small ? " sm" : "");
    if (c.wild) {
      el.classList.add("wild");
      el.innerHTML = `<div class="wtext">${WILD_TEXT[c.wild]}</div>`;
    } else {
      const red = c.suit === "heart" || c.suit === "diamond";
      if (red) el.classList.add("red");
      const sym = SUIT_SYM[c.suit];
      el.innerHTML =
        `<div class="corner">${c.rank}<br>${sym}</div>` +
        `<div class="corner br">${c.rank}<br>${sym}</div>`;
    }
    return el;
  }

  // ---------- 分享 ----------
  $("shareBtn").addEventListener("click", () => {
    const rid = state ? state.roomId : localStorage.getItem("tm_lastRoom");
    const url = location.origin + location.pathname + "?room=" + rid;
    // 优先用系统分享(微信中可能拉起),否则复制
    if (navigator.share) {
      navigator.share({ title: "天门顺过", text: `房号 ${rid},一起来打牌!`, url })
        .catch(() => copyText(url, rid));
    } else {
      copyText(url, rid);
    }
  });
  function copyText(url, rid) {
    const ta = document.createElement("textarea");
    ta.value = url; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); toast("链接已复制,房号 " + rid + "\n发给朋友点开即可加入"); }
    catch (e) { toast("分享链接:" + url); }
    document.body.removeChild(ta);
  }

  // ---------- 退出 ----------
  $("leaveBtn").addEventListener("click", () => {
    localStorage.removeItem("tm_lastRoom");
    location.href = location.origin + location.pathname;
  });
  $("backLobbyBtn").addEventListener("click", () => {
    localStorage.removeItem("tm_lastRoom");
    location.href = location.origin + location.pathname;
  });

  // ---------- 结算 ----------
  function showResult() {
    const overlay = $("resultOverlay");
    const list = $("rankList");
    list.innerHTML = "";
    const posName = ["头游 🏆", "二游", "三游", "四游", "五游", "末游"];
    state.winners.forEach((seat, i) => {
      const p = state.players.find((x) => x.seat === seat);
      const div = document.createElement("div");
      div.innerHTML = `<span class="pos">${posName[i] || (i + 1) + "名"}</span>${escapeHtml(p ? p.name : "?")}`;
      list.appendChild(div);
    });
    overlay.classList.add("show");
  }

  // ---------- 语音包 ----------
  // 天门方言搞笑语音: 把 mp3 放进 /assets/audio/ 即可。
  // 触发时机 -> 文件名 映射:
  const VOICE_MAP = {
    bomb: "bomb.mp3",          // 炸弹
    single: "play.mp3",        // 出牌通用
    pair: "play.mp3",
    triple: "play.mp3",
    straight: "play.mp3",
    doubleStraight: "play.mp3",
    tripleStraight: "play.mp3",
    pass: "pass.mp3",          // 要不起
    win: "win.mp3",            // 赢了
  };
  // 文字气泡兜底(没有 mp3 时也有效果,可换成天门方言)
  const VOICE_TEXT = {
    bomb: "炸死你!",
    pass: "要不起咧~",
    win: "我跑脱哒!",
    play: "出哒!",
  };
  const audioCache = {};
  function playVoice(a) {
    if (!voiceOn) return;
    let key = a.type;
    let textKey = a.type === "pass" ? "pass" : "play";
    if (a.finished) { key = "win"; textKey = "win"; }
    if (a.type === "bomb") textKey = "bomb";

    // 文字气泡
    showVoicePop(VOICE_TEXT[textKey] || "");

    // 音频(若存在)
    const file = a.finished ? VOICE_MAP.win : VOICE_MAP[a.type];
    if (!file) return;
    const src = "/assets/audio/" + file;
    try {
      let audio = audioCache[src];
      if (!audio) { audio = new Audio(src); audioCache[src] = audio; }
      audio.currentTime = 0;
      audio.play().catch(() => { /* 文件不存在或未授权,忽略,气泡已生效 */ });
    } catch (e) { /* 忽略 */ }
  }
  function showVoicePop(text) {
    if (!text) return;
    const pop = $("voicePop");
    pop.textContent = text;
    pop.classList.add("show");
    clearTimeout(showVoicePop._t);
    showVoicePop._t = setTimeout(() => pop.classList.remove("show"), 1200);
  }
  $("voiceToggle").addEventListener("click", () => {
    voiceOn = !voiceOn;
    $("voiceToggle").textContent = voiceOn ? "🔊 语音" : "🔇 静音";
  });

  // ---------- 工具 ----------
  function btn(text, cls) { const b = document.createElement("button"); b.className = cls; b.textContent = text; return b; }
  function toast(msg) {
    const t = $("toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2200);
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  // 启动: 检查 URL 是否带房号
  checkUrlRoom();
})();

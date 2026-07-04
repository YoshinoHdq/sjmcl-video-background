(function () {
  var TOKEN = (document.currentScript && document.currentScript.dataset && document.currentScript.dataset.extensionToken) || "";
  if (!TOKEN) throw new Error("Missing extension activation token");

  // ===== 全局视频状态（脱离 React 生命周期） =====
    var ST = { active: false, paused: false, vol: 0.5 };
  // 恢复音量
  try { var sv = localStorage.getItem("vb-vol"); if (sv) ST.vol = parseFloat(sv); } catch(e){}
  var _vid = null;
  var _url = null;

  function vid() {
    // 清理旧视频元素（防止重复）
    var old = document.getElementById("vbg-vid");
    if (old && old.parentNode) old.parentNode.removeChild(old);
    if (_url) { URL.revokeObjectURL(_url); _url = null; }
    var v = document.createElement("video");
    v.id = "vbg-vid";
    v.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;object-fit:cover;z-index:0;pointer-events:none;opacity:1";
    v.loop = true;
    v.muted = false;
    v.playsInline = true;
    v.volume = ST.vol;
    document.body.insertBefore(v, document.body.firstChild);
    // 抬升天气 canvas
    var wc = document.getElementById("sw-bg");
    if (wc) wc.style.zIndex = "1";
    _vid = v;
    return v;
  }

  function vstart(blob) {
    try {
      if (_vid) { _vid.pause(); _vid.src = ""; try{_vid.load();}catch(e){} }
    } catch(e) {}
    var v = vid();
    _url = URL.createObjectURL(blob);
    v.src = _url;
    ST.active = true; ST.paused = false;
    v.play().catch(function(e){});
    // 保存到 IndexedDB
    try {
      var r = indexedDB.open("VidDB", 1);
      r.onupgradeneeded = function(e) { if (!e.target.result.objectStoreNames.contains("d")) e.target.result.createObjectStore("d"); };
      r.onsuccess = function(e) {
        var tx = e.target.result.transaction(["d"], "readwrite");
        tx.objectStore("d").put(blob, "v");
        tx.oncomplete = function() { e.target.result.close(); };
      };
    } catch(e) {}
  }

  function vpause() { if (_vid) { _vid.pause(); ST.paused = true; } }
  function vplay() { if (_vid) { _vid.play(); ST.paused = false; } }
  function vvol(v) { ST.vol = v; if (_vid) _vid.volume = v; try { localStorage.setItem("vb-vol", v); } catch(e){} }

  function vkill() {
    if (_vid) {
      try { _vid.pause(); _vid.src = ""; try{_vid.load();}catch(e){} } catch(e) {}
      if (_vid.parentNode) _vid.parentNode.removeChild(_vid);
    }
    if (_url) { URL.revokeObjectURL(_url); _url = null; }
    _vid = null; ST.active = false; ST.paused = false;
    var wc = document.getElementById("sw-bg");
    if (wc) wc.style.zIndex = "0";
    // 删除 IndexedDB
    try {
      var r = indexedDB.open("VidDB", 1);
      r.onsuccess = function(e) {
        var tx = e.target.result.transaction(["d"], "readwrite");
        tx.objectStore("d").delete("v");
        tx.oncomplete = function() { e.target.result.close(); };
      };
    } catch(e) {}
  }

  // ===== 启动时自动恢复 =====
  try {
    var r = indexedDB.open("VidDB", 1);
    r.onupgradeneeded = function(e) { if (!e.target.result.objectStoreNames.contains("d")) e.target.result.createObjectStore("d"); };
    r.onsuccess = function(e) {
      var tx = e.target.result.transaction(["d"], "readonly");
      var req = tx.objectStore("d").get("v");
      req.onsuccess = function() {
        var blob = req.result;
        if (blob) vstart(blob);
        e.target.result.close();
      };
    };
  } catch(e) {}

  // ===== 文件选择器 =====
  var _input = null;
  function vpick() {
    if (!_input) {
      _input = document.createElement("input");
      _input.type = "file";
      _input.accept = "video/mp4,video/webm,video/ogg";
      _input.style.display = "none";
      document.body.appendChild(_input);
      _input.addEventListener("change", function() {
        var f = _input.files[0];
        _input.value = "";
        if (f) vstart(f);
      });
    }
    _input.click();
  }

  // ===== 注册扩展 =====
  window.registerExtension(function (api) {
    var R = api.React;
    var useState = R.useState, useEffect = R.useEffect, useRef = R.useRef;
    var el = R.createElement;

    var CU = api.ChakraUI;
    var Box = CU.Box, HStack = CU.HStack, VStack = CU.VStack;
    var Text = CU.Text, Heading = CU.Heading, Badge = CU.Badge;
    var Button = CU.Button;

    // ===== 组件状态同步钩子 =====
    function useVidState() {
      var [s, setS] = useState({ active: ST.active, paused: ST.paused });
      useEffect(function() {
        var id = setInterval(function() { setS({ active: ST.active, paused: ST.paused }); }, 100);
        return function() { clearInterval(id); };
      }, []);
      return s;
    }

    // ===== 首页卡片 =====
    function HomeWidget() {
      var s = useVidState();
      return el(Box, { p: 4, borderRadius: "lg", bg: "rgba(8,12,24,0.9)", backdropFilter: "blur(4px)" },
        el(VStack, { spacing: 3, align: "stretch" },
          el(HStack, { justify: "space-between", align: "center" },
            el(Text, { fontSize: "sm", fontWeight: "bold", color: "white" }, "🎬 视频背景"),
            el(Badge, { colorScheme: s.active ? "green" : "gray", variant: "solid", fontSize: "xs" },
              s.active ? "播放中" : "未设置")
          ),
          s.active
            ? el(HStack, { spacing: 2 },
                el(Button, { size: "xs", colorScheme: "blue",
                  onClick: function() { if (ST.paused) vplay(); else vpause(); }
                }, s.paused ? "▶ 播放" : "⏸ 暂停"),
                el(Button, { size: "xs", colorScheme: "red", variant: "ghost",
                  onClick: function() { vkill(); }
                }, "🗑 移除"),
                el(Button, { size: "xs", colorScheme: "green",
                  onClick: vpick
                }, "📁 更换")
              )
            : el(Button, { size: "sm", colorScheme: "green", w: "100%", onClick: vpick }, "📁 选择视频文件"),
          s.active ? el(Box, null,
            el(Text, { fontSize: "xs", color: "gray.400" }, "音量"),
            el("input", { type: "range", min: 0, max: 1, step: 0.1, defaultValue: ST.vol,
              onChange: function(e) { vvol(parseFloat(e.target.value)); },
              style: { width: "100%" }
            })
          ) : null
        )
      );
    }

    // ===== 设置页面 =====
    function SettingsPage() {
      var s = useVidState();
      return el(Box, { p: 8, borderRadius: "lg", bg: "rgba(8,12,24,0.95)", backdropFilter: "blur(4px)" },
        el(VStack, { spacing: 6, align: "stretch" },
          el(HStack, { justify: "space-between", align: "center" },
            el(Heading, { size: "md", color: "white" }, "🎬 视频背景"),
            el(Badge, { colorScheme: s.active ? "green" : "gray", variant: "solid", fontSize: "sm" },
              s.active ? "播放中" : "未设置")
          ),
          s.active ? el(VStack, { spacing: 3, align: "stretch" },
            el(Box, { p: 3, borderWidth: 1, borderRadius: "md", borderColor: "green.200" },
              el(Text, { fontSize: "sm", color: "white" }, "✅ 视频正在播放"),
              el(Text, { fontSize: "xs", color: "gray.400" }, ST.paused ? "(已暂停)" : "")
            ),
            el(HStack, { spacing: 3 },
              el(Button, { size: "sm", colorScheme: "blue",
                onClick: function() { if (ST.paused) vplay(); else vpause(); }
              }, s.paused ? "▶ 播放" : "⏸ 暂停"),
              el(Button, { size: "sm", colorScheme: "green", onClick: vpick }, "📁 更换"),
              el(Button, { size: "sm", colorScheme: "red", onClick: function() { vkill(); } }, "🗑 移除")
            ),
            el(Box, null,
              el(Text, { fontSize: "sm", color: "gray.300", mb: 1 }, "音量: " + Math.round(ST.vol * 100) + "%"),
              el("input", { type: "range", min: 0, max: 1, step: 0.1, defaultValue: ST.vol,
                onChange: function(e) { vvol(parseFloat(e.target.value)); },
                style: { width: "100%", accentColor: "#4299ff" }
              })
            )
          ) : el(Box, null,
            el(Text, { fontSize: "sm", color: "gray.300", mb: 3, fontWeight: "bold" }, "选择视频"),
            el(Text, { fontSize: "xs", color: "gray.500", mb: 3 }, "支持 MP4/WebM/OGG。重启自动恢复。"),
            el(Button, { size: "lg", colorScheme: "green", w: "100%", py: 6, onClick: vpick },
              el(VStack, { spacing: 2, align: "center" },
                el(Text, { fontSize: "2xl" }, "📁"),
                el(Text, null, "点击选择视频文件"),
                el(Text, { fontSize: "xs", color: "gray.400" }, "MP4 / WebM / OGG")
              )
            )
          ),
          el(Box, { p: 3, borderWidth: 1, borderRadius: "md", borderColor: "blue.200" },
            el(Text, { fontSize: "xs", color: "blue.200", fontWeight: "bold" }, "💡 视频 (z:0) + 天气 (z:1) 可同时开启，互不干扰")
          )
        )
      );
    }

    return {
      homeWidget: { title: "视频背景", defaultWidth: 320, minWidth: 260, Component: HomeWidget },
      settingsPage: { Component: SettingsPage }
    };
  }, TOKEN);
})();

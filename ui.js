import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";

const stageTargets = {
  1: {
    distant: { opacity: 0.5, speed: 0.38, gather: 0, colorA: [0.34, 0.48, 0.92], colorB: [0.63, 0.46, 0.98] },
    mid: { opacity: 0.34, speed: 0.45, gather: 0, colorA: [0.35, 0.53, 1.0], colorB: [0.66, 0.48, 1.0] },
    near: { opacity: 0.22, speed: 0.36, gather: 0, colorA: [0.52, 0.7, 1.0], colorB: [0.78, 0.64, 1.0] },
    accent: { opacity: 0, speed: 0.22, gather: 0.08, colorA: [1.0, 0.64, 0.28], colorB: [1.0, 0.84, 0.42] },
    tone: new THREE.Color(0x070918),
  },
  2: {
    distant: { opacity: 0.6, speed: 0.44, gather: 0.03, colorA: [0.39, 0.58, 1.0], colorB: [0.7, 0.5, 1.0] },
    mid: { opacity: 0.43, speed: 0.58, gather: 0.06, colorA: [0.42, 0.62, 1.0], colorB: [0.74, 0.55, 1.0] },
    near: { opacity: 0.28, speed: 0.44, gather: 0.03, colorA: [0.58, 0.76, 1.0], colorB: [0.83, 0.68, 1.0] },
    accent: { opacity: 0.02, speed: 0.26, gather: 0.08, colorA: [1.0, 0.62, 0.28], colorB: [1.0, 0.82, 0.45] },
    tone: new THREE.Color(0x080a1c),
  },
  3: {
    distant: { opacity: 0.66, speed: 0.52, gather: 0.05, colorA: [0.42, 0.62, 1.0], colorB: [0.74, 0.56, 1.0] },
    mid: { opacity: 0.58, speed: 0.78, gather: 0.18, colorA: [0.48, 0.68, 1.0], colorB: [0.82, 0.58, 1.0] },
    near: { opacity: 0.35, speed: 0.5, gather: 0.08, colorA: [0.64, 0.78, 1.0], colorB: [0.9, 0.72, 1.0] },
    accent: { opacity: 0.04, speed: 0.32, gather: 0.13, colorA: [1.0, 0.62, 0.3], colorB: [1.0, 0.82, 0.47] },
    tone: new THREE.Color(0x090b20),
  },
  4: {
    distant: { opacity: 0.68, speed: 0.5, gather: 0.08, colorA: [0.43, 0.58, 1.0], colorB: [0.78, 0.56, 1.0] },
    mid: { opacity: 0.63, speed: 0.66, gather: 0.33, colorA: [0.52, 0.66, 1.0], colorB: [0.86, 0.62, 1.0] },
    near: { opacity: 0.42, speed: 0.54, gather: 0.22, colorA: [0.7, 0.78, 1.0], colorB: [0.96, 0.75, 1.0] },
    accent: { opacity: 0.08, speed: 0.38, gather: 0.24, colorA: [1.0, 0.61, 0.32], colorB: [1.0, 0.83, 0.48] },
    tone: new THREE.Color(0x0b0a20),
  },
  5: {
    distant: { opacity: 0.66, speed: 0.46, gather: 0.1, colorA: [0.42, 0.55, 0.96], colorB: [0.76, 0.54, 0.98] },
    mid: { opacity: 0.62, speed: 0.58, gather: 0.24, colorA: [0.58, 0.66, 1.0], colorB: [0.93, 0.68, 0.94] },
    near: { opacity: 0.45, speed: 0.5, gather: 0.16, colorA: [0.76, 0.76, 1.0], colorB: [1.0, 0.78, 0.78] },
    accent: { opacity: 0.34, speed: 0.48, gather: 0.36, colorA: [1.0, 0.58, 0.24], colorB: [1.0, 0.82, 0.38] },
    tone: new THREE.Color(0x0d0a1a),
  },
};

function softParticleTexture() {
  const size = 128;
  const particleCanvas = document.createElement("canvas");
  particleCanvas.width = size;
  particleCanvas.height = size;
  const ctx = particleCanvas.getContext("2d");
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.18, "rgba(255,255,255,0.86)");
  gradient.addColorStop(0.48, "rgba(255,255,255,0.28)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(particleCanvas);
}

const vertexShader = `
  attribute float aSize;
  attribute float aDepth;
  attribute float aSeed;
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uPulse;
  uniform float uGather;
  varying float vDepth;
  varying float vSeed;

  void main() {
    vec3 p = position;
    float breathing = sin(uTime * 0.42 + aSeed * 6.2831) * 0.22;
    float centerPull = uGather + uPulse * 0.18;
    p.xy *= 1.0 - centerPull * (0.28 + aDepth * 0.2);
    p.z += sin(uTime * 0.26 + aSeed * 9.0) * (0.28 + aDepth * 0.44);
    p.y += breathing * (0.18 + aDepth * 0.35);
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = aSize * uPixelRatio * (42.0 / -mvPosition.z) * (1.0 + uPulse * 0.36);
    gl_Position = projectionMatrix * mvPosition;
    vDepth = aDepth;
    vSeed = aSeed;
  }
`;

const fragmentShader = `
  uniform sampler2D uMap;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uPulse;
  varying float vDepth;
  varying float vSeed;

  void main() {
    vec4 sprite = texture2D(uMap, gl_PointCoord);
    float breath = 0.74 + 0.26 * sin(uTime * 0.7 + vSeed * 8.0);
    vec3 color = mix(uColorA, uColorB, smoothstep(0.05, 0.95, vDepth));
    color += uPulse * vec3(0.16, 0.12, 0.24);
    float alpha = sprite.a * uOpacity * breath * (0.64 + vDepth * 0.46);
    gl_FragColor = vec4(color, alpha);
  }
`;

export function initUI() {
  function getElement(selector) {
    const element = document.querySelector(selector);
    if (!element) console.warn(`[ui] Missing DOM element: ${selector}`);
    return element;
  }

  const canvas = getElement("#webgl-field");
  const messages = getElement("#messages");
  const quickReplies = getElement("#quickReplies");
  const composer = getElement("#composer");
  const input = getElement("#messageInput");
  const micButton = getElement("#micButton");
  const sendButton = getElement("#sendButton");
  const voiceStatus = getElement("#voiceStatus");
  const stageLabel = getElement("#stageLabel");
  const stageDots = [...document.querySelectorAll(".stage-dot")];

  console.log("[ui] send button found", Boolean(sendButton));
  console.log("[ui] mic button found", Boolean(micButton));
  if (!stageDots.length) console.warn("[ui] Missing DOM elements: .stage-dot");

  let currentStage = 1;
  const mouse = new THREE.Vector2(0, 0);
  const pulse = { value: 0 };
  const aiGather = { value: 0 };
  const layers = [];

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x070918, 0.015);

  const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 180);
  camera.position.set(0, 0.6, 22);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);

  const clock = new THREE.Clock();
  const particleTexture = softParticleTexture();

  function randomInCluster(radiusX, radiusY, radiusZ, clusterCount, emptyBias = 0.18) {
    const cluster = Math.floor(Math.random() * clusterCount);
    const angle = (cluster / clusterCount) * Math.PI * 2 + Math.random() * 0.9;
    const centerRadius = Math.pow(Math.random(), 0.55);
    const cx = Math.cos(angle) * radiusX * centerRadius * 0.72;
    const cy = (Math.random() - 0.5) * radiusY * 0.55 + Math.sin(angle * 1.7) * radiusY * 0.18;
    const cz = Math.sin(angle) * radiusZ * centerRadius * 0.72;
    const spread = Math.random() < emptyBias ? 1.2 : 0.46;

    return new THREE.Vector3(
      cx + THREE.MathUtils.randFloatSpread(radiusX * spread),
      cy + THREE.MathUtils.randFloatSpread(radiusY * spread),
      cz + THREE.MathUtils.randFloatSpread(radiusZ * spread),
    );
  }

  function createParticleLayer(name, count, sizeRange, radius, clusters, drift) {
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const depths = new Float32Array(count);
    const seeds = new Float32Array(count);

    for (let i = 0; i < count; i += 1) {
      const p = randomInCluster(radius.x, radius.y, radius.z, clusters, 0.24);
      const spiral = i / count * Math.PI * 7.0;
      p.x += Math.cos(spiral) * radius.x * 0.1 * Math.random();
      p.y += Math.sin(spiral * 0.7) * radius.y * 0.08 * Math.random();
      p.z += Math.sin(spiral) * radius.z * 0.1 * Math.random();
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
      sizes[i] = THREE.MathUtils.randFloat(sizeRange[0], sizeRange[1]);
      depths[i] = THREE.MathUtils.clamp((p.z + radius.z) / (radius.z * 2), 0, 1);
      seeds[i] = Math.random();
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute("aDepth", new THREE.BufferAttribute(depths, 1));
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));

    const target = stageTargets[1][name];
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: particleTexture },
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
        uOpacity: { value: target.opacity },
        uPulse: { value: 0 },
        uGather: { value: target.gather },
        uColorA: { value: new THREE.Vector3(...target.colorA) },
        uColorB: { value: new THREE.Vector3(...target.colorB) },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const points = new THREE.Points(geometry, material);
    points.userData = {
      name,
      drift,
      opacity: target.opacity,
      speed: target.speed,
      gather: target.gather,
      colorA: [...target.colorA],
      colorB: [...target.colorB],
      baseY: THREE.MathUtils.randFloatSpread(2),
    };
    scene.add(points);
    layers.push(points);
  }

  createParticleLayer("distant", 5200, [0.9, 2.4], new THREE.Vector3(46, 26, 58), 9, 0.15);
  createParticleLayer("mid", 1800, [2.2, 7.0], new THREE.Vector3(28, 17, 34), 7, 0.28);
  createParticleLayer("near", 520, [7.0, 18.0], new THREE.Vector3(18, 11, 20), 5, 0.38);
  createParticleLayer("accent", 360, [5.0, 14.0], new THREE.Vector3(16, 9, 18), 4, 0.24);

  function autoSizeInput() {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 132)}px`;
  }

  function cleanDisplayText(value = "") {
    return String(value || "")
      .replace(/算吗/g, "")
      .replace(/就是/g, "")
      .replace(/刚才那个/g, "")
      .replace(/刚才/g, "")
      .replace(/嗯+/g, "")
      .replace(/我负责/g, "负责")
      .replace(/有一个有/g, "获得")
      .replace(/我们组/g, "小组")
      .replace(/有(\d+万浏览量)/g, "约$1")
      .replace(/我们创业课老师让做的[，,、]*/g, "创业课程")
      .replace(/创业课老师让做的[，,、]*/g, "创业课程")
      .replace(/老师让做的[，,、]*/g, "")
      .replace(/介绍自己卖的东西/g, "产品展示")
      .replace(/\s+/g, "")
      .replace(/^[，,、。]+|[，,、。]+$/g, "")
      .slice(0, 46);
  }

  function displayScene(value = "") {
    const text = String(value || "");
    if (/创业课|创业课程|老师让做|产品展示|介绍自己卖的东西/.test(text)) return "创业课程产品展示短视频";
    if (/社团|宣传活动|社团宣传/.test(text)) return "社团活动宣传内容";
    if (/抖音|短视频/.test(text)) return "抖音短视频内容发布";
    return cleanDisplayText(text) || "未补充";
  }

  function displayAction(value = "") {
    const text = String(value || "");
    if (/抖音|短视频/.test(text) && /文案|标题/.test(text)) return "撰写抖音短视频文案";
    if (/发布/.test(text) && /抖音|短视频/.test(text)) return "发布抖音短视频";
    return cleanDisplayText(text) || "未补充";
  }

  function displayResultUse(snapshot = {}) {
    const experience = snapshot.currentExperience || {};
    const combined = [experience.scene, experience.action, experience.result].join(" ");
    if (/创业课|创业课程|产品展示|介绍自己卖的东西/.test(combined)) return "支持小组完成产品展示";
    if (/社团|宣传活动|社团宣传/.test(combined)) return "用于社团活动宣传";
    const cleaned = cleanDisplayText(experience.result);
    if (/浏览|播放/.test(cleaned)) return "未补充";
    return cleaned || "未补充";
  }

  function displayResultMetric(snapshot = {}) {
    const experience = snapshot.currentExperience || {};
    const combined = [experience.resultMetric, experience.result, experience.scale].join(" ");
    const match = combined.match(/(?:约)?(?:\d+(?:\.\d+)?|十|百|千|万)+\s*万?[^，,。]*?(?:浏览量|浏览|播放量|播放|观看|阅读)/);
    if (!match) return "未补充";
    let metric = cleanDisplayText(match[0]).replace(/^有/, "").replace(/^获得/, "").replace(/浏览$/, "浏览量");
    if (!metric.startsWith("约") && /10万|十万/.test(metric)) metric = `约${metric}`;
    if (!metric.includes("单条内容")) metric = `单条内容${metric}`;
    return metric;
  }

  function displayScale(snapshot = {}) {
    const scale = cleanDisplayText(snapshot.currentExperience?.scale || "");
    if (!scale || /浏览|播放|观看|阅读/.test(scale)) return "未补充";
    return scale;
  }

  function parseOutputResultText(text = "") {
    const lines = String(text || "").split("\n").map((line) => line.trim()).filter(Boolean);
    const fieldValue = (label) => {
      const line = lines.find((item) => item.startsWith(`- ${label}：`));
      return line ? line.replace(`- ${label}：`, "").trim() : "";
    };
    const bulletIndex = lines.findIndex((line) => line === "经历草稿：");
    const bullet = bulletIndex >= 0 ? (lines[bulletIndex + 1] || "").replace(/^- /, "").trim() : "";

    return {
      resumeDraft: { resumeBullets: bullet ? [bullet] : [] },
      userProfile: { targetRole: fieldValue("目标方向") },
      currentExperience: {
        scene: fieldValue("经历场景"),
        action: fieldValue("具体动作"),
        result: fieldValue("结果/用途"),
        resultMetric: fieldValue("结果数据"),
        scale: fieldValue("规模/周期") === "未补充" ? "" : fieldValue("规模/周期"),
      },
    };
  }

  function createSummaryItem(label, value) {
    const item = document.createElement("div");
    item.className = "draft-summary-item";
    const name = document.createElement("span");
    name.textContent = label;
    const detail = document.createElement("strong");
    detail.textContent = value || "未补充";
    item.append(name, detail);
    return item;
  }

  function renderResultCard(snapshot = {}) {
    const row = document.createElement("article");
    row.className = "message-row ai result-row";

    const avatar = document.createElement("span");
    avatar.className = "avatar";
    row.append(avatar);

    const card = document.createElement("section");
    card.className = "draft-card";
    card.setAttribute("aria-label", "经历草稿");

    const label = document.createElement("p");
    label.className = "draft-card-label";
    label.textContent = "经历草稿";

    const bullet = document.createElement("p");
    bullet.className = "draft-bullet";
    bullet.textContent = snapshot.resumeDraft?.resumeBullets?.[0] || "这段经历已先保存为线索，后续可以继续补具体场景、动作和用途。";

    const summary = document.createElement("div");
    summary.className = "draft-summary";
    summary.append(
      createSummaryItem("目标方向", cleanDisplayText(snapshot.userProfile?.targetRole || "") || "未确定"),
      createSummaryItem("经历场景", displayScene(snapshot.currentExperience?.scene || "")),
      createSummaryItem("具体动作", displayAction(snapshot.currentExperience?.action || "")),
      createSummaryItem("结果/用途", displayResultUse(snapshot)),
      createSummaryItem("结果数据", displayResultMetric(snapshot)),
      createSummaryItem("规模/周期", displayScale(snapshot)),
    );

    card.append(label, bullet, summary);
    row.append(card);
    messages.append(row);
    scrollChatArea();
  }

  function renderMessage(role, text) {
    if (role === "ai" && String(text || "").includes("经历草稿：") && String(text || "").includes("已提取信息：")) {
      if (stageLabel) stageLabel.textContent = "经历草稿已生成";
      renderResultCard(parseOutputResultText(text));
      return;
    }

    const row = document.createElement("article");
    row.className = `message-row ${role}`;

    if (role === "ai") {
      const avatar = document.createElement("span");
      avatar.className = "avatar";
      row.append(avatar);
    }

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = text;
    row.append(bubble);
    messages.append(row);
    scrollChatArea();
  }

  function renderQuickReplies(replies) {
    clearQuickReplies();
    replies.forEach((reply) => {
      const button = document.createElement("button");
      button.className = "quick-reply";
      button.type = "button";
      const displayReply = reply === "生成经历草稿" ? "保存这段经历草稿" : reply;
      button.textContent = displayReply;
      button.dataset.reply = reply;
      button.dataset.displayReply = displayReply;
      quickReplies.append(button);
    });
  }

  function clearQuickReplies() {
    quickReplies.textContent = "";
  }

  function updateInputValue(value) {
    input.value = value;
    autoSizeInput();
    input.focus();
  }

  function appendInputValue(value) {
    const clean = value.trim();
    if (!clean) return;
    const needsSpace = input.value.trim() && !/[，。！？、\s]$/.test(input.value);
    updateInputValue(`${input.value}${needsSpace ? " " : ""}${clean}`);
  }

  function readInputValue() {
    return input.value;
  }

  function scrollChatArea() {
    messages.scrollTop = messages.scrollHeight;
  }

  function updateRecordingStatus(text = "", state = "") {
    voiceStatus.textContent = text;
    voiceStatus.classList.toggle("is-listening", state === "listening");
    voiceStatus.classList.toggle("is-warning", state === "warning");
  }

  function setRecordingActive(active) {
    micButton.classList.toggle("is-recording", active);
    micButton.setAttribute("aria-pressed", String(active));
    micButton.setAttribute("aria-label", active ? "停止语音输入" : "开始语音输入");
  }

  function setMicDisabled(disabled) {
    micButton.disabled = disabled;
  }

  function stageText(stage, state = "") {
    if (state === "OUTPUT_RESULT") return "经历草稿已生成";
    if (state === "USER_CONFIRMATION" || stage === 5) return "正在生成经历草稿";
    if (state === "DEEP_DIVE_SCENE" || state === "DEEP_DIVE_ACTION" || state === "DEEP_DIVE_RESULT" || stage === 4) return "正在深挖细节";
    if (stage === 3) return "正在找经历";
    if (stage === 2) return "正在确认方向";
    return "正在启动";
  }

  function updateVisualStage(stage, state = "") {
    currentStage = stage;
    stageDots.forEach((dot, index) => {
      const active = index < stage;
      dot.classList.toggle("is-active", active);
      dot.classList.toggle("is-warm", active && stage === 5);
    });
    if (stageLabel) stageLabel.textContent = stageText(stage, state);
  }

  function triggerUserPulse() {
    pulse.value = 1;
  }

  function triggerAssistantGather() {
    aiGather.value = 1;
  }

  function bindSend(handler) {
    composer.addEventListener("submit", (event) => {
      event.preventDefault();
      console.log("[ui] send clicked", { source: "submit" });
      handler(readInputValue());
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        console.log("[ui] send clicked", { source: "enter" });
        handler(readInputValue());
      }
    });

    input.addEventListener("input", autoSizeInput);
  }

  function bindQuickReply(handler) {
    quickReplies.addEventListener("click", (event) => {
      const button = event.target.closest(".quick-reply");
      if (!button) return;
      const reply = button.dataset.reply || button.textContent;
      console.log("[ui] quick reply clicked", reply);
      if (button.dataset.displayReply === "保存这段经历草稿") {
        updateRecordingStatus("已保存为当前经历草稿。");
      }
      handler(reply);
    });
  }

  function bindMic(handler) {
    micButton.addEventListener("click", (event) => {
      console.log("[ui] mic button clicked");
      handler(event);
    });
  }

  function lerpArray(current, target, amount) {
    current[0] = THREE.MathUtils.lerp(current[0], target[0], amount);
    current[1] = THREE.MathUtils.lerp(current[1], target[1], amount);
    current[2] = THREE.MathUtils.lerp(current[2], target[2], amount);
  }

  function animate() {
    const elapsed = clock.getElapsedTime();
    const delta = clock.getDelta();
    const targetBundle = stageTargets[currentStage];

    pulse.value = Math.max(0, pulse.value - delta * 1.65);
    aiGather.value = Math.max(0, aiGather.value - delta * 0.8);
    scene.fog.color.lerp(targetBundle.tone, 0.018);
    renderer.setClearColor(scene.fog.color, 0);

    layers.forEach((layer, index) => {
      const data = layer.userData;
      const target = targetBundle[data.name];
      const smoothing = 0.025;
      data.opacity = THREE.MathUtils.lerp(data.opacity, target.opacity, smoothing);
      data.speed = THREE.MathUtils.lerp(data.speed, target.speed, smoothing);
      data.gather = THREE.MathUtils.lerp(data.gather, target.gather, smoothing);
      lerpArray(data.colorA, target.colorA, smoothing);
      lerpArray(data.colorB, target.colorB, smoothing);

      const motion = data.speed;
      layer.rotation.y += delta * (0.004 + index * 0.002) * motion;
      layer.rotation.x = Math.sin(elapsed * 0.05 + index) * 0.035;
      layer.position.y = data.baseY + Math.sin(elapsed * data.drift * 0.18 + index * 1.7) * 0.28;
      layer.position.z = Math.sin(elapsed * 0.08 + index) * 0.42;

      const uniforms = layer.material.uniforms;
      uniforms.uTime.value = elapsed * motion;
      uniforms.uOpacity.value = data.opacity;
      uniforms.uPulse.value = pulse.value;
      uniforms.uGather.value = data.gather + aiGather.value * 0.2;
      uniforms.uColorA.value.set(...data.colorA);
      uniforms.uColorB.value.set(...data.colorB);
    });

    camera.position.x = THREE.MathUtils.lerp(camera.position.x, mouse.x * 1.1, 0.035);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, 0.6 - mouse.y * 0.72, 0.035);
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, 21 + mouse.y * 0.7, 0.025);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  window.addEventListener("pointermove", (event) => {
    mouse.x = (event.clientX / window.innerWidth - 0.5) * 2;
    mouse.y = (event.clientY / window.innerHeight - 0.5) * 2;
  });

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    layers.forEach((layer) => {
      layer.material.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio || 1, 2);
    });
  });

  animate();

  return {
    renderMessage,
    renderQuickReplies,
    clearQuickReplies,
    updateInputValue,
    appendInputValue,
    readInputValue,
    scrollChatArea,
    updateRecordingStatus,
    setRecordingActive,
    setMicDisabled,
    updateVisualStage,
    triggerUserPulse,
    triggerAssistantGather,
    bindSend,
    bindQuickReply,
    bindMic,
  };
}

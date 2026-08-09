(()=>{
"use strict";

const $ = id => document.getElementById(id);

let watchId = null;
let lastT = null;
let lastV = null;

let speedKmh = 0;
let accelG = 0;

let ctx = null;
let master = null;
let compressor = null;
let limiter = null;
let engine = null;

let running = false;
let profile = "cyber";
let testTimer = null;

const PROFILES = {
  cyber:{
    waves:["sine","triangle","sine"],
    base:[76,152,610],
    speed:[215,430,1050],
    accel:[72,135,410],
    mix:[0.31,0.13,0.025],
    level:0.72
  },
  pod:{
    waves:["sawtooth","triangle","sine"],
    base:[52,104,330],
    speed:[150,305,760],
    accel:[90,175,470],
    mix:[0.18,0.14,0.025],
    level:0.70
  },
  hyper:{
    waves:["sine","triangle","sine"],
    base:[58,174,690],
    speed:[190,445,1420],
    accel:[62,150,510],
    mix:[0.30,0.115,0.026],
    level:0.76
  },
  turbine:{
    waves:["sine","sine","triangle"],
    base:[92,275,880],
    speed:[330,760,1980],
    accel:[100,210,590],
    mix:[0.26,0.085,0.024],
    level:0.76
  },
  ion:{
    waves:["sine","triangle","sine"],
    base:[112,336,1260],
    speed:[280,720,2200],
    accel:[92,220,610],
    mix:[0.25,0.070,0.018],
    level:0.72
  },
  phantom:{
    waves:["sine","triangle","sine"],
    base:[34,68,136],
    speed:[82,164,330],
    accel:[42,80,150],
    mix:[0.34,0.105,0.034],
    level:0.76
  },
  arc:{
    waves:["triangle","sine","sine"],
    base:[72,216,930],
    speed:[225,590,1670],
    accel:[78,170,460],
    mix:[0.23,0.065,0.020],
    level:0.72
  },
  zen:{
    waves:["sine","sine","sine"],
    base:[52,104,260],
    speed:[70,140,310],
    accel:[15,28,50],
    mix:[0.30,0.085,0.015],
    level:0.64
  }
};

function softSaturate(value, scale=1){
  return Math.tanh(value / scale);
}

function initAudio(){
  if(ctx) return;

  ctx = new (window.AudioContext || window.webkitAudioContext)({
    latencyHint:"interactive"
  });

  master = ctx.createGain();
  master.gain.value = Number($("volume").value) / 100 * 0.82;

  compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -15;
  compressor.knee.value = 12;
  compressor.ratio.value = 3.5;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.18;

  limiter = ctx.createWaveShaper();
  const curve = new Float32Array(65536);

  for(let i=0;i<curve.length;i++){
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 1.45) / Math.tanh(1.45);
  }

  limiter.curve = curve;
  limiter.oversample = "4x";

  master
    .connect(compressor)
    .connect(limiter)
    .connect(ctx.destination);
}

function createVoice(type, frequency, volume, output){
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.value = volume;

  oscillator
    .connect(gain)
    .connect(output);

  oscillator.start();

  return { oscillator, gain };
}

function stopEngine(){
  if(!engine) return;

  const oldEngine = engine;
  engine = null;

  const now = ctx.currentTime;

  try{
    oldEngine.output.gain.cancelScheduledValues(now);
    oldEngine.output.gain.setTargetAtTime(0.0001, now, 0.08);
  }catch{}

  setTimeout(()=>{
    try{
      oldEngine.voices.forEach(voice => voice.oscillator.stop());
    }catch{}
  },350);
}

function buildEngine(){
  initAudio();
  stopEngine();

  const config = PROFILES[profile];
  const output = ctx.createGain();

  output.gain.value = 0.0001;
  output.connect(master);

  const voices = config.waves.map((wave,index)=>
    createVoice(
      wave,
      config.base[index],
      config.mix[index],
      output
    )
  );

  engine = { output, voices };

  output.gain.setTargetAtTime(
    config.level,
    ctx.currentTime,
    0.18
  );
}

function updateSound(){
  if(!running || !engine || !ctx) return;

  const config = PROFILES[profile];
  const now = ctx.currentTime;

  const speedDrive = softSaturate(speedKmh / 155);
  const positiveAcceleration = (softSaturate(accelG / 0.38) + 1) / 2;
  const negativeAcceleration = (softSaturate(-accelG / 0.30) + 1) / 2;

  engine.voices.forEach((voice,index)=>{
    const targetFrequency =
      config.base[index] +
      speedDrive * config.speed[index] +
      positiveAcceleration * config.accel[index];

    voice.oscillator.frequency.setTargetAtTime(
      targetFrequency,
      now,
      0.26
    );
  });

  const accelerationVolume = positiveAcceleration * 0.12;
  const decelerationReduction = negativeAcceleration * 0.045;

  const targetLevel =
    config.level +
    accelerationVolume -
    decelerationReduction;

  engine.output.gain.setTargetAtTime(
    targetLevel,
    now,
    0.22
  );
}

function onPosition(position){
  const speed = position.coords.speed;

  if(
    typeof speed !== "number" ||
    !Number.isFinite(speed) ||
    speed < 0
  ){
    $("gpsText").textContent = "GPS CONNECTED · NO SPEED";
    return;
  }

  const now = position.timestamp || Date.now();
  speedKmh = speed * 3.6;

  if(lastT !== null && lastV !== null){
    const dt = (now - lastT) / 1000;

    if(dt > 0.08 && dt < 5){
      const measuredAcceleration =
        ((speed - lastV) / dt) / 9.80665;

      accelG += (measuredAcceleration - accelG) * 0.055;
    }
  }

  lastT = now;
  lastV = speed;

  $("gpsDot").classList.add("ok");
  $("gpsText").textContent = "GPS CONNECTED";
  $("gpsFooter").textContent = "Active";
}

function stopGPS(){
  if(watchId !== null && navigator.geolocation){
    navigator.geolocation.clearWatch(watchId);
  }

  watchId = null;
  lastT = null;
  lastV = null;

  $("gpsDot").classList.remove("ok");
  $("gpsText").textContent = "GPS NOT CONNECTED";
  $("gpsFooter").textContent = "Inactive";
  $("gpsToggle").textContent = "ENABLE GPS";
}

function startGPS(){
  if(!navigator.geolocation){
    $("gpsText").textContent = "GPS NOT AVAILABLE";
    $("gpsFooter").textContent = "Unavailable";
    return;
  }

  if(watchId !== null){
    stopGPS();
    return;
  }

  $("gpsText").textContent = "GPS REQUESTED";
  $("gpsFooter").textContent = "Requesting";

  watchId = navigator.geolocation.watchPosition(
    onPosition,
    ()=>{
      $("gpsDot").classList.remove("ok");
      $("gpsText").textContent = "GPS ERROR";
      $("gpsFooter").textContent = "Error";
    },
    {
      enableHighAccuracy:true,
      maximumAge:0,
      timeout:10000
    }
  );

  $("gpsToggle").textContent = "STOP GPS";
}

function setProfile(newProfile){
  profile = newProfile;

  document.querySelectorAll(".sound-btn").forEach(button =>
    button.classList.toggle(
      "active",
      button.dataset.p === newProfile
    )
  );

  if(running) buildEngine();
}

document.querySelectorAll(".sound-btn").forEach(button =>
  button.onclick = ()=>setProfile(button.dataset.p)
);

$("startBtn").onclick = async()=>{
  initAudio();

  if(ctx.state === "suspended"){
    await ctx.resume();
  }

  running = !running;

  if(running){
    buildEngine();
    $("startBtn").textContent = "STOP SOUND";
    $("startBtn").classList.add("running");
  }else{
    stopEngine();
    $("startBtn").textContent = "START SOUND";
    $("startBtn").classList.remove("running");
  }
};

$("testBtn").onclick = async()=>{
  initAudio();

  if(ctx.state === "suspended"){
    await ctx.resume();
  }

  if(!running){
    running = true;
    buildEngine();
    $("startBtn").textContent = "STOP SOUND";
    $("startBtn").classList.add("running");
  }

  clearInterval(testTimer);

  const testStart = performance.now();
  const duration = 10000;

  testTimer = setInterval(()=>{
    const elapsed = performance.now() - testStart;
    const u = Math.min(elapsed / duration, 1);

    speedKmh =
      62.5 *
      (1 - Math.cos(2 * Math.PI * u));

    const dvdt =
      125 *
      Math.PI *
      Math.sin(2 * Math.PI * u) /
      (duration / 1000);

    const targetG =
      (dvdt / 3.6) /
      9.80665;

    accelG += (targetG - accelG) * 0.04;

    if(u >= 1){
      clearInterval(testTimer);
      testTimer = null;
      speedKmh = 0;
      accelG = 0;
    }

  },20);
};

$("volume").oninput = ()=>{
  const volume = Number($("volume").value);
  $("volPercent").textContent = volume + "%";

  if(ctx && master){
    master.gain.setTargetAtTime(
      volume / 100 * 0.82,
      ctx.currentTime,
      0.10
    );
  }
};

$("refreshBtn").onclick = ()=>window.location.reload();
$("gpsToggle").onclick = startGPS;

function render(){
  const boost = Math.round(
    softSaturate(
      Math.max(accelG,0) / 0.35
    ) * 100
  );

  const decel = Math.round(
    softSaturate(
      Math.max(-accelG,0) / 0.30
    ) * 100
  );

  let mode = "CRUISE";
  let description = "Steady speed";

  if(speedKmh < 2 && Math.abs(accelG) < .02){
    mode = "READY";
    description = "Waiting for movement";
  }else if(accelG > .05){
    mode = "BOOST";
    description = "Acceleration";
  }else if(accelG < -.05){
    mode = "DECEL";
    description = "Deceleration";
  }

  $("speed").textContent = Math.round(speedKmh);
  $("driveMode").textContent = mode;
  $("driveSub").textContent = description;

  $("gValue").textContent =
    (accelG >= 0 ? "+" : "") +
    accelG.toFixed(2) +
    " g";

  $("boostValue").textContent = boost + " %";
  $("decelValue").textContent = decel + " %";

  updateSound();
  requestAnimationFrame(render);
}

requestAnimationFrame(render);

window.addEventListener("pagehide",()=>{
  try{ stopEngine(); }catch{}
  try{ stopGPS(); }catch{}

  if(ctx && ctx.state !== "closed"){
    ctx.close().catch(()=>{});
  }
});

document.addEventListener("visibilitychange",()=>{
  if(document.hidden && ctx && ctx.state === "running"){
    ctx.suspend().catch(()=>{});
  }else if(
    !document.hidden &&
    running &&
    ctx &&
    ctx.state === "suspended"
  ){
    ctx.resume().catch(()=>{});
  }
});

if("serviceWorker" in navigator){
  window.addEventListener("load",()=>{
    navigator.serviceWorker
      .register("./service-worker.js",{scope:"./"})
      .catch(()=>{});
  });
}

})();

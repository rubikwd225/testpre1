import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
import { getFirestore, doc, getDoc, updateDoc, increment } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBq1IksvMVbqs_yHF9QVvA_UKYxF4befo8",
  authDomain: "project-hsfs20271.firebaseapp.com",
  projectId: "project-hsfs20271",
  storageBucket: "project-hsfs20271.firebasestorage.app",
  messagingSenderId: "722084381349",
  appId: "1:722084381349:web:cdddafae5d0b6bb4a7034c",
  measurementId: "G-H01QPE6NJQ"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let currentMode = "entry"; 
let html5QrCode = null;
let isProcessing = false;
let lastScannedText = "";
let isCameraActive = false;

// シンプルな「ピッ」という効果音
function playBeep(isSuccess = true) {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(isSuccess ? 1200 : 600, now);
    
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start(now);
    osc.stop(now + 0.1);
  } catch (e) {
    console.log("音声再生エラー", e);
  }
}

// メニューの開閉
window.toggleMenu = function() {
  const modal = document.getElementById("menuModal");
  modal.style.display = modal.style.display === "flex" ? "none" : "flex";
};

// モード選択
window.selectMode = function(mode, label) {
  currentMode = mode;
  document.getElementById("currentModeLabel").textContent = `モード: ${label}`;
  toggleMenu();
};

// ログ追加関数
function addLog(mainText, status, subText = "") {
  const container = document.getElementById("logsContainer");
  const card = document.createElement("div");
  card.className = `log-item ${status}`;
  
  card.innerHTML = `
    <span class="log-text">${mainText}</span>
    ${subText ? `<span class="log-sub">${subText} /${new Date().toLocaleTimeString()}</span>` : `<span class="log-sub">${new Date().toLocaleTimeString()}</span>`}
  `;
  
  container.prepend(card);
  container.scrollTop = 0;
}

// ステータスエラー判定
function getStatusErrorMessage(currentStatus, targetMode) {
  if (currentStatus === "unused") {
    return targetMode === "reentry" ? "このチケットはまだ入場していません" : "このチケットは受付前です";
  } else if (currentStatus === "checked_in") {
    if (targetMode === "reception") return "このチケットは受付済です";
    if (targetMode === "reentry") return "このチケットはまだ入場していません";
    return "受付を行ってください";
  } else if (currentStatus === "used") {
    if (targetMode === "entry") return "このチケットは入場済です";
    if (targetMode === "reception") return "このチケットは入場済です";
  } else if (currentStatus === "reentry_permit") {
    if (targetMode === "reentry") return "すでに再入場許可が発行されています";
    if (targetMode === "reception") return "このチケットは受付・入場済です";
  }
  return `無効なステータス (${currentStatus})`;
}

async function onScanSuccess(decodedText) {
  if (isProcessing || decodedText === lastScannedText) return;
  isProcessing = true;
  lastScannedText = decodedText;

  const fullId = decodedText;

  try {
    const ticketRef = doc(db, "tickets", decodedText);
    const ticketSnap = await getDoc(ticketRef);

    if (!ticketSnap.exists()) {
      playBeep(false);
      addLog(`ID: ${fullId}`, "error", "チケットが見つかりません");
      return;
    }

    const ticketData = ticketSnap.data();
    const currentStatus = ticketData.status;

    // 1. 受付モード
    if (currentMode === "reception") {
      if (currentStatus !== "unused") {
        playBeep(false);
        addLog(`ID: ${fullId}`, "error", getStatusErrorMessage(currentStatus, "reception"));
        return;
      }

      if (ticketData.timeSlot && ticketData.timeSlot !== "free") {
        const slotRef = doc(db, "timeSlots", ticketData.timeSlot);
        await updateDoc(slotRef, { remainingGroups: increment(-1) });
      }

      await updateDoc(ticketRef, { status: "checked_in" });
      playBeep(true);
      addLog(`ID: ${fullId}`, "success", "受付完了");

    // 2. 入場モード
    } else if (currentMode === "entry") {
      if (currentStatus !== "checked_in" && currentStatus !== "reentry_permit") {
        playBeep(false);
        addLog(`ID: ${fullId}`, "error", getStatusErrorMessage(currentStatus, "entry"));
        return;
      }

      const msg = currentStatus === "reentry_permit" ? "再入場完了" : "入場完了";
      await updateDoc(ticketRef, { status: "used" });
      playBeep(true);
      addLog(`ID: ${fullId}`, "success", msg);

    // 3. 再入場許可モード
    } else if (currentMode === "reentry") {
      if (currentStatus !== "used") {
        playBeep(false);
        addLog(`ID: ${fullId}`, "error", getStatusErrorMessage(currentStatus, "reentry"));
        return;
      }

      await updateDoc(ticketRef, { status: "reentry_permit" });
      playBeep(true);
      addLog(`ID: ${fullId}`, "success", "再入場許可を付与しました");

    // 4. 初期化モード
    } else if (currentMode === "reset") {
      if (currentStatus === "unused") {
        playBeep(false);
        addLog(`ID: ${fullId}`, "error", "すでに受付前の状態です");
        return;
      }

      await updateDoc(ticketRef, { status: "unused" });
      playBeep(true);
      addLog(`ID: ${fullId}`, "success", "受付前に戻しました");
    }

  } catch (err) {
    console.error(err);
    playBeep(false);
    addLog(`ID: ${fullId}`, "error", "通信エラー");
  } finally {
    isProcessing = false;
    setTimeout(() => { lastScannedText = ""; }, 800);
  }
}

// カメラ起動
async function startScanner() {
  if (isCameraActive) return;
  isCameraActive = true;
  
  document.querySelector(".scanner-wrapper").classList.add("scanning");
  document.getElementById("scanStatusOverlay").textContent = "SCANNING...";

  try {
    if (!html5QrCode) {
      html5QrCode = new Html5Qrcode("reader");
    }
    await html5QrCode.start({ facingMode: "environment" }, { fps: 20 }, onScanSuccess, () => {});
  } catch (err) {
    try {
      await html5QrCode.start({ facingMode: "user" }, { fps: 20 }, onScanSuccess, () => {});
    } catch (err2) {
      console.error(err2);
      addLog("カメラ起動失敗", "error", "権限を確認してください");
      stopScanner();
    }
  }
}

// カメラ停止
async function stopScanner() {
  if (!isCameraActive) return;
  isCameraActive = false;

  document.querySelector(".scanner-wrapper").classList.remove("scanning");
  document.getElementById("scanStatusOverlay").textContent = "HOLD TO SCAN";

  if (html5QrCode && html5QrCode.isScanning) {
    try {
      await html5QrCode.stop();
    } catch (e) {
      console.error(e);
    }
  }
}

// 長押しボタンの設定
function setupHoldButton() {
  const btn = document.getElementById("btnHoldScan");

  const handleStart = (e) => {
    e.preventDefault();
    btn.classList.add("active");
    startScanner();
  };

  const handleEnd = (e) => {
    e.preventDefault();
    btn.classList.remove("active");
    stopScanner();
  };

  btn.addEventListener("touchstart", handleStart, { passive: false });
  btn.addEventListener("touchend", handleEnd, { passive: false });
  btn.addEventListener("touchcancel", handleEnd, { passive: false });

  btn.addEventListener("mousedown", handleStart);
  btn.addEventListener("mouseup", handleEnd);
  btn.addEventListener("mouseleave", handleEnd);
}

window.addEventListener("DOMContentLoaded", () => {
  setupHoldButton();
});
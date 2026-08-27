(() => {
  const installButton = document.querySelector("[data-install-app]");
  const installStatus = document.querySelector("[data-install-status]");
  let deferredInstallPrompt = null;

  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches
      || window.navigator.standalone === true;
  }

  function updateInstallButton() {
    if (!installButton) {
      return;
    }
    installButton.hidden = isStandalone() || !deferredInstallPrompt;
    if (installStatus && isStandalone()) {
      installStatus.textContent = "이미 설치된 앱입니다. 홈 화면의 가치봄 제주 아이콘을 눌러 실행하세요.";
    } else if (installStatus && deferredInstallPrompt) {
      installStatus.textContent = "설치 준비가 끝났습니다. ‘휴대폰에 바로 설치’를 눌러 주세요.";
    }
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    updateInstallButton();
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    updateInstallButton();
    if (installStatus) {
      installStatus.textContent = "설치가 완료됐습니다. 홈 화면에서 가치봄 제주를 실행할 수 있습니다.";
    }
  });

  installButton?.addEventListener("click", async () => {
    if (!deferredInstallPrompt) {
      return;
    }
    installButton.disabled = true;
    try {
      await deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      if (installStatus && choice.outcome !== "accepted") {
        installStatus.textContent = "설치가 취소됐습니다. 원할 때 설치 버튼을 다시 눌러 주세요.";
      }
    } finally {
      deferredInstallPrompt = null;
      installButton.disabled = false;
      updateInstallButton();
    }
  });

  if ("serviceWorker" in navigator && window.isSecureContext) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("service-worker.js", { scope: "./" }).catch(() => {
        // The site keeps working online even when offline support is unavailable.
      });
    });
  }
})();

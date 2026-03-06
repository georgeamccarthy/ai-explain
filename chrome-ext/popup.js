const statusEl = document.getElementById("status");
const urlInput = document.getElementById("worker-url-input");
const passphraseInput = document.getElementById("passphrase-input");
const saveBtn = document.getElementById("save-btn");
const savedMsg = document.getElementById("saved-msg");

const passphraseSetEl = document.getElementById("passphrase-set");
const changePassphraseEl = document.getElementById("change-passphrase");
let passphraseAlreadySet = false;

function showPassphraseSet() {
  passphraseSetEl.style.display = "flex";
  passphraseInput.style.display = "none";
  passphraseInput.value = "";
}

function showPassphraseInput() {
  passphraseSetEl.style.display = "none";
  passphraseInput.style.display = "block";
  passphraseInput.focus();
}

changePassphraseEl.addEventListener("click", showPassphraseInput);

chrome.storage.local.get(["ai-explain-passphrase", "ai-explain-worker-url"], (result) => {
  const hasPassphrase = !!result["ai-explain-passphrase"];
  const hasUrl = !!result["ai-explain-worker-url"];

  if (hasUrl) urlInput.value = result["ai-explain-worker-url"];

  if (hasPassphrase) {
    passphraseAlreadySet = true;
    showPassphraseSet();
  }

  if (hasPassphrase && hasUrl) {
    statusEl.textContent = "Configured ✓";
    statusEl.className = "status set";
  } else {
    statusEl.textContent = "Not configured";
    statusEl.className = "status unset";
  }
});

saveBtn.addEventListener("click", () => {
  const urlValue = urlInput.value.trim();
  const passphraseValue = passphraseInput.value.trim();

  if (!urlValue) {
    savedMsg.style.color = "#c0392b";
    savedMsg.textContent = "Please enter a worker URL.";
    return;
  }
  if (!passphraseValue && !passphraseAlreadySet) {
    savedMsg.style.color = "#c0392b";
    savedMsg.textContent = "Please enter a passphrase.";
    return;
  }

  const toSave = { "ai-explain-worker-url": urlValue };
  if (passphraseValue) toSave["ai-explain-passphrase"] = passphraseValue;

  chrome.storage.local.set(toSave, () => {
    passphraseAlreadySet = true;
    showPassphraseSet();
    statusEl.textContent = "Configured ✓";
    statusEl.className = "status set";
    savedMsg.style.color = "#2e7d32";
    savedMsg.textContent = "Saved!";
    setTimeout(() => (savedMsg.textContent = ""), 2000);
  });
});

passphraseInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") saveBtn.click();
});

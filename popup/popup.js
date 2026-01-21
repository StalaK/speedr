const wpmSlider = document.getElementById('wpm-slider');
const wpmInput = document.getElementById('wpm-input');
const focusModeCheckbox = document.getElementById('focus-mode-checkbox');
const darkModeCheckbox = document.getElementById('dark-mode-checkbox');
const playPauseButton = document.getElementById('play-pause-button');

document.addEventListener('DOMContentLoaded', restoreSettings);

async function restoreSettings() {
  const result = await browser.storage.local.get(['wpm', 'focusMode', 'darkMode']);
  const storedWpm = result.wpm === undefined ? 500 : result.wpm; // Default 500
  const storedFocusMode = result.focusMode === undefined ? true : result.focusMode; // Default true
  const storedDarkMode = result.darkMode === undefined ? false : result.darkMode; // Default false

  wpmSlider.value = storedWpm;
  wpmInput.value = storedWpm;
  focusModeCheckbox.checked = storedFocusMode;
  darkModeCheckbox.checked = storedDarkMode;
  
  toggleDarkMode(storedDarkMode);
}

playPauseButton.addEventListener('click', () => {
  sendMessage({ action: 'playPause', focusMode: focusModeCheckbox.checked, darkMode: darkModeCheckbox.checked });
});

wpmSlider.addEventListener('input', () => {
  const wpm = wpmSlider.value;
  wpmInput.value = wpm;
  sendMessage({ action: 'setWpm', wpm: parseInt(wpm, 10) });
  browser.storage.local.set({ wpm: parseInt(wpm, 10) }); // Save WPM
});

wpmInput.addEventListener('input', () => {
  const wpm = parseInt(wpmInput.value, 10);
  if (!isNaN(wpm)) {
    wpmSlider.value = wpm;
    sendMessage({ action: 'setWpm', wpm: wpm });
    sendMessage({ action: 'pause' });
    browser.storage.local.set({ wpm: wpm }); // Save WPM
  }
});

focusModeCheckbox.addEventListener('change', () => {
  const isChecked = focusModeCheckbox.checked;
  sendMessage({ action: 'toggleFocusMode', focusMode: isChecked });
  browser.storage.local.set({ focusMode: isChecked }); // Save Focus Mode
});

darkModeCheckbox.addEventListener('change', () => {
  const isChecked = darkModeCheckbox.checked;
  toggleDarkMode(isChecked);
  sendMessage({ action: 'toggleDarkMode', darkMode: isChecked });
  browser.storage.local.set({ darkMode: isChecked }); // Save Dark Mode
});

function toggleDarkMode(isDark) {
  if (isDark) {
    document.body.classList.add('dark-mode');
  } else {
    document.body.classList.remove('dark-mode');
  }
}

function sendMessage(message) {
  browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length > 0) {
      browser.tabs.sendMessage(tabs[0].id, message);
    }
  });
}

browser.runtime.onMessage.addListener((message) => {
  if (message.action === 'stateUpdate') {
    if (message.isPlaying) {
      playPauseButton.innerHTML = '&#9208;';
    } else {
      playPauseButton.innerHTML = '&#9654;';
    }
  }
});

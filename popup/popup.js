const wpmSlider = document.getElementById('wpm-slider');
const wpmInput = document.getElementById('wpm-input');
const focusModeCheckbox = document.getElementById('focus-mode-checkbox');
const darkModeCheckbox = document.getElementById('dark-mode-checkbox');
const pauseCommaCheckbox = document.getElementById('pause-comma-checkbox');
const pauseSentenceCheckbox = document.getElementById('pause-sentence-checkbox');
const pauseParagraphCheckbox = document.getElementById('pause-paragraph-checkbox');
const playPauseButton = document.getElementById('play-pause-button');

document.addEventListener('DOMContentLoaded', restoreSettings);

async function restoreSettings() {
  const result = await chrome.storage.local.get(['wpm', 'focusMode', 'darkMode', 'pauseComma', 'pauseSentence', 'pauseParagraph']);
  const storedWpm = result.wpm === undefined ? 500 : result.wpm; // Default 500
  const storedFocusMode = result.focusMode === undefined ? true : result.focusMode; // Default true
  const storedDarkMode = result.darkMode === undefined ? false : result.darkMode; // Default false
  const storedPauseComma = result.pauseComma === undefined ? false : result.pauseComma; // Default false
  const storedPauseSentence = result.pauseSentence === undefined ? false : result.pauseSentence; // Default false
  const storedPauseParagraph = result.pauseParagraph === undefined ? false : result.pauseParagraph; // Default false

  wpmSlider.value = storedWpm;
  wpmInput.value = storedWpm;
  focusModeCheckbox.checked = storedFocusMode;
  darkModeCheckbox.checked = storedDarkMode;
  pauseCommaCheckbox.checked = storedPauseComma;
  pauseSentenceCheckbox.checked = storedPauseSentence;
  pauseParagraphCheckbox.checked = storedPauseParagraph;
  
  toggleDarkMode(storedDarkMode);
}

playPauseButton.addEventListener('click', () => {
  sendMessage({ action: 'playPause', focusMode: focusModeCheckbox.checked, darkMode: darkModeCheckbox.checked });
});

wpmSlider.addEventListener('input', () => {
  const wpm = wpmSlider.value;
  wpmInput.value = wpm;
  sendMessage({ action: 'setWpm', wpm: parseInt(wpm, 10) });
  chrome.storage.local.set({ wpm: parseInt(wpm, 10) }); // Save WPM
});

wpmInput.addEventListener('input', () => {
  const wpm = parseInt(wpmInput.value, 10);
  if (!isNaN(wpm)) {
    wpmSlider.value = wpm;
    sendMessage({ action: 'setWpm', wpm: wpm });
    sendMessage({ action: 'pause' });
    chrome.storage.local.set({ wpm: wpm }); // Save WPM
  }
});

focusModeCheckbox.addEventListener('change', () => {
  const isChecked = focusModeCheckbox.checked;
  sendMessage({ action: 'toggleFocusMode', focusMode: isChecked });
  chrome.storage.local.set({ focusMode: isChecked }); // Save Focus Mode
});

darkModeCheckbox.addEventListener('change', () => {
  const isChecked = darkModeCheckbox.checked;
  toggleDarkMode(isChecked);
  sendMessage({ action: 'toggleDarkMode', darkMode: isChecked });
  chrome.storage.local.set({ darkMode: isChecked }); // Save Dark Mode
});

pauseCommaCheckbox.addEventListener('change', () => {
  const isChecked = pauseCommaCheckbox.checked;
  sendMessage({ action: 'togglePauseComma', value: isChecked });
  chrome.storage.local.set({ pauseComma: isChecked });
});

pauseSentenceCheckbox.addEventListener('change', () => {
  const isChecked = pauseSentenceCheckbox.checked;
  sendMessage({ action: 'togglePauseSentence', value: isChecked });
  chrome.storage.local.set({ pauseSentence: isChecked });
});

pauseParagraphCheckbox.addEventListener('change', () => {
  const isChecked = pauseParagraphCheckbox.checked;
  sendMessage({ action: 'togglePauseParagraph', value: isChecked });
  chrome.storage.local.set({ pauseParagraph: isChecked });
});

function toggleDarkMode(isDark) {
  const logo = document.querySelector('.header-logo');
  if (isDark) {
    document.body.classList.add('dark-mode');
    if (logo) logo.src = '../icons/150-dark.svg';
  } else {
    document.body.classList.remove('dark-mode');
    if (logo) logo.src = '../icons/150-light.svg';
  }
}

function sendMessage(message) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length > 0) {
      chrome.tabs.sendMessage(tabs[0].id, message);
    }
  });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'stateUpdate') {
    if (message.isPlaying) {
      playPauseButton.innerHTML = '&#9208;';
    } else {
      playPauseButton.innerHTML = '&#9654;';
    }
  }
});

// Tooltip logic
const tooltipIcons = document.querySelectorAll('.tooltip-icon');

// Create single tooltip instance
const tooltip = document.createElement('div');
tooltip.className = 'custom-tooltip';
const arrow = document.createElement('div');
arrow.className = 'tooltip-arrow';
tooltip.appendChild(arrow);
document.body.appendChild(tooltip);

tooltipIcons.forEach(icon => {
  let tooltipTimeout;
  const tooltipText = icon.getAttribute('data-tooltip');
  
  if (tooltipText) {
    icon.addEventListener('mouseenter', () => {
      tooltipTimeout = setTimeout(() => {
          tooltip.childNodes[0].nodeValue = tooltipText; // Update text safely
          if (tooltip.firstChild.nodeType !== Node.TEXT_NODE) {
             tooltip.prepend(document.createTextNode(tooltipText));
          } else {
             tooltip.firstChild.nodeValue = tooltipText;
          }

          const iconRect = icon.getBoundingClientRect();
          const tooltipWidth = 200; // Defined in CSS
          const bodyWidth = document.body.clientWidth;
          
          // Calculate Left (Clamp to window bounds)
          let left = iconRect.left + iconRect.width / 2 - tooltipWidth / 2;
          // Padding of 10px from edges
          if (left < 10) left = 10;
          if (left + tooltipWidth > bodyWidth - 10) left = bodyWidth - 10 - tooltipWidth;
          
          tooltip.style.left = left + 'px';
          
          // Calculate Top (Above icon)
          // We need to render it to get height if it's dynamic, but here it's mostly text.
          // Let's assume it's roughly positioned, or use visibility to measure.
          tooltip.style.visibility = 'hidden'; 
          tooltip.style.opacity = '0';
          // Force layout update? 
          // Actually, since it's fixed, we can just set top after a brief moment or calculate assuming height?
          // Safer to show it hidden, measure, then set top.
          
          // Temporarily show to measure height
          tooltip.style.display = 'block'; 
          const tooltipHeight = tooltip.offsetHeight;
          
          let top = iconRect.top - tooltipHeight - 8; 
          tooltip.style.top = top + 'px';

          // Calculate Arrow Position (Relative to tooltip)
          const iconCenter = iconRect.left + iconRect.width / 2;
          // Arrow center should be at iconCenter
          // arrowLeft + 5 (half border) = iconCenter - tooltipLeft
          const arrowLeft = iconCenter - left - 5;
          arrow.style.left = arrowLeft + 'px';

          tooltip.style.visibility = 'visible';
          tooltip.style.opacity = '1';
      }, 200); // 200ms delay
    });

    icon.addEventListener('mouseleave', () => {
      clearTimeout(tooltipTimeout);
      tooltip.style.visibility = 'hidden';
      tooltip.style.opacity = '0';
    });
  }
});

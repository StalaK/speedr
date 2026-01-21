let readerState = {
  words: [],
  currentIndex: 0,
  wpm: 500,
  isPlaying: false,
  timerId: null,
  focusMode: true,
  darkMode: false,
  originalPageText: "",
};

let overlay = null;
let wordDisplay = null;
let focusOverlay = null;
let progressBar = null;

// Initialize originalPageText and originalPageOffsets as soon as the content script loads
const { flatText, nodeOffsetMap } = getFlatTextAndOffsets(document.body);
readerState.originalPageText = flatText;
readerState.originalPageOffsets = nodeOffsetMap;

// Function to stop reader and clean up overlays
function stopReaderAndCleanUp() {
  if (overlay) {
    overlay.remove();
    overlay = null;
    progressBar = null;
  }
  if (focusOverlay) {
    focusOverlay.remove();
    focusOverlay = null;
  }
  pauseReader(); // Also clears timer and sets isPlaying to false

  // Reset reader state
  readerState.words = [];
  readerState.currentIndex = 0;

  // Send update to popup to show play icon
  browser.runtime.sendMessage({ action: 'stateUpdate', isPlaying: false });
}

// Helper to get flat text and offsets
function getFlatTextAndOffsets(rootElement) {
  let flatText = '';
  const nodeOffsetMap = new Map(); // Maps node to {start, end} offset in flatText

  function traverse(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent.trim().length > 0) {
        nodeOffsetMap.set(node, { start: flatText.length, end: flatText.length + node.textContent.length });
        flatText += node.textContent;
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      // Check visibility
      if (!isVisible(node)) return;

      const tagName = node.tagName.toLowerCase();
      // Skip script and style elements
      if (tagName === 'script' || tagName === 'style') {
        return;
      }

      // Add newlines for paragraph separation, matching extractTextFromPage
      const isBlockElement = ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li'].includes(tagName);
      const isLineBreak = tagName === 'br';

      if (isBlockElement && flatText.length > 0 && !flatText.endsWith('\n\n')) {
        flatText += '\n\n';
      } else if (isLineBreak && flatText.length > 0 && !flatText.endsWith('\n')) {
        flatText += '\n';
      }

      for (const child of node.childNodes) {
        traverse(child);
      }

      // Add extra newline after block elements for consistency with extractTextFromPage's innerText
      if (isBlockElement && !flatText.endsWith('\n\n')) {
        flatText += '\n\n';
      }
    }
  }

  traverse(rootElement);
  return { flatText: flatText.trim(), nodeOffsetMap };
}

// Helper to map DOM selection to character offsets in the flat text
function mapSelectionToFlatText(selection, flatText, nodeOffsetMap) {
  if (!selection || selection.rangeCount === 0) {
    return { startIndex: -1, endIndex: -1 };
  }

  const range = selection.getRangeAt(0);
  const { startContainer, startOffset, endContainer, endOffset } = range;

  let selectionStartIndex = -1;
  let selectionEndIndex = -1;

  // Function to find the text node and its flat text offset
  const findTextNodeAndOffset = (container, offset, isStart) => {
    let currentOffset = 0;
    let foundNode = null;

    const findNodeRecursive = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node === container) {
          foundNode = node;
          return true;
        }
        currentOffset += node.textContent.length;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const tagName = node.tagName.toLowerCase();
        if (tagName === 'script' || tagName === 'style') return false;

        const isBlockElement = ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li'].includes(tagName);
        const isLineBreak = tagName === 'br';

        if (isBlockElement && flatText.length > 0) { // Check length to avoid adding newline at very beginning
            currentOffset += '\n\n'.length;
        } else if (isLineBreak) {
            currentOffset += '\n'.length;
        }

        for (const child of node.childNodes) {
          if (findNodeRecursive(child)) return true;
        }
        if (isBlockElement && flatText.length > 0) { // Check length to avoid adding newline at very beginning
            currentOffset += '\n\n'.length;
        }
      }
      return false;
    };

    // Try to find the container in the current DOM
    // This is a simplified search for direct text nodes.
    // For complex containers (e.g., selection starts in <p> but not text node directly),
    // a more sophisticated approach would be needed.
    let node = container;
    while(node && node.nodeType !== Node.TEXT_NODE) {
      node = node.firstChild || node.nextSibling; // Simple heuristic
    }

    if (node && nodeOffsetMap.has(node)) {
      const map = nodeOffsetMap.get(node);
      return map.start + offset;
    }
    return -1;
  };

  // Simplified mapping for start and end, directly using nodeOffsetMap
  // This assumes startContainer and endContainer are mostly text nodes or directly mapped.
  if (nodeOffsetMap.has(startContainer)) {
    selectionStartIndex = nodeOffsetMap.get(startContainer).start + startOffset;
  } else {
    // Fallback: search the flat text for the selection text. Less precise.
    const selectionText = selection.toString();
    const tempStartIndex = flatText.indexOf(selectionText);
    if (tempStartIndex !== -1) selectionStartIndex = tempStartIndex;
  }

  if (nodeOffsetMap.has(endContainer)) {
    selectionEndIndex = nodeOffsetMap.get(endContainer).start + endOffset;
  } else {
    const selectionText = selection.toString();
    const tempEndIndex = flatText.lastIndexOf(selectionText) + selectionText.length;
    if (tempEndIndex !== -1) selectionEndIndex = tempEndIndex;
  }


  // Adjust for collapsed selection if only one point found
  if (selectionStartIndex === -1 && selectionEndIndex !== -1) selectionStartIndex = selectionEndIndex;
  if (selectionEndIndex === -1 && selectionStartIndex !== -1) selectionEndIndex = selectionStartIndex;

  // Ensure start is before end
  if (selectionStartIndex > selectionEndIndex) {
    [selectionStartIndex, selectionEndIndex] = [selectionEndIndex, selectionStartIndex];
  }


  return { startIndex: selectionStartIndex, endIndex: selectionEndIndex };
}


// Add keyboard listeners
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && (readerState.isPlaying || (overlay && overlay.style.display !== 'none'))) {
    stopReaderAndCleanUp();
  } else if (event.key === ' ' && (readerState.isPlaying || readerState.words.length > 0)) { // Spacebar for play/pause
    event.preventDefault(); // Prevent default spacebar action (e.g., scrolling)
    if (readerState.isPlaying) {
      pauseReader();
    } else {
      resumeReader();
    }
  }
});

browser.runtime.onMessage.addListener(async (message) => {
  if (message.action === 'playPause') {
    if (readerState.words.length === 0) {
      // If reader hasn't started, start from the beginning of the page.
      const result = await browser.storage.local.get(['wpm', 'focusMode', 'darkMode']);
      const storedWpm = result.wpm === undefined ? 500 : result.wpm; // Default 500
      const storedFocusMode = result.focusMode === undefined ? true : result.focusMode; // Default true
      const storedDarkMode = result.darkMode === undefined ? false : result.darkMode; // Default false
      startReaderFromText(readerState.originalPageText, storedFocusMode, storedWpm, storedDarkMode);
    } else if (readerState.isPlaying) {
      pauseReader();
    } else {
      resumeReader();
    }
  } else if (message.action === 'pause') {
    if (readerState.isPlaying) {
      pauseReader();
    }
  } else if (message.action === 'setWpm') {
    setWpm(message.wpm);
  } else if (message.action === 'toggleFocusMode') {
    readerState.focusMode = message.focusMode;
    toggleFocusOverlay(readerState.focusMode);
  } else if (message.action === 'toggleDarkMode') {
    readerState.darkMode = message.darkMode;
    updateOverlayTheme(readerState.darkMode);
  } else if (message.action === 'startReadFromSelection') {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const { startIndex, endIndex } = mapSelectionToFlatText(selection, readerState.originalPageText, readerState.originalPageOffsets);
      if (startIndex !== -1) {
        const result = await browser.storage.local.get(['wpm', 'focusMode', 'darkMode']);
        const storedWpm = result.wpm === undefined ? 500 : result.wpm; // Default 500
        const storedFocusMode = result.focusMode === undefined ? true : result.focusMode; // Default true
        const storedDarkMode = result.darkMode === undefined ? false : result.darkMode; // Default false
        const textToRead = readerState.originalPageText.substring(startIndex);
        startReaderFromText(textToRead, storedFocusMode, storedWpm, storedDarkMode);
      }
    }
  } else if (message.action === 'startReadToSelection') {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const { startIndex, endIndex } = mapSelectionToFlatText(selection, readerState.originalPageText, readerState.originalPageOffsets);
      if (endIndex !== -1) {
        const result = await browser.storage.local.get(['wpm', 'focusMode', 'darkMode']);
        const storedWpm = result.wpm === undefined ? 500 : result.wpm; // Default 500
        const storedFocusMode = result.focusMode === undefined ? true : result.focusMode; // Default true
        const storedDarkMode = result.darkMode === undefined ? false : result.darkMode; // Default false
        const textToRead = readerState.originalPageText.substring(0, endIndex);
        startReaderFromText(textToRead, storedFocusMode, storedWpm, storedDarkMode);
      }
    }
  } else if (message.action === 'readWholePage') {
    const result = await browser.storage.local.get(['wpm', 'focusMode', 'darkMode']);
    const storedWpm = result.wpm === undefined ? 500 : result.wpm; // Default 500
    const storedFocusMode = result.focusMode === undefined ? true : result.focusMode; // Default true
    const storedDarkMode = result.darkMode === undefined ? false : result.darkMode; // Default false
    const textToRead = getSmartPageText();
    startReaderFromText(textToRead, storedFocusMode, storedWpm, storedDarkMode);
  }
});

function getSmartPageText() {
  const selectors = ['article', 'main', '[role="main"]', '.post-content', '#content', '#main-content', '.entry-content'];
  let root = document.body;
  let isFallback = true;

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    // Ensure it has reasonable content (e.g. > 200 chars) to avoid empty containers
    if (el && el.innerText.trim().length > 200) {
      root = el;
      isFallback = false;
      break;
    }
  }

  return extractReadableText(root, isFallback);
}

function extractReadableText(root, isFallback) {
  let flatText = '';
  
  function traverse(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const trimmed = node.textContent.trim();
      if (trimmed.length > 0) {
        flatText += node.textContent;
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      // Check visibility
      if (!isVisible(node)) return;

      const tagName = node.tagName.toLowerCase();
      // Always ignore these
      if (['script', 'style', 'noscript', 'nav', 'aside', 'iframe', 'svg'].includes(tagName)) return;
      
      // If we are falling back to body, also ignore header/footer
      if (isFallback && ['header', 'footer'].includes(tagName)) return;

      const isBlockElement = ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'article', 'section', 'main'].includes(tagName);
      const isLineBreak = tagName === 'br';

      if (isBlockElement && flatText.length > 0 && !flatText.endsWith('\n\n')) {
        flatText += '\n\n';
      } else if (isLineBreak && flatText.length > 0 && !flatText.endsWith('\n')) {
        flatText += '\n';
      }

      for (const child of node.childNodes) {
        traverse(child);
      }

      if (isBlockElement && !flatText.endsWith('\n\n')) {
        flatText += '\n\n';
      }
    }
  }

  traverse(root);
  return flatText.trim();
}

function startReaderFromText(text, focusMode, wpm, darkMode) { // Added wpm and darkMode parameters
  if (readerState.isPlaying) {
    // If already playing, stop current reading first
    pauseReader();
  }

  readerState.focusMode = focusMode;
  readerState.wpm = wpm; // Set readerState.wpm
  readerState.darkMode = darkMode;
  readerState.words = text.replace(/(\r\n|\n|\r){2,}/gm, " _PARAGRAPH_END_ ").split(/\s+/).filter(word => word.length > 0);
  readerState.currentIndex = 0;

  if (overlay) {
    // If overlay already exists, clear its content
    wordDisplay.innerHTML = '';
    overlay.style.display = 'flex'; // Ensure overlay is visible
    if (readerState.focusMode) {
      toggleFocusOverlay(true);
    }
    updateOverlayTheme(readerState.darkMode);
  } else {
    // If overlay doesn't exist, create it
    createOverlay();
  }

  readerState.isPlaying = true;
  browser.runtime.sendMessage({ action: 'stateUpdate', isPlaying: readerState.isPlaying });
  showNextWord();
}

function pauseReader() {
  readerState.isPlaying = false;
  if (readerState.timerId) {
    clearTimeout(readerState.timerId);
  }
  browser.runtime.sendMessage({ action: 'stateUpdate', isPlaying: readerState.isPlaying });
}

function resumeReader() {
  if (readerState.words.length === 0) {
    return;
  }
  readerState.isPlaying = true;
  browser.runtime.sendMessage({ action: 'stateUpdate', isPlaying: readerState.isPlaying });
  showNextWord();
}

function setWpm(wpm) {
  readerState.wpm = wpm;
}

function extractTextFromPage() {
  const bodyClone = document.body.cloneNode(true);

  // Remove script and style elements
  Array.from(bodyClone.querySelectorAll('script, style')).forEach(el => el.remove());

  // Replace block elements with newlines for better paragraph separation
  Array.from(bodyClone.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6, li, br')).forEach(el => {
    el.insertAdjacentText('afterend', '\n\n');
  });

  return bodyClone.innerText;
}

function toggleFocusOverlay(show) {
  if (show) {
    if (!focusOverlay) {
      focusOverlay = document.createElement('div');
      focusOverlay.id = 'focus-mode-overlay';
      const style = document.createElement('style');
      style.textContent = `
        #focus-mode-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background-color: rgba(0, 0, 0, 0.85);
          z-index: 9998;
        }
      `;
      document.head.appendChild(style);
      document.body.appendChild(focusOverlay);
    }
    focusOverlay.style.display = 'block';
  } else {
    if (focusOverlay) {
      focusOverlay.style.display = 'none';
    }
  }
}

function updateOverlayTheme(isDark) {
  if (overlay) {
    if (isDark) {
      overlay.classList.add('dark-mode');
    } else {
      overlay.classList.remove('dark-mode');
    }
  }
}

function createOverlay() {
  if (readerState.focusMode) {
    toggleFocusOverlay(true);
  }

  overlay = document.createElement('div');
  overlay.id = 'word-reader-overlay';
  if (readerState.darkMode) {
    overlay.classList.add('dark-mode');
  }
  
  wordDisplay = document.createElement('div');
  wordDisplay.id = 'word-reader-display';
  
  const progressContainer = document.createElement('div');
  progressContainer.id = 'word-reader-progress-container';
  
  progressBar = document.createElement('div');
  progressBar.id = 'word-reader-progress-bar';
  progressContainer.appendChild(progressBar);

  const closeButton = document.createElement('button');
  closeButton.id = 'word-reader-close';
  closeButton.textContent = 'X';
  closeButton.addEventListener('click', () => {
    stopReaderAndCleanUp(); // Call the new cleanup function
  });

  overlay.appendChild(wordDisplay);
  overlay.appendChild(progressContainer);
  overlay.appendChild(closeButton);
  document.body.appendChild(overlay);

  const style = document.createElement('style');
  style.textContent = `
    #word-reader-overlay {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background-color: rgba(251, 240, 217, 0.9);
      color: #5B4636;
      padding: 20px;
      padding-bottom: 30px; /* Add extra padding for progress bar */
      border-radius: 10px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      align-items: center;
      box-shadow: 0 0 20px rgba(0,0,0,0.5);
    }
    #word-reader-overlay.dark-mode {
      background-color: rgba(51, 51, 51, 0.95);
      color: #E0E0E0;
    }
    #word-reader-display {
      font-family: 'Courier New', monospace;
      font-size: 3em;
      margin-bottom: 10px;
      width: 400px;
      height: 100px;
      display: flex;
      justify-content: center;
      align-items: center; /* Vertical centering */
      text-align: center; /* Horizontal centering for text */
      white-space: nowrap; /* Ensure the word does not break */
      overflow: hidden; /* Hide overflowing parts that are not expanded */
    }
    #word-reader-display.expanded {
      width: auto;
    }
    #word-reader-progress-container {
      width: 100%;
      height: 5px;
      background-color: rgba(0, 0, 0, 0.1);
      border-radius: 2px;
      margin-top: 10px;
      overflow: hidden;
    }
    #word-reader-overlay.dark-mode #word-reader-progress-container {
      background-color: rgba(255, 255, 255, 0.1);
    }
    #word-reader-progress-bar {
      height: 100%;
      background-color: #5A7D9A;
      width: 0%;
      transition: width 0.1s linear;
    }
    #word-reader-close {
      position: absolute;
      top: 5px;
      right: 5px;
      background: none;
      border: none;
      color: #5B4636;
      font-size: 1.2em;
      cursor: pointer;
    }
    #word-reader-overlay.dark-mode #word-reader-close {
      color: #E0E0E0;
    }
  `;
  document.head.appendChild(style);
}

function showNextWord() {
  if (!readerState.isPlaying || readerState.currentIndex >= readerState.words.length) {
    readerState.isPlaying = false;
    return;
  }

  if (wordDisplay.classList.contains('expanded')) {
    wordDisplay.classList.remove('expanded');
  }

  const word = readerState.words[readerState.currentIndex];

  if (word === '_PARAGRAPH_END_') {
    readerState.currentIndex++;
    const delay = (60000 / readerState.wpm) * 1.5; // 1.5x delay for paragraph
    readerState.timerId = setTimeout(showNextWord, delay);
    return;
  }

  // Highlight the middle letter
  const wordLength = word.length;
  let middleIndex = Math.floor(wordLength / 2);
  if (wordLength % 2 === 0 && middleIndex > 0) { // For even length, pick the one closer to beginning
    middleIndex--;
  }

  const beforeMiddle = word.substring(0, middleIndex);
  const middleLetter = word.charAt(middleIndex);
  const afterMiddle = word.substring(middleIndex + 1);

  wordDisplay.innerHTML = `${beforeMiddle}<span style="color: #5A7D9A;">${middleLetter}</span>${afterMiddle}`;
  
  if (wordDisplay.scrollWidth > wordDisplay.clientWidth) {
    wordDisplay.classList.add('expanded');
  }

  // Update progress bar
  if (progressBar) {
    const progress = (readerState.currentIndex / readerState.words.length) * 100;
    progressBar.style.width = `${progress}%`;
  }

  readerState.currentIndex++;

  let delay = 60000 / readerState.wpm;
  if (word.endsWith('.') || word.endsWith('!') || word.endsWith('?')) {
    delay *= 1.25; // 25% longer for sentence end
  } else if (word.endsWith(',')) {
    delay *= 1.2; // 20% longer for comma
  }

  readerState.timerId = setTimeout(showNextWord, delay);
}

function isVisible(element) {
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
}
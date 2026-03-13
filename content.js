let readerState = {
  words: [],
  currentIndex: 0,
  wpm: 500,
  isPlaying: false,
  timerId: null,
  focusMode: true,
  darkMode: false,
  useWebpageFont: false,
  scrollWithText: false,
  inlineResumeIcon: false,
  pauseComma: false,
  pauseSentence: false,
  pauseParagraph: false,
  originalPageText: "",
};

let overlay = null;
let wordDisplay = null;
let focusOverlay = null;
let progressBar = null;

let targetScrollY = null;
let isSmoothScrolling = false;

function smoothScrollLoop() {
  if (!readerState.isPlaying || !readerState.scrollWithText || targetScrollY === null) {
    isSmoothScrolling = false;
    return;
  }
  
  const diff = targetScrollY - window.scrollY;
  if (Math.abs(diff) > 1) {
    window.scrollTo(0, window.scrollY + diff * 0.05);
    requestAnimationFrame(smoothScrollLoop);
  } else {
    isSmoothScrolling = false;
  }
}

// Initialize originalPageText and originalPageOffsets as soon as the content script loads
const { root: smartRoot, isFallback } = getReadableRootElement();
const { flatText, nodeOffsetMap } = getFilteredTextAndOffsets(smartRoot, isFallback);
readerState.originalPageText = flatText;
readerState.originalPageOffsets = nodeOffsetMap;

function removeResumeIcons() {
  const existingIcons = document.querySelectorAll('.speedr-resume-icon');
  existingIcons.forEach(icon => {
    const p = icon.parentNode;
    icon.remove();
    if (p) p.normalize();
  });
}

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
  const currentIndex = readerState.currentIndex;
  const totalWords = readerState.words.length;
  const targetIndex = currentIndex > 0 ? currentIndex - 1 : 0;
  const targetWordObj = readerState.words[targetIndex];
  const inlineResumeIcon = readerState.inlineResumeIcon;

  readerState.words = [];
  readerState.currentIndex = 0;
  targetScrollY = null;
  isSmoothScrolling = false;

  removeResumeIcons();

  if (inlineResumeIcon && currentIndex > 0 && currentIndex < totalWords && targetWordObj) {
    const globalOffset = typeof targetWordObj === 'object' ? targetWordObj.globalOffset : -1;
    if (globalOffset !== -1) {
      for (const [node, {start, end}] of readerState.originalPageOffsets.entries()) {
        if (globalOffset >= start && globalOffset < end) {
          try {
            const range = document.createRange();
            const nodeOffset = globalOffset - start;
            range.setStart(node, nodeOffset);
            range.setEnd(node, nodeOffset);
            
            const icon = document.createElement('span');
            icon.className = 'speedr-resume-icon';
            icon.title = 'Resume Speedr from here';
            icon.style.cssText = 'display: inline-flex; align-items: center; justify-content: center; background: rgb(251, 240, 217); border-radius: 3px; padding: 2px !important; margin: 0 4px !important; cursor: pointer; box-shadow: 0 1px 3px rgba(0,0,0,0.3); vertical-align: middle; line-height: 0 !important; box-sizing: content-box !important; height: 1.2em !important; width: 1.2em !important;';
            if (readerState.darkMode) {
              icon.style.background = '#D4B996';
            }
            
            const img = document.createElement('img');
            img.src = readerState.darkMode ? chrome.runtime.getURL('icons/150-dark.svg') : chrome.runtime.getURL('icons/150-light.svg');
            img.style.cssText = 'height: 100% !important; width: 100% !important; display: block !important; margin: 0 !important; padding: 0 !important; border: none !important; box-sizing: border-box !important; object-fit: contain !important;';
            icon.appendChild(img);
            
            const parent = node.parentNode;
            
            icon.addEventListener('click', async (e) => {
               e.preventDefault();
               e.stopPropagation();
               icon.remove();
               if (parent) parent.normalize();
               const settings = await getStoredSettings();
               const textToRead = readerState.originalPageText.substring(globalOffset);
               startReaderFromText(textToRead, settings, globalOffset);
            });
            
            range.insertNode(icon);
          } catch (e) {
             console.error("Speedr inline icon error:", e);
          }
          break;
        }
      }
    }
  }

  // Send update to popup to show play icon
  chrome.runtime.sendMessage({ action: 'stateUpdate', isPlaying: false });
}

// Helper to get filtered text and offsets
function getFilteredTextAndOffsets(rootElement, isFallback) {
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
  } else if (!readerState.isPlaying && readerState.words.length > 0 && overlay && overlay.style.display !== 'none') {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      seekForward();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      seekBackward();
    }
  }
});

function seekForward() {
  if (readerState.currentIndex < readerState.words.length) {
    // If we're paused, we just want to advance and show the word immediately
    // If the *current* word is shown and we want to go forward, 
    // the index is already ahead (since showNextWord increments it).
    // So if we just want to show the next word manually:
    showWordAtIndex(readerState.currentIndex);
    readerState.currentIndex++;
  }
}

function seekBackward() {
  if (readerState.currentIndex > 1) {
    // If current index is at the next word, we need to go back 2 steps to see the previous word
    readerState.currentIndex -= 2;
    showWordAtIndex(readerState.currentIndex);
    readerState.currentIndex++;
  } else if (readerState.currentIndex === 1) {
     readerState.currentIndex = 0;
     showWordAtIndex(readerState.currentIndex);
     readerState.currentIndex++;
  }
}

function showWordAtIndex(index) {
  if (index < 0 || index >= readerState.words.length) return;

  if (wordDisplay.classList.contains('expanded')) {
    wordDisplay.classList.remove('expanded');
  }

  const wordObj = readerState.words[index];
  const word = typeof wordObj === 'object' ? wordObj.word : wordObj;
  const globalOffset = typeof wordObj === 'object' ? wordObj.globalOffset : -1;

  if (word === '_PARAGRAPH_END_') {
    // Skip paragraph ends when seeking
    if (event.key === 'ArrowLeft' && index > 0) {
        readerState.currentIndex--;
        seekBackward();
    } else if (event.key === 'ArrowRight' && index < readerState.words.length - 1) {
        readerState.currentIndex++;
        seekForward();
    } else {
        wordDisplay.textContent = '';
    }
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

  wordDisplay.textContent = ''; // Clear previous content

  // Create text node for beforeMiddle
  const beforeSpan = document.createTextNode(beforeMiddle);
  wordDisplay.appendChild(beforeSpan);

  // Create span for middleLetter
  const middleSpan = document.createElement('span');
  middleSpan.style.color = '#5A7D9A';
  middleSpan.textContent = middleLetter;
  wordDisplay.appendChild(middleSpan);

  // Create text node for afterMiddle
  const afterSpan = document.createTextNode(afterMiddle);
  wordDisplay.appendChild(afterSpan);
  
  if (wordDisplay.scrollWidth > wordDisplay.clientWidth) {
    wordDisplay.classList.add('expanded');
  }

  // Update progress bar
  if (progressBar) {
    const progress = (index / readerState.words.length) * 100;
    progressBar.style.width = `${progress}%`;
  }
}

async function getStoredSettings() {
  const result = await chrome.storage.local.get(['wpm', 'focusMode', 'darkMode', 'useWebpageFont', 'scrollWithText', 'inlineResumeIcon', 'pauseComma', 'pauseSentence', 'pauseParagraph']);
  return {
    wpm: result.wpm === undefined ? 500 : result.wpm,
    focusMode: result.focusMode === undefined ? true : result.focusMode,
    darkMode: result.darkMode === undefined ? false : result.darkMode,
    useWebpageFont: result.useWebpageFont === undefined ? false : result.useWebpageFont,
    scrollWithText: result.scrollWithText === undefined ? false : result.scrollWithText,
    inlineResumeIcon: result.inlineResumeIcon === undefined ? false : result.inlineResumeIcon,
    pauseComma: result.pauseComma === undefined ? false : result.pauseComma,
    pauseSentence: result.pauseSentence === undefined ? false : result.pauseSentence,
    pauseParagraph: result.pauseParagraph === undefined ? false : result.pauseParagraph,
  };
}

chrome.runtime.onMessage.addListener(async (message) => {
  if (message.action === 'playPause') {
    if (readerState.words.length === 0) {
      // If reader hasn't started, start from the beginning of the page.
      const settings = await getStoredSettings();
      startReaderFromText(readerState.originalPageText, settings);
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
    if (overlay) { // Only toggle if overlay is active
        toggleFocusOverlay(readerState.focusMode);
    }
  } else if (message.action === 'toggleDarkMode') {
    readerState.darkMode = message.darkMode;
    updateOverlayTheme(readerState.darkMode);
  } else if (message.action === 'toggleWebpageFont') {
    readerState.useWebpageFont = message.useWebpageFont;
    updateOverlayFont(readerState.useWebpageFont);
  } else if (message.action === 'toggleScrollWithText') {
    readerState.scrollWithText = message.scrollWithText;
  } else if (message.action === 'toggleInlineResumeIcon') {
    readerState.inlineResumeIcon = message.inlineResumeIcon;
  } else if (message.action === 'togglePauseComma') {
    readerState.pauseComma = message.value;
  } else if (message.action === 'togglePauseSentence') {
    readerState.pauseSentence = message.value;
  } else if (message.action === 'togglePauseParagraph') {
    readerState.pauseParagraph = message.value;
  } else if (message.action === 'startReadFromSelection') {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const { startIndex, endIndex } = mapSelectionToFlatText(selection, readerState.originalPageText, readerState.originalPageOffsets);
      if (startIndex !== -1) {
        const settings = await getStoredSettings();
        const textToRead = readerState.originalPageText.substring(startIndex);
        startReaderFromText(textToRead, settings, startIndex);
      }
    }
  } else if (message.action === 'startReadToSelection') {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const { startIndex, endIndex } = mapSelectionToFlatText(selection, readerState.originalPageText, readerState.originalPageOffsets);
      if (endIndex !== -1) {
        const settings = await getStoredSettings();
        const textToRead = readerState.originalPageText.substring(0, endIndex);
        startReaderFromText(textToRead, settings, 0);
      }
    }
  } else if (message.action === 'readSelection') {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const { startIndex, endIndex } = mapSelectionToFlatText(selection, readerState.originalPageText, readerState.originalPageOffsets);
      if (startIndex !== -1 && endIndex !== -1) {
        // Expand to word boundaries
        let expandedStart = startIndex;
        while (expandedStart > 0 && !/\s/.test(readerState.originalPageText[expandedStart - 1])) {
          expandedStart--;
        }
        let expandedEnd = endIndex;
        while (expandedEnd < readerState.originalPageText.length && !/\s/.test(readerState.originalPageText[expandedEnd])) {
          expandedEnd++;
        }
        
        const settings = await getStoredSettings();
        const textToRead = readerState.originalPageText.substring(expandedStart, expandedEnd);
        startReaderFromText(textToRead, settings, expandedStart);
      }
    }
  } else if (message.action === 'readWholePage') {
    const settings = await getStoredSettings();
    const textToRead = getSmartPageText();
    startReaderFromText(textToRead, settings);
  }
});

function getReadableRootElement() {
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
  return { root, isFallback };
}

function getSmartPageText() {
  const { root, isFallback } = getReadableRootElement();
  const { flatText } = getFilteredTextAndOffsets(root, isFallback);
  return flatText;
}


function startReaderFromText(text, options, textStartIndex = 0) {
  removeResumeIcons();

  if (readerState.isPlaying) {
    // If already playing, stop current reading first
    pauseReader();
  }

  readerState.focusMode = options.focusMode;
  readerState.wpm = options.wpm;
  readerState.darkMode = options.darkMode;
  readerState.useWebpageFont = options.useWebpageFont;
  readerState.scrollWithText = options.scrollWithText;
  readerState.inlineResumeIcon = options.inlineResumeIcon;
  readerState.pauseComma = options.pauseComma;
  readerState.pauseSentence = options.pauseSentence;
  readerState.pauseParagraph = options.pauseParagraph;

  readerState.words = [];
  const regex = /\S+/g;
  let match;
  let currentOffset = 0;
  while ((match = regex.exec(text)) !== null) {
    let word = match[0];
    const precedingSpace = text.substring(currentOffset, match.index);
    if (precedingSpace.match(/(\r\n|\n|\r){2,}/)) {
      readerState.words.push({ word: '_PARAGRAPH_END_', globalOffset: textStartIndex + match.index });
    }
    
    if (word.includes('/')) {
      const parts = word.split('/');
      for (let i = 0; i < parts.length; i++) {
        if (parts[i].length > 0) {
          readerState.words.push({ word: parts[i], globalOffset: textStartIndex + match.index });
        }
      }
    } else {
      readerState.words.push({ word: word, globalOffset: textStartIndex + match.index });
    }
    currentOffset = match.index + word.length;
  }
  
  readerState.currentIndex = 0;

  if (overlay) {
    // If overlay already exists, clear its content
    wordDisplay.textContent = ''; // Clear previous content
    overlay.style.display = 'flex'; // Ensure overlay is visible
    if (readerState.focusMode) {
      toggleFocusOverlay(true);
    }
    updateOverlayTheme(readerState.darkMode);
    updateOverlayFont(readerState.useWebpageFont);
  } else {
    // If overlay doesn't exist, create it
    createOverlay();
  }

  readerState.isPlaying = true;
  chrome.runtime.sendMessage({ action: 'stateUpdate', isPlaying: readerState.isPlaying });
  showNextWord();
}

function pauseReader() {
  readerState.isPlaying = false;
  if (readerState.timerId) {
    clearTimeout(readerState.timerId);
  }
  chrome.runtime.sendMessage({ action: 'stateUpdate', isPlaying: readerState.isPlaying });
}

function resumeReader() {
  if (readerState.words.length === 0) {
    return;
  }
  readerState.isPlaying = true;
  chrome.runtime.sendMessage({ action: 'stateUpdate', isPlaying: readerState.isPlaying });
  showNextWord();
}

function setWpm(wpm) {
  readerState.wpm = wpm;
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

function updateOverlayFont(useWebpageFont) {
  if (overlay) {
    if (useWebpageFont) {
      overlay.classList.add('use-webpage-font');
    } else {
      overlay.classList.remove('use-webpage-font');
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
  if (readerState.useWebpageFont) {
    overlay.classList.add('use-webpage-font');
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
    #word-reader-overlay.use-webpage-font #word-reader-display {
      font-family: inherit !important;
    }
    #word-reader-display {
      font-family: initial !important;
      font-size: 3em;
      margin-bottom: 10px;
      width: 800px;
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

  const wordObj = readerState.words[readerState.currentIndex];
  const word = typeof wordObj === 'object' ? wordObj.word : wordObj;
  const globalOffset = typeof wordObj === 'object' ? wordObj.globalOffset : -1;

  if (word === '_PARAGRAPH_END_') {
    readerState.currentIndex++;
    let delay = 60000 / readerState.wpm;
    if (readerState.pauseParagraph) {
      delay *= 1.75; // 1.75x delay for paragraph
    }
    wordDisplay.textContent = ''; // Clear display during paragraph pause
    readerState.timerId = setTimeout(showNextWord, delay);
    return;
  }

  // Handle scrolling
  if (readerState.scrollWithText && globalOffset !== -1) {
    for (const [node, {start, end}] of readerState.originalPageOffsets.entries()) {
      if (globalOffset >= start && globalOffset < end) {
        try {
          const range = document.createRange();
          const nodeStart = globalOffset - start;
          const nodeEnd = Math.min(node.textContent.length, nodeStart + word.length);
          range.setStart(node, nodeStart);
          range.setEnd(node, nodeEnd);
          const rect = range.getBoundingClientRect();
          if (rect.top !== 0 || rect.bottom !== 0) {
            const absoluteTop = window.scrollY + rect.top;
            targetScrollY = absoluteTop - window.innerHeight / 2;
            if (!isSmoothScrolling) {
              isSmoothScrolling = true;
              requestAnimationFrame(smoothScrollLoop);
            }
          }
        } catch (e) {
          console.error("Speedr scroll error:", e);
        }
        break;
      }
    }
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

  wordDisplay.textContent = ''; // Clear previous content

  // Create text node for beforeMiddle
  const beforeSpan = document.createTextNode(beforeMiddle);
  wordDisplay.appendChild(beforeSpan);

  // Create span for middleLetter
  const middleSpan = document.createElement('span');
  middleSpan.style.color = '#5A7D9A';
  middleSpan.textContent = middleLetter;
  wordDisplay.appendChild(middleSpan);

  // Create text node for afterMiddle
  const afterSpan = document.createTextNode(afterMiddle);
  wordDisplay.appendChild(afterSpan);
  
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
  if (readerState.pauseSentence && (word.endsWith('.') || word.endsWith('!') || word.endsWith('?'))) {
    delay *= 1.5; // 50% longer for sentence end
  } else if (readerState.pauseComma && word.endsWith(',')) {
    delay *= 1.5; // 50% longer for comma
  }

  readerState.timerId = setTimeout(showNextWord, delay);
}

function isVisible(element) {
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
}
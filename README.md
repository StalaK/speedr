# Speedr - Speed Read The Web

Speedr is a Firefox extension designed to enhance your focus and reading speed by displaying webpage text word by word in a customizable overlay.

## Features

*   **Word-by-word Display:** Reads text from any webpage, displaying one word at a time in a central overlay.
*   **Adjustable Reading Speed:** Customize your reading pace with a Words Per Minute (WPM) slider, ranging from 60 to 1200 WPM.
*   **Pause/Resume Functionality:** Control the reader's flow using play/pause functionality
*   **Focus Mode:** Enable a dark, distraction-free overlay over the entire page to help you concentrate solely on the word being displayed.
*   **Read to/from here:** Select any text on a webpage, and choose to read "Read to/from here" to start the word-by-word display from or to your exact selection.fonts.

## Usage

1.  **Navigate to a Webpage:** Go to any webpage you wish to read.
2.  **Open the Extension:** Click on the Speedr icon in your Firefox toolbar.
3.  **Adjust Settings (Optional):**
    *   Use the **"Words Per Minute" slider** to set your desired reading speed.
    *   Toggle the **"Focus Mode" checkbox** to enable/disable the full-page dark overlay.
4.  **Start/Pause/Resume Reading:**
    *   Click the **Play/Pause button** (▶/⏸) in the popup.
    *   Alternatively, press the **`Spacebar`** on your keyboard to toggle between play and pause states.
5.  **Read from/to Selection:**
    *   Select a piece of text on the webpage.
    *   Right-click on the selected text.
    *   Choose either **"Read from here"** to start reading from that point to the end of the page, or **"Read to here"** to read from the beginning of the page up to your selection.
6.  **Exit Reader:** Press the **`Escape` key** on your keyboard to close the reader overlay and stop reading at any time.

## Keyboard Shortcuts

These are the default keyboard shortcuts which can be customised in Firefox's extension shortcut settings

* **Read Full Page**: ALT + R
* **Read From Here**: Select text then CTRL + ALT + F
* **Read To Here**: Select text then CTRL + ALT + T

The following keyboard shortcuts are built into Speedr and cannot be customised.

* **Play/Pause**: Spacebar
* **Exit Speedr**: Escape

## Building from Source

To build the extension for both Chrome and Firefox:

1.  **Run the build script:**
    ```bash
    ./build.sh
    ```
    This will create two files in the project root:
    *   `speedr-chrome.zip`
    *   `speedr-firefox.zip`

## Installation

### Firefox

1.  Open Firefox and type `about:debugging` in the address bar.
2.  Click on **"This Firefox"** in the left sidebar.
3.  Click **"Load Temporary Add-on..."**.
4.  Select the `speedr-firefox.zip` file.

### Chrome

1.  Unzip `speedr-chrome.zip` into a folder (e.g., `speedr-chrome`).
2.  Open Chrome and navigate to `chrome://extensions`.
3.  Enable **"Developer mode"** in the top right corner.
4.  Click **"Load unpacked"**.
5.  Select the folder where you unzipped the extension.
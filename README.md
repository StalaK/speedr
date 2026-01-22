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

If you wish to build the extension package (`.zip` file) yourself from the source code:

1.  **Navigate to the project root:**
    ```bash
    cd /path/to/your/project/directory
    ```
2.  **Create the zip package:**
    ```bash
    zip -r speedr.zip . -x "*.git/*"
    ```
    This command will create `speedr.zip` containing all necessary files, excluding the `.git` directory.

3.  **Load in Firefox:**
    *   Open your Firefox browser.
    *   Type `about:debugging` in the address bar and press Enter.
    *   In the `about:debugging` page, click on **"This Firefox"** from the left-hand menu.
    *   Click the **"Load Temporary Add-on..."** button.
    *   Navigate to the directory where you have the `speedr.zip` file, and select it.

    The Speedr extension should now appear in your list of temporary add-ons and its icon will be visible in your list of extensions.

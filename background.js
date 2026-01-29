chrome.contextMenus.create({
  id: "read-from-here",
  title: "Read from here",
  contexts: ["selection"],
});

chrome.contextMenus.create({
  id: "read-to-here",
  title: "Read to here",
  contexts: ["selection"],
});

chrome.contextMenus.create({
  id: "read-whole-page",
  title: "Read whole page",
  contexts: ["page"], // Available on any part of the page, not just selection
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "read-from-here") {
    chrome.tabs.sendMessage(tab.id, {
      action: "startReadFromSelection",
    });
  } else if (info.menuItemId === "read-to-here") {
    chrome.tabs.sendMessage(tab.id, {
      action: "startReadToSelection",
    });
  } else if (info.menuItemId === "read-whole-page") {
    chrome.tabs.sendMessage(tab.id, {
      action: "readWholePage",
    });
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "read-whole-page") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "readWholePage",
        });
      }
    });
  } else if (command === "read-from-here") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "startReadFromSelection",
        });
      }
    });
  } else if (command === "read-to-here") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "startReadToSelection",
        });
      }
    });
  }
});

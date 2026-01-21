browser.contextMenus.create({
  id: "read-from-here",
  title: "Read from here",
  contexts: ["selection"],
});

browser.contextMenus.create({
  id: "read-to-here",
  title: "Read to here",
  contexts: ["selection"],
});

browser.contextMenus.create({
  id: "read-whole-page",
  title: "Read whole page",
  contexts: ["page"], // Available on any part of the page, not just selection
});

browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "read-from-here") {
    browser.tabs.sendMessage(tab.id, {
      action: "startReadFromSelection",
    });
  } else if (info.menuItemId === "read-to-here") {
    browser.tabs.sendMessage(tab.id, {
      action: "startReadToSelection",
    });
  } else if (info.menuItemId === "read-whole-page") {
    browser.tabs.sendMessage(tab.id, {
      action: "readWholePage",
    });
  }
});

browser.commands.onCommand.addListener((command) => {
  if (command === "read-whole-page") {
    browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        browser.tabs.sendMessage(tabs[0].id, {
          action: "readWholePage",
        });
      }
    });
  } else if (command === "read-from-here") {
    browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        browser.tabs.sendMessage(tabs[0].id, {
          action: "startReadFromSelection",
        });
      }
    });
  } else if (command === "read-to-here") {
    browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        browser.tabs.sendMessage(tabs[0].id, {
          action: "startReadToSelection",
        });
      }
    });
  }
});

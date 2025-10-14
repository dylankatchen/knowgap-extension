# AchieveUp Extension

A simple Chrome/Firefox web extension.

## Installation

#test

### Chrome/Edge
1. Open Chrome/Edge
2. Go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the `achieveup-extension` folder
6. The extension icon will appear in your toolbar

### Firefox
1. Open Firefox
2. Go to `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on"
4. Select the `manifest.json` file from the `achieveup-extension` folder
5. The extension will be loaded temporarily

## Usage

Click the extension icon in your browser toolbar to see "achieveup-extension" displayed.

## Files Structure

```
achieveup-extension/
├── manifest.json      # Extension configuration
├── popup.html         # Popup UI
├── popup.css          # Popup styles
└── README.md          # This file
```

## Note

Icons are referenced in the manifest but not required for basic functionality. If you want to add icons, create an `icons/` folder with icon16.png, icon48.png, and icon128.png files.

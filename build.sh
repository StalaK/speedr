#!/bin/bash

# Define output directory
DIST_DIR="dist"
CHROME_DIR="$DIST_DIR/chrome"
FIREFOX_DIR="$DIST_DIR/firefox"

# Clean up previous builds
rm -rf "$DIST_DIR"
rm -f speedr-chrome.zip speedr-firefox.zip

# Create directories
mkdir -p "$CHROME_DIR"
mkdir -p "$FIREFOX_DIR"

# Files to copy (common files)
# We can use rsync or cp. strict cp is safer for basic shell.
# Copying folders: icons, popup
cp -r icons "$CHROME_DIR/"
cp -r popup "$CHROME_DIR/"
cp background.js "$CHROME_DIR/"
cp content.js "$CHROME_DIR/"

cp -r icons "$FIREFOX_DIR/"
cp -r popup "$FIREFOX_DIR/"
cp background.js "$FIREFOX_DIR/"
cp content.js "$FIREFOX_DIR/"

# Copy specific manifests
cp manifest-chrome.json "$CHROME_DIR/manifest.json"
cp manifest-firefox.json "$FIREFOX_DIR/manifest.json"

# Create Zips
# Navigate into the directory to zip so the root of the zip is clean
cd "$CHROME_DIR"
zip -r ../../speedr-chrome.zip .
cd ../..

cd "$FIREFOX_DIR"
zip -r ../../speedr-firefox.zip .
cd ../..

# Cleanup dist folder (optional, keeping it for inspection might be nice, but user asked for zips)
rm -rf "$DIST_DIR"

echo "Build complete: speedr-chrome.zip and speedr-firefox.zip created."

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

# Copy shared files (popup, background, content)
cp -r popup "$CHROME_DIR/"
cp background.js "$CHROME_DIR/"
cp content.js "$CHROME_DIR/"

cp -r popup "$FIREFOX_DIR/"
cp background.js "$FIREFOX_DIR/"
cp content.js "$FIREFOX_DIR/"

# Copy Chrome-specific icons (PNGs for manifest, SVGs for popup)
mkdir -p "$CHROME_DIR/icons"
cp icons/48.png "$CHROME_DIR/icons/"
cp icons/96.png "$CHROME_DIR/icons/"
cp icons/150-light.svg "$CHROME_DIR/icons/"
cp icons/150-dark.svg "$CHROME_DIR/icons/"

# Copy Firefox-specific icons (SVGs for everything)
mkdir -p "$FIREFOX_DIR/icons"
cp icons/48.svg "$FIREFOX_DIR/icons/"
cp icons/96.svg "$FIREFOX_DIR/icons/"
cp icons/150-light.svg "$FIREFOX_DIR/icons/"
cp icons/150-dark.svg "$FIREFOX_DIR/icons/"

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
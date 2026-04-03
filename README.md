# Quartzy Product Parser

Chrome extension for capturing reagent and product details from supplier product pages and preparing them for Quartzy.

## Current supported vendors

- Thermo Fisher
- NEB
- Sigma-Aldrich / MilliporeSigma
- Active Motif
- Abcam
- Generic fallback for other product pages

## Install

### Option 1: Clone from GitHub

```bash
git clone git@github.com:cpflueger2016/Quartzy_Product_parser.git
cd Quartzy_Product_parser
```

### Option 2: Download a ZIP

1. Download the repository ZIP from GitHub.
2. Unzip it to a permanent folder on your computer.

Important:
- Keep the extension folder in a stable location.
- Do not delete or move it after loading it into Chrome.

## Load into Chrome

1. Open `chrome://extensions`
2. Turn on `Developer mode`
3. Click `Load unpacked`
4. Select the folder containing `manifest.json`

After loading, the extension should appear in Chrome as `Quartzy Capture Prototype`.

## Use

1. Open a supported vendor product page.
2. Click the extension icon to open the side panel.
3. Click `Refresh from page`.
4. Review the parsed fields before submitting to Quartzy.

For multi-size products:
- Use the product option dropdown in the side panel.
- On sites like Abcam, if the page price changes after selecting a different size, refresh again to capture the new price.

## Update

### If you cloned with git

From the project folder:

```bash
git pull
```

Then in Chrome:

1. Open `chrome://extensions`
2. Find `Quartzy Capture Prototype`
3. Click `Reload`

### If you installed from a ZIP

1. Download the new ZIP version.
2. Replace the old project folder with the new one.
3. Open `chrome://extensions`
4. Click `Reload` on the extension

If Chrome loses track of the folder after replacement:

1. Remove the old unpacked extension
2. Click `Load unpacked`
3. Select the updated folder again

## Versioning

The extension version is defined in `manifest.json`.

Current version:
- `0.5.1`

## Notes

- This extension is currently distributed as an unpacked Chrome extension.
- Everyone using it must enable Chrome Developer Mode.
- Chrome may show permission prompts when loading or reloading the extension.
- If parsing looks wrong on a product page, refresh once more after the page finishes updating dynamic content.

# pdf.fjtd.dev

A personal, browser-based PDF editor. PDFs, images, and passwords are processed locally in a Web Worker and are never uploaded to a processing server. Bundled libraries let the application run without external CDN requests.

The interface supports Japanese and English. Choose a language in the top-right menu; the preference is saved in your browser and shared with the source and license page. On your first visit, the interface follows your browser language.

## Features

- Reorder, combine, split, extract, rotate, duplicate, and delete pages.
- View pages at different zoom levels and navigate between them.
- Edit or delete existing horizontal text directly on the page. The original text is removed and the replacement is drawn with the selected font.
- Add text, including Japanese, and change its size, color, and font.
- Add comments, highlights, underlines, strikethroughs, rectangles, ellipses, and freehand drawings.
- Crop pages by changing the CropBox. Content outside the visible area remains in the file.
- Redact selected areas by removing text, images, and graphics. Saving creates a new PDF and removes unused objects instead of appending an incremental update.
- Export PDFs to PNG, JPEG, plain text, or HTML. Multiple images are packaged as a ZIP file.
- Export HTML with embedded page images to preserve appearance, or as readable text.
- Create PDFs from PNG and JPEG images.
- Add AES-256 password protection, or open a protected PDF with its password and save an unprotected copy.
- Undo up to 25 operations, with keyboard shortcuts for undo and redo.

## Run locally

No build step or package installation is required. From the repository directory, run:

```sh
python3 -m http.server 8765 --directory dist
```

Open [localhost:8765](http://localhost:8765) in your browser. Serve the files over HTTP rather than opening `index.html` directly. This server only serves static application files; it does not receive PDFs.

## Hosting

Serve `dist/` over HTTPS using your own web server configuration. No build step, application server, or database is required. PDFs are processed in the visitor's browser.

## Usage

1. Choose **Choose files** or drop PDFs and images onto the file area.
2. Use **Organize pages** to reorder pages. Choose **Edit** on a thumbnail or **Edit PDF** in the toolbar to edit the document.
3. Click a horizontal text line to place a cursor directly in its text. Press Enter to apply, Shift+Enter to insert a new line, or Escape to cancel. Use the nearby toolbar to change formatting. Changing pages, workspace tools, or interface language applies the current text edit.
4. Use **Comments & markup** for annotations. Drag on the page to create shapes, crop areas, or redactions.
5. Choose **Save PDF** in the top bar to save the current document. Use the page extraction controls to save selected or remaining pages separately.
6. Configure password protection under **Protect PDF**. To remove a password, open the protected PDF with its password, leave **Add a password to the saved PDF** unchecked, and save a new copy.

## Limitations

- This application does not offer full Acrobat feature parity or guarantee compatibility with every PDF.
- Text editing replaces individual lines using the selected font; it does not fully preserve the original font. Japanese text uses the bundled CJK font. Vertical text, rotated text, scanned text, and automatic paragraph reflow are not supported.
- Common annotations are retained, but preservation of forms, digital signatures, bookmarks, attachments, and other special structures is not guaranteed. Editing and saving a signed document invalidates its signatures.
- Redaction affects the selected area. It does not automatically find and remove matching information elsewhere in the document. Graphics intersecting an area may be removed in their entirety.
- Appearance-preserving HTML uses page images rather than reconstructing a semantic HTML document.
- Word, Excel, and PowerPoint conversion and OCR are not implemented.
- Closing or reloading the tab clears the workspace. Original files are not overwritten.
- The workspace supports up to 1,000 pages and 100 MB of source files in total. Images are limited to 25 megapixels. Image exports support up to 100 pages; appearance-preserving HTML supports up to 30 pages. The longest exported image edge is limited to 4,000 pixels, and export data size is also limited. Some devices may require smaller documents.

## Validation

The implementation has been checked for Japanese text replacement and deletion, saved annotations and drawings, text extraction after redaction, cropping rotated pages, password protection and removal, image import, image/text/HTML export, and mobile layouts. Language switching, persistence across pages and reloads, and retention of edited PDF content have also been checked.

Processing and interface responsiveness were checked with a synthetic 100-page text document and a synthetic 20-page image document in Chrome on the development Mac. Performance varies with the device and document.

## Source and licenses

Application code is licensed under **AGPL-3.0-or-later**. See [LICENSE](LICENSE). Sources are the `.mjs`, HTML, and CSS files in `dist/`. The source and license page links to this repository and its ZIP archive, including application files, required libraries, and license notices.

Bundled libraries:

| Library | Version | License | Purpose |
| --- | --- | --- | --- |
| MuPDF.js | 1.28.1 | AGPL-3.0-or-later | PDF processing and rendering |
| PDF-LIB | 1.17.1 | MIT | Sample document generation |
| JSZip | 3.10.1 | MIT | Image export archives |

MuPDF.js is bundled from its unmodified npm distribution. Its matching [upstream source, including submodules](https://github.com/ArtifexSoftware/mupdf/tree/1.28.1), and [WebAssembly build instructions](https://github.com/ArtifexSoftware/mupdf/blob/1.28.1/platform/wasm/BUILDING.md) are available upstream. Library license texts are included in `dist/vendor/`.

RevPDF code, images, branding, and UI assets have not been reused.

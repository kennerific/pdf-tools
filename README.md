# pdf-tools

Split a PDF into page ranges, entirely in the browser. Each range becomes its own PDF, downloaded together as a ZIP.

## Use

1. Drop or browse for a PDF.
2. Add ranges (e.g. 12–15, 15–37, 90–100). Labels are optional and become file names.
3. Click **Cut**.

Password-protected PDFs are not supported.

## Run locally

ES modules need a server:

```sh
python3 -m http.server
```

## Deploy

Settings → Pages → Deploy from branch → `main` / `root`.

## Dependencies

Vendored in `vendor/`, no build step:

- [pdf-lib](https://github.com/Hopding/pdf-lib) 1.17.1
- [fflate](https://github.com/101arrowz/fflate) 0.8.3

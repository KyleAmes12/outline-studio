# Outline Studio

A mobile-friendly image-to-outline web application, designed for laser engraving preparation.

## Features
- Upload JPG, PNG or WebP on iPhone or desktop.
- Remove photographic backgrounds using the open-source `@imgly/background-removal` model, directly in your browser (no API key or server upload).
- Trace black edges from the actual original subject, not generative redrawing.
- Tune detail, edge contrast and line thickness; optionally outline the silhouette.
- Export a transparent PNG suitable for subsequent cleanup and LaserGRBL imports.

## Install / deploy
1. Create a **new** GitHub repository (`outline-studio`).
2. Upload all the files in this project **except** `node_modules` and `dist`.
3. Import that repository into [Vercel](https://vercel.com/new).
4. Framework preset: **Vite**; build command: `npm run build`; output directory: `dist`.
5. Deploy. No environment variables or paid API needed.

## Local development
```sh
npm install
npm run dev
```

## Notes and limitations
- First use downloads a browser-based image segmentation model. Internet is required on first load and the model may be slow on older phones.
- Complex hair, intricate backgrounds, transparent objects and low-resolution photos can produce imperfect masking or lines; sliders help but can't guarantee perfect output for *every* image.
- Output is pixel-based PNG, not vector paths or a production-ready cutting file.
- For best results, use photos with a clearly differentiated subject and a clean, well-lit image.
- Large images are resized to a maximum of 2200 pixels on their longest side before edge conversion to reduce memory usage on phones.
# Mandala

A slow, procedural mandala that draws itself over fifteen minutes, rests, and is swept away.

```
npm install
npm run dev
```

Useful addresses while developing: `?d=2` for a two minute run, `?seed=amber-river-2201`, `?style=gilt`, `?form=palace`, `?t=600` to start partway.

## Video

```
node tools/render-video.mjs --seed amber-river-2201 --style gilt --form palace --out out/gilt.mp4
```

Defaults to 3840x2160 at 30fps for 15 minutes, with sound. Roughly 50 minutes to render and a couple of gigabytes.
Finished 30 second segments are kept in `out/<name>.work`, so running the same command again resumes an interrupted render.
Use `--from 600 --to 630` for a short test clip and `--no-audio` to skip the sound.
A thumbnail of the finished mandala is written next to the video.

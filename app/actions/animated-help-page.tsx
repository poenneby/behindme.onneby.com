import type { Handle } from 'remix/component'

import type { Identity } from '../data/users.ts'
import { ANIMATED_MIN_HEIGHT, ANIMATED_MIN_WIDTH } from '../images.ts'
import { routes } from '../routes.ts'
import { Document } from './document.tsx'

// Tested with ffmpeg 6 on a 5-second, 30 fps camera clip: 9 MB, or 18 MB as
// a seamless loop. hqdn3d removes camera noise, which otherwise changes
// every pixel in every frame and makes GIFs huge.
const FILTERS =
  'fps=12,hqdn3d=6:4:12:12,scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720'
const PALETTE = 'palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle'

const FFMPEG = `ffmpeg -i clip.mov -vf "${FILTERS},split[a][b];[a]${PALETTE}" -loop 0 background.gif`
const FFMPEG_LOOP = `ffmpeg -i clip.mov -filter_complex "${FILTERS},split[f][r];[r]reverse[r2];[f][r2]concat=n=2:v=1,split[a][b];[a]${PALETTE}" -loop 0 background.gif`

export function AnimatedHelpPage(handle: Handle<{ user: Identity | null }>) {
  return () => (
    <Document
      user={handle.props.user}
      title="Making an animated background"
      section="teams"
      share={{
        path: routes.animatedHelp.href(),
        description: 'How to turn a short clip of your office into an animated Teams background.',
      }}
    >
      <article class="prose">
        <div class="hero">
          <h1>Making an animated background</h1>
          <p>
            An animated background is a GIF that plays behind you in Teams. Behind Me uses your GIF
            exactly as you upload it, so how it looks and how big it is are up to you. Here’s how to
            make one that looks real and stays small.
          </p>
        </div>

        <h2>1. Film it</h2>
        <ul>
          <li>
            Film from where you sit, with your own camera, so it lines up with the room around you.
            On a Mac, Photo Booth records movie clips (choose the movie button at the bottom left).
            On Windows, use the Camera app’s video mode. Start recording, step out of view, and come
            back when you have enough.
          </li>
          <li>
            <strong>Put the camera down on something steady.</strong> If it shakes, every pixel
            changes in every frame and the GIF gets enormous.
          </li>
          <li>
            Film 5–10 seconds of gentle movement: light, a plant, a screen, people in the distance.
            Small movement looks real; big movement is distracting behind you.
          </li>
          <li>Hold it landscape. Teams backgrounds are 16:9.</li>
          <li>Keep confidential screens and whiteboards out of shot.</li>
          <li>
            For a seamless loop, film something that ends roughly where it started, or play it
            forward then backward (a “boomerang”). The ffmpeg command below can do that.
          </li>
        </ul>

        <h2>2. Turn it into a GIF</h2>
        <p>Aim for:</p>
        <ul>
          <li>
            <strong>1280×720</strong> (16:9). Smaller works too, down to {ANIMATED_MIN_WIDTH}×
            {ANIMATED_MIN_HEIGHT}.
          </li>
          <li>
            <strong>10–15 frames per second.</strong> Phones and Photo Booth record at 30; halving
            that halves the file and still looks smooth.
          </li>
          <li>
            <strong>Under 10 MB</strong> if you can. Smaller loads faster in Teams. Uploads here are
            capped at 25 MB.
          </li>
        </ul>

        <p>Free tools that do this:</p>

        <h3>ezgif.com, in your browser</h3>
        <p>
          Use{' '}
          <a href="https://ezgif.com/video-to-gif" rel="noopener">
            Video to GIF
          </a>{' '}
          to convert the clip, choosing a lower frame rate and size. Then use its crop tool to make
          it 16:9 and its{' '}
          <a href="https://ezgif.com/optimize" rel="noopener">
            optimiser
          </a>{' '}
          (lossy compression) to shrink it. Your video is uploaded to ezgif’s servers, so don’t use
          it for anything confidential.
        </p>

        <h3>Gifski, on a Mac</h3>
        <p>
          A free app from the{' '}
          <a href="https://apps.apple.com/app/gifski/id1351639930" rel="noopener">
            Mac App Store
          </a>
          . Drag the video in, then set the dimensions, frame rate and quality slider. Everything
          stays on your Mac.
        </p>

        <h3>ffmpeg, from the command line</h3>
        <p>
          Free on Windows, Mac and Linux (
          <a href="https://ffmpeg.org/download.html" rel="noopener">
            download
          </a>
          ). This turns <code>clip.mov</code> into a 1280×720, 12 fps GIF, with the camera noise
          smoothed out:
        </p>
        <pre>
          <code>{FFMPEG}</code>
        </pre>
        <p>The same, playing forward then backward for a seamless loop:</p>
        <pre>
          <code>{FFMPEG_LOOP}</code>
        </pre>
        <p>
          Still too big? Change <code>fps=12</code> to <code>fps=10</code>, or <code>1280:720</code>{' '}
          to <code>960:540</code> (in both places).
        </p>

        <h2>3. Share it</h2>
        <p>
          Upload it on <a href={routes.backgrounds.uploadForm.href()}>Share a background</a>. It’s
          stored and added to Teams exactly as you made it. The “Add to Teams” command saves it with
          a <code>.png</code> extension, which is how Teams plays animated backgrounds.
        </p>
      </article>
    </Document>
  )
}

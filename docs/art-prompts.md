# Art prompts for Gemini — CAPCOM crew & zombie expressions

Paste one prompt per message into Gemini (gemini.google.com, image generation).
Do the **base zombie first**; then for each expression say "same character as before" so the face,
suit and colours stay consistent. Same for the five CAPCOM crew: generate Lee first, then use
"same art style as the cat portrait" for the others.

Save as PNG with the exact filenames in `public/assets/README.md`.

---

## Shared style block (paste at the start of every prompt)

> 2.5D cel-shaded vector cartoon for a casual mobile game, slapstick and goofy, family friendly.
> Thick, uniform dark navy outlines (#1b2230) around every shape. Flat colour fills with exactly
> one hard-edged shadow band per shape (no gradients, no soft airbrushing), and one small white
> highlight on round surfaces. Chunky, rounded, bouncy proportions — big head, small body.
> Bright saturated palette. Clean silhouette that still reads at 64 pixels.
> Centered bust portrait, front-facing, slight 3/4 turn. Plain flat light grey background (#eef1f5),
> nothing else in the background. No text, no letters, no watermark, no frame. Square image.

---

## Zombie (original design — goofy, not scary, no blood: any goo is lime-green slime)

### 0 · Base character (generate first)
> [style block] A short, chubby cartoon zombie test-dummy with a big round head and pale
> mint-green skin. One droopy half-closed eye and one big round eye with a tiny pupil.
> A wide stitched-up grin with two crooked buck teeth. A single tuft of messy dark hair
> sticking up. Wearing a slightly-too-small light blue mechanic's jumpsuit with a few patches,
> and bright orange seat-belt harness straps over both shoulders. Arms raised forward in the
> classic zombie reach. Expression: mildly bored, unimpressed. Lovable, silly, harmless.

### 1 · `zombie_idle.png` — 1 g, waiting
> [style block] Same zombie character as before, sitting strapped into a wooden chair with the
> orange harness, looking bored and unimpressed, one eye half-closed, blowing a small lime-green
> bubble-gum bubble. Relaxed slouched posture.

### 2 · `zombie_zero_g.png` — weightless, confused
> [style block] Same zombie character, floating up out of the orange harness straps in zero
> gravity, arms and legs splayed like a starfish, both eyes wide and confused, mouth an "o".
> Two cartoon question marks above the head. Three small cute pink worms drifting out of one ear,
> waving. A single loose tooth floating nearby. Hair tuft floating straight up.

### 3 · `zombie_high_g.png` — squished
> [style block] Same zombie character pressed flat by extreme g-force: the whole face squashed
> wide and short like a pancake, cheeks dragged down and back, eyes squeezed into lines,
> mouth stretched into a huge straining grimace showing both buck teeth, hair tuft flattened
> backwards. Horizontal speed lines behind the head. Comedic, rubbery, not painful.

### 4 · `zombie_spinning.png` — dizzy, tumbling
> [style block] Same zombie character, extremely dizzy: both eyes are black-and-white hypnotic
> spirals, face tinted an even sicklier green, tongue hanging out of one side, head tilted.
> A ring of small yellow cartoon stars and two tiny birds circling the head. Slight motion blur
> lines suggesting spinning.

### 5 · `zombie_reentry.png` — on fire, extra crispy
> [style block] Same zombie character after a hot re-entry: skin charred to a crispy dark brown
> like overcooked toast, jumpsuit scorched and smoking, the hair tuft burning with a small
> cartoon flame. Eyes blinking bright white out of the soot, little puffs of grey smoke rising.
> Giving a shaky thumbs-up. Funny and harmless, like a cartoon character after an explosion.

### 6 · `zombie_pieces.png` — optional, nothing left in the seat
> [style block] An empty pair of orange harness straps over a wooden seat, with a puddle of
> lime-green slime on the seat and one small cartoon zombie hand poking out of the slime,
> waving goodbye. Silly, not gory.

---

## CAPCOM crew (Mission Control) — headset portraits, same style block

### `capcom_lee_cat.png` — Lee, Flight Director
> [style block] Lee, a confident brown Thai Siamese cat (warm chocolate-brown coat with darker
> brown points on the ears and face, bright sky-blue eyes), wearing a mission-control headset
> with a boom microphone and a navy flight-director vest with a small rocket pin. Calm,
> in-charge expression, one eyebrow raised, holding a clipboard. Friendly and cool.

### `capcom_owl_professor.png` — Prof. Owl, Flight Dynamics
> [style block] An elderly brown-and-cream owl professor with big round wire glasses, a
> tweed jacket and a red bow tie, wearing a mission-control headset. A piece of chalk in one
> wing and a little chalk dust on the feathers. Eyebrows raised mid-explanation, wise and
> slightly smug.

### `capcom_tortoise_clerk.png` — Tortoise Clerk, Range Safety & Paperwork
> [style block] A very old, very slow tortoise clerk with tiny half-moon reading glasses and a
> green accountant's visor cap, wearing a mission-control headset. Holding a big red rubber
> stamp over a tall stack of forms. Deadpan, unbothered, bureaucratic expression.

### `capcom_capybara.png` — Capybara, Recovery & Zombie Wellness
> [style block] A serene capybara with a small folded towel on its head and a bright orange
> hi-vis recovery vest, wearing a mission-control headset. Holding a mop and a bucket.
> Completely calm, eyes half-closed, peaceful little smile. The most relaxed creature alive.

### `capcom_otter.png` — Otter, Booster Engineer
> [style block] An excitable river otter engineer with safety goggles pushed up on the
> forehead, a grease smudge on one cheek and a big wrench, wearing a mission-control headset
> and blue overalls. Sparkly wide eyes, huge open-mouthed grin, whiskers bristling with
> excitement.

---

## After generating
- Gemini usually can't give a transparent background — that's why the prompts ask for flat
  light grey. Send the PNGs back to Claude: it can cut out the background, crop to the
  portrait frame, resize (512×512 crew, 512×560 zombie) and drop them into `public/assets/`.
- If a face drifts between expressions, reply "keep exactly the same face, suit and colours as
  the first image" and regenerate only that one.

---

## Sprint E — Slapstick & cartoon gore (v0.14)

Same shared style block, but **transparent or plain flat background** as noted. Gore rule: *no red
anywhere on the zombie* — only white cartoon bone and lime-green slime (#7bd34a, darker #4f9a2a).

### `zombie_jarred.png` — compressed into a jar (state `'jarred'`, 18 g+ spike)
> [style block] Same zombie character as before, but squashed and compressed to fit inside a small
> clear glass mason jar, like a pickled specimen. The jar is upright and centred, with a chunky
> red screw-top lid with vertical grip ridges, and a cream paper label on the front with a hand-drawn
> zombie face doodle (no letters). Inside: the zombie's mint-green body folded and squished
> into a dense lump filling the jar, a scrap of its light blue jumpsuit and one orange harness strap
> pressed flat against the glass, one small hand flattened palm-out against the inside of the glass.
> Its two eyes are pressed right up against the front of the glass and flattened into wide ovals —
> one big round eye, one droopy half-closed eye, both looking straight at the viewer, still blinking,
> deadpan unimpressed expression. Smears of lime-green slime on the inside of the glass, one slow
> drip running down. Two crisp white glass highlights (a long vertical streak and a small dot) on
> the left side of the jar. Comedic, harmless, cute-gross, absolutely no blood. Plain flat light grey
> background (#eef1f5). No text. Square image.

### `capybara_mop_walk.png` — the Palate Cleanser (walking sprite, faces right)
> [style block] Full-body side view of the same Capybara character from Mission Control, walking
> to the right in a calm, unhurried stride, one foot forward. Completely serene, eyes peacefully
> half-closed, tiny content smile, totally unbothered. Wearing a bright orange hi-vis safety vest with
> silver reflective stripes, a small white cleaning cap, and the CAPCOM headset around its neck.
> Holding a long wooden mop in both front paws, angled forward and up toward the upper right of the
> frame; the mop head is a big shaggy bundle of off-white cotton strands with a few streaks of
> lime-green slime, mid-swing. A small blue bucket hangs from one arm, a little green slime
> sloshing at the rim. Gentle motion lines behind its feet. Full figure visible head to toe with the
> whole mop inside the frame. Transparent background (or plain flat white if transparency is
> unavailable). No text. Portrait image, 3:4.

> Tip: generate this one **without** a background so it can walk over the game; the game also draws
> its own mop if the sprite has none, so a "holding nothing, paws forward" version works too.

### `fx_bone_stub.png` — comedic exposed bone stub with green slime (limb-loss overlay)
> [style block] A single small cartoon prop isolated on a transparent background: the stump of a
> cartoon zombie limb seen from the side. A short, perfectly clean, bright white cartoon bone sticks
> straight out to the right, with the classic double-knob "dog bone" end and one thin pale-cream
> shading band along its length. At the left end, where it would join the body, a ragged collar of
> mint-green zombie skin and a torn scrap of light-blue jumpsuit sleeve, ringed with a glossy
> blob of lime-green slime (#7bd34a) and a single fat slime drip hanging straight down. Thick navy
> outlines, one hard shadow band, one white highlight on the bone knob and one on the slime. Cute,
> silly, PG-13, absolutely no red and no blood — only white bone and green slime. Centered, lots of
> empty space around it. Transparent background. No text. Square image.

> In the game the stub is rotated to point the way the lost limb pointed and scaled to the limb's
> width, with the bone pointing **up** in the image (the code rotates by angle − 90°). If your result
> points right, rotate it 90° counter-clockwise before saving.

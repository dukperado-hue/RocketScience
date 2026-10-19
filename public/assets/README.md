# Art assets (v0.12)

The art was made by the project owner with Gemini. Backgrounds were removed and the character sheets cropped with `scripts`-style processing: flood-fill matte, a soft 2 px edge with colour decontamination, and holes inside shapes removed.

Every image is optional. When a file is missing, the game draws its vector fallback.

| Folder | What | Used by |
|---|---|---|
| `zombie/zombie_{idle,zero_g,high_g,spinning,reentry,pieces}.png` | live zombie mood portraits (transparent) | Launch HUD (`zombieMood.ts`). The fat and brittle builds are reshaped in CSS. |
| `zombie/zombie_standing.png` | standing zombie | Factory › Test payloads cards |
| `zombie/zombie_jarred.png` | zombie compressed in a jar | seat + HUD portrait when `state === 'jarred'`; vector jar until then |
| `zombie/fx_bone_stub.png` | bone stub with slime, bone pointing up | drawn at each missing limb's socket; vector stub until then |
| `capcom/capybara_mop_walk.png` | serene capybara walking right with a mop | Palate Cleanser; falls back to `capcom_capybara_full.png` + a drawn mop |
| `capcom/capcom_<crew>.png` (v0.15: Lee, Owl, Tortoise, Otter replaced by the matching-style busts; `capcom_capybara_cartoon*.png` spare) | 256 px square avatars | CAPCOM box, Story room |
| `capcom/capcom_<crew>_full.png` | full transparent portraits | spare, for cut-ins |
| `capcom/capcom_duck_{happy,sad,serious}.png` | Aero-Duck expressions | CAPCOM, picked by event (`faceFor`) |
| `capcom/capcom_capybara_3d.png` + `capcom/capcom_capybara_{laughing,nervous,exhausted,dizzy,angry,starry}.png` | Capybara expressions (3D style) | CAPCOM: happy, serious, sad, dizzy (tumbles), angry (shredded chute); `starry` spare |
| `story/wanhu_take{1,2,3}.{webm,mp4,jpg}` | the three Wan Hu chair cutscenes (WebM VP9 first, H.264 fallback, poster) | Story room; auto-plays after a Wan Hu chair flight ends badly (toggle in Story) |
| `story/*.jpg` | prologue, aftermath, Bang Fai procession, Hangar 4 crew | prologue card, summary banners, milestone card |
| `library/pixel/` | pixel-art sheets sliced per pose: Jiangshi (hopping), Naga lady, candle dancer, Thai ghost poses, each with a black-robe variant | not wired yet — role to be decided |
| `site/spirit_house{,_reach,_offering}.png` | san phra phum beside the pad: calm → hand reaching out after a crash → red-soda offering after a good flight | Launch view |
| `library/other/` | frightened civilian, gunmen, woman in suit (expression sheets), 3D capybara turnaround | kept for later — people who panic when the zombies arrive |
| `library/` | not wired yet: Captain Kiko sheet and faces, LYRA cat astronaut, Otter press reporter, Capybara engineer, detective Capybara, the user's own cutouts | future: crewed missions, press/newsroom, alternate crew |

Note: the videos carry the generator's ✦ watermark in the corner.

3D models for payloads go in `../models/` (`zomsat.glb`, `satellite.glb`, `hubble.glb`).

# StyleARZ Facebook redesign — apply checklist

Brand match for [stylearz.com](https://stylearz.com): black + orange `#FF6600`, tagline *your personal fashion statement*, Grade A export casuals (Men · Women · Children), store in Radhanagar, Pabna.

**Do not paste passwords into chat.** Change the password if it was shared, and manage the page while logged in yourself (or Meta Business Suite).

---

## 0. Critical: use a **Page**, not a personal profile

`facebook.com/STYLEARZ` currently behaves like a **personal profile** (“Friends”, Work / University).  
A fashion store needs a **Facebook Page** (Business / Creator) so you get:

- Call-to-action button → Website  
- Address, phone, hours, WhatsApp  
- Shop / Services tabs  
- Ads & Insights  
- Reviews

**Do this first**

1. Create a Page named **STYLEARZ** (or convert the profile via Meta’s “Create a Page” / professional mode if offered).  
2. Claim username `@STYLEARZ` if available.  
3. Category: **Clothing (Brand)** or **Women's Clothing Store** / **Men's Clothing Store**.  
4. Link the Page to Meta Business Suite.

---

## 1. Identity (upload from `out/`)

| Asset | File | Notes |
|-------|------|--------|
| Profile picture | `avatar-1080.jpg` (or `avatar-400.jpg`) | Black field, STYLE**ARZ** lockup |
| Cover photo | `cover-1640x924.jpg` | Desktop-safe; left brand panel + opening |
| Fallback cover | `cover-820x312.jpg` | Older crop |

After upload, check cover on phone: avatar must not cover the logo or “GRAND OPENING”.

---

## 2. Page name & short description

**Name:** STYLEARZ  

**Username:** @STYLEARZ  

**Short description (≤100 chars):**  
`your personal fashion statement · Grade A export casuals · Pabna`

**About / bio (paste):**

> STYLEARZ — your personal fashion statement.  
> Bangladesh Grade A export casuals for everyday wear — Men, Women, and Children. Shop online, then build outfits in Style Studio (mix & match, colour match, build on a budget). Lookbook, Quiz, Planner, and Wardrobe on stylearz.com.  
> Store: College Road, Radhanagar, Pabna.  
> Inauguration: 27 November.

**Website:** https://stylearz.com/  

**Phone:** +880 1612-225916  

**Email:** (store email you prefer — not shared passwords)

**Address:** College Road, Radhanagar, Pabna, Bangladesh  

**Hours:** set real opening hours before 27 Nov  

---

## 3. Action button (CTA)

Primary CTA: **Shop Now** → `https://stylearz.com/`  

Optional secondary (if available): **Call** or **WhatsApp** → +880 1612-225916  

---

## 4. Tabs & features (mirror the website)

Pin / enable what Meta allows:

| Website | Facebook |
|---------|----------|
| Shop | Shop Now CTA + product posts / catalog |
| Lookbook | Album “Lookbook” + `post-lookbook.jpg` |
| Studio | Feature posts + link to `/studio` |
| Quiz / Planner / Wardrobe | Link posts to those routes |
| Community | Page posts + Groups if you create one |
| Grand Opening | Pin `post-grand-opening.jpg` until after 27 Nov |

**Suggested story highlights** (icons in `out/highlight-*.jpg`):  
Shop · Studio · Lookbook · Opening · Pabna  

---

## 5. Visual system (keep every post on-brand)

| Token | Value |
|-------|--------|
| Orange | `#FF6600` |
| Ink | `#0A0A0A` |
| Paper | `#F3F3F1` |
| Wordmark | STYLE in white/paper, **ARZ** in orange |
| Tagline | lowercase italic: *your personal fashion statement* |
| Photos | Real store / winter rails (prefer `winter-images/`) |

Avoid purple gradients, cream+terracotta, or generic stock “sale” templates.

---

## 6. First week posts (files ready)

| Order | File | Caption focus |
|-------|------|----------------|
| 1 (pin) | `post-grand-opening.jpg` | 27 Nov opening + tiers |
| 2 | `post-shop.jpg` | Export-floor casuals |
| 3 | `post-studio.jpg` | Mix & match / colour / budget |
| 4 | `post-lookbook.jpg` | Ways to wear |
| 5 | `post-features.jpg` | Full site map of features |
| Stories | `story-grand-opening-1080x1920.jpg` | Opening offer |

Full captions: see `POSTS.md`.

---

## 7. Rebuild assets

```bash
cd marketing/fb-page
../fb-demo/.venv/bin/python build_assets.py
```

Output lands in `out/`.

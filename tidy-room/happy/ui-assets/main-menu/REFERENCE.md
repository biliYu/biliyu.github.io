# Main menu reference skin

`reference-v3.png` is an unchanged copy of the approved 768 × 1376 image
`codex-clipboard-2680e77e-da47-4cc0-93a0-51966799798f.png`.

`../../main-menu-art.js` now uses this image as a UI atlas. Resource bars, logo,
level button and navigation are clipped away from the former scene background.
The eye-level room is a separate generated illustration; see `ILLUSTRATION.md`.
Source coordinates and dynamic value patches live in that module; layout and
value visibility are in `../../main-menu.css`.

Coins, lives, recovery time and level remain bound to saved player data. Initial
values 600 / 5 / level 1 retain the exact approved glyphs; changed values render
over clean local background samples. Native DOM buttons keep real navigation and
keyboard access. The default interface is Simplified Chinese, with explicit
`?lang=en` still supported.

The former reference-only skin verification at 768 × 1376 compared 1,011,508 pixels outside the two edited
146 × 155 corner regions: zero differing RGB pixels. Also checked 430 × 932,
320 × 568, 360 × 800, 768 × 1024 and 896 × 414 layouts, saved-state values, entry
to a room, life gating, bottom navigation and returning to the menu.

Layout uses the full artwork height inside the CSS safe-area insets. It must not
scale up to fill a shorter portrait window's width, because the artwork also
contains the bottom captions. Regression checks include 550 × 949, 560 × 949,
desktop's 550-pixel game container, dynamic resizing and simulated safe-area
padding; caption bottoms must fit within the usable bounds, not just remain
clickable at their centres.

The outer menu container now limits its width using that same artwork aspect and
available height, preventing solid side strips. Artwork sizing reads fractional
element bounds to avoid rounding seams. A host ResizeObserver updates the game
canvas when switching between the fitted menu and the gameplay container.
Verified side coverage and complete captions at 1920 × 954, fractional 125% DPR,
safe-area insets, and the earlier portrait/window cases; the canonical approved
UI dimensions and placement remain tied to that reference frame. The current
illustration version verifies 32,852 protected UI interior pixels against the
approved atlas, with zero differences; the room background intentionally differs.

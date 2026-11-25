# Eye-level messy reading room

- Runtime asset: `eye-level-messy-room-v3.png`, exactly **1274 × 1920**.
- Generated with the built-in `image_gen.imagegen` tool.
- Final prompt: `Project/art-source/main-menu-eye-level-v3/prompt.txt`.
- Camera/poses and structural guide: `Project/art-source/main-menu-eye-level-v3/`.
- Original generation, export mapping and validation record are saved there too.

The user requested a frontal human-eye room view, overriding the gameplay's
orthographic camera for this main-menu illustration only. The final composition
uses a central curtained window, left sofa, middle coffee table, right drawer
cabinet, shoe bench, storage basket, slippers, shirt, magazines and toy clutter.
The artist-studio easel/brush/jar composition from the reference is not reused.

The AI-rendered source is exported with a uniform scale and a sub-pixel horizontal
crop to 1274 × 1920. Runtime SVG uses a further uniform centre crop into the
existing 768 × 1376 UI frame: scale 1376/1920 and horizontal offset -72.5167 px.
No nonuniform scaling or PNG rotation substitutes for the scene camera.

Native controls retain the original UI atlas. Clip paths remove old room pixels
around them; a logo matte removes the old blue window fringe. Real coins, lives,
recovery time and level continue to use saved player data. Existing menu size,
safe-area handling and gameplay transitions are preserved.

Validation includes visual eye-level/support/occlusion review, exact exported
dimensions, protected UI pixel comparisons, desktop and phone layouts, no side
gaps, complete footer text, live values, navigation and room entry/return.

The primary button uses a measured painted-outline path rather than a generic
rounded rectangle. This removes the former room's pale fringe while preserving
its text, highlight and bevel. The measured source outline is recorded in
`Project/art-source/main-menu-eye-level-v3/play-button-outline.json`.

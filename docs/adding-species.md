# Adding flowers, trees, mushrooms, birds, insects, fish and animals

The world is built to keep growing. One species is one line in `src/garden/species.js`:

```js
['Name', 'Latin name', kind, habitat, rarity, colour, colour2, form, size],
```

- **Only ever add at the end of `ROWS`.** A species' id is its place in the list, and every saved garden,
  pouch and map row points at that id. Never reorder, rename the Latin name, or delete a line.
  `tests/growth.test.mjs` fails if an existing id moves (`tests/species-ids.json` is the frozen list).
- `kind`: `flower`, `tree`, `mushroom`, `bird`, `insect`, `fish` or `animal`.
- `habitat`: `dune` (dry sand), `bank` (beside water) or `ridge` (high ground). Fish are always `bank`.
- `rarity`: 1 common to 4 legendary. Rarer kinds reach players at higher levels.
- `form`: how it is drawn, one of `FORMS[kind]` at the bottom of `species.js`. A new form needs its
  drawing (`src/garden/paint.js` for plants, `src/garden/fauna.js` for wildlife) and its name in `FORMS`.
- Colours are `#rrggbb`; size is relative (about 0.3 to 3).

Then run `node --test tests/*.test.mjs` and refresh the game. Nothing else is needed: the herbarium, the
inventory, seed clouds, the sprite atlas, the map and the rooms all read the list. Existing species keep
their pictures when new ones are added.

**Room to grow:** ids travel in 16 bits (65,533 species), and the plant sprite atlas grows from 32 to 64
cells a row as plants are added (up to 4,096 flowers, trees and mushrooms). Past 4,096 plants the atlas must
be split in two; the test says so before it happens.

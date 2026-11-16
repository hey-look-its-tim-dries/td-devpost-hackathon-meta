# Submission checklist (deadline 18 November 2026, 12:00 PST = 21:00 in Belgium)

Everything that is done, and the few steps only Tim can do.

## Done

- [x] Game live at https://hey-look-its-tim-dries.github.io/td-devpost-hackathon-meta/ (the submission URL)
- [x] Demo video recorded: `media/palm-whorl-cities-pitch.mp4` (2:33, Quest 3 emulator, narration + music)
- [x] Devpost copy, paste-ready: `docs/devpost.md`
- [x] README with gallery and video slot
- [x] Manual: `docs/manual/palm-whorl-cities-manual.pdf` (17 pages, Veo slot on the cover)
- [x] Pitch deck: `docs/deck/palm-whorl-cities-pitch.pptx` + PDF (Veo slots on cover and closing)
- [x] Repo public, description, homepage and topics set
- [x] Security pass on the live site and the server

## Tim, in order

1. **Veo artwork** (tomorrow). Save the images as:
   - `docs/manual/art-cover.jpg` then re-render the manual:
     `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --no-pdf-header-footer --print-to-pdf=docs/manual/palm-whorl-cities-manual.pdf file://$PWD/docs/manual/manual.html`
   - the deck's paths are constants at the top of `tools/deck.py`; drop the files in and run `python3 tools/deck.py`
   - Devpost gallery: upload the Veo cover plus the shots listed at the end of `docs/devpost.md`
2. **Upload the video** to YouTube (unlisted is fine for judging). Then:
   - paste the link in the Devpost form,
   - replace `VIDEO_ID` in `README.md` and `VIDEO LINK` in `docs/devpost.md`.
3. **Fill the Devpost form** from `docs/devpost.md`, top to bottom (tagline, story, hand interactions,
   Built With, links, track Gaming / New division, launch date).
4. **Check on the form** the exact names of the bonus categories before ticking them.
5. **Submit before 12:00 PST.** Devpost locks late entries; aim for hours early.

## Worth doing if there is time

- One real-Quest session: cold start, hand reading in your own room (passthrough now keeps the room),
  frame rate, the one-bus-stop test (the rules grade these).
- A second pair of hands on the live site, to be seen meeting a player in the lobby.

# Facebook demo pack — Thingkers Intelligence

POS + Inventory first; Thingkers Intelligence as solution provider at the end.

- **Provider:** Thingkers Intelligence · https://thingkers.com/ · WhatsApp +8801916642465  
- **Offer:** ৳20,010 (domain + 1y hosting + POS + inventory), pay in 3 months  
- **Audio:** instrumental hip-hop bed (no voice) · text captions only  

## Rebuild

```bash
cd marketing/fb-demo
# stills-based (screenshots)
.venv/bin/python build_video.py

# OR short clips from posInventory.mov (faces + 2:31–2:41 removed, fitted to sequence)
.venv/bin/python cut_screen_record.py          # once → out/posInventory-clean.mp4
.venv/bin/python build_screencap_steps.py       # → out/thingkers-pos-inventory-{en,bn}.mp4
```

Output: `out/thingkers-pos-inventory-en.mp4` / `…-bn.mp4` (~1:40, text captions + hip-hop)

# Web3 — Rain Court

Pages configuration: Framework None / Build command `exit 0` / Build output directory `web3`.

The repository contains ready-to-serve static files. No build step, npm install or external CDN is required. The deployed index is `/`, and variants are `/medium/`, `/high/`, `/xhigh/`, `/ultra/`. All navigation is relative so it also works under a local `/web3/` prefix.

`prompts/user-request.md` records the user request. `prompts/common.md` records the common production brief. `prompts/reference.png` is the provided visual reference, not an instruction source.

Current task owns medium and the portal. Three separately created tasks use high, xhigh and ultra reasoning respectively. The current task cannot change its own reasoning setting through available tools; medium is the user-requested output label, not an independently measured reasoning setting. No quality ranking is inferred from the labels.

Serve locally with `node serve.mjs`, then open http://127.0.0.1:4178/ .


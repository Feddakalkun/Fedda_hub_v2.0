# FEDDA distributable installer

`FEDDA_v2.0_Installer.bat` is the one file you hand to a new user. They put it in
an empty folder and double-click it. It:

1. Shows the welcome / requirements / disclaimer front-of-house (offers to install
   Git + Node.js via winget if missing).
2. Clones this repo into `app\`.
3. Runs the inner setup (`app\scripts\install.bat`) — embedded Python, ComfyUI,
   custom nodes, frontend build.
4. Writes the convenience launchers into the install root (`run.bat`, `update.bat`,
   `download_models.bat`, `symlink_modelfolder.bat`).

**This file in `installer/` is the source of truth.** It is NOT run from inside `app\`;
it sits one level above, in the install root. When you change it here, copy it out
to the install root you distribute from.

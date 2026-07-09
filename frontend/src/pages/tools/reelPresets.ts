/**
 * Shared reel presets — used by Transform Reel and Reel Machine.
 * Outfits are written photographically (real fabrics, fit, light) so edits read
 * as real photos; transitions are music-video moves, not soft glow morphs.
 */

export interface ReelPreset {
  label: string;
  prompt: string;
}

export const CHARACTER_PRESETS: ReelPreset[] = [
  { label: 'Red Latex', prompt: 'a skin-tight glossy red latex mini dress that hugs every curve, deep neckline, the latex catching real specular highlights from the scene lighting, black stiletto heels, smoky evening makeup, hair styled loose' },
  { label: 'Lingerie', prompt: 'a black lace lingerie set - underwired balconette bra, matching high-cut briefs, a garter belt with sheer thigh-high stockings - real delicate lace texture against her skin, a thin gold body chain, bedroom-glam makeup' },
  { label: 'Club Dress', prompt: 'a backless skin-tight black satin mini dress with a cowl neck, the satin draping and creasing naturally, strappy heels, a small clutch, glowing evening makeup with glossy lips, styled waves' },
  { label: 'Bikini', prompt: 'a tiny bronze string bikini with thin ties at the hips, real sunlit skin with a natural sheen, wet-look hair pushed back, barefoot, delicate anklet and layered necklaces' },
  { label: 'Biker', prompt: 'tight black leather pants and a cropped leather biker jacket worn open over a black lace bralette, the leather creased and worn like real hide, chunky boots, silver rings, tousled hair, bold eyeliner' },
  { label: 'Bunny', prompt: 'a classic black satin bunny corset outfit with a white collar and cuffs, sheer black tights, tall black ears, the satin reflecting the room light realistically, red lipstick and winged liner' },
  { label: 'Devil', prompt: 'a sexy devil look shot like a real photoshoot - a tight red vinyl corset dress with a sweetheart neckline, small red horns in her hair, long red gloves, sheer black stockings, dramatic red-and-black makeup' },
  { label: 'Angel', prompt: 'a white silk slip mini dress with delicate lace trim, thin straps slipping off one shoulder, soft feathered wings behind her, dewy glowing skin, pearl jewelry, soft romantic makeup' },
  { label: 'Fishnet Goth', prompt: 'a black mesh long-sleeve top over a black bra, a leather mini skirt with a studded belt, ripped fishnet tights, platform boots, layered chokers, dark lipstick and smudged black eyeliner' },
  { label: 'Cosplay Armor', prompt: 'a form-fitting fantasy armor set that looks practically built - a molded chest piece over a black bodysuit, layered thigh plates, worn metal with real scratches and reflections, a long braid, subtle scar makeup' },
  { label: 'Sporty', prompt: 'a matching seamless sports bra and high-waisted gym leggings hugging her curves, a light sweat sheen on toned skin, athletic and real, gym-lit' },
  { label: 'Evening Gown', prompt: 'a floor-length silk evening gown with a thigh-high slit and a plunging back, the fabric draping and catching light realistically, statement earrings, red-carpet glam makeup' },
  { label: 'Schoolgirl', prompt: 'a plaid pleated mini skirt with a fitted white blouse tied at the waist, knee-high socks and mary-jane heels, playful, real cotton and pleats' },
  { label: 'Maid', prompt: 'a classic black-and-white maid dress with a lace apron, ruffled trim and a choker, real satin sheen and lace texture, styled hair' },
  { label: 'Wet Look', prompt: 'a soaked sheer white tank top clinging to her skin over a bikini top and tiny denim shorts, water droplets on her body, bright sunlit realism' },
  { label: 'Winter Glam', prompt: 'an open cream fur coat over a matching knit bralette and mini skirt, thigh-high boots, cold rosy skin, breath-in-the-air realism' },
];

export const TRANSITION_STYLES: ReelPreset[] = [
  {
    label: 'Whip Spin',
    prompt:
      'She spins fast on her heel, hair whipping across the frame. At the peak of the spin a single hard white '
      + 'flash fills the frame for a split second, and as she completes the turn she is wearing the new outfit. '
      + 'She lands the pose sharply and holds it, chin up, confident smirk. Fast snappy motion, music-video pacing, '
      + 'crisp focus, energetic, no slow motion.',
  },
  {
    label: 'Hard Flash',
    prompt:
      'She looks straight into the camera and snaps her fingers. The frame whites out in a hard camera flash for '
      + 'two frames, and when it clears she is in the new outfit in the exact same stance, one eyebrow raised. '
      + 'The camera does a quick subtle push-in as she rolls her shoulders back. Punchy, clean, editorial pacing.',
  },
  {
    label: 'Hair Flip',
    prompt:
      'She throws her head down and whips her hair back up in one fluid motion. Behind the curtain of moving hair '
      + 'her outfit changes, revealed as the hair settles. She runs a hand through it and locks eyes with the '
      + 'camera. Smooth but fast, glossy music-video energy, sharp focus on her face.',
  },
  {
    label: 'Shockwave',
    prompt:
      'She stomps one heel and a fast shockwave ripples up her body from the floor, converting her outfit to the '
      + 'new look as it passes, dust and small debris kicking up around her feet. She squares her shoulders and '
      + 'stares down the camera. Powerful, cinematic, quick.',
  },
  {
    label: 'Walk Toward',
    prompt:
      'She struts confidently toward the camera, hips swaying, in the new outfit from the first step. A quick low-angle '
      + 'shot as she approaches, hair bouncing, holding eye contact with a slow smirk. Glossy fashion-film look, '
      + 'shallow depth of field, smooth steady motion, high detail on fabric and skin.',
  },
  {
    label: 'Slow Reveal',
    prompt:
      'The camera slowly tilts up her body from her heels to her face, revealing the new outfit piece by piece, ending '
      + 'on her confident gaze into the lens. Cinematic, sensual, unhurried, warm key light, crisp focus, film grain.',
  },
  {
    label: 'Energy Sweep',
    prompt:
      'A burst of glowing energy sweeps across her body and her outfit seamlessly transforms into the new look. '
      + 'She holds the same pose with a confident expression, camera static, cinematic lighting, sparkling '
      + 'particles and light streaks during the transformation.',
  },
];

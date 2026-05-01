// api/discord-callback.js — Vercel Serverless Function
// Gère le retour OAuth Discord et mappe les rôles Discord → rôles portail

export default async function handler(req, res) {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send('Code manquant.');
  }

  const CLIENT_ID     = process.env.DISCORD_CLIENT_ID;
  const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
  const REDIRECT_URI  = process.env.DISCORD_REDIRECT_URI; // ex: https://ton-domaine.vercel.app/api/discord-callback
  const GUILD_ID      = process.env.DISCORD_GUILD_ID;      // ID de ton serveur Discord
  const OWNER_ID      = '661189164867256331';               // Ton Discord ID — toujours zenith

  // ══════════════════════════════════════════════════════
  //  MAPPING RÔLES DISCORD → RÔLES PORTAIL
  //  Rempli avec les IDs de ta capture Vercel (env vars)
  // ══════════════════════════════════════════════════════
  const ROLE_MAP = {
    // Format: 'DISCORD_ROLE_ID': 'role_portail'
    // ⚠ ROLE_ZENITH_ID est ignoré ici — le zenith est forcé par OWNER_ID uniquement
    [process.env.ROLE_MEMBRE_ID]:      'player',      // 1456721646244335631
    [process.env.ROLE_GMJ_ID]:         'gerant_mj',   // 1456722617183768637
    [process.env.ROLE_CADRE_ID]:       'cadre_mj',    // 1456722291483345090
    [process.env.ROLE_RESP_ID]:        'resp_rp',     // 1456723322350866697
    // ROLE_MODERATEUR_ID → ignoré (pas de rôle modérateur sur le portail)
    [process.env.ROLE_OWNER_ID]:       'resp_rp',     // 1456723508406124598 → Gérant = resp_rp
    [process.env.ROLE_MJ_ID]:          'mj',          // 1456722177171652824
  };

  // Priorité des rôles portail (du plus haut au plus bas)
  const ROLE_PRIORITY = ['resp_rp', 'gerant_mj', 'cadre_mj', 'mj', 'player'];

  try {
    // ── 1. Échange du code contre un token ──────────────────
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type:    'authorization_code',
        code,
        redirect_uri:  REDIRECT_URI,
      }),
    });

    if (!tokenRes.ok) {
      console.error('Token error:', await tokenRes.text());
      return res.redirect('/?discord_auth=error%3D1');
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // ── 2. Récupère les infos utilisateur Discord ───────────
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const discordUser = await userRes.json();

    // ── 3. Récupère les rôles du membre dans le serveur ─────
    let memberRoles = [];
    try {
      const memberRes = await fetch(
        `https://discord.com/api/users/@me/guilds/${GUILD_ID}/member`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (memberRes.ok) {
        const memberData = await memberRes.json();
        memberRoles = memberData.roles || [];
      }
    } catch (e) {
      console.warn('Impossible de récupérer les rôles du membre :', e);
    }

    // ── 4. Détermine le rôle portail en fonction des rôles Discord ──
    let siteRole = 'player'; // rôle par défaut

    if (discordUser.id === OWNER_ID) {
      // L'owner est toujours zenith, bypass total
      siteRole = 'zenith';
    } else {
      // Cherche le rôle portail le plus élevé parmi les rôles Discord du membre
      const mappedRoles = memberRoles
        .map(rid => ROLE_MAP[rid])
        .filter(Boolean); // retire les undefined (rôles non mappés, ex: modérateur)

      for (const priority of ROLE_PRIORITY) {
        if (mappedRoles.includes(priority)) {
          siteRole = priority;
          break;
        }
      }
    }

    // ── 5. Construit les paramètres de retour vers le frontend ──
    const params = new URLSearchParams({
      id:       discordUser.id,
      username: discordUser.username,
      avatar:   discordUser.avatar || '',
      role:     siteRole,
    });

    // Redirige vers la page principale avec les données auth
    return res.redirect(`/?discord_auth=${params.toString()}`);

  } catch (err) {
    console.error('Discord callback error:', err);
    return res.redirect('/?discord_auth=error%3D1');
  }
}

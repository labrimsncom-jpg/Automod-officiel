require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionFlagsBits,
  ActivityType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  ChannelType
} = require("discord.js");

const fs = require("fs");

// ======================================================
// CONFIGURATION
// ======================================================

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID || null;

if (!TOKEN) {
  console.error("❌ DISCORD_TOKEN manquant dans .env");
  process.exit(1);
}

if (!CLIENT_ID) {
  console.error("❌ CLIENT_ID manquant dans .env");
  process.exit(1);
}

// ======================================================
// CLIENT
// ======================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],

  partials: [
    Partials.Channel,
    Partials.GuildMember,
    Partials.User,
    Partials.Message
  ]
});

// ======================================================
// BASE DE DONNÉES
// ======================================================

const DATA_FILE = "./data.json";

let data = {
  guilds: {}
};

if (fs.existsSync(DATA_FILE)) {
  try {
    data = JSON.parse(
      fs.readFileSync(DATA_FILE, "utf8")
    );
  } catch (error) {
    console.error(
      "⚠️ data.json invalide, création d'une nouvelle base."
    );

    data = {
      guilds: {}
    };
  }
}

function saveData() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(data, null, 2),
      "utf8"
    );
  } catch (error) {
    console.error(
      "❌ Erreur sauvegarde data.json :",
      error
    );
  }
}

function getCfg(guildId) {

  if (!data.guilds[guildId]) {

    data.guilds[guildId] = {

      logChannel: null,

      antispam: false,
      antilink: false,
      antibot: false,
      antiraid: false,

      raidmode: false,
      lockdown: false,

      allowedDomains: [
        "discord.com",
        "discord.gg",
        "youtube.com",
        "youtu.be",
        "github.com"
      ],

      exemptRoles: [],

      warns: {},

      raidJoins: [],

      welcomeChannel: null

    };

    saveData();
  }

  const cfg = data.guilds[guildId];

  // Compatibilité avec une ancienne data.json

  if (!Array.isArray(cfg.allowedDomains)) {
    cfg.allowedDomains = [
      "discord.com",
      "discord.gg",
      "youtube.com",
      "youtu.be",
      "github.com"
    ];
  }

  if (!Array.isArray(cfg.exemptRoles)) {
    cfg.exemptRoles = [];
  }

  if (!cfg.warns) {
    cfg.warns = {};
  }

  if (!Array.isArray(cfg.raidJoins)) {
    cfg.raidJoins = [];
  }

  return cfg;
}

// ======================================================
// VARIABLES
// ======================================================

const spamMap = new Map();

let BOT_OWNER_ID = null;

const URL_RE =
  /(https?:\/\/|www\.)[^\s]+/i;

// ======================================================
// OUTILS
// ======================================================

function getWarns(guildId, userId) {

  const cfg = getCfg(guildId);

  if (!cfg.warns[userId]) {
    cfg.warns[userId] = [];
    saveData();
  }

  return cfg.warns[userId];
}

function canModerate(member, target) {

  if (!member || !target) {
    return false;
  }

  if (target.id === member.id) {
    return false;
  }

  if (target.id === member.guild.ownerId) {
    return false;
  }

  if (
    member.roles.highest.position <=
    target.roles.highest.position
  ) {
    return false;
  }

  return true;
}

async function sendLog(guild, content) {

  const cfg = getCfg(guild.id);

  if (!cfg.logChannel) {
    return;
  }

  const channel =
    guild.channels.cache.get(
      cfg.logChannel
    );

  if (!channel) {
    return;
  }

  if (!channel.isTextBased()) {
    return;
  }

  try {

    await channel.send({
      content,
      allowedMentions: {
        parse: []
      }
    });

  } catch {}
}

function getSendableChannel(guild) {

  if (
    guild.systemChannel &&
    guild.systemChannel.isTextBased()
  ) {

    const permissions =
      guild.systemChannel.permissionsFor(
        client.user
      );

    if (
      permissions?.has(
        PermissionFlagsBits.SendMessages
      )
    ) {

      return guild.systemChannel;

    }
  }

  return guild.channels.cache.find(
    channel => {

      if (!channel.isTextBased()) {
        return false;
      }

      const permissions =
        channel.permissionsFor(
          client.user
        );

      return permissions?.has(
        PermissionFlagsBits.SendMessages
      );

    }
  );
}

// ======================================================
// PROPRIÉTAIRE D'AUTOMOD
// ======================================================

async function loadBotOwner() {

  try {

    await client.application.fetch();

    const owner =
      client.application.owner;

    if (owner) {

      BOT_OWNER_ID =
        owner.id;

      console.log(
        `👑 Owner Automod : ${1368642102615085106}`
      );

    }

  } catch (error) {

    console.error(
      "❌ Impossible de récupérer le propriétaire d'Automod :",
      error
    );

  }
}

// ======================================================
// STATUT
// ======================================================

function updateBotStatus() {

  if (!client.user) {
    return;
  }

  const count =
    client.guilds.cache.size;

  const text =
    `/help • ${count} serveur(s)`;

  client.user.setPresence({

    status: "online",

    activities: [
      {
        name: "Automod",
        state: text,
        type: ActivityType.Custom
      }
    ]

  });

  console.log(
    `📊 Statut : ${text}`
  );
}

// ======================================================
// COMMANDES
// ======================================================

const commands = [

  // ----------------------------------------------------
  // HELP
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("help")
    .setDescription(
      "Afficher les commandes d'Automod"
    ),

  // ----------------------------------------------------
  // MENU
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("menu")
    .setDescription(
      "Ouvrir le menu principal d'Automod"
    ),

  // ----------------------------------------------------
  // AUTOMOD
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("automod")
    .setDescription(
      "Ouvrir le centre de protection Automod"
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    ),

  // ----------------------------------------------------
  // SECURITY CONFIG
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("securityconfig")
    .setDescription(
      "Configurer les protections de sécurité"
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    ),

  // ----------------------------------------------------
  // SERVER CONFIG
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("serverconfig")
    .setDescription(
      "Voir la configuration du serveur"
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    ),

  // ----------------------------------------------------
  // TICKET CONFIG
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("ticketconfig")
    .setDescription(
      "Voir la configuration du système de tickets"
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    ),

  // ----------------------------------------------------
  // BAN
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Bannir un membre")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addUserOption(option =>
      option
        .setName("membre")
        .setDescription("Membre à bannir")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("raison")
        .setDescription("Raison")
        .setRequired(false)
    ),

  // ----------------------------------------------------
  // UNBAN
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Débannir un utilisateur")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addStringOption(option =>
      option
        .setName("userid")
        .setDescription("ID de l'utilisateur")
        .setRequired(true)
    ),

  // ----------------------------------------------------
  // KICK
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Expulser un membre")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addUserOption(option =>
      option
        .setName("membre")
        .setDescription("Membre")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("raison")
        .setDescription("Raison")
        .setRequired(false)
    ),

  // ----------------------------------------------------
  // TIMEOUT
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Mettre un membre en timeout")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addUserOption(option =>
      option
        .setName("membre")
        .setDescription("Membre")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("minutes")
        .setDescription("Durée en minutes")
        .setMinValue(1)
        .setMaxValue(40320)
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("raison")
        .setDescription("Raison")
        .setRequired(false)
    ),

  // ----------------------------------------------------
  // UNTIMEOUT
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("untimeout")
    .setDescription("Retirer un timeout")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addUserOption(option =>
      option
        .setName("membre")
        .setDescription("Membre")
        .setRequired(true)
    ),

  // ----------------------------------------------------
  // WARN
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Avertir un membre")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addUserOption(option =>
      option
        .setName("membre")
        .setDescription("Membre")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("raison")
        .setDescription("Raison")
        .setRequired(true)
    ),

  // ----------------------------------------------------
  // UNWARN
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("unwarn")
    .setDescription("Retirer un avertissement")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addUserOption(option =>
      option
        .setName("membre")
        .setDescription("Membre")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("numero")
        .setDescription("Numéro du warn")
        .setMinValue(1)
        .setRequired(true)
    ),

  // ----------------------------------------------------
  // CASIER
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("casier")
    .setDescription("Voir les avertissements")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addUserOption(option =>
      option
        .setName("membre")
        .setDescription("Membre")
        .setRequired(true)
    ),

  // ----------------------------------------------------
  // CLEAR WARNS
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("clearwarns")
    .setDescription(
      "Supprimer tous les avertissements"
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addUserOption(option =>
      option
        .setName("membre")
        .setDescription("Membre")
        .setRequired(true)
    ),

  // ----------------------------------------------------
  // CLEAR
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Supprimer des messages")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addIntegerOption(option =>
      option
        .setName("nombre")
        .setDescription("Nombre de messages")
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    ),

  // ----------------------------------------------------
  // PURGE
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Supprimer plusieurs messages")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addIntegerOption(option =>
      option
        .setName("nombre")
        .setDescription("Nombre")
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    ),

  // ----------------------------------------------------
  // SLOWMODE
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Configurer le slowmode")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addIntegerOption(option =>
      option
        .setName("secondes")
        .setDescription("Durée")
        .setMinValue(0)
        .setMaxValue(21600)
        .setRequired(true)
    ),

  // ----------------------------------------------------
  // LOCK
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Verrouiller le salon")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    ),

  // ----------------------------------------------------
  // UNLOCK
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Déverrouiller le salon")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    ),

  // ----------------------------------------------------
  // NICK
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("nick")
    .setDescription("Modifier le pseudo")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addUserOption(option =>
      option
        .setName("membre")
        .setDescription("Membre")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("pseudo")
        .setDescription("Nouveau pseudo")
        .setRequired(true)
    ),

  // ----------------------------------------------------
  // ROLE ADD
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("roleadd")
    .setDescription("Ajouter un rôle")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addUserOption(option =>
      option
        .setName("membre")
        .setDescription("Membre")
        .setRequired(true)
    )
    .addRoleOption(option =>
      option
        .setName("role")
        .setDescription("Rôle")
        .setRequired(true)
    ),

  // ----------------------------------------------------
  // ROLE REMOVE
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("roleremove")
    .setDescription("Retirer un rôle")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addUserOption(option =>
      option
        .setName("membre")
        .setDescription("Membre")
        .setRequired(true)
    )
    .addRoleOption(option =>
      option
        .setName("role")
        .setDescription("Rôle")
        .setRequired(true)
    ),

  // ----------------------------------------------------
  // USERINFO
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription(
      "Informations sur un utilisateur"
    )
    .addUserOption(option =>
      option
        .setName("membre")
        .setDescription("Utilisateur")
        .setRequired(false)
    ),

  // ----------------------------------------------------
  // SERVERINFO
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription(
      "Informations sur le serveur"
    ),

  // ----------------------------------------------------
  // SAY
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("say")
    .setDescription("Faire parler Automod")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addStringOption(option =>
      option
        .setName("message")
        .setDescription("Message")
        .setRequired(true)
    ),

  // ----------------------------------------------------
  // ANNOUNCE
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Créer une annonce")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addStringOption(option =>
      option
        .setName("message")
        .setDescription("Annonce")
        .setRequired(true)
    ),

  // ----------------------------------------------------
  // SETUP
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Configurer Automod")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addSubcommand(sub =>
      sub
        .setName("logs")
        .setDescription(
          "Configurer le salon des logs"
        )
        .addChannelOption(option =>
          option
            .setName("salon")
            .setDescription("Salon des logs")
            .addChannelTypes(
              ChannelType.GuildText
            )
            .setRequired(true)
        )
    ),

  // ----------------------------------------------------
  // ANTISPAM
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("antispam")
    .setDescription("Configurer l'anti-spam")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addBooleanOption(option =>
      option
        .setName("actif")
        .setDescription("Activer ou désactiver")
        .setRequired(true)
    ),

  // ----------------------------------------------------
  // ANTILINKS
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("antilinks")
    .setDescription("Configurer l'anti-liens")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addBooleanOption(option =>
      option
        .setName("actif")
        .setDescription("Activer ou désactiver")
        .setRequired(true)
    ),

  // ----------------------------------------------------
  // ANTIBOT
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("antibot")
    .setDescription("Configurer l'anti-bots")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addBooleanOption(option =>
      option
        .setName("actif")
        .setDescription("Activer ou désactiver")
        .setRequired(true)
    ),

  // ----------------------------------------------------
  // ANTIRAID
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("antiraid")
    .setDescription("Configurer l'anti-raid")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addBooleanOption(option =>
      option
        .setName("actif")
        .setDescription("Activer ou désactiver")
        .setRequired(true)
    ),

  // ----------------------------------------------------
  // RAIDMODE
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("raidmode")
    .setDescription("Activer le mode raid")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addBooleanOption(option =>
      option
        .setName("actif")
        .setDescription("Activer ou désactiver")
        .setRequired(true)
    ),

  // ----------------------------------------------------
  // LOCKDOWN
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("lockdown")
    .setDescription("Verrouiller tout le serveur")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addBooleanOption(option =>
      option
        .setName("actif")
        .setDescription("Activer ou désactiver")
        .setRequired(true)
    )

].map(command => command.toJSON());

// ======================================================
// READY
// ======================================================

client.once("ready", async () => {

  console.log("");
  console.log("======================================");
  console.log("          🤖 AUTOMOD EN LIGNE");
  console.log("======================================");

  console.log(
    `🤖 Bot : ${client.user.tag}`
  );

  console.log(
    `🆔 ID : ${client.user.id}`
  );

  console.log(
    `🌐 Serveurs : ${client.guilds.cache.size}`
  );

  console.log("");

  await loadBotOwner();

  updateBotStatus();

  setInterval(
    updateBotStatus,
    5 * 60 * 1000
  );

  try {

    if (GUILD_ID) {

      const guild =
        await client.guilds.fetch(
          GUILD_ID
        );

      await guild.commands.set(
        commands
      );

      console.log(
        `✅ ${commands.length} commandes installées sur ${guild.name}`
      );

    } else {

      await client.application.commands.set(
        commands
      );

      console.log(
        `✅ ${commands.length} commandes globales installées`
      );

    }

  } catch (error) {

    console.error(
      "❌ Erreur déploiement commandes :",
      error
    );

  }

});

// ======================================================
// AUTOMOD REJOINT UN SERVEUR
// ======================================================

client.on(
  "guildCreate",
  async guild => {

    getCfg(guild.id);

    saveData();

    console.log(
      `➕ Automod rejoint : ${guild.name}`
    );

    updateBotStatus();

    const channel =
      getSendableChannel(guild);

    if (!channel) {
      return;
    }

    const embed =
      new EmbedBuilder()

        .setColor(0x5865F2)

        .setTitle(
          "✨ Automod est arrivé"
        )

        .setDescription(
          `Salut **${guild.name}** 👋\n\n` +
          `Je suis **Automod**, votre bot de modération et de sécurité.\n\n` +
          `### 🚀 Démarrage rapide\n` +
          `• \`/menu\` — interface principale\n` +
          `• \`/serverconfig\` — configuration du serveur\n` +
          `• \`/securityconfig\` — protections\n` +
          `• \`/automod\` — centre de sécurité\n\n` +
          `✅ **Commandes slash installées sur ce serveur.**`
        )

        .setFooter({
          text:
            "Automod • Merci de votre confiance"
        })

        .setTimestamp();

    try {

      await channel.send({
        embeds: [embed]
      });

    } catch {}

  }
);

// ======================================================
// AUTOMOD QUITTE UN SERVEUR
// ======================================================

client.on(
  "guildDelete",
  guild => {

    console.log(
      `➖ Automod quitte : ${guild.name}`
    );

    updateBotStatus();

  }
);

// ======================================================
// NOUVEAU MEMBRE
// ======================================================

client.on(
  "guildMemberAdd",
  async member => {

    const cfg =
      getCfg(
        member.guild.id
      );

    // ==================================================
    // 👑 OWNER D'AUTOMOD
    // ==================================================

    if (
      BOT_OWNER_ID &&
      member.id === BOT_OWNER_ID
    ) {

      const channel =
        getSendableChannel(
          member.guild
        );

      if (channel) {

        const avatar =
          member.user.displayAvatarURL({
            extension: "png",
            size: 256
          });

        const embed =
          new EmbedBuilder()

            .setColor(0xF1C40F)

            .setTitle(
              "⚡ Le créateur d'Automod est là"
            )

            .setDescription(
              `**${member.user.username}** — **Owner d'Automod** — vient de rejoindre **${member.guild.name}**.\n\n` +
              `> 🫡 **Accueil premium**`
            )

            .setThumbnail(
              avatar
            )

            .setFooter({
              text:
                "Automod • Accueil premium"
            })

            .setTimestamp();

        try {

          await channel.send({
            embeds: [embed]
          });

        } catch {}

      }

    }

    // ==================================================
    // 🤖 ANTI-BOT
    // ==================================================

    if (
      cfg.antibot &&
      member.user.bot
    ) {

      try {

        await member.kick(
          "Automod • Anti-Bot"
        );

        await sendLog(
          member.guild,
          `🤖 **Anti-Bot** : ${member.user.tag} a été expulsé.`
        );

      } catch {}

      return;
    }

    // ==================================================
    // 🚨 ANTI-RAID
    // ==================================================

    if (cfg.antiraid) {

      const now =
        Date.now();

      cfg.raidJoins =
        cfg.raidJoins.filter(
          timestamp =>
            now - timestamp <
            10000
        );

      cfg.raidJoins.push(
        now
      );

      // 5 arrivées en 10 secondes
      if (
        cfg.raidJoins.length >= 5 &&
        !cfg.raidmode
      ) {

        cfg.raidmode = true;

        saveData();

        await sendLog(
          member.guild,
          `🚨 **ANTI-RAID ACTIVÉ AUTOMATIQUEMENT**\n` +
          `Automod a détecté plusieurs arrivées rapides sur **${member.guild.name}**.`
        );

      }

      saveData();

    }

    // ==================================================
    // RAID MODE
    // ==================================================

    if (cfg.raidmode) {

      await sendLog(
        member.guild,
        `🚨 **Mode Raid** : ${member.user.tag} vient de rejoindre le serveur.`
      );

    }

  }
);

// ======================================================
// MESSAGES
// ======================================================

client.on(
  "messageCreate",
  async message => {

    if (!message.guild) {
      return;
    }

    if (message.author.bot) {
      return;
    }

    const cfg =
      getCfg(
        message.guild.id
      );

    // --------------------------------------------------
    // RÔLES EXEMPTÉS
    // --------------------------------------------------

    const exempt =
      message.member?.roles?.cache?.some(
        role =>
          cfg.exemptRoles.includes(
            role.id
          )
      );

    if (exempt) {
      return;
    }

    // --------------------------------------------------
    // ANTI-SPAM
    // --------------------------------------------------

    if (cfg.antispam) {

      const now =
        Date.now();

      const key =
        `${message.guild.id}:${message.author.id}`;

      let timestamps =
        spamMap.get(key) || [];

      timestamps =
        timestamps.filter(
          timestamp =>
            now - timestamp < 6000
        );

      timestamps.push(
        now
      );

      spamMap.set(
        key,
        timestamps
      );

      if (timestamps.length >= 5) {

        spamMap.delete(
          key
        );

        try {
          await message.delete();
        } catch {}

        await sendLog(
          message.guild,
          `💬 **Anti-Spam** : ${message.author.tag} a été détecté.`
        );

        try {

          if (
            message.member.moderatable
          ) {

            await message.member.timeout(
              10000,
              "Automod • Anti-Spam"
            );

          }

        } catch {}

        return;
      }

    }

    // --------------------------------------------------
    // ANTI-LIENS
    // --------------------------------------------------

    if (
      cfg.antilink &&
      URL_RE.test(
        message.content
      )
    ) {

      const channelName =
        message.channel.name?.toLowerCase() ||
        "";

      // Tickets exemptés
      if (
        channelName.includes(
          "ticket"
        )
      ) {
        return;
      }

      const urls =
        message.content.match(
          /https?:\/\/[^\s]+/gi
        ) || [];

      let allowed =
        false;

      for (
        const url of urls
      ) {

        try {

          const hostname =
            new URL(url)
              .hostname
              .toLowerCase()
              .replace(
                /^www\./,
                ""
              );

          if (
            cfg.allowedDomains.some(
              domain =>
                hostname === domain ||
                hostname.endsWith(
                  `.${domain}`
                )
            )
          ) {

            allowed = true;
            break;

          }

        } catch {}

      }

      if (!allowed) {

        try {
          await message.delete();
        } catch {}

        await sendLog(
          message.guild,
          `🔗 **Anti-Liens** : lien supprimé de ${message.author.tag}.`
        );

      }

    }

  }
);

// ======================================================
// EMBED AUTOMOD
// ======================================================

function createAutomodEmbed(
  guild,
  cfg
) {

  const status =
    value =>
      value
        ? "🟢 Activé"
        : "🔴 Désactivé";

  const logs =
    cfg.logChannel
      ? `<#${cfg.logChannel}>`
      : "❌ Non configurés";

  return new EmbedBuilder()

    .setColor(0x5865F2)

    .setTitle(
      "🛡️ Automod • Centre de protection"
    )

    .setDescription(
      `Bienvenue dans le centre de sécurité de **${guild.name}**.\n\n` +
      `Gère les protections directement avec les boutons ci-dessous.`
    )

    .addFields(

      {
        name: "💬 Anti-Spam",
        value:
          status(cfg.antispam),
        inline: true
      },

      {
        name: "🔗 Anti-Liens",
        value:
          status(cfg.antilink),
        inline: true
      },

      {
        name: "🤖 Anti-Bots",
        value:
          status(cfg.antibot),
        inline: true
      },

      {
        name: "🚨 Anti-Raid",
        value:
          status(cfg.antiraid),
        inline: true
      },

      {
        name: "⚠️ Mode Raid",
        value:
          status(cfg.raidmode),
        inline: true
      },

      {
        name: "🔒 Lockdown",
        value:
          status(cfg.lockdown),
        inline: true
      },

      {
        name: "📋 Salon des logs",
        value:
          logs,
        inline: false
      }

    )

    .setFooter({
      text:
        "Automod • Protection intelligente"
    })

    .setTimestamp();

}

// ======================================================
// BOUTONS AUTOMOD
// ======================================================

function createAutomodButtons(
  cfg
) {

  return [

    new ActionRowBuilder()
      .addComponents(

        new ButtonBuilder()
          .setCustomId(
            "automod_antispam"
          )
          .setLabel(
            cfg.antispam
              ? "Anti-Spam ON"
              : "Anti-Spam OFF"
          )
          .setEmoji("💬")
          .setStyle(
            cfg.antispam
              ? ButtonStyle.Success
              : ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId(
            "automod_antilink"
          )
          .setLabel(
            cfg.antilink
              ? "Anti-Liens ON"
              : "Anti-Liens OFF"
          )
          .setEmoji("🔗")
          .setStyle(
            cfg.antilink
              ? ButtonStyle.Success
              : ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId(
            "automod_antibot"
          )
          .setLabel(
            cfg.antibot
              ? "Anti-Bots ON"
              : "Anti-Bots OFF"
          )
          .setEmoji("🤖")
          .setStyle(
            cfg.antibot
              ? ButtonStyle.Success
              : ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId(
            "automod_antiraid"
          )
          .setLabel(
            cfg.antiraid
              ? "Anti-Raid ON"
              : "Anti-Raid OFF"
          )
          .setEmoji("🚨")
          .setStyle(
            cfg.antiraid
              ? ButtonStyle.Success
              : ButtonStyle.Secondary
          )

      ),

    new ActionRowBuilder()
      .addComponents(

        new ButtonBuilder()
          .setCustomId(
            "automod_lockdown"
          )
          .setLabel(
            cfg.lockdown
              ? "Lockdown ON"
              : "Lockdown OFF"
          )
          .setEmoji("🔒")
          .setStyle(
            cfg.lockdown
              ? ButtonStyle.Danger
              : ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId(
            "automod_raidmode"
          )
          .setLabel(
            cfg.raidmode
              ? "Raidmode ON"
              : "Raidmode OFF"
          )
          .setEmoji("⚠️")
          .setStyle(
            cfg.raidmode
              ? ButtonStyle.Danger
              : ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId(
            "automod_refresh"
          )
          .setLabel(
            "Actualiser"
          )
          .setEmoji("🔄")
          .setStyle(
            ButtonStyle.Primary
          )

      )

  ];

}

// ======================================================
// LOCKDOWN
// ======================================================

async function setLockdown(
  guild,
  active
) {

  let modified =
    0;

  for (
    const channel
    of guild.channels.cache.values()
  ) {

    if (
      !channel.isTextBased()
    ) {
      continue;
    }

    try {

      await channel.permissionOverwrites.edit(
        guild.roles.everyone,
        {
          SendMessages:
            active
              ? false
              : null
        }
      );

      modified++;

    } catch {}

  }

  return modified;
}

// ======================================================
// INTERACTIONS
// ======================================================

client.on(
  "interactionCreate",
  async interaction => {

    // ==================================================
    // BOUTONS
    // ==================================================

    if (
      interaction.isButton()
    ) {

      if (
        !interaction.guild
      ) {
        return;
      }

      if (
        !interaction.memberPermissions?.has(
          PermissionFlagsBits.ManageGuild
        )
      ) {

        return interaction.reply({
          content:
            "❌ Permission **Gérer le serveur** requise.",
          ephemeral: true
        });

      }

      const cfg =
        getCfg(
          interaction.guild.id
        );

      // ------------------------------------------------
      // REFRESH
      // ------------------------------------------------

      if (
        interaction.customId ===
        "automod_refresh"
      ) {

        return interaction.update({

          embeds: [
            createAutomodEmbed(
              interaction.guild,
              cfg
            )
          ],

          components:
            createAutomodButtons(
              cfg
            )

        });

      }

      // ------------------------------------------------
      // ANTISPAM
      // ------------------------------------------------

      if (
        interaction.customId ===
        "automod_antispam"
      ) {

        cfg.antispam =
          !cfg.antispam;

      }

      // ------------------------------------------------
      // ANTILINK
      // ------------------------------------------------

      if (
        interaction.customId ===
        "automod_antilink"
      ) {

        cfg.antilink =
          !cfg.antilink;

      }

      // ------------------------------------------------
      // ANTIBOT
      // ------------------------------------------------

      if (
        interaction.customId ===
        "automod_antibot"
      ) {

        cfg.antibot =
          !cfg.antibot;

      }

      // ------------------------------------------------
      // ANTIRAID
      // ------------------------------------------------

      if (
        interaction.customId ===
        "automod_antiraid"
      ) {

        cfg.antiraid =
          !cfg.antiraid;

        if (!cfg.antiraid) {
          cfg.raidJoins = [];
        }

      }

      // ------------------------------------------------
      // RAIDMODE
      // ------------------------------------------------

      if (
        interaction.customId ===
        "automod_raidmode"
      ) {

        cfg.raidmode =
          !cfg.raidmode;

      }

      // ------------------------------------------------
      // LOCKDOWN
      // ------------------------------------------------

      if (
        interaction.customId ===
        "automod_lockdown"
      ) {

        cfg.lockdown =
          !cfg.lockdown;

        await setLockdown(
          interaction.guild,
          cfg.lockdown
        );

      }

      saveData();

      return interaction.update({

        embeds: [
          createAutomodEmbed(
            interaction.guild,
            cfg
          )
        ],

        components:
          createAutomodButtons(
            cfg
          )

      });

    }

    // ==================================================
    // SLASH COMMAND
    // ==================================================

    if (
      !interaction.isChatInputCommand()
    ) {
      return;
    }

    const i =
      interaction;

    // ==================================================
    // HELP
    // ==================================================

    if (
      i.commandName === "help"
    ) {

      const embed =
        new EmbedBuilder()

          .setColor(0x5865F2)

          .setTitle(
            "🤖 Automod • Centre d'aide"
          )

          .setDescription(
            "Bienvenue sur **Automod**, votre bot de modération et de sécurité."
          )

          .addFields(

            {
              name: "🛡️ Sécurité",
              value:
                "`/automod` `/securityconfig` `/antispam` `/antilinks` `/antibot` `/antiraid` `/raidmode` `/lockdown`"
            },

            {
              name: "🔨 Modération",
              value:
                "`/ban` `/unban` `/kick` `/timeout` `/untimeout`"
            },

            {
              name: "⚠️ Avertissements",
              value:
                "`/warn` `/unwarn` `/casier` `/clearwarns`"
            },

            {
              name: "🧹 Nettoyage",
              value:
                "`/clear` `/purge` `/slowmode` `/lock` `/unlock`"
            },

            {
              name: "⚙️ Configuration",
              value:
                "`/menu` `/serverconfig` `/ticketconfig` `/setup`"
            },

            {
              name: "📊 Informations",
              value:
                "`/userinfo` `/serverinfo`"
            },

            {
              name: "📢 Utilitaires",
              value:
                "`/say` `/announce`"
            }

          )

          .setFooter({
            text:
              `Automod • ${client.guilds.cache.size} serveur(s)`
          })

          .setTimestamp();

      return i.reply({
        embeds: [embed]
      });

    }

    // ==================================================
    // PERMISSIONS
    // ==================================================

    if (
      !i.memberPermissions?.has(
        PermissionFlagsBits.ManageGuild
      )
    ) {

      return i.reply({
        content:
          "❌ Tu dois avoir la permission **Gérer le serveur**.",
        ephemeral: true
      });

    }

    const cfg =
      getCfg(
        i.guild.id
      );

    // ==================================================
    // MENU
    // ==================================================

    if (
      i.commandName === "menu"
    ) {

      const embed =
        new EmbedBuilder()

          .setColor(0x5865F2)

          .setTitle(
            "✨ Automod • Menu principal"
          )

          .setDescription(
            `Bienvenue dans le panneau de gestion d'**Automod**.\n\n` +
            `🛡️ **Sécurité**\n` +
            `Gère les protections de ton serveur.\n\n` +
            `⚙️ **Configuration**\n` +
            `Configure les logs et les paramètres.\n\n` +
            `🎫 **Tickets**\n` +
            `Accède à la configuration du système de tickets.\n\n` +
            `Utilise les commandes ci-dessous pour accéder à chaque section.`
          )

          .addFields(
            {
              name: "🛡️ Sécurité",
              value:
                "`/automod` ou `/securityconfig`"
            },
            {
              name: "⚙️ Serveur",
              value:
                "`/serverconfig`"
            },
            {
              name: "🎫 Tickets",
              value:
                "`/ticketconfig`"
            }
          )

          .setFooter({
            text:
              "Automod • Menu principal"
          })

          .setTimestamp();

      return i.reply({
        embeds: [embed]
      });

    }

    // ==================================================
    // AUTOMOD
    // ==================================================

    if (
      i.commandName === "automod" ||
      i.commandName === "securityconfig"
    ) {

      return i.reply({

        embeds: [
          createAutomodEmbed(
            i.guild,
            cfg
          )
        ],

        components:
          createAutomodButtons(
            cfg
          )

      });

    }

    // ==================================================
    // SERVER CONFIG
    // ==================================================

    if (
      i.commandName === "serverconfig"
    ) {

      const embed =
        new EmbedBuilder()

          .setColor(0x5865F2)

          .setTitle(
            "⚙️ Automod • Configuration serveur"
          )

          .setDescription(
            "Configuration actuelle du serveur."
          )

          .addFields(

            {
              name: "📋 Logs",
              value:
                cfg.logChannel
                  ? `<#${cfg.logChannel}>`
                  : "❌ Non configurés",
              inline: true
            },

            {
              name: "💬 Anti-Spam",
              value:
                cfg.antispam
                  ? "🟢 Activé"
                  : "🔴 Désactivé",
              inline: true
            },

            {
              name: "🔗 Anti-Liens",
              value:
                cfg.antilink
                  ? "🟢 Activé"
                  : "🔴 Désactivé",
              inline: true
            },

            {
              name: "🤖 Anti-Bots",
              value:
                cfg.antibot
                  ? "🟢 Activé"
                  : "🔴 Désactivé",
              inline: true
            },

            {
              name: "🚨 Anti-Raid",
              value:
                cfg.antiraid
                  ? "🟢 Activé"
                  : "🔴 Désactivé",
              inline: true
            },

            {
              name: "🔒 Lockdown",
              value:
                cfg.lockdown
                  ? "🟢 Activé"
                  : "🔴 Désactivé",
              inline: true
            }

          )

          .setFooter({
            text:
              "Automod • Configuration"
          })

          .setTimestamp();

      return i.reply({
        embeds: [embed]
      });

    }

    // ==================================================
    // TICKET CONFIG
    // ==================================================

    if (
      i.commandName === "ticketconfig"
    ) {

      const embed =
        new EmbedBuilder()

          .setColor(0x5865F2)

          .setTitle(
            "🎫 Automod • Ticket Config"
          )

          .setDescription(
            "Configuration du système de tickets."
          )

          .addFields(

            {
              name: "🎫 Système",
              value:
                "⚙️ Configuration disponible"
            },

            {
              name: "📋 Logs",
              value:
                cfg.logChannel
                  ? `<#${cfg.logChannel}>`
                  : "❌ Non configurés"
            }

          )

          .setFooter({
            text:
              "Automod • Ticket System"
          })

          .setTimestamp();

      return i.reply({
        embeds: [embed]
      });

    }

    // ==================================================
    // BAN
    // ==================================================

    if (
      i.commandName === "ban"
    ) {

      const user =
        i.options.getUser(
          "membre"
        );

      const reason =
        i.options.getString(
          "raison"
        ) ||
        "Aucune raison";

      const member =
        await i.guild.members
          .fetch(user.id)
          .catch(() => null);

      if (
        member &&
        !canModerate(
          i.member,
          member
        )
      ) {

        return i.reply({
          content:
            "❌ Tu ne peux pas bannir ce membre.",
          ephemeral: true
        });

      }

      try {

        await i.guild.members.ban(
          user.id,
          {
            reason
          }
        );

        await i.reply(
          `🔨 **${user.tag}** a été banni.\n> ${reason}`
        );

        await sendLog(
          i.guild,
          `🔨 **BAN** — ${user.tag}\nRaison : ${reason}`
        );

      } catch {

        await i.reply({
          content:
            "❌ Impossible de bannir ce membre.",
          ephemeral: true
        });

      }

      return;
    }

    // ==================================================
    // UNBAN
    // ==================================================

    if (
      i.commandName === "unban"
    ) {

      const userId =
        i.options.getString(
          "userid"
        );

      try {

        await i.guild.members.unban(
          userId
        );

        return i.reply(
          `✅ **${userId}** a été débanni.`
        );

      } catch {

        return i.reply({
          content:
            "❌ Impossible de débannir cet utilisateur.",
          ephemeral: true
        });

      }

    }

    // ==================================================
    // KICK
    // ==================================================

    if (
      i.commandName === "kick"
    ) {

      const user =
        i.options.getUser(
          "membre"
        );

      const reason =
        i.options.getString(
          "raison"
        ) ||
        "Aucune raison";

      const member =
        await i.guild.members
          .fetch(user.id)
          .catch(() => null);

      if (
        !member ||
        !canModerate(
          i.member,
          member
        )
      ) {

        return i.reply({
          content:
            "❌ Tu ne peux pas expulser ce membre.",
          ephemeral: true
        });

      }

      try {

        await member.kick(
          reason
        );

        return i.reply(
          `👢 **${user.tag}** a été expulsé.\n> ${reason}`
        );

      } catch {

        return i.reply({
          content:
            "❌ Impossible d'expulser ce membre.",
          ephemeral: true
        });

      }

    }

    // ==================================================
    // TIMEOUT
    // ==================================================

    if (
      i.commandName === "timeout"
    ) {

      const user =
        i.options.getUser(
          "membre"
        );

      const minutes =
        i.options.getInteger(
          "minutes"
        );

      const reason =
        i.options.getString(
          "raison"
        ) ||
        "Aucune raison";

      const member =
        await i.guild.members
          .fetch(user.id)
          .catch(() => null);

      if (
        !member ||
        !canModerate(
          i.member,
          member
        )
      ) {

        return i.reply({
          content:
            "❌ Tu ne peux pas timeout ce membre.",
          ephemeral: true
        });

      }

      try {

        await member.timeout(
          minutes * 60 * 1000,
          reason
        );

        return i.reply(
          `⏱️ **${user.tag}** est en timeout pendant **${minutes} minute(s)**.`
        );

      } catch {

        return i.reply({
          content:
            "❌ Impossible d'appliquer le timeout.",
          ephemeral: true
        });

      }

    }

    // ==================================================
    // UNTIMEOUT
    // ==================================================

    if (
      i.commandName === "untimeout"
    ) {

      const user =
        i.options.getUser(
          "membre"
        );

      const member =
        await i.guild.members
          .fetch(user.id)
          .catch(() => null);

      if (
        !member ||
        !canModerate(
          i.member,
          member
        )
      ) {

        return i.reply({
          content:
            "❌ Tu ne peux pas modifier ce membre.",
          ephemeral: true
        });

      }

      try {

        await member.timeout(
          null,
          "Timeout retiré"
        );

        return i.reply(
          `✅ Timeout retiré à **${user.tag}**.`
        );

      } catch {

        return i.reply({
          content:
            "❌ Impossible de retirer le timeout.",
          ephemeral: true
        });

      }

    }

    // ==================================================
    // WARN
    // ==================================================

    if (
      i.commandName === "warn"
    ) {

      const user =
        i.options.getUser(
          "membre"
        );

      const reason =
        i.options.getString(
          "raison"
        );

      const warns =
        getWarns(
          i.guild.id,
          user.id
        );

      warns.push({

        reason,

        moderator:
          i.user.id,

        date:
          new Date().toISOString()

      });

      saveData();

      await i.reply(
        `⚠️ **${user.tag}** a reçu un avertissement.\n> ${reason}\n\nTotal : **${warns.length}**`
      );

      await sendLog(
        i.guild,
        `⚠️ **WARN** — ${user.tag}\nRaison : ${reason}`
      );

      return;
    }

    // ==================================================
    // UNWARN
    // ==================================================

    if (
      i.commandName === "unwarn"
    ) {

      const user =
        i.options.getUser(
          "membre"
        );

      const number =
        i.options.getInteger(
          "numero"
        );

      const warns =
        getWarns(
          i.guild.id,
          user.id
        );

      if (
        number < 1 ||
        number > warns.length
      ) {

        return i.reply({
          content:
            "❌ Ce warn n'existe pas.",
          ephemeral: true
        });

      }

      warns.splice(
        number - 1,
        1
      );

      saveData();

      return i.reply(
        `✅ Le warn **#${number}** de **${user.tag}** a été supprimé.`
      );

    }

    // ==================================================
    // CASIER
    // ==================================================

    if (
      i.commandName === "casier"
    ) {

      const user =
        i.options.getUser(
          "membre"
        );

      const warns =
        getWarns(
          i.guild.id,
          user.id
        );

      const embed =
        new EmbedBuilder()

          .setColor(0x5865F2)

          .setTitle(
            `📋 Casier • ${user.tag}`
          )

          .setThumbnail(
            user.displayAvatarURL()
          );

      if (!warns.length) {

        embed.setDescription(
          "✅ Aucun avertissement."
        );

      } else {

        embed.setDescription(
          warns
            .map(
              (warn, index) =>
                `**#${index + 1}** — ${warn.reason}\n<@${warn.moderator}>`
            )
            .join("\n\n")
        );

      }

      return i.reply({
        embeds: [embed]
      });

    }

    // ==================================================
    // CLEAR WARNS
    // ==================================================

    if (
      i.commandName === "clearwarns"
    ) {

      const user =
        i.options.getUser(
          "membre"
        );

      cfg.warns[user.id] = [];

      saveData();

      return i.reply(
        `🧹 Tous les avertissements de **${user.tag}** ont été supprimés.`
      );

    }

    // ==================================================
    // CLEAR / PURGE
    // ==================================================

    if (
      i.commandName === "clear" ||
      i.commandName === "purge"
    ) {

      const amount =
        i.options.getInteger(
          "nombre"
        );

      try {

        const deleted =
          await i.channel.bulkDelete(
            amount,
            true
          );

        return i.reply({
          content:
            `🧹 **${deleted.size}** message(s) supprimé(s).`,
          ephemeral: true
        });

      } catch {

        return i.reply({
          content:
            "❌ Impossible de supprimer les messages.",
          ephemeral: true
        });

      }

    }

    // ==================================================
    // SLOWMODE
    // ==================================================

    if (
      i.commandName === "slowmode"
    ) {

      const seconds =
        i.options.getInteger(
          "secondes"
        );

      try {

        await i.channel.setRateLimitPerUser(
          seconds
        );

        return i.reply(
          seconds === 0
            ? "✅ Slowmode désactivé."
            : `🐢 Slowmode réglé sur **${seconds}s**.`
        );

      } catch {

        return i.reply({
          content:
            "❌ Impossible de modifier le slowmode.",
          ephemeral: true
        });

      }

    }

    // ==================================================
    // LOCK
    // ==================================================

    if (
      i.commandName === "lock"
    ) {

      try {

        await i.channel.permissionOverwrites.edit(
          i.guild.roles.everyone,
          {
            SendMessages: false
          }
        );

        return i.reply(
          "🔒 Salon verrouillé."
        );

      } catch {

        return i.reply({
          content:
            "❌ Impossible de verrouiller le salon.",
          ephemeral: true
        });

      }

    }

    // ==================================================
    // UNLOCK
    // ==================================================

    if (
      i.commandName === "unlock"
    ) {

      try {

        await i.channel.permissionOverwrites.edit(
          i.guild.roles.everyone,
          {
            SendMessages: null
          }
        );

        return i.reply(
          "🔓 Salon déverrouillé."
        );

      } catch {

        return i.reply({
          content:
            "❌ Impossible de déverrouiller le salon.",
          ephemeral: true
        });

      }

    }

    // ==================================================
    // NICK
    // ==================================================

    if (
      i.commandName === "nick"
    ) {

      const user =
        i.options.getUser(
          "membre"
        );

      const nickname =
        i.options.getString(
          "pseudo"
        );

      const member =
        await i.guild.members
          .fetch(user.id)
          .catch(() => null);

      if (
        !member ||
        !canModerate(
          i.member,
          member
        )
      ) {

        return i.reply({
          content:
            "❌ Tu ne peux pas modifier ce membre.",
          ephemeral: true
        });

      }

      try {

        await member.setNickname(
          nickname
        );

        return i.reply(
          `✅ Pseudo de **${user.tag}** modifié.`
        );

      } catch {

        return i.reply({
          content:
            "❌ Impossible de modifier le pseudo.",
          ephemeral: true
        });

      }

    }

    // ==================================================
    // ROLE ADD
    // ==================================================

    if (
      i.commandName === "roleadd"
    ) {

      const user =
        i.options.getUser(
          "membre"
        );

      const role =
        i.options.getRole(
          "role"
        );

      const member =
        await i.guild.members
          .fetch(user.id
        )
        .catch(() => null);

      if (!member) {

        return i.reply({
          content:
            "❌ Membre introuvable.",
          ephemeral: true
        });

      }

      try {

        await member.roles.add(
          role
        );

        return i.reply(
          `✅ ${role} ajouté à **${user.tag}**.`
        );

      } catch {

        return i.reply({
          content:
            "❌ Impossible d'ajouter ce rôle.",
          ephemeral: true
        });

      }

    }

    // ==================================================
    // ROLE REMOVE
    // ==================================================

    if (
      i.commandName === "roleremove"
    ) {

      const user =
        i.options.getUser(
          "membre"
        );

      const role =
        i.options.getRole(
          "role"
        );

      const member =
        await i.guild.members
          .fetch(user.id
        )
        .catch(() => null);

      if (!member) {

        return i.reply({
          content:
            "❌ Membre introuvable.",
          ephemeral: true
        });

      }

      try {

        await member.roles.remove(
          role
        );

        return i.reply(
          `✅ ${role} retiré de **${user.tag}**.`
        );

      } catch {

        return i.reply({
          content:
            "❌ Impossible de retirer ce rôle.",
          ephemeral: true
        });

      }

    }

    // ==================================================
    // USERINFO
    // ==================================================

    if (
      i.commandName === "userinfo"
    ) {

      const user =
        i.options.getUser(
          "membre"
        ) ||
        i.user;

      const member =
        await i.guild.members
          .fetch(user.id
        )
        .catch(() => null);

      const embed =
        new EmbedBuilder()

          .setColor(0x5865F2)

          .setTitle(
            `👤 ${user.tag}`
          )

          .setThumbnail(
            user.displayAvatarURL()
          )

          .addFields(

            {
              name: "🆔 ID",
              value: user.id,
              inline: true
            },

            {
              name: "🤖 Bot",
              value:
                user.bot
                  ? "Oui"
                  : "Non",
              inline: true
            },

            {
              name: "📅 Compte",
              value:
                `<t:${Math.floor(
                  user.createdTimestamp / 1000
                )}:R>`,
              inline: true
            },

            {
              name: "📥 Rejoint",
              value:
                member?.joinedTimestamp
                  ? `<t:${Math.floor(
                      member.joinedTimestamp / 1000
                    )}:R>`
                  : "Inconnu",
              inline: true
            }

          );

      return i.reply({
        embeds: [embed]
      });

    }

    // ==================================================
    // SERVERINFO
    // ==================================================

    if (
      i.commandName === "serverinfo"
    ) {

      const guild =
        i.guild;

      const embed =
        new EmbedBuilder()

          .setColor(0x5865F2)

          .setTitle(
            `🏠 ${guild.name}`
          )

          .setThumbnail(
            guild.iconURL()
          )

          .addFields(

            {
              name: "👥 Membres",
              value:
                `${guild.memberCount}`,
              inline: true
            },

            {
              name: "💬 Salons",
              value:
                `${guild.channels.cache.size}`,
              inline: true
            },

            {
              name: "🎭 Rôles",
              value:
                `${guild.roles.cache.size}`,
              inline: true
            },

            {
              name: "🆔 ID",
              value:
                guild.id,
              inline: true
            }

          );

      return i.reply({
        embeds: [embed]
      });

    }

    // ==================================================
    // SAY
    // ==================================================

    if (
      i.commandName === "say"
    ) {

      const message =
        i.options.getString(
          "message"
        );

      await i.reply({
        content:
          "✅ Message envoyé.",
        ephemeral: true
      });

      await i.channel.send({
        content: message,
        allowedMentions: {
          parse: []
        }
      });

      return;
    }

    // ==================================================
    // ANNOUNCE
    // ==================================================

    if (
      i.commandName === "announce"
    ) {

      const message =
        i.options.getString(
          "message"
        );

      const embed =
        new EmbedBuilder()

          .setColor(0x5865F2)

          .setTitle(
            "📢 Annonce"
          )

          .setDescription(
            message
          )

          .setFooter({
            text:
              `Automod • ${i.user.tag}`
          })

          .setTimestamp();

      await i.reply({
        content:
          "✅ Annonce envoyée.",
        ephemeral: true
      });

      await i.channel.send({
        embeds: [embed]
      });

      return;
    }

    // ==================================================
    // SETUP
    // ==================================================

    if (
      i.commandName === "setup"
    ) {

      const sub =
        i.options.getSubcommand();

      if (
        sub === "logs"
      ) {

        const channel =
          i.options.getChannel(
            "salon"
          );

        cfg.logChannel =
          channel.id;

        saveData();

        return i.reply(
          `✅ Les logs sont maintenant envoyés dans ${channel}.`
        );

      }

    }

    // ==================================================
    // ANTISPAM
    // ==================================================

    if (
      i.commandName === "antispam"
    ) {

      cfg.antispam =
        i.options.getBoolean(
          "actif"
        );

      saveData();

      return i.reply(
        cfg.antispam
          ? "🟢 **Anti-Spam activé.**"
          : "🔴 **Anti-Spam désactivé.**"
      );

    }

    // ==================================================
    // ANTILINKS
    // ==================================================

    if (
      i.commandName === "antilinks"
    ) {

      cfg.antilink =
        i.options.getBoolean(
          "actif"
        );

      saveData();

      return i.reply(
        cfg.antilink
          ? "🟢 **Anti-Liens activé.**"
          : "🔴 **Anti-Liens désactivé.**"
      );

    }

    // ==================================================
    // ANTIBOT
    // ==================================================

    if (
      i.commandName === "antibot"
    ) {

      cfg.antibot =
        i.options.getBoolean(
          "actif"
        );

      saveData();

      return i.reply(
        cfg.antibot
          ? "🟢 **Anti-Bots activé.**"
          : "🔴 **Anti-Bots désactivé.**"
      );

    }

    // ==================================================
    // ANTIRAID
    // ==================================================

    if (
      i.commandName === "antiraid"
    ) {

      cfg.antiraid =
        i.options.getBoolean(
          "actif"
        );

      if (!cfg.antiraid) {
        cfg.raidJoins = [];
      }

      saveData();

      return i.reply(
        cfg.antiraid
          ? "🟢 **Anti-Raid activé.**\nAutomod surveille maintenant les arrivées rapides."
          : "🔴 **Anti-Raid désactivé.**"
      );

    }

    // ==================================================
    // RAIDMODE
    // ==================================================

    if (
      i.commandName === "raidmode"
    ) {

      cfg.raidmode =
        i.options.getBoolean(
          "actif"
        );

      saveData();

      return i.reply(
        cfg.raidmode
          ? "🚨 **Mode Raid activé.**"
          : "🟢 **Mode Raid désactivé.**"
      );

    }

    // ==================================================
    // LOCKDOWN
    // ==================================================

    if (
      i.commandName === "lockdown"
    ) {

      const active =
        i.options.getBoolean(
          "actif"
        );

      cfg.lockdown =
        active;

      const modified =
        await setLockdown(
          i.guild,
          active
        );

      saveData();

      return i.reply(
        active
          ? `🔒 **Lockdown activé** sur ${modified} salon(s).`
          : `🔓 **Lockdown désactivé** sur ${modified} salon(s).`
      );

    }

  }
);

// ======================================================
// ERREURS
// ======================================================

process.on(
  "unhandledRejection",
  error => {

    console.error(
      "❌ Unhandled Rejection:",
      error
    );

  }
);

process.on(
  "uncaughtException",
  error => {

    console.error(
      "❌ Uncaught Exception:",
      error
    );

  }
);

// ======================================================
// CONNEXION
// ======================================================

client.login(
  TOKEN
);
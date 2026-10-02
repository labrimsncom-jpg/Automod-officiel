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
  StringSelectMenuBuilder,
  SlashCommandBuilder,
  ChannelType
} = require("discord.js");

const fs = require("fs");

// ======================================================
// AUTOMOD • CONFIG
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
    GatewayIntentBits.GuildModeration,
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
// DATABASE
// ======================================================

const DATA_FILE = "./data.json";

const DEFAULT_CONFIG = {
  logs: {
    moderation: null,
    security: null,
    automod: null,
    members: null,
    administration: null
  },

  protection: {
    antispam: false,
    antilinks: false,
    antiinvites: false,
    antibot: false,
    antiraid: false,
    antinuke: false,
    antiwebhook: false,
    antirole: false,
    antichannel: false,
    filter: false
  },

  raid: {
    threshold: 5,
    window: 10,
    lockdown: false,
    automatic: false
  },

  lockdown: false,

  whitelist: {
    users: [],
    roles: [],
    channels: []
  },

  exemptRoles: [],

  allowedDomains: [
    "discord.com",
    "discord.gg",
    "youtube.com",
    "youtu.be",
    "github.com"
  ],

  blockedWords: [],

  ticket: {
    category: null,
    supportRole: null,
    logs: null
  },

  warns: {},

  stats: {
    deletedMessages: 0,
    warns: 0,
    bans: 0,
    kicks: 0,
    timeouts: 0,
    raids: 0,
    nukeActions: 0
  },

  raidJoins: [],

  securityActions: {}
};

let data = {
  guilds: {}
};

if (fs.existsSync(DATA_FILE)) {
  try {
    data = JSON.parse(
      fs.readFileSync(DATA_FILE, "utf8")
    );
  } catch {
    data = { guilds: {} };
  }
}

function cloneDefault() {
  return JSON.parse(
    JSON.stringify(DEFAULT_CONFIG)
  );
}

function getCfg(guildId) {
  if (!data.guilds[guildId]) {
    data.guilds[guildId] = cloneDefault();
    saveData();
  }

  const cfg = data.guilds[guildId];

  for (const key of Object.keys(DEFAULT_CONFIG)) {
    if (
      typeof cfg[key] === "undefined"
    ) {
      cfg[key] =
        JSON.parse(
          JSON.stringify(
            DEFAULT_CONFIG[key]
          )
        );
    }
  }

  return cfg;
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
      "❌ Erreur sauvegarde :",
      error
    );
  }
}

// ======================================================
// VARIABLES
// ======================================================

let BOT_OWNER_ID = null;

const spamMap = new Map();
const securityMap = new Map();

const URL_RE =
  /(https?:\/\/|www\.)[^\s]+/i;

const INVITE_RE =
  /(discord\.gg\/|discord\.com\/invite\/)/i;

// ======================================================
// UTILITAIRES
// ======================================================

function isWhitelisted(
  guild,
  userId,
  channelId = null
) {
  const cfg = getCfg(guild.id);

  if (
    userId === guild.ownerId
  ) {
    return true;
  }

  if (
    cfg.whitelist.users.includes(
      userId
    )
  ) {
    return true;
  }

  const member =
    guild.members.cache.get(
      userId
    );

  if (
    member &&
    member.roles.cache.some(
      role =>
        cfg.whitelist.roles.includes(
          role.id
        )
    )
  ) {
    return true;
  }

  if (
    channelId &&
    cfg.whitelist.channels.includes(
      channelId
    )
  ) {
    return true;
  }

  return false;
}

function canModerate(
  moderator,
  target
) {
  if (!moderator || !target) {
    return false;
  }

  if (
    target.id === moderator.id
  ) {
    return false;
  }

  if (
    target.id ===
    target.guild.ownerId
  ) {
    return false;
  }

  return (
    moderator.roles.highest.position >
    target.roles.highest.position
  );
}

function getWarns(
  guildId,
  userId
) {
  const cfg =
    getCfg(guildId);

  if (!cfg.warns[userId]) {
    cfg.warns[userId] = [];
  }

  return cfg.warns[userId];
}

async function sendLog(
  guild,
  type,
  message
) {
  const cfg =
    getCfg(guild.id);

  const channelId =
    cfg.logs[type] ||
    cfg.logs.security;

  if (!channelId) {
    return;
  }

  const channel =
    guild.channels.cache.get(
      channelId
    );

  if (
    !channel ||
    !channel.isTextBased()
  ) {
    return;
  }

  try {
    await channel.send({
      content: message,
      allowedMentions: {
        parse: []
      }
    });
  } catch {}
}

function getBotChannel(guild) {
  if (
    guild.systemChannel &&
    guild.systemChannel.isTextBased()
  ) {
    return guild.systemChannel;
  }

  return guild.channels.cache.find(
    channel =>
      channel.isTextBased() &&
      channel
        .permissionsFor(client.user)
        ?.has(
          PermissionFlagsBits.SendMessages
        )
  );
}

// ======================================================
// OWNER AUTOMOD
// ======================================================

async function loadOwner() {
  try {
    await client.application.fetch();

    if (client.application.owner) {
      BOT_OWNER_ID =
        client.application.owner.id;
    }

    console.log(
      `👑 Owner Automod : ${BOT_OWNER_ID || "inconnu"}`
    );
  } catch (error) {
    console.error(
      "❌ Owner introuvable :",
      error
    );
  }
}

// ======================================================
// STATUS
// ======================================================

function updateStatus() {
  if (!client.user) return;

  const count =
    client.guilds.cache.size;

  client.user.setPresence({
    status: "online",
    activities: [
      {
        name: "Automod",
        state:
          `/help • ${count} serveur(s)`,
        type: ActivityType.Custom
      }
    ]
  });

  console.log(
    `📊 /help • ${count} serveur(s)`
  );
}

// ======================================================
// COMMANDES
// ======================================================

const commands = [

  new SlashCommandBuilder()
    .setName("help")
    .setDescription(
      "Afficher l'aide d'Automod"
    ),

  new SlashCommandBuilder()
    .setName("menu")
    .setDescription(
      "Ouvrir le menu Automod"
    ),

  new SlashCommandBuilder()
    .setName("automod")
    .setDescription(
      "Ouvrir le centre de sécurité Automod"
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    ),

  new SlashCommandBuilder()
    .setName("stats")
    .setDescription(
      "Afficher les statistiques Automod"
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    ),

  new SlashCommandBuilder()
    .setName("serverconfig")
    .setDescription(
      "Afficher la configuration"
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    ),

  new SlashCommandBuilder()
    .setName("securityconfig")
    .setDescription(
      "Configurer la sécurité"
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    ),

  new SlashCommandBuilder()
    .setName("whitelist")
    .setDescription(
      "Gérer la whitelist"
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addSubcommand(sub =>
      sub
        .setName("user")
        .setDescription(
          "Ajouter ou retirer un utilisateur"
        )
        .addUserOption(option =>
          option
            .setName("membre")
            .setDescription("Utilisateur")
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("role")
        .setDescription(
          "Ajouter ou retirer un rôle"
        )
        .addRoleOption(option =>
          option
            .setName("role")
            .setDescription("Rôle")
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("channel")
        .setDescription(
          "Ajouter ou retirer un salon"
        )
        .addChannelOption(option =>
          option
            .setName("salon")
            .setDescription("Salon")
            .addChannelTypes(
              ChannelType.GuildText
            )
            .setRequired(true)
        )
    ),

  new SlashCommandBuilder()
    .setName("logs")
    .setDescription(
      "Configurer les logs"
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addStringOption(option =>
      option
        .setName("type")
        .setDescription("Type de logs")
        .setRequired(true)
        .addChoices(
          {
            name: "Modération",
            value: "moderation"
          },
          {
            name: "Sécurité",
            value: "security"
          },
          {
            name: "AutoMod",
            value: "automod"
          },
          {
            name: "Membres",
            value: "members"
          },
          {
            name: "Administration",
            value: "administration"
          }
        )
    )
    .addChannelOption(option =>
      option
        .setName("salon")
        .setDescription("Salon")
        .addChannelTypes(
          ChannelType.GuildText
        )
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("ticketconfig")
    .setDescription(
      "Configurer les tickets"
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    ),

  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription(
      "Créer un ticket"
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Bannir un membre")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addUserOption(o =>
      o
        .setName("membre")
        .setDescription("Membre")
        .setRequired(true)
    )
    .addStringOption(o =>
      o
        .setName("raison")
        .setDescription("Raison")
    ),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Expulser un membre")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addUserOption(o =>
      o
        .setName("membre")
        .setDescription("Membre")
        .setRequired(true)
    )
    .addStringOption(o =>
      o
        .setName("raison")
        .setDescription("Raison")
    ),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addUserOption(o =>
      o
        .setName("membre")
        .setDescription("Membre")
        .setRequired(true)
    )
    .addIntegerOption(o =>
      o
        .setName("minutes")
        .setDescription("Minutes")
        .setMinValue(1)
        .setMaxValue(40320)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("untimeout")
    .setDescription(
      "Retirer un timeout"
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addUserOption(o =>
      o
        .setName("membre")
        .setDescription("Membre")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Avertir")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addUserOption(o =>
      o
        .setName("membre")
        .setDescription("Membre")
        .setRequired(true)
    )
    .addStringOption(o =>
      o
        .setName("raison")
        .setDescription("Raison")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("casier")
    .setDescription(
      "Voir le casier"
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addUserOption(o =>
      o
        .setName("membre")
        .setDescription("Membre")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("clear")
    .setDescription(
      "Supprimer des messages"
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageMessages
    )
    .addIntegerOption(o =>
      o
        .setName("nombre")
        .setDescription("Nombre")
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription(
      "Configurer le slowmode"
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageChannels
    )
    .addIntegerOption(o =>
      o
        .setName("secondes")
        .setDescription("Secondes")
        .setMinValue(0)
        .setMaxValue(21600)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("lock")
    .setDescription(
      "Verrouiller le salon"
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageChannels
    ),

  new SlashCommandBuilder()
    .setName("unlock")
    .setDescription(
      "Déverrouiller le salon"
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageChannels
    ),

  new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription(
      "Informations utilisateur"
    )
    .addUserOption(o =>
      o
        .setName("membre")
        .setDescription("Utilisateur")
    ),

  new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription(
      "Informations serveur"
    ),

  new SlashCommandBuilder()
    .setName("say")
    .setDescription(
      "Faire parler Automod"
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addStringOption(o =>
      o
        .setName("message")
        .setDescription("Message")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("announce")
    .setDescription(
      "Créer une annonce"
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addStringOption(o =>
      o
        .setName("message")
        .setDescription("Annonce")
        .setRequired(true)
    )

].map(c => c.toJSON());

// ======================================================
// AUTOMOD EMBED
// ======================================================

function automodEmbed(
  guild,
  cfg,
  page = "main"
) {
  const on =
    value =>
      value
        ? "🟢 Activé"
        : "🔴 Désactivé";

  if (page === "security") {
    return new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(
        "🛡️ Automod • Sécurité"
      )
      .setDescription(
        "Protection avancée de ton serveur."
      )
      .addFields(
        {
          name: "💥 Anti-Nuke",
          value: on(
            cfg.protection.antinuke
          ),
          inline: true
        },
        {
          name: "🪝 Anti-Webhook",
          value: on(
            cfg.protection.antiwebhook
          ),
          inline: true
        },
        {
          name: "🎭 Protection rôles",
          value: on(
            cfg.protection.antirole
          ),
          inline: true
        },
        {
          name: "📁 Protection salons",
          value: on(
            cfg.protection.antichannel
          ),
          inline: true
        },
        {
          name: "🚨 Anti-Raid",
          value: on(
            cfg.protection.antiraid
          ),
          inline: true
        },
        {
          name: "🤖 Anti-Bots",
          value: on(
            cfg.protection.antibot
          ),
          inline: true
        }
      )
      .setFooter({
        text:
          "Automod • Sécurité avancée"
      })
      .setTimestamp();
  }

  if (page === "moderation") {
    return new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(
        "🧹 Automod • Modération"
      )
      .setDescription(
        "Protection automatique des messages et membres."
      )
      .addFields(
        {
          name: "💬 Anti-Spam",
          value: on(
            cfg.protection.antispam
          ),
          inline: true
        },
        {
          name: "🔗 Anti-Liens",
          value: on(
            cfg.protection.antilinks
          ),
          inline: true
        },
        {
          name: "📨 Anti-Invites",
          value: on(
            cfg.protection.antiinvites
          ),
          inline: true
        },
        {
          name: "🤬 Filtre",
          value: on(
            cfg.protection.filter
          ),
          inline: true
        },
        {
          name: "🚨 Anti-Raid",
          value: on(
            cfg.protection.antiraid
          ),
          inline: true
        }
      )
      .setFooter({
        text:
          "Automod • Modération"
      })
      .setTimestamp();
  }

  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(
      "🛡️ Automod • Centre de protection"
    )
    .setDescription(
      `Bienvenue dans le centre de sécurité de **${guild.name}**.\n\n` +
      `Utilise les menus ci-dessous pour gérer chaque catégorie.`
    )
    .addFields(
      {
        name: "🧹 Modération",
        value:
          "Anti-Spam • Anti-Liens • Anti-Invites • Filtre",
        inline: false
      },
      {
        name: "🛡️ Sécurité",
        value:
          "Anti-Nuke • Anti-Webhooks • Protection rôles/salons",
        inline: false
      },
      {
        name: "🚨 Anti-Raid",
        value:
          `Seuil : **${cfg.raid.threshold}** arrivées / **${cfg.raid.window}s**`,
        inline: false
      },
      {
        name: "📋 Logs",
        value:
          cfg.logs.security
            ? `<#${cfg.logs.security}>`
            : "❌ Non configurés",
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
// AUTOMOD COMPONENTS
// ======================================================

function automodComponents(cfg) {
  const menu =
    new StringSelectMenuBuilder()
      .setCustomId(
        "automod_page"
      )
      .setPlaceholder(
        "Choisir une catégorie"
      )
      .addOptions(
        {
          label: "Vue générale",
          value: "main",
          emoji: "🏠"
        },
        {
          label: "Modération",
          value: "moderation",
          emoji: "🧹"
        },
        {
          label: "Sécurité",
          value: "security",
          emoji: "🛡️"
        }
      );

  const row1 =
    new ActionRowBuilder()
      .addComponents(menu);

  const row2 =
    new ActionRowBuilder()
      .addComponents(

        new ButtonBuilder()
          .setCustomId(
            "toggle_antispam"
          )
          .setLabel(
            cfg.protection.antispam
              ? "Anti-Spam ON"
              : "Anti-Spam OFF"
          )
          .setEmoji("💬")
          .setStyle(
            cfg.protection.antispam
              ? ButtonStyle.Success
              : ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId(
            "toggle_antilinks"
          )
          .setLabel(
            cfg.protection.antilinks
              ? "Anti-Liens ON"
              : "Anti-Liens OFF"
          )
          .setEmoji("🔗")
          .setStyle(
            cfg.protection.antilinks
              ? ButtonStyle.Success
              : ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId(
            "toggle_antiraid"
          )
          .setLabel(
            cfg.protection.antiraid
              ? "Anti-Raid ON"
              : "Anti-Raid OFF"
          )
          .setEmoji("🚨")
          .setStyle(
            cfg.protection.antiraid
              ? ButtonStyle.Success
              : ButtonStyle.Secondary
          )

      );

  const row3 =
    new ActionRowBuilder()
      .addComponents(

        new ButtonBuilder()
          .setCustomId(
            "toggle_antinuke"
          )
          .setLabel(
            cfg.protection.antinuke
              ? "Anti-Nuke ON"
              : "Anti-Nuke OFF"
          )
          .setEmoji("💥")
          .setStyle(
            cfg.protection.antinuke
              ? ButtonStyle.Success
              : ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId(
            "toggle_antiwebhook"
          )
          .setLabel(
            cfg.protection.antiwebhook
              ? "Webhooks ON"
              : "Webhooks OFF"
          )
          .setEmoji("🪝")
          .setStyle(
            cfg.protection.antiwebhook
              ? ButtonStyle.Success
              : ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId(
            "toggle_antibot"
          )
          .setLabel(
            cfg.protection.antibot
              ? "Anti-Bots ON"
              : "Anti-Bots OFF"
          )
          .setEmoji("🤖")
          .setStyle(
            cfg.protection.antibot
              ? ButtonStyle.Success
              : ButtonStyle.Secondary
          )

      );

  const row4 =
    new ActionRowBuilder()
      .addComponents(

        new ButtonBuilder()
          .setCustomId(
            "toggle_lockdown"
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
            "automod_refresh"
          )
          .setLabel(
            "Actualiser"
          )
          .setEmoji("🔄")
          .setStyle(
            ButtonStyle.Primary
          )

      );

  return [
    row1,
    row2,
    row3,
    row4
  ];
}

// ======================================================
// LOCKDOWN
// ======================================================

async function lockdown(
  guild,
  active
) {
  let count = 0;

  for (
    const channel
    of guild.channels.cache.values()
  ) {
    if (
      channel.type !==
      ChannelType.GuildText
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

      count++;
    } catch {}
  }

  return count;
}

// ======================================================
// READY
// ======================================================

client.once(
  "ready",
  async () => {

    console.log("");
    console.log(
      "======================================"
    );
    console.log(
      "        🤖 AUTOMOD EN LIGNE"
    );
    console.log(
      "======================================"
    );

    console.log(
      `🤖 ${client.user.tag}`
    );

    console.log(
      `🌐 ${client.guilds.cache.size} serveur(s)`
    );

    await loadOwner();

    updateStatus();

    setInterval(
      updateStatus,
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
        "❌ Déploiement commandes :",
        error
      );
    }
  }
);

// ======================================================
// BOT JOIN
// ======================================================

client.on(
  "guildCreate",
  async guild => {

    getCfg(guild.id);
    saveData();

    console.log(
      `➕ Automod rejoint ${guild.name}`
    );

    updateStatus();

    const channel =
      getBotChannel(guild);

    if (!channel) return;

    const embed =
      new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(
          "✨ Automod est arrivé"
        )
        .setDescription(
          `Bienvenue sur **${guild.name}** 👋\n\n` +
          `Je suis **Automod**, votre bot de modération et de sécurité.\n\n` +
          `🚀 **Commence avec :**\n` +
          `• \`/automod\` — centre de protection\n` +
          `• \`/menu\` — menu principal\n` +
          `• \`/help\` — toutes les commandes`
        )
        .setFooter({
          text:
            "Automod • Protection intelligente"
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
// BOT LEAVE
// ======================================================

client.on(
  "guildDelete",
  guild => {
    console.log(
      `➖ Automod quitte ${guild.name}`
    );

    updateStatus();
  }
);

// ======================================================
// MEMBER JOIN
// ======================================================

client.on(
  "guildMemberAdd",
  async member => {

    const guild =
      member.guild;

    const cfg =
      getCfg(guild.id);

    // --------------------------------------------------
    // OWNER AUTOMOD
    // --------------------------------------------------

    if (
      BOT_OWNER_ID &&
      member.id === BOT_OWNER_ID
    ) {

      const channel =
        getBotChannel(guild);

      if (channel) {

        const embed =
          new EmbedBuilder()
            .setColor(0xF1C40F)
            .setTitle(
              "⚡ Le créateur d'Automod est là"
            )
            .setDescription(
              `**${member.user.username}** — **Owner d'Automod** — vient de rejoindre **${guild.name}**.\n\n` +
              `> 🫡 **Accueil premium**`
            )
            .setThumbnail(
              member.user.displayAvatarURL({
                extension: "png",
                size: 256
              })
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

    // --------------------------------------------------
    // ANTI BOT
    // --------------------------------------------------

    if (
      cfg.protection.antibot &&
      member.user.bot &&
      !isWhitelisted(
        guild,
        member.id
      )
    ) {

      try {
        await member.kick(
          "Automod • Anti-Bot"
        );

        await sendLog(
          guild,
          "security",
          `🤖 **Anti-Bot** : ${member.user.tag} expulsé.`
        );
      } catch {}

      return;
    }

    // --------------------------------------------------
    // ANTI RAID
    // --------------------------------------------------

    if (
      cfg.protection.antiraid
    ) {

      const now =
        Date.now();

      cfg.raidJoins =
        cfg.raidJoins.filter(
          time =>
            now - time <
            cfg.raid.window * 1000
        );

      cfg.raidJoins.push(now);

      if (
        cfg.raidJoins.length >=
        cfg.raid.threshold
      ) {

        if (!cfg.raidmode) {
          cfg.raidmode = true;
        }

        cfg.stats.raids++;

        await sendLog(
          guild,
          "security",
          `🚨 **RAID DÉTECTÉ**\n${cfg.raidJoins.length} arrivées en ${cfg.raid.window}s.`
        );

        if (
          cfg.raid.automatic
        ) {
          await lockdown(
            guild,
            true
          );

          cfg.lockdown = true;
        }

        saveData();
      }
    }
  }
);

// ======================================================
// MESSAGE AUTOMOD
// ======================================================

client.on(
  "messageCreate",
  async message => {

    if (
      !message.guild ||
      message.author.bot
    ) {
      return;
    }

    const guild =
      message.guild;

    const cfg =
      getCfg(guild.id);

    if (
      isWhitelisted(
        guild,
        message.author.id,
        message.channel.id
      )
    ) {
      return;
    }

    if (
      message.member?.roles.cache.some(
        role =>
          cfg.exemptRoles.includes(
            role.id
          )
      )
    ) {
      return;
    }

    // --------------------------------------------------
    // ANTI SPAM
    // --------------------------------------------------

    if (
      cfg.protection.antispam
    ) {

      const key =
        `${guild.id}:${message.author.id}`;

      const now =
        Date.now();

      let timestamps =
        spamMap.get(key) || [];

      timestamps =
        timestamps.filter(
          time =>
            now - time < 6000
        );

      timestamps.push(now);

      spamMap.set(
        key,
        timestamps
      );

      if (
        timestamps.length >= 5
      ) {

        spamMap.delete(key);

        try {
          await message.delete();
        } catch {}

        cfg.stats.deletedMessages++;

        await sendLog(
          guild,
          "automod",
          `💬 **Anti-Spam** : ${message.author.tag} détecté.`
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

        saveData();

        return;
      }
    }

    // --------------------------------------------------
    // ANTI INVITE
    // --------------------------------------------------

    if (
      cfg.protection.antiinvites &&
      INVITE_RE.test(
        message.content
      )
    ) {

      try {
        await message.delete();
      } catch {}

      cfg.stats.deletedMessages++;

      await sendLog(
        guild,
        "automod",
        `📨 **Anti-Invite** : invitation supprimée de ${message.author.tag}.`
      );

      saveData();

      return;
    }

    // --------------------------------------------------
    // ANTI LIENS
    // --------------------------------------------------

    if (
      cfg.protection.antilinks &&
      URL_RE.test(
        message.content
      )
    ) {

      const urls =
        message.content.match(
          /https?:\/\/[^\s]+/gi
        ) || [];

      let allowed = false;

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

        cfg.stats.deletedMessages++;

        await sendLog(
          guild,
          "automod",
          `🔗 **Anti-Liens** : lien supprimé de ${message.author.tag}.`
        );

        saveData();

        return;
      }
    }

    // --------------------------------------------------
    // FILTRE
    // --------------------------------------------------

    if (
      cfg.protection.filter &&
      cfg.blockedWords.length
    ) {

      const content =
        message.content.toLowerCase();

      const blocked =
        cfg.blockedWords.some(
          word =>
            content.includes(
              word.toLowerCase()
            )
        );

      if (blocked) {

        try {
          await message.delete();
        } catch {}

        cfg.stats.deletedMessages++;

        await sendLog(
          guild,
          "automod",
          `🤬 **Filtre** : message supprimé de ${message.author.tag}.`
        );

        saveData();

        return;
      }
    }
  }
);

// ======================================================
// SECURITY: WEBHOOK
// ======================================================

client.on(
  "webhookUpdate",
  async channel => {

    const guild =
      channel.guild;

    if (!guild) return;

    const cfg =
      getCfg(guild.id);

    if (
      !cfg.protection.antiwebhook
    ) {
      return;
    }

    await sendLog(
      guild,
      "security",
      `🪝 **Anti-Webhook** : modification détectée dans <#${channel.id}>.`
    );
  }
);

// ======================================================
// INTERACTIONS
// ======================================================

client.on(
  "interactionCreate",
  async interaction => {

    // ==================================================
    // SELECT MENU
    // ==================================================

    if (
      interaction.isStringSelectMenu()
    ) {

      if (
        interaction.customId !==
        "automod_page"
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
            "❌ Permission insuffisante.",
          ephemeral: true
        });
      }

      const cfg =
        getCfg(
          interaction.guild.id
        );

      const page =
        interaction.values[0];

      return interaction.update({
        embeds: [
          automodEmbed(
            interaction.guild,
            cfg,
            page
          )
        ],
        components:
          automodComponents(cfg)
      });
    }

    // ==================================================
    // BUTTONS
    // ==================================================

    if (
      interaction.isButton()
    ) {

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

      const id =
        interaction.customId;

      if (
        id ===
        "automod_refresh"
      ) {
        return interaction.update({
          embeds: [
            automodEmbed(
              interaction.guild,
              cfg
            )
          ],
          components:
            automodComponents(cfg)
        });
      }

      const mapping = {
        toggle_antispam:
          "antispam",

        toggle_antilinks:
          "antilinks",

        toggle_antiraid:
          "antiraid",

        toggle_antinuke:
          "antinuke",

        toggle_antiwebhook:
          "antiwebhook",

        toggle_antibot:
          "antibot"
      };

      if (
        mapping[id]
      ) {

        const key =
          mapping[id];

        cfg.protection[key] =
          !cfg.protection[key];

        saveData();

        await sendLog(
          interaction.guild,
          "security",
          `⚙️ **Configuration** : ${key} ${cfg.protection[key] ? "activé" : "désactivé"} par ${interaction.user.tag}.`
        );
      }

      if (
        id ===
        "toggle_lockdown"
      ) {

        cfg.lockdown =
          !cfg.lockdown;

        await lockdown(
          interaction.guild,
          cfg.lockdown
        );

        saveData();
      }

      return interaction.update({
        embeds: [
          automodEmbed(
            interaction.guild,
            cfg
          )
        ],
        components:
          automodComponents(cfg)
      });
    }

    // ==================================================
    // SLASH
    // ==================================================

    if (
      !interaction.isChatInputCommand()
    ) {
      return;
    }

    const i =
      interaction;

    // --------------------------------------------------
    // HELP
    // --------------------------------------------------

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
            "Bot Discord de modération, sécurité et protection."
          )
          .addFields(
            {
              name: "🛡️ Sécurité",
              value:
                "`/automod` `/securityconfig` `/whitelist` `/logs`"
            },
            {
              name: "🚨 Protection",
              value:
                "Anti-Nuke • Anti-Raid • Anti-Webhooks • Anti-Bots • Protection rôles/salons"
            },
            {
              name: "🧹 Modération",
              value:
                "`/ban` `/kick` `/timeout` `/untimeout` `/warn` `/casier` `/clear` `/slowmode`"
            },
            {
              name: "🎫 Tickets",
              value:
                "`/ticket` `/ticketconfig`"
            },
            {
              name: "📊 Informations",
              value:
                "`/stats` `/userinfo` `/serverinfo`"
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

    // --------------------------------------------------
    // BASIC PERMISSION
    // --------------------------------------------------

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

    // --------------------------------------------------
    // MENU
    // --------------------------------------------------

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
            "Centre de contrôle de ton serveur."
          )
          .addFields(
            {
              name: "🛡️ Sécurité",
              value:
                "`/automod`"
            },
            {
              name: "📊 Statistiques",
              value:
                "`/stats`"
            },
            {
              name: "🎫 Tickets",
              value:
                "`/ticket` `/ticketconfig`"
            },
            {
              name: "⚙️ Configuration",
              value:
                "`/logs` `/whitelist` `/serverconfig`"
            }
          )
          .setFooter({
            text:
              "Automod • Menu"
          })
          .setTimestamp();

      return i.reply({
        embeds: [embed]
      });
    }

    // --------------------------------------------------
    // AUTOMOD
    // --------------------------------------------------

    if (
      i.commandName === "automod"
    ) {

      return i.reply({
        embeds: [
          automodEmbed(
            i.guild,
            cfg
          )
        ],
        components:
          automodComponents(cfg)
      });
    }

    // --------------------------------------------------
    // SECURITY CONFIG
    // --------------------------------------------------

    if (
      i.commandName === "securityconfig"
    ) {

      return i.reply({
        embeds: [
          automodEmbed(
            i.guild,
            cfg,
            "security"
          )
        ],
        components:
          automodComponents(cfg)
      });
    }

    // --------------------------------------------------
    // STATS
    // --------------------------------------------------

    if (
      i.commandName === "stats"
    ) {

      const s =
        cfg.stats;

      const embed =
        new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle(
            "📊 Automod • Statistiques"
          )
          .addFields(
            {
              name: "🏠 Serveur",
              value:
                i.guild.name,
              inline: true
            },
            {
              name: "👥 Membres",
              value:
                `${i.guild.memberCount}`,
              inline: true
            },
            {
              name: "🧹 Messages supprimés",
              value:
                `${s.deletedMessages}`,
              inline: true
            },
            {
              name: "⚠️ Warns",
              value:
                `${s.warns}`,
              inline: true
            },
            {
              name: "🔨 Bans",
              value:
                `${s.bans}`,
              inline: true
            },
            {
              name: "👢 Kicks",
              value:
                `${s.kicks}`,
              inline: true
            },
            {
              name: "🚨 Raids",
              value:
                `${s.raids}`,
              inline: true
            },
            {
              name: "💥 Actions Anti-Nuke",
              value:
                `${s.nukeActions}`,
              inline: true
            }
          )
          .setFooter({
            text:
              "Automod • Statistiques"
          })
          .setTimestamp();

      return i.reply({
        embeds: [embed]
      });
    }

    // --------------------------------------------------
    // SERVER CONFIG
    // --------------------------------------------------

    if (
      i.commandName ===
      "serverconfig"
    ) {

      return i.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(
              "⚙️ Automod • Configuration"
            )
            .addFields(
              {
                name: "🛡️ Protections",
                value:
                  Object.entries(
                    cfg.protection
                  )
                    .map(
                      ([key, value]) =>
                        `${value ? "🟢" : "🔴"} ${key}`
                    )
                    .join("\n")
              },
              {
                name: "📋 Logs",
                value:
                  Object.entries(
                    cfg.logs
                  )
                    .map(
                      ([key, value]) =>
                        `${key}: ${value ? `<#${value}>` : "❌"}`
                    )
                    .join("\n")
              }
            )
            .setTimestamp()
        ]
      });
    }

    // --------------------------------------------------
    // LOGS
    // --------------------------------------------------

    if (
      i.commandName === "logs"
    ) {

      const type =
        i.options.getString(
          "type"
        );

      const channel =
        i.options.getChannel(
          "salon"
        );

      cfg.logs[type] =
        channel.id;

      saveData();

      return i.reply(
        `✅ Logs **${type}** configurés dans ${channel}.`
      );
    }

    // --------------------------------------------------
    // WHITELIST
    // --------------------------------------------------

    if (
      i.commandName === "whitelist"
    ) {

      const sub =
        i.options.getSubcommand();

      if (
        sub === "user"
      ) {

        const user =
          i.options.getUser(
            "membre"
          );

        const list =
          cfg.whitelist.users;

        const index =
          list.indexOf(
            user.id
          );

        if (index >= 0) {
          list.splice(index, 1);

          saveData();

          return i.reply(
            `🗑️ **${user.tag}** retiré de la whitelist.`
          );
        }

        list.push(
          user.id
        );

        saveData();

        return i.reply(
          `✅ **${user.tag}** ajouté à la whitelist.`
        );
      }

      if (
        sub === "role"
      ) {

        const role =
          i.options.getRole(
            "role"
          );

        const list =
          cfg.whitelist.roles;

        const index =
          list.indexOf(
            role.id
          );

        if (index >= 0) {
          list.splice(index, 1);

          saveData();

          return i.reply(
            `🗑️ ${role} retiré de la whitelist.`
          );
        }

        list.push(
          role.id
        );

        saveData();

        return i.reply(
          `✅ ${role} ajouté à la whitelist.`
        );
      }

      if (
        sub === "channel"
      ) {

        const channel =
          i.options.getChannel(
            "salon"
          );

        const list =
          cfg.whitelist.channels;

        const index =
          list.indexOf(
            channel.id
          );

        if (index >= 0) {
          list.splice(index, 1);

          saveData();

          return i.reply(
            `🗑️ ${channel} retiré de la whitelist.`
          );
        }

        list.push(
          channel.id
        );

        saveData();

        return i.reply(
          `✅ ${channel} ajouté à la whitelist.`
        );
      }
    }

    // --------------------------------------------------
    // TICKET CONFIG
    // --------------------------------------------------

    if (
      i.commandName ===
      "ticketconfig"
    ) {

      cfg.ticket.category =
        cfg.ticket.category ||
        null;

      return i.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(
              "🎫 Automod • Tickets"
            )
            .setDescription(
              "Le système de tickets est prêt à être configuré."
            )
            .addFields(
              {
                name: "📁 Catégorie",
                value:
                  cfg.ticket.category
                    ? `<#${cfg.ticket.category}>`
                    : "❌ Non configurée"
              },
              {
                name: "👥 Support",
                value:
                  cfg.ticket.supportRole
                    ? `<@&${cfg.ticket.supportRole}>`
                    : "❌ Non configuré"
              },
              {
                name: "📋 Logs",
                value:
                  cfg.ticket.logs
                    ? `<#${cfg.ticket.logs}>`
                    : "❌ Non configurés"
              }
            )
            .setFooter({
              text:
                "Automod • Ticket System"
            })
            .setTimestamp()
        ]
      });
    }

    // --------------------------------------------------
    // TICKET
    // --------------------------------------------------

    if (
      i.commandName === "ticket"
    ) {

      const existing =
        i.guild.channels.cache.find(
          channel =>
            channel.name ===
            `ticket-${i.user.username.toLowerCase()}`
        );

      if (existing) {
        return i.reply({
          content:
            `🎫 Tu as déjà un ticket : ${existing}`,
          ephemeral: true
        });
      }

      const channel =
        await i.guild.channels.create({
          name:
            `ticket-${i.user.username}`
              .toLowerCase()
              .replace(
                /[^a-z0-9-]/g,
                ""
              )
              .slice(0, 80),

          type:
            ChannelType.GuildText,

          parent:
            cfg.ticket.category || undefined,

          permissionOverwrites: [
            {
              id:
                i.guild.roles.everyone.id,
              deny: [
                PermissionFlagsBits.ViewChannel
              ]
            },
            {
              id:
                i.user.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages
              ]
            }
          ]
        });

      const embed =
        new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle(
            "🎫 Ticket ouvert"
          )
          .setDescription(
            `Bienvenue ${i.user}.\n\n` +
            `Explique ton problème ici.\n\n` +
            `Un membre du staff pourra prendre en charge ton ticket.`
          )
          .setTimestamp();

      const row =
        new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(
                "ticket_close"
              )
              .setLabel(
                "Fermer"
              )
              .setEmoji("🔒")
              .setStyle(
                ButtonStyle.Danger
              )
          );

      await channel.send({
        content:
          `${i.user}`,
        embeds: [embed],
        components: [row]
      });

      return i.reply({
        content:
          `🎫 Ticket créé : ${channel}`,
        ephemeral: true
      });
    }

    // --------------------------------------------------
    // BAN
    // --------------------------------------------------

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
          { reason }
        );

        cfg.stats.bans++;

        saveData();

        await sendLog(
          i.guild,
          "moderation",
          `🔨 **BAN** ${user.tag}\nRaison : ${reason}`
        );

        return i.reply(
          `🔨 **${user.tag}** a été banni.`
        );

      } catch {
        return i.reply({
          content:
            "❌ Impossible de bannir ce membre.",
          ephemeral: true
        });
      }
    }

    // --------------------------------------------------
    // KICK
    // --------------------------------------------------

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

        cfg.stats.kicks++;

        saveData();

        return i.reply(
          `👢 **${user.tag}** a été expulsé.`
        );

      } catch {
        return i.reply({
          content:
            "❌ Impossible d'expulser.",
          ephemeral: true
        });
      }
    }

    // --------------------------------------------------
    // TIMEOUT
    // --------------------------------------------------

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
          minutes * 60000,
          "Automod"
        );

        cfg.stats.timeouts++;

        saveData();

        return i.reply(
          `⏱️ **${user.tag}** timeout pendant **${minutes} minute(s)**.`
        );

      } catch {
        return i.reply({
          content:
            "❌ Impossible d'appliquer le timeout.",
          ephemeral: true
        });
      }
    }

    // --------------------------------------------------
    // UNTIMEOUT
    // --------------------------------------------------

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
            "❌ Impossible.",
          ephemeral: true
        });
      }
    }

    // --------------------------------------------------
    // WARN
    // --------------------------------------------------

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

      cfg.stats.warns++;

      saveData();

      await sendLog(
        i.guild,
        "moderation",
        `⚠️ **WARN** ${user.tag}\nRaison : ${reason}`
      );

      return i.reply(
        `⚠️ **${user.tag}** averti.\n> ${reason}\n\nTotal : **${warns.length}**`
      );
    }

    // --------------------------------------------------
    // CASIER
    // --------------------------------------------------

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

    // --------------------------------------------------
    // CLEAR
    // --------------------------------------------------

    if (
      i.commandName === "clear"
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

        cfg.stats.deletedMessages +=
          deleted.size;

        saveData();

        return i.reply({
          content:
            `🧹 **${deleted.size}** messages supprimés.`,
          ephemeral: true
        });

      } catch {
        return i.reply({
          content:
            "❌ Impossible de supprimer.",
          ephemeral: true
        });
      }
    }

    // --------------------------------------------------
    // SLOWMODE
    // --------------------------------------------------

    if (
      i.commandName ===
      "slowmode"
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
            : `🐢 Slowmode : **${seconds}s**.`
        );

      } catch {
        return i.reply({
          content:
            "❌ Impossible.",
          ephemeral: true
        });
      }
    }

    // --------------------------------------------------
    // LOCK
    // --------------------------------------------------

    if (
      i.commandName === "lock"
    ) {

      await i.channel.permissionOverwrites.edit(
        i.guild.roles.everyone,
        {
          SendMessages: false
        }
      );

      return i.reply(
        "🔒 Salon verrouillé."
      );
    }

    // --------------------------------------------------
    // UNLOCK
    // --------------------------------------------------

    if (
      i.commandName === "unlock"
    ) {

      await i.channel.permissionOverwrites.edit(
        i.guild.roles.everyone,
        {
          SendMessages: null
        }
      );

      return i.reply(
        "🔓 Salon déverrouillé."
      );
    }

    // --------------------------------------------------
    // USERINFO
    // --------------------------------------------------

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
          .fetch(user.id)
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

    // --------------------------------------------------
    // SERVERINFO
    // --------------------------------------------------

    if (
      i.commandName ===
      "serverinfo"
    ) {

      return i.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(
              `🏠 ${i.guild.name}`
            )
            .setThumbnail(
              i.guild.iconURL()
            )
            .addFields(
              {
                name: "👥 Membres",
                value:
                  `${i.guild.memberCount}`,
                inline: true
              },
              {
                name: "💬 Salons",
                value:
                  `${i.guild.channels.cache.size}`,
                inline: true
              },
              {
                name: "🎭 Rôles",
                value:
                  `${i.guild.roles.cache.size}`,
                inline: true
              }
            )
        ]
      });
    }

    // --------------------------------------------------
    // SAY
    // --------------------------------------------------

    if (
      i.commandName === "say"
    ) {

      const message =
        i.options.getString(
          "message"
        );

      await i.reply({
        content:
          "✅ Envoyé.",
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

    // --------------------------------------------------
    // ANNOUNCE
    // --------------------------------------------------

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
    }
  }
);

// ======================================================
// TICKET BUTTON
// ======================================================

client.on(
  "interactionCreate",
  async interaction => {

    if (
      !interaction.isButton()
    ) {
      return;
    }

    if (
      interaction.customId !==
      "ticket_close"
    ) {
      return;
    }

    if (
      !interaction.channel ||
      !interaction.channel.name?.startsWith(
        "ticket-"
      )
    ) {
      return;
    }

    await interaction.reply(
      "🔒 Fermeture du ticket..."
    );

    setTimeout(
      async () => {
        try {
          await interaction.channel.delete(
            "Automod • Ticket fermé"
          );
        } catch {}
      },
      1500
    );
  }
);

// ======================================================
// ERROR HANDLERS
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
// LOGIN
// ======================================================

client.login(TOKEN);

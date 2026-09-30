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
// CONFIG
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
// DATA
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
  } catch {
    data = {
      guilds: {}
    };
  }
}

function saveData() {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

function getCfg(guildId) {
  if (!data.guilds[guildId]) {
    data.guilds[guildId] = {
      logChannel: null,

      antispam: false,
      antilink: false,
      antibot: false,

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

      warns: {}
    };

    saveData();
  }

  return data.guilds[guildId];
}

// ======================================================
// AUTOMOD
// ======================================================

const spamMap = new Map();

const URL_RE =
  /(https?:\/\/|www\.)[^\s]+/i;

// ======================================================
// OUTILS
// ======================================================

function canModerate(member, target) {
  if (!target) return false;

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

  if (!cfg.logChannel) return;

  const channel =
    guild.channels.cache.get(cfg.logChannel);

  if (!channel) return;

  if (!channel.isTextBased()) return;

  try {
    await channel.send({
      content,
      allowedMentions: {
        parse: []
      }
    });
  } catch {}
}

function getWarns(guildId, userId) {
  const cfg = getCfg(guildId);

  if (!cfg.warns[userId]) {
    cfg.warns[userId] = [];
    saveData();
  }

  return cfg.warns[userId];
}

// ======================================================
// COMMANDES
// ======================================================

const commands = [

  // HELP
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Afficher l'aide d'Automod"),

  // BAN
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

  // UNBAN
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

  // KICK
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

  // TIMEOUT
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

  // UNTIMEOUT
  new SlashCommandBuilder()
    .setName("untimeout")
    .setDescription("Retirer le timeout")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addUserOption(option =>
      option
        .setName("membre")
        .setDescription("Membre")
        .setRequired(true)
    ),

  // WARN
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

  // UNWARN
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

  // CASIER
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

  // CLEARWARNS
  new SlashCommandBuilder()
    .setName("clearwarns")
    .setDescription("Supprimer tous les avertissements")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addUserOption(option =>
      option
        .setName("membre")
        .setDescription("Membre")
        .setRequired(true)
    ),

  // CLEAR
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

  // PURGE
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

  // SLOWMODE
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

  // LOCK
  new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Verrouiller le salon")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    ),

  // UNLOCK
  new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Déverrouiller le salon")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    ),

  // NICK
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

  // ROLEADD
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

  // ROLEREMOVE
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

  // USERINFO
  new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Informations sur un utilisateur")
    .addUserOption(option =>
      option
        .setName("membre")
        .setDescription("Utilisateur")
        .setRequired(false)
    ),

  // SERVERINFO
  new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Informations sur le serveur"),

  // SAY
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

  // ANNOUNCE
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

  // SETUP
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Configurer Automod")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addSubcommand(sub =>
      sub
        .setName("logs")
        .setDescription("Configurer les logs")
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

  // AUTOMOD
  new SlashCommandBuilder()
    .setName("automod")
    .setDescription("Ouvrir le panneau Automod")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    ),

  // ANTISPAM
  new SlashCommandBuilder()
    .setName("antispam")
    .setDescription("Activer ou désactiver l'anti-spam")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addBooleanOption(option =>
      option
        .setName("actif")
        .setDescription("Activer")
        .setRequired(true)
    ),

  // ANTILINKS
  new SlashCommandBuilder()
    .setName("antilinks")
    .setDescription("Activer ou désactiver l'anti-liens")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addBooleanOption(option =>
      option
        .setName("actif")
        .setDescription("Activer")
        .setRequired(true)
    ),

  // RAIDMODE
  new SlashCommandBuilder()
    .setName("raidmode")
    .setDescription("Activer ou désactiver le mode raid")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addBooleanOption(option =>
      option
        .setName("actif")
        .setDescription("Activer")
        .setRequired(true)
    ),

  // LOCKDOWN
  new SlashCommandBuilder()
    .setName("lockdown")
    .setDescription("Verrouiller le serveur")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addBooleanOption(option =>
      option
        .setName("actif")
        .setDescription("Activer")
        .setRequired(true)
    )

].map(command => command.toJSON());

// ======================================================
// STATUT DU BOT
// ======================================================

function updateBotStatus() {

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
// READY
// ======================================================

client.once("ready", async () => {

  console.log("");
  console.log("======================================");
  console.log("           AUTOMOD EN LIGNE");
  console.log("======================================");
  console.log(
    `🤖 Nom : ${client.user.username}`
  );
  console.log(
    `🆔 ID : ${client.user.id}`
  );
  console.log(
    `🌐 Serveurs : ${client.guilds.cache.size}`
  );
  console.log("");

  // Statut immédiat
  updateBotStatus();

  // Actualisation toutes les 5 minutes
  setInterval(
    updateBotStatus,
    5 * 60 * 1000
  );

  // Commandes
  try {

    if (GUILD_ID) {

      const guild =
        await client.guilds.fetch(GUILD_ID);

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
      "❌ Erreur commandes :",
      error
    );

  }

});

// ======================================================
// SERVEUR REJOINT
// ======================================================

client.on(
  "guildCreate",
  guild => {

    getCfg(guild.id);

    saveData();

    console.log(
      `➕ Automod rejoint ${guild.name}`
    );

    updateBotStatus();
  }
);

// ======================================================
// SERVEUR QUITTÉ
// ======================================================

client.on(
  "guildDelete",
  guild => {

    console.log(
      `➖ Automod quitte ${guild.name}`
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
      getCfg(member.guild.id);

    // Anti-bot
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

    // Raidmode
    if (cfg.raidmode) {

      await sendLog(
        member.guild,
        `🚨 **Mode Raid** : ${member.user.tag} vient de rejoindre le serveur.`
      );

    }

  }
);

// ======================================================
// MESSAGE AUTOMOD
// ======================================================

client.on(
  "messageCreate",
  async message => {

    if (!message.guild) return;

    if (message.author.bot) return;

    const cfg =
      getCfg(message.guild.id);

    // Rôle exempté
    const exempt =
      message.member?.roles?.cache?.some(
        role =>
          cfg.exemptRoles.includes(
            role.id
          )
      );

    if (exempt) return;

    // ----------------------------------------------
    // ANTI-SPAM
    // ----------------------------------------------

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

      timestamps.push(now);

      spamMap.set(
        key,
        timestamps
      );

      if (timestamps.length >= 5) {

        spamMap.delete(key);

        try {

          await message.channel.bulkDelete(
            20,
            true
          );

        } catch {}

        await sendLog(
          message.guild,
          `💬 **Anti-Spam** : ${message.author.tag} a été détecté pour spam.`
        );

        return;
      }

    }

    // ----------------------------------------------
    // ANTI-LIENS
    // ----------------------------------------------

    if (
      cfg.antilink &&
      URL_RE.test(message.content)
    ) {

      const channelName =
        message.channel.name?.toLowerCase() ||
        "";

      // Ticket exempté
      if (
        channelName.includes("ticket")
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
// INTERACTIONS
// ======================================================

client.on(
  "interactionCreate",
  async interaction => {

    // ==================================================
    // BOUTONS
    // ==================================================

    if (interaction.isButton()) {

      if (
        interaction.customId ===
        "automod_refresh"
      ) {

        const cfg =
          getCfg(
            interaction.guild.id
          );

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

      if (
        interaction.customId.startsWith(
          "automod_"
        )
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

        if (
          interaction.customId ===
          "automod_antispam"
        ) {

          cfg.antispam =
            !cfg.antispam;
        }

        if (
          interaction.customId ===
          "automod_antilink"
        ) {

          cfg.antilink =
            !cfg.antilink;
        }

        if (
          interaction.customId ===
          "automod_antibot"
        ) {

          cfg.antibot =
            !cfg.antibot;
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

      return;
    }

    // ==================================================
    // SLASH COMMANDS
    // ==================================================

    if (
      !interaction.isChatInputCommand()
    ) {
      return;
    }

    const i =
      interaction;

    // ==================================================
    // HELP PUBLIC
    // ==================================================

    if (
      i.commandName === "help"
    ) {

      const embed =
        new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle(
            "🤖 Automod • Commandes"
          )
          .setDescription(
            "Voici les commandes disponibles sur Automod."
          )
          .addFields(

            {
              name: "🛡️ Sécurité",
              value:
                "`/automod` `/antispam` `/antilinks` `/raidmode` `/lockdown`"
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
              name: "⚙️ Gestion",
              value:
                "`/nick` `/roleadd` `/roleremove` `/setup`"
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
    // PERMISSION
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
    // CLEARWARNS
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

      if (
        !i.channel ||
        !i.channel.isTextBased()
      ) {

        return i.reply({
          content:
            "❌ Salon invalide.",
          ephemeral: true
        });

      }

      try {

        const deleted =
          await i.channel.bulkDelete(
            amount,
            true
          );

        return i.reply({
          content:
            `🧹 ${deleted.size} message(s) supprimé(s).`,
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
            : `🐢 Slowmode : **${seconds}s**.`
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
          `✅ Pseudo modifié : **${nickname}**`
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
          .fetch(user.id)
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
          .fetch(user.id)
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
                `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`,
              inline: true
            },

            {
              name: "📥 Rejoint",
              value:
                member?.joinedTimestamp
                  ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`
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
          `✅ Les logs sont configurés dans ${channel}.`
        );

      }

    }

    // ==================================================
    // AUTOMOD
    // ==================================================

    if (
      i.commandName === "automod"
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
          ? "🟢 Anti-Spam activé."
          : "🔴 Anti-Spam désactivé."
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
          ? "🟢 Anti-Liens activé."
          : "🔴 Anti-Liens désactivé."
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
          ? "🚨 Mode Raid activé."
          : "🟢 Mode Raid désactivé."
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

      let modified = 0;

      for (
        const channel
        of i.guild.channels.cache.values()
      ) {

        if (
          !channel.isTextBased()
        ) continue;

        try {

          await channel.permissionOverwrites.edit(
            i.guild.roles.everyone,
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

      saveData();

      return i.reply(
        active
          ? `🔒 Lockdown activé sur ${modified} salon(s).`
          : `🔓 Lockdown désactivé sur ${modified} salon(s).`
      );

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

  const state = value =>
    value
      ? "🟢 Activé"
      : "🔴 Désactivé";

  return new EmbedBuilder()

    .setColor(0x5865F2)

    .setTitle(
      "🛡️ Automod • Centre de sécurité"
    )

    .setDescription(
      `Protection de **${guild.name}**\n\n` +
      "Utilise les boutons pour activer ou désactiver les protections."
    )

    .addFields(

      {
        name: "💬 Anti-Spam",
        value:
          state(cfg.antispam),
        inline: true
      },

      {
        name: "🔗 Anti-Liens",
        value:
          state(cfg.antilink),
        inline: true
      },

      {
        name: "🤖 Anti-Bots",
        value:
          state(cfg.antibot),
        inline: true
      },

      {
        name: "🚨 Mode Raid",
        value:
          state(cfg.raidmode),
        inline: true
      },

      {
        name: "🔒 Lockdown",
        value:
          state(cfg.lockdown),
        inline: true
      },

      {
        name: "📋 Logs",
        value:
          cfg.logChannel
            ? `<#${cfg.logChannel}>`
            : "❌ Non configurés",
        inline: true
      }

    )

    .setFooter({
      text:
        "Automod • Sécurité du serveur"
    })

    .setTimestamp();
}

// ======================================================
// BOUTONS AUTOMOD
// ======================================================

function createAutomodButtons(cfg) {

  return [

    new ActionRowBuilder()
      .addComponents(

        new ButtonBuilder()
          .setCustomId(
            "automod_antispam"
          )
          .setLabel(
            cfg.antispam
              ? "Anti-Spam : ON"
              : "Anti-Spam : OFF"
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
              ? "Anti-Liens : ON"
              : "Anti-Liens : OFF"
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
              ? "Anti-Bots : ON"
              : "Anti-Bots : OFF"
          )
          .setEmoji("🤖")
          .setStyle(
            cfg.antibot
              ? ButtonStyle.Success
              : ButtonStyle.Secondary
          )

      ),

    new ActionRowBuilder()
      .addComponents(

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

client.login(TOKEN);
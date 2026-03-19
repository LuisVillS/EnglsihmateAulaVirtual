import discord
from discord.ext import commands
from services.config import ROLE_SYNC_REQUIRES_MEMBERS_INTENT, TOKEN

intents = discord.Intents.default()
if ROLE_SYNC_REQUIRES_MEMBERS_INTENT:
    intents.members = True
bot = commands.Bot(intents=intents, command_prefix='/') 

def setup():
    bot.load_extension("commands.verify")
    bot.load_extension("commands.practice")
    bot.load_extension("services.member_sync")

if __name__ == "__main__":
    if not TOKEN:
        raise RuntimeError("Falta DISCORD_BOT_TOKEN. Agrégalo en .env o en las variables de entorno.")
    setup()
    bot.run(TOKEN)


